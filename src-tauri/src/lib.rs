use tauri_plugin_http;
use base64::{Engine as _, engine::general_purpose};
use tauri_plugin_dialog::DialogExt;
use tokio::io::AsyncWriteExt;
use futures_util::StreamExt;
use tauri::Emitter;
use reqwest;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::sync::broadcast;
use std::sync::LazyLock;

mod archive;

use archive::{handlers::ArchiveHandler, types::*};

// 全局下载管理器
static DOWNLOAD_MANAGER: LazyLock<Arc<Mutex<HashMap<String, broadcast::Sender<()>>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

// 全局压缩包处理器
static ARCHIVE_HANDLER: LazyLock<Arc<ArchiveHandler>> =
    LazyLock::new(|| Arc::new(ArchiveHandler::new()));

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn webdav_request(
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = tauri_plugin_http::reqwest::Client::new();

    let mut request = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "HEAD" => client.head(&url),
        "PROPFIND" => client.request(tauri_plugin_http::reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    // 添加headers
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    // 添加body
    if let Some(body_content) = body {
        request = request.body(body_content);
    }

    // 发送请求
    let response = request.send().await.map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status().as_u16();
    let headers_map: std::collections::HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let text = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

    Ok(serde_json::json!({
        "status": status,
        "headers": headers_map,
        "body": text
    }))
}

#[tauri::command]
async fn webdav_request_binary(
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = tauri_plugin_http::reqwest::Client::new();

    let mut request = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "HEAD" => client.head(&url),
        "PROPFIND" => client.request(tauri_plugin_http::reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    // 添加headers
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    // 添加body
    if let Some(body_content) = body {
        request = request.body(body_content);
    }

    // 发送请求
    let response = request.send().await.map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status().as_u16();
    let headers_map: std::collections::HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    // 获取二进制数据并转换为base64
    let bytes = response.bytes().await.map_err(|e| format!("Failed to read response: {}", e))?;
    let body_base64 = general_purpose::STANDARD.encode(&bytes);

    Ok(serde_json::json!({
        "status": status,
        "headers": headers_map,
        "body": body_base64
    }))
}

#[tauri::command]
async fn download_file_with_progress(
    app: tauri::AppHandle,
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
) -> Result<String, String> {
    // 显示保存文件对话框
    let file_path = app.dialog()
        .file()
        .set_file_name(&filename)
        .blocking_save_file();

    let save_path = match file_path {
        Some(path) => path.into_path().map_err(|e| format!("Failed to get path: {}", e))?,
        None => return Err("User cancelled file save".to_string()),
    };

    let client = reqwest::Client::new();

    let mut request_builder = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "HEAD" => client.head(&url),
        "PROPFIND" => client.request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    // 添加headers
    for (key, value) in headers {
        request_builder = request_builder.header(&key, &value);
    }

    // 发送请求并获取响应
    let response = request_builder.send().await.map_err(|e| {
        format!("Request failed: {}", e)
    })?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {} - {}",
            response.status().as_u16(),
            response.status().canonical_reason().unwrap_or("Unknown error")));
    }

    // 获取文件总大小
    let total_size = response.content_length().unwrap_or(0);

    // 创建取消信号
    let (cancel_tx, mut cancel_rx) = broadcast::channel::<()>(1);

    // 将取消发送器存储到全局管理器
    {
        let mut manager = DOWNLOAD_MANAGER.lock().unwrap();
        manager.insert(filename.clone(), cancel_tx);
    }

    // 发送开始下载事件
    let _ = app.emit("download-started", serde_json::json!({
        "filename": filename,
        "total_size": total_size
    }));

    // 创建文件
    let mut file = tokio::fs::File::create(&save_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    // 真正的流式下载 - 逐块读取和写入
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        // 检查是否收到取消信号
        if cancel_rx.try_recv().is_ok() {
            // 删除部分下载的文件
            let _ = tokio::fs::remove_file(&save_path).await;

            // 从管理器中移除
            {
                let mut manager = DOWNLOAD_MANAGER.lock().unwrap();
                manager.remove(&filename);
            }

            // 发送取消事件
            let _ = app.emit("download-error", serde_json::json!({
                "filename": filename,
                "error": "Download cancelled by user"
            }));

            return Err("Download cancelled by user".to_string());
        }

        let chunk = chunk_result.map_err(|e| format!("Failed to read chunk: {}", e))?;

        // 写入文件
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;

        // 发送进度更新事件（每64KB或每块更新一次）
        let progress = if total_size > 0 {
            (downloaded as f64 / total_size as f64 * 100.0).round() as u32
        } else {
            0
        };

        // 只在进度有显著变化时发送事件，避免过于频繁的更新
        if downloaded % (64 * 1024) == 0 || chunk.len() < 64 * 1024 {
            let _ = app.emit("download-progress", serde_json::json!({
                "filename": filename,
                "downloaded": downloaded,
                "total_size": total_size,
                "progress": progress
            }));
        }
    }

    // 下载完成，从管理器中移除
    {
        let mut manager = DOWNLOAD_MANAGER.lock().unwrap();
        manager.remove(&filename);
    }

    file.flush().await.map_err(|e| format!("Failed to flush file: {}", e))?;

    // 发送完成事件
    let _ = app.emit("download-completed", serde_json::json!({
        "filename": filename,
        "file_path": save_path.display().to_string()
    }));

    Ok(format!("File downloaded successfully to: {}", save_path.display()))
}

