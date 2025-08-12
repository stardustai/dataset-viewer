mod storage;
mod archive;  // 压缩包处理功能 - 前端需要使用
mod download; // 下载管理功能
mod utils;    // 通用工具模块

use archive::{handlers::ArchiveHandler, types::*};
use storage::{StorageRequest, ConnectionConfig, get_storage_manager, ListOptions};
use download::{DownloadManager, DownloadRequest};
use std::sync::{Arc, LazyLock, Mutex};
use tauri::{Emitter, Manager, Listener};

// 全局下载管理器
static DOWNLOAD_MANAGER: LazyLock<DownloadManager> =
    LazyLock::new(DownloadManager::new);

// 全局压缩包处理器
static ARCHIVE_HANDLER: LazyLock<Arc<ArchiveHandler>> =
    LazyLock::new(|| Arc::new(ArchiveHandler::new()));

// 前端就绪状态和待处理文件队列
static FRONTEND_STATE: LazyLock<Mutex<FrontendState>> = LazyLock::new(|| {
    Mutex::new(FrontendState {
        is_ready: false,
        pending_files: Vec::new(),
    })
});

#[derive(Debug)]
struct FrontendState {
    is_ready: bool,
    pending_files: Vec<String>,
}

// 处理文件打开请求的辅助函数
fn handle_file_open_request(app: &tauri::AppHandle, file_path: String) {
    // 将窗口置于前台
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.unminimize();
    }
    
    // 检查前端是否就绪
    if let Ok(mut state) = FRONTEND_STATE.lock() {
        if state.is_ready {
            // 前端已就绪，立即发送事件
            let _ = app.emit("file-opened", &file_path);
        } else {
            // 前端未就绪，加入待处理队列
            state.pending_files.push(file_path);
        }
    }
}

