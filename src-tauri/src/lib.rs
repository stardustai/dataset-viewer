mod storage;
mod archive;  // 压缩包处理功能 - 前端需要使用
mod download; // 下载管理功能
mod utils;    // 通用工具模块

use archive::{handlers::ArchiveHandler, types::*};
use storage::{StorageRequest, ConnectionConfig, get_storage_manager, ListOptions};
use download::{DownloadManager, DownloadRequest};
use std::sync::{Arc, LazyLock};
use tauri::Emitter;


// 移除参数结构体，直接在命令中使用 serde rename 属性

// 全局下载管理器
static DOWNLOAD_MANAGER: LazyLock<DownloadManager> =
    LazyLock::new(DownloadManager::new);

// 全局压缩包处理器
static ARCHIVE_HANDLER: LazyLock<Arc<ArchiveHandler>> =
    LazyLock::new(|| Arc::new(ArchiveHandler::new()));

#[tauri::command]
async fn storage_request(
    protocol: String,
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
    options: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let manager_arc = get_storage_manager().await;

    // 如果是本地文件系统的连接检查，需要先创建临时客户端
    if protocol == "local" && method == "CHECK_ACCESS" {
        // 创建连接配置
        let config = ConnectionConfig {
            protocol: "local".to_string(),
            url: Some(url.clone()),
            access_key: None,
            secret_key: None,
            region: None,
            bucket: None,
            endpoint: None,
            username: None,
            password: None,
            extra_options: None,
        };

        // 使用 StorageManager 的 connect 方法 - 需要写锁
        let mut manager = manager_arc.write().await;
        match manager.connect(&config).await {
            Ok(_) => {
                // 返回成功响应
                return Ok(serde_json::json!({
                    "status": 200,
                    "headers": {},
                    "body": "OK",
                    "metadata": null
                }));
            }
            Err(e) => {
                return Err(format!("Local storage connection failed: {}", e));
            }
        }
    }

    // 如果是 HuggingFace 的连接检查，需要先创建临时客户端
    if protocol == "huggingface" && method == "CHECK_ACCESS" {
        // 创建连接配置
        let config = ConnectionConfig {
            protocol: "huggingface".to_string(),
            url: Some(url.clone()),
            access_key: None,
            secret_key: None,
            region: None,
            bucket: None,
            endpoint: None,
            username: None,
            password: None,
            extra_options: options.clone().map(|v| {
                // 尝试将 serde_json::Value 转换为 HashMap<String, String>
                if let serde_json::Value::Object(map) = v {
                    map.into_iter()
                        .filter_map(|(k, v)| {
                            if let serde_json::Value::String(s) = v {
                                Some((k, s))
                            } else {
                                Some((k, v.to_string()))
                            }
                        })
                        .collect()
                } else {
                    std::collections::HashMap::new()
                }
            }),
        };

        // 使用 StorageManager 的 connect 方法 - 需要写锁
        let mut manager = manager_arc.write().await;
        match manager.connect(&config).await {
            Ok(_) => {
                // 返回成功响应
                return Ok(serde_json::json!({
                    "status": 200,
                    "headers": {},
                    "body": "OK",
                    "metadata": null
                }));
            }
            Err(e) => {
                return Err(format!("HuggingFace connection failed: {}", e));
            }
        }
    }

    let request = StorageRequest {
        method,
        url,
        headers,
        body,
        options,
    };

    // 对于普通请求，使用读锁（已优化为支持并发）
    let manager = manager_arc.read().await;
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
async fn analyze_archive_with_client(
    _protocol: String,
    file_path: String,
    filename: String,
    max_size: Option<usize>,
) -> Result<ArchiveInfo, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    // 获取对应的存储客户端
    let client = manager.get_current_client()
        .ok_or_else(|| "No storage client connected".to_string())?;

    // 释放读锁后进行分析
    drop(manager);
    
    // 使用压缩包处理器分析文件
    ARCHIVE_HANDLER.analyze_archive_with_client(
        client,
        file_path,
        filename,
        max_size,
    ).await
}