#[tauri::command]
async fn cancel_download(filename: String) -> Result<String, String> {
    let mut manager = DOWNLOAD_MANAGER.lock().unwrap();

    if let Some(cancel_sender) = manager.remove(&filename) {
        // 发送取消信号
        let _ = cancel_sender.send(());
        Ok(format!("Download cancellation signal sent for: {}", filename))
    } else {
        Err(format!("No active download found for: {}", filename))
    }
}

// 新的压缩包处理命令

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

/// 开始流式读取文件
#[tauri::command]
async fn start_file_stream<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    entry_path: String,
    chunk_size: Option<usize>,
) -> Result<String, String> {
    ARCHIVE_HANDLER.start_streaming(app, url, headers, filename, entry_path, chunk_size).await
}

/// 暂停流
#[tauri::command]
async fn pause_stream(stream_id: String) -> Result<(), String> {
    ARCHIVE_HANDLER.pause_stream(stream_id)
}

/// 恢复流
#[tauri::command]
async fn resume_stream(stream_id: String) -> Result<(), String> {
    ARCHIVE_HANDLER.resume_stream(stream_id)
}

/// 取消流
#[tauri::command]
async fn cancel_stream(stream_id: String) -> Result<(), String> {
    ARCHIVE_HANDLER.cancel_stream(stream_id)
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

/// 获取支持的压缩格式列表
#[tauri::command]
async fn get_supported_formats() -> Result<Vec<&'static str>, String> {
    Ok(ARCHIVE_HANDLER.get_supported_formats())
}

/// 格式化文件大小
#[tauri::command]
async fn format_file_size(bytes: u64) -> Result<String, String> {
    Ok(ARCHIVE_HANDLER.format_file_size(bytes))
}

/// 获取压缩率
#[tauri::command]
async fn get_compression_ratio(uncompressed: u64, compressed: u64) -> Result<String, String> {
    Ok(ARCHIVE_HANDLER.get_compression_ratio(uncompressed, compressed))
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

/// 获取推荐的分块大小
#[tauri::command]
async fn get_recommended_chunk_size(filename: String, file_size: u64) -> Result<usize, String> {
    Ok(ARCHIVE_HANDLER.get_recommended_chunk_size(&filename, file_size))
}

/// 从压缩文件中提取文件预览
#[allow(dead_code)]
#[tauri::command]
async fn extract_file_preview_from_archive(
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    entry_path: String,
    max_preview_size: Option<usize>,
) -> Result<FilePreview, String> {
    ARCHIVE_HANDLER.get_file_preview(url, headers, filename, entry_path, max_preview_size).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            webdav_request,
            webdav_request_binary,
            download_file_with_progress,
            cancel_download,
            // 新的压缩包处理命令
            analyze_archive,
            get_file_preview,
            start_file_stream,
            pause_stream,
            resume_stream,
            cancel_stream,
            is_supported_archive,
            supports_streaming,
            get_compression_info,
            smart_preview,
            batch_preview,
            get_supported_formats,
            format_file_size,
            get_compression_ratio,
            validate_archive,
            get_recommended_chunk_size
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
