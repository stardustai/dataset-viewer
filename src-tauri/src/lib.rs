use tauri_plugin_http;
use base64::{Engine as _, engine::general_purpose};

mod storage;
mod archive;  // 压缩包处理功能 - 前端需要使用
mod download; // 下载管理功能
#[allow(dead_code)]
mod cache;    // 智能缓存机制 - 暂未使用

use archive::{handlers::ArchiveHandler, types::*};
use storage::{StorageRequest, ConnectionConfig, get_storage_manager};
use download::{DownloadManager, DownloadRequest};
use std::sync::{Arc, LazyLock};

// 全局下载管理器
static DOWNLOAD_MANAGER: LazyLock<DownloadManager> =
    LazyLock::new(|| DownloadManager::new());

// 全局压缩包处理器
static ARCHIVE_HANDLER: LazyLock<Arc<ArchiveHandler>> =
    LazyLock::new(|| Arc::new(ArchiveHandler::new()));

#[tauri::command]
async fn storage_request(
    _protocol: String,
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
    options: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let manager = get_storage_manager().await;
    let manager = manager.lock().await;

    let request = StorageRequest {
        method,
        url,
        headers,
        body,
        options,
    };

    match manager.request(&request).await {
        Ok(response) => Ok(serde_json::json!({
            "status": response.status,
            "headers": response.headers,
            "body": response.body,
            "metadata": response.metadata
        })),
        Err(e) => Err(format!("Storage request failed: {}", e))
    }
}

#[tauri::command]
async fn storage_request_binary(
    _protocol: String,
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    options: Option<serde_json::Value>,
) -> Result<String, String> {
    let manager = get_storage_manager().await;
    let manager = manager.lock().await;

    let request = StorageRequest {
        method,
        url,
        headers,
        body: None,
        options,
    };

    match manager.request_binary(&request).await {
        Ok(data) => Ok(general_purpose::STANDARD.encode(&data)),
        Err(e) => Err(format!("Binary request failed: {}", e))
    }
}

// 存储连接管理命令
#[tauri::command]
async fn storage_connect(
    protocol: String,
    url: Option<String>,
    username: Option<String>,
    password: Option<String>,
    access_key: Option<String>,
    secret_key: Option<String>,
    region: Option<String>,
    bucket: Option<String>,
    endpoint: Option<String>,
    extra_options: Option<std::collections::HashMap<String, String>>,
) -> Result<bool, String> {
    let manager = get_storage_manager().await;
    let mut manager = manager.lock().await;

    let config = ConnectionConfig {
        protocol: protocol.clone(),
        url,
        access_key,
        secret_key,
        region,
        bucket,
        endpoint,
        username,
        password,
        extra_options,
    };

    match manager.connect(&config).await {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Connection failed: {}", e))
    }
}

#[tauri::command]
async fn storage_disconnect() -> Result<bool, String> {
    let manager = get_storage_manager().await;
    let mut manager = manager.lock().await;

    match manager.disconnect().await {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Disconnect failed: {}", e))
    }
}

#[tauri::command]
async fn storage_is_connected() -> Result<bool, String> {
    let manager = get_storage_manager().await;
    let manager = manager.lock().await;

    Ok(manager.is_connected())
}

#[tauri::command]
async fn storage_get_capabilities() -> Result<serde_json::Value, String> {
    let manager = get_storage_manager().await;
    let manager = manager.lock().await;

    match manager.current_capabilities() {
        Some(caps) => Ok(serde_json::to_value(caps).unwrap()),
        None => Err("No active connection".to_string())
    }
}

#[tauri::command]
async fn storage_get_supported_protocols() -> Result<Vec<String>, String> {
    let manager = get_storage_manager().await;
    let manager = manager.lock().await;

    Ok(manager.supported_protocols().iter().map(|s| s.to_string()).collect())
}

// 下载进度命令

