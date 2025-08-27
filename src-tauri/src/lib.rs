mod storage;
mod archive;  // 压缩包处理功能
mod download; // 下载管理功能
mod utils;    // 通用工具模块
mod commands; // Tauri 命令模块

use commands::*;  // 导入所有命令
use tauri::{Emitter, Listener};

// 前端状态管理 - 用于文件关联处理
static FRONTEND_STATE: std::sync::Mutex<FrontendState> = std::sync::Mutex::new(
    FrontendState {
        is_ready: false,
        pending_files: Vec::new(),
    }
);

#[derive(Debug)]
struct FrontendState {
    is_ready: bool,
    pending_files: Vec<String>,
}

// 创建文件查看窗口的内部函数
async fn create_file_viewer_window(app: tauri::AppHandle, file_path: String) -> Result<String, String> {
    use tauri::{WebviewWindowBuilder, WebviewUrl};

    // 为每个文件创建唯一的窗口标签
    let window_label = format!("file-viewer-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());

    // 获取文件名作为窗口标题
    let file_name = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("File Viewer");

    // 创建新窗口，URL 参数传递文件路径
    let encoded_path = urlencoding::encode(&file_path);
    let window_url = format!("/?mode=file-viewer&file={}", encoded_path);

    match WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(window_url.into()))
        .title(file_name)  // 只显示文件名
        .inner_size(1200.0, 800.0)  // 与主窗口保持一致
        .min_inner_size(400.0, 600.0)  // 与主窗口保持一致
        .build()
    {
        Ok(_window) => {
            // 窗口创建成功，文件路径已通过 URL 传递
            Ok(window_label)
        },
        Err(e) => Err(format!("Failed to create window: {}", e))
    }
}

// 处理文件打开请求的辅助函数
fn handle_file_open_request(app: &tauri::AppHandle, file_path: String) {
    // 检查前端是否就绪
    if let Ok(mut state) = FRONTEND_STATE.lock() {
        if state.is_ready {
            // 前端已就绪，创建独立的文件查看窗口
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = create_file_viewer_window(app_handle, file_path).await {
                    eprintln!("Failed to create file viewer window: {}", e);
                }
            });
        } else {
            // 前端未就绪，加入待处理队列（冷启动情况）
            state.pending_files.push(file_path);
        }
    }
}

// 处理前端就绪事件的辅助函数
fn handle_frontend_ready(app: &tauri::AppHandle) {
    if let Ok(mut state) = FRONTEND_STATE.lock() {
        state.is_ready = true;

        // 如果有待处理的文件，发送文件打开事件到前端
        if !state.pending_files.is_empty() {
            let files_to_process: Vec<String> = state.pending_files.drain(..).collect();

            // 对于冷启动，只处理第一个文件，发送到主窗口
            if let Some(file_path) = files_to_process.first() {
                // 发送文件打开事件到前端
                if let Err(e) = app.emit("file-opened", file_path) {
                    eprintln!("Failed to emit file-opened event: {}", e);
                }
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    let builder = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init());

    let builder = builder
        .invoke_handler(tauri::generate_handler![
            // 统一存储接口命令
            storage_request,
            storage_request_binary,
            storage_connect,
            storage_disconnect,
            storage_list_directory,
            storage_get_download_url,
            // 下载管理命令
            download_file_with_progress,
            cancel_download,
            cancel_all_downloads,
            download_archive_file_with_progress,
            get_default_download_path,
            // 系统对话框命令
            show_folder_dialog,
            // 压缩包处理命令
            analyze_archive,
            get_file_preview,
            // 新增：通过存储客户端的压缩包处理命令
            analyze_archive_with_client,
            get_archive_preview_with_client,
            // 文件关联注册命令
            register_file_associations,
            // 窗口主题设置命令
            set_window_theme
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