// 处理前端就绪事件的辅助函数
fn handle_frontend_ready(app: &tauri::AppHandle) {
    if let Ok(mut state) = FRONTEND_STATE.lock() {
        state.is_ready = true;
        
        // 处理所有待处理的文件
        for file_path in state.pending_files.drain(..) {
            let _ = app.emit("file-opened", &file_path);
        }
    }
}

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
    let client_lock = manager.get_current_client()
        .ok_or_else(|| "No storage client connected".to_string())?;

    // 释放读锁后进行分析
    drop(manager);
    
    // 直接使用客户端，无需包装
    let client = client_lock;
    
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
    let client_lock = manager.get_current_client()
        .ok_or_else(|| "No storage client connected".to_string())?;

    // 释放读锁后进行预览
    drop(manager);
    
    // 直接使用客户端，无需包装
    let client = client_lock;
    
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

    match manager.current_capabilities().await {
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
    
    manager.get_download_url(&path).await
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
        match manager.get_download_url(&url).await {
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
            client,
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
            client,
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

/// Windows 平台文件关联注册
#[cfg(target_os = "windows")]
async fn register_windows_file_associations() -> Result<String, String> {
    use std::process::Command;
    
    // 获取当前可执行文件路径
    let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_path_str = exe_path.to_string_lossy();
    
    // 定义支持的文件扩展名
    let extensions = vec![
        "csv", "xlsx", "xls", "ods", "parquet", "pqt", "zip", "tar", "gz", "tgz", 
        "bz2", "xz", "7z", "rar", "lz4", "zst", "zstd", "br", "txt", "json", 
        "jsonl", "js", "ts", "jsx", "tsx", "html", "css", "scss", "less", "py", 
        "java", "cpp", "c", "php", "rb", "go", "rs", "xml", "yaml", "yml", 
        "sql", "sh", "bat", "ps1", "log", "config", "ini", "tsv", "md", 
        "markdown", "mdown", "mkd", "mdx"
    ];
    
    let mut registered_count = 0;
    
    for ext in extensions {
        // 注册文件类型
        let output = Command::new("reg")
            .args([
                "add",
                &format!("HKCU\\Software\\Classes\\.{}", ext),
                "/v", "",
                "/d", "DatasetViewer.File",
                "/f"
            ])
            .output();
            
        if output.is_ok() {
            registered_count += 1;
        }
    }
    
    // 注册应用程序信息
     let _ = Command::new("reg")
         .args([
             "add",
             "HKCU\\Software\\Classes\\DatasetViewer.File\\shell\\open\\command",
             "/v", "",
             "/d", &format!("\"{}\" \"%1\"", exe_path_str),
             "/f"
         ])
         .output();
    
     Ok(format!("Successfully registered {} file associations on Windows", registered_count))
}

/// macOS 平台文件关联注册
#[cfg(target_os = "macos")]
async fn register_macos_file_associations() -> Result<String, String> {
    // macOS 上文件关联通过 Info.plist 和 Launch Services 处理
    // 在构建时已经通过 tauri.conf.json 中的 fileAssociations 配置
    // 这里可以刷新 Launch Services 数据库
    use std::process::Command;
    
    let output = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
        .args(["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"])
        .output();
        
    match output {
        Ok(_) => Ok("File associations refreshed successfully on macOS".to_string()),
        Err(e) => Err(format!("Failed to refresh file associations on macOS: {}", e))
    }
}

/// Linux 平台文件关联注册
#[cfg(target_os = "linux")]
async fn register_linux_file_associations() -> Result<String, String> {
    use std::process::Command;
    use std::fs;
    use std::path::Path;
    
    // 获取当前可执行文件路径
    let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_path_str = exe_path.to_string_lossy();
    
    // 创建 .desktop 文件
    let home_dir = std::env::var("HOME").map_err(|_| "Failed to get HOME directory".to_string())?;
    let desktop_dir = format!("{}/.local/share/applications", home_dir);
    let desktop_file_path = format!("{}/dataset-viewer.desktop", desktop_dir);
    
    // 确保目录存在
    if let Some(parent) = Path::new(&desktop_file_path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    let desktop_content = format!(
        "[Desktop Entry]\n\
        Name=Dataset Viewer\n\
        Comment=Modern dataset viewer with large file streaming support\n\
        Exec={} %f\n\
        Icon=dataset-viewer\n\
        Terminal=false\n\
        Type=Application\n\
        Categories=Office;Development;\n\
        MimeType=text/csv;application/vnd.ms-excel;application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;application/vnd.oasis.opendocument.spreadsheet;application/octet-stream;application/zip;application/x-tar;application/gzip;application/x-bzip2;application/x-xz;application/x-7z-compressed;application/x-rar-compressed;text/plain;application/json;text/html;text/css;text/javascript;application/javascript;text/x-python;text/x-java-source;text/x-c;text/x-c++;text/x-php;text/x-ruby;text/x-go;text/x-rust;application/xml;text/yaml;application/sql;text/x-shellscript;text/x-log;text/markdown;image/jpeg;image/png;image/gif;image/webp;image/svg+xml;image/bmp;image/x-icon;image/tiff;application/pdf;video/mp4;video/webm;video/ogg;video/x-msvideo;video/quicktime;video/x-ms-wmv;video/x-flv;video/x-matroska;audio/mpeg;audio/ogg;audio/wav;audio/x-flac;audio/aac;audio/x-m4a;application/msword;application/vnd.openxmlformats-officedocument.wordprocessingml.document;application/rtf;application/vnd.ms-powerpoint;application/vnd.openxmlformats-officedocument.presentationml.presentation;application/vnd.oasis.opendocument.presentation;\n",
        exe_path_str
    );
    
    fs::write(&desktop_file_path, desktop_content)
        .map_err(|e| format!("Failed to write desktop file: {}", e))?;
    
    // 更新 MIME 数据库
    let _ = Command::new("update-desktop-database")
        .arg(desktop_dir)
        .output();
        
    Ok("File associations registered successfully on Linux".to_string())
}

/// 注册文件关联
/// 在不同平台上注册应用程序与支持的文件类型的关联
#[tauri::command]
async fn register_file_associations() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // Windows 平台的文件关联注册
        register_windows_file_associations().await
    }
    #[cfg(target_os = "macos")]
    {
        // macOS 平台的文件关联注册
        register_macos_file_associations().await
    }
    #[cfg(target_os = "linux")]
    {
        // Linux 平台的文件关联注册
        register_linux_file_associations().await
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
     {
         Err("File association registration is not supported on this platform".to_string())
     }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 当应用已经运行时，处理新的文件打开请求
            if args.len() > 1 {
                let file_path = &args[1];
                if std::path::Path::new(file_path).exists() {
                    handle_file_open_request(app, file_path.to_string());
                }
            }
        }))
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
            handle_android_back_button,
            // 文件关联注册命令
            register_file_associations
        ])
        .setup(|app| {
            // 监听前端就绪事件
            let app_handle = app.handle().clone();
            app.listen("frontend-ready", move |_event| {
                handle_frontend_ready(&app_handle);
            });
            
            // 处理命令行参数，支持文件关联
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let file_path = &args[1];
                if std::path::Path::new(file_path).exists() {
                    handle_file_open_request(&app.handle(), file_path.to_string());
                }
            }
            Ok(())
        });

    #[cfg(target_os = "android")]
    let builder = builder.on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            // 在安卓上拦截关闭事件，转换为返回按钮事件
            let app_handle = window.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = handle_android_back_button(app_handle).await;
            });
            api.prevent_close();
        }
    });

    builder
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let files = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .collect::<Vec<_>>();
                
                if !files.is_empty() {
                    let file_path = files[0].to_string_lossy().to_string();
                    handle_file_open_request(app, file_path);
                }
            }
        });
}