#[tauri::command]
async fn download_file_with_progress(
    app: tauri::AppHandle,
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
) -> Result<String, String> {
    let request = DownloadRequest {
        method,
        url,
        headers,
        filename,
    };

    DOWNLOAD_MANAGER.download_with_progress(app, request).await
}

#[tauri::command]
async fn cancel_download(filename: String) -> Result<String, String> {
    DOWNLOAD_MANAGER.cancel_download(&filename)
}

// 压缩包处理命令

/// 分析压缩包结构
#[tauri::command]
async fn analyze_archive(
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    max_size: Option<usize>,
) -> Result<ArchiveInfo, String> {
    ARCHIVE_HANDLER.analyze_archive(url, headers, filename, max_size).await
}

/// 获取文件预览
#[tauri::command]
async fn get_file_preview(
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    entry_path: String,
    max_preview_size: Option<usize>,
) -> Result<FilePreview, String> {
    ARCHIVE_HANDLER.get_file_preview(url, headers, filename, entry_path, max_preview_size).await
}

/// 检查文件是否支持压缩包操作
#[tauri::command]
async fn is_supported_archive(filename: String) -> Result<bool, String> {
    Ok(ARCHIVE_HANDLER.is_supported_archive(&filename))
}

/// 检查文件是否支持流式读取
#[tauri::command]
async fn supports_streaming(filename: String) -> Result<bool, String> {
    Ok(ARCHIVE_HANDLER.supports_streaming(&filename))
}

/// 获取压缩格式信息
#[tauri::command]
async fn get_compression_info(filename: String) -> Result<CompressionType, String> {
    Ok(ARCHIVE_HANDLER.get_compression_info(&filename))
}

/// 智能预览文件
#[tauri::command]
async fn smart_preview(
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    entry_path: String,
) -> Result<FilePreview, String> {
    ARCHIVE_HANDLER.smart_preview(url, headers, filename, entry_path).await
}

/// 批量预览文件
#[tauri::command]
async fn batch_preview(
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    entry_paths: Vec<String>,
    max_preview_size: Option<usize>,
) -> Result<Vec<(String, Result<FilePreview, String>)>, String> {
    ARCHIVE_HANDLER.batch_preview(url, headers, filename, entry_paths, max_preview_size).await
}

/// 验证压缩包完整性
#[tauri::command]
async fn validate_archive(
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
) -> Result<bool, String> {
    ARCHIVE_HANDLER.validate_archive(url, headers, filename).await
}

/// 获取支持的压缩格式列表
#[tauri::command]
async fn get_supported_formats() -> Result<Vec<String>, String> {
    let formats = ARCHIVE_HANDLER.get_supported_formats();
    Ok(formats.iter().map(|s| s.to_string()).collect())
}

/// 格式化文件大小显示
#[tauri::command]
async fn format_file_size(bytes: u64) -> Result<String, String> {
    Ok(ARCHIVE_HANDLER.format_file_size(bytes))
}

/// 获取压缩比信息
#[tauri::command]
async fn get_compression_ratio(uncompressed: u64, compressed: u64) -> Result<String, String> {
    Ok(ARCHIVE_HANDLER.get_compression_ratio(uncompressed, compressed))
}

/// 获取推荐的块大小
#[tauri::command]
async fn get_recommended_chunk_size(filename: String, file_size: u64) -> Result<usize, String> {
    Ok(ARCHIVE_HANDLER.get_recommended_chunk_size(&filename, file_size))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
                .invoke_handler(tauri::generate_handler![
            // 统一存储接口命令
            storage_request,
            storage_request_binary,
            storage_connect,
            storage_disconnect,
            storage_is_connected,
            storage_get_capabilities,
            storage_get_supported_protocols,
            // 下载进度命令
            download_file_with_progress,
            cancel_download,
            // 压缩包处理命令
            analyze_archive,
            get_file_preview,
            is_supported_archive,
            supports_streaming,
            get_compression_info,
            smart_preview,
            batch_preview,
            validate_archive,
            get_supported_formats,
            format_file_size,
            get_compression_ratio,
            get_recommended_chunk_size
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