#[tauri::command]
async fn get_archive_preview_with_client(
    _protocol: String,
    file_path: String,
    filename: String,
    entry_path: String,
    max_preview_size: Option<usize>,
) -> Result<FilePreview, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    // 获取对应的存储客户端
    let client = manager.get_current_client()
        .ok_or_else(|| "No storage client connected".to_string())?;

    // 释放读锁后进行预览
    drop(manager);
    
    // 使用压缩包处理器获取文件预览
    ARCHIVE_HANDLER.get_file_preview_with_client(
        client,
        file_path,
        filename,
        entry_path,
        max_preview_size,
        None::<fn(u64, u64)>, // 不使用进度回调
        None, // 不使用取消信号
    ).await
}

#[tauri::command]
async fn storage_request_binary(
    _protocol: String,
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    options: Option<serde_json::Value>,
) -> Result<Vec<u8>, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    let request = StorageRequest {
        method,
        url,
        headers,
        body: None,
        options,
    };

    match manager.request_binary(&request).await {
        Ok(data) => Ok(data),
        Err(e) => Err(format!("Binary request failed: {}", e))
    }
}

// 存储连接管理命令
#[tauri::command]
async fn storage_connect(config: ConnectionConfig) -> Result<bool, String> {
    let manager_arc = get_storage_manager().await;
    let mut manager = manager_arc.write().await;

    match manager.connect(&config).await {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Connection failed: {}", e))
    }
}

#[tauri::command]
async fn storage_disconnect() -> Result<bool, String> {
    let manager_arc = get_storage_manager().await;
    let mut manager = manager_arc.write().await;

    match manager.disconnect().await {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Disconnect failed: {}", e))
    }
}

#[tauri::command]
async fn storage_is_connected() -> Result<bool, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    Ok(manager.is_connected())
}

#[tauri::command]
async fn storage_get_capabilities() -> Result<serde_json::Value, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    match manager.current_capabilities() {
        Some(caps) => Ok(serde_json::to_value(caps).unwrap()),
        None => Err("No active connection".to_string())
    }
}

#[tauri::command]
async fn storage_get_supported_protocols() -> Result<Vec<String>, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    Ok(manager.supported_protocols().iter().map(|s| s.to_string()).collect())
}

#[tauri::command]
async fn storage_list_directory(
    path: String,
    options: Option<ListOptions>,
) -> Result<serde_json::Value, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    match manager.list_directory(&path, options.as_ref()).await {
        Ok(result) => Ok(serde_json::to_value(result).unwrap()),
        Err(e) => Err(format!("List directory failed: {}", e))
    }
}

#[tauri::command]
async fn storage_get_download_url(path: String) -> Result<String, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;
    
    manager.get_download_url(&path)
        .map_err(|e| format!("Failed to get download URL: {}", e))
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
    // 获取存储管理器并处理下载URL（避免死锁）
    let download_url = {
        let manager_arc = get_storage_manager().await;
        let manager = manager_arc.read().await;

        // 通过存储客户端获取正确的下载 URL
        // 每个存储客户端会根据自己的特点处理路径到 URL 的转换
        match manager.get_download_url(&url) {
            Ok(processed_url) => {
                println!("Generated download URL: {} -> {}", url, processed_url);
                processed_url
            },
            Err(e) => {
                println!("Failed to generate download URL for {}: {}, using original URL", url, e);
                url
            }
        }
        // 锁在这里自动释放
    };

    let request = DownloadRequest {
        method,
        url: download_url,
        headers,
        filename,
    };

    DOWNLOAD_MANAGER.download_with_progress(app, request).await
}

#[tauri::command]
async fn cancel_download(filename: String) -> Result<String, String> {
    DOWNLOAD_MANAGER.cancel_download(&filename)
}

#[tauri::command]
async fn download_archive_file_with_progress(
    app: tauri::AppHandle,
    archive_path: String,
    archive_filename: String,
    entry_path: String,
    entry_filename: String,
) -> Result<String, String> {
    // 使用统一的下载管理器来处理压缩包文件下载，支持取消功能
    DOWNLOAD_MANAGER
        .download_archive_file_with_progress(
            app,
            archive_path,
            archive_filename,
            entry_path,
            entry_filename,
        )
        .await
}

// 系统对话框命令

/// 显示文件夹选择对话框
#[tauri::command]
async fn show_folder_dialog(_app: tauri::AppHandle) -> Result<Option<String>, String> {
    // Android and iOS don't support folder picker
    #[cfg(target_os = "android")]
    {
        return Err("Folder selection is not supported on Android platform".to_string());
    }
    
    #[cfg(target_os = "ios")]
    {
        return Err("Folder selection is not supported on iOS platform".to_string());
    }
    
    #[cfg(desktop)]
    {
        use tauri_plugin_dialog::DialogExt;
        use std::sync::mpsc;
        
        let (tx, rx) = mpsc::channel();
        
        _app.dialog()
            .file()
            .set_title("选择目录")
            .pick_folder(move |folder| {
                let _ = tx.send(folder);
            });
        
        match rx.recv() {
            Ok(Some(folder)) => {
                let path_buf = folder.into_path()
                    .map_err(|e| format!("Failed to get path: {}", e))?;
                Ok(Some(path_buf.to_string_lossy().to_string()))
            },
            Ok(None) => Ok(None),
            Err(e) => Err(format!("Failed to receive folder selection: {}", e)),
        }
    }
}

// 压缩包处理命令

/// 分析压缩包结构（统一接口）
#[tauri::command]
async fn analyze_archive(
    url: String,
    _headers: std::collections::HashMap<String, String>,
    filename: String,
    max_size: Option<usize>,
) -> Result<ArchiveInfo, String> {
    // 统一使用StorageClient接口进行流式分析
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    if let Some(client) = manager.get_current_client() {
        let protocol = client.protocol();
        println!("使用{}存储客户端进行流式分析: {}", protocol, url);
        drop(manager);

        ARCHIVE_HANDLER.analyze_archive_with_client(
            client.clone(),
            url,
            filename,
            max_size
        ).await
    } else {
        Err("No storage client available. Please connect to a storage first (Local, WebDAV, OSS, or HuggingFace)".to_string())
    }
}

/// 获取文件预览（统一接口）
#[tauri::command(rename_all = "camelCase")]
async fn get_file_preview(
    url: String,
    _headers: std::collections::HashMap<String, String>,
    filename: String,
    entry_path: String,
    max_preview_size: Option<usize>
) -> Result<FilePreview, String> {
    // 统一使用StorageClient接口进行流式预览
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    if let Some(client) = manager.get_current_client() {
        let protocol = client.protocol();
        println!("使用{}存储客户端进行流式预览: {} -> {}", protocol, url, entry_path);
        drop(manager);

        ARCHIVE_HANDLER.get_file_preview_with_client(
            client.clone(),
            url,
            filename,
            entry_path,
            max_preview_size,
            None::<fn(u64, u64)>, // 不使用进度回调
            None, // 不使用取消信号
        ).await
    } else {
        Err("No storage client available. Please connect to a storage first (Local, WebDAV, OSS, or HuggingFace)".to_string())
    }
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

/// 获取支持的压缩格式列表

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

// 安卓返回按钮处理
#[tauri::command]
async fn handle_android_back_button(app: tauri::AppHandle) -> Result<bool, String> {
    // 发送自定义事件到前端
    app.emit("android-back-button", ())
        .map_err(|e| format!("Failed to emit android back button event: {}", e))?;
    
    // 返回 true 表示事件已被处理，阻止默认行为
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            // 统一存储接口命令
            storage_request,
            storage_request_binary,
            storage_connect,
            storage_disconnect,
            storage_is_connected,
            storage_get_capabilities,
            storage_get_supported_protocols,
            storage_list_directory,
            storage_get_download_url,
            // 下载进度命令
            download_file_with_progress,
            cancel_download,
            download_archive_file_with_progress,
            // 系统对话框命令
            show_folder_dialog,
            // 压缩包处理命令
            analyze_archive,
            get_file_preview,
            is_supported_archive,
            supports_streaming,
            get_compression_info,
            get_supported_formats,
            format_file_size,
            get_compression_ratio,
            get_recommended_chunk_size,
            // 新增：通过存储客户端的压缩包处理命令
            analyze_archive_with_client,
            get_archive_preview_with_client,
            handle_android_back_button
        ]);

    #[cfg(target_os = "android")]
    {
        builder = builder.on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 在安卓上拦截关闭事件，转换为返回按钮事件
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = handle_android_back_button(app_handle).await;
                });
                api.prevent_close();
            }
        });
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
