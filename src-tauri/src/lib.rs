mod archive; // 压缩包处理功能
pub mod commands;
mod download; // 下载管理功能
mod storage;
mod utils; // 通用工具模块 // Tauri 命令模块 - 公开以便外部访问

use commands::*; // 导入所有命令
use tauri::{Emitter, Listener};
use tauri_specta::{collect_commands, Builder};

/**
 * 使用插件发现系统加载插件资源
 */
async fn load_plugin_resource_by_discovery(
    plugin_id: String,
    resource_path: String,
) -> Result<Vec<u8>, String> {
    println!(
        "🔍 Loading plugin resource: '{}' for plugin: '{}'",
        resource_path, plugin_id
    );

    // 统一错误处理函数
    let plugin_error = |context: &str, error: String| -> String {
        format!("Plugin resource {}: {}", context, error)
    };

    // 获取插件缓存目录
    let cache_dir = crate::commands::plugin_installer::get_plugin_cache_dir()
        .map_err(|e| plugin_error("cache directory access failed", e.to_string()))?;
    println!("🔍 Plugin cache directory: {}", cache_dir.display());

    // 使用插件发现系统查找插件
    use crate::commands::plugin_discovery::plugin_discover;

    match plugin_discover(Some(false)).await {
        Ok(plugins) => {
            println!("🔍 Found {} plugins", plugins.len());

            // 查找匹配的插件
            for plugin in plugins {
                println!(
                    "🔍 Checking plugin: id='{}', enabled={}, entry_path={:?}",
                    plugin.id, plugin.enabled, plugin.entry_path
                );

                if plugin.id == plugin_id && plugin.entry_path.is_some() {
                    let entry_path = plugin.entry_path.unwrap();
                    println!("✅ Found matching plugin with entry_path: '{}'", entry_path);

                    // 提取插件目录（去掉文件名部分）
                    if let Some(plugin_dir_relative) = std::path::Path::new(&entry_path).parent() {
                        // 根据entry_path的格式判断插件类型
                        let plugin_dir = if entry_path.starts_with(".plugins/") {
                            // 缓存目录中的插件
                            cache_dir.join(
                                plugin_dir_relative
                                    .strip_prefix(".plugins/")
                                    .unwrap_or(plugin_dir_relative),
                            )
                        } else {
                            // npm link的插件，使用项目根目录
                            let current_dir = std::env::current_dir().unwrap_or_default();
                            let project_root = if current_dir.ends_with("src-tauri") {
                                current_dir.parent().unwrap_or(&current_dir)
                            } else {
                                &current_dir
                            };
                            project_root.join(plugin_dir_relative)
                        };

                        println!("🔍 Plugin directory: {}", plugin_dir.display());

                        // 构建资源文件的完整路径
                        let resource_file_path = plugin_dir.join(&resource_path);
                        println!(
                            "🔍 Trying to load resource from: {}",
                            resource_file_path.display()
                        );

                        // 检查文件是否存在
                        if resource_file_path.exists() {
                            println!("✅ Resource file exists!");

                            // 检查路径安全性（使用规范化路径）
                            let canonical_resource_path =
                                resource_file_path.canonicalize().map_err(|e| {
                                    plugin_error("path canonicalization failed", e.to_string())
                                })?;

                            // 对于npm link插件，允许项目根目录下的路径
                            let current_dir = std::env::current_dir().unwrap_or_default();
                            let project_root = if current_dir.ends_with("src-tauri") {
                                current_dir.parent().unwrap_or(&current_dir)
                            } else {
                                &current_dir
                            };
                            let canonical_project_root =
                                project_root.canonicalize().map_err(|e| {
                                    plugin_error(
                                        "project root canonicalization failed",
                                        e.to_string(),
                                    )
                                })?;
                            let canonical_cache_dir = cache_dir.canonicalize().map_err(|e| {
                                plugin_error(
                                    "cache directory canonicalization failed",
                                    e.to_string(),
                                )
                            })?;

                            // 允许缓存目录或项目根目录下的文件
                            if canonical_resource_path.starts_with(&canonical_cache_dir)
                                || canonical_resource_path.starts_with(&canonical_project_root)
                            {
                                println!("✅ Path security check passed");
                                return std::fs::read(&resource_file_path).map_err(|e| {
                                    plugin_error(
                                        &format!(
                                            "file read failed ({})",
                                            resource_file_path.display()
                                        ),
                                        e.to_string(),
                                    )
                                });
                            } else {
                                println!(
                                    "❌ Path security check failed - outside allowed directories"
                                );
                                return Err(plugin_error(
                                    "access denied",
                                    "resource path outside allowed directories".to_string(),
                                ));
                            }
                        } else {
                            println!(
                                "❌ Resource file does not exist at: {}",
                                resource_file_path.display()
                            );
                        }
                    } else {
                        println!(
                            "❌ Failed to get parent directory from entry_path: {}",
                            entry_path
                        );
                    }
                }
            }

            println!("❌ No matching plugin found for id: '{}'", plugin_id);
            Err(plugin_error(
                "not found",
                format!("{} for plugin {}", resource_path, plugin_id),
            ))
        }
        Err(e) => {
            println!("❌ Failed to discover plugins: {}", e);
            Err(plugin_error("discovery failed", e.to_string()))
        }
    }
}

// 前端状态管理 - 用于文件关联处理
static FRONTEND_STATE: std::sync::Mutex<FrontendState> = std::sync::Mutex::new(FrontendState {
    is_ready: false,
    pending_files: Vec::new(),
});

#[derive(Debug)]
struct FrontendState {
    is_ready: bool,
    pending_files: Vec<String>,
}

// 创建文件查看窗口的内部函数
async fn create_file_viewer_window(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<String, String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    // 为每个文件创建唯一的窗口标签
    let window_label = format!(
        "file-viewer-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    // 获取文件名作为窗口标题
    let file_name = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("File Viewer");

    // 创建新窗口，URL 参数传递文件路径
    let encoded_path = urlencoding::encode(&file_path);
    let window_url = format!("/?mode=file-viewer&file={}", encoded_path);

    match WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(window_url.into()))
        .title(file_name) // 只显示文件名
        .inner_size(1200.0, 800.0) // 与主窗口保持一致
        .min_inner_size(400.0, 600.0) // 与主窗口保持一致
        .build()
    {
        Ok(_window) => {
            // 窗口创建成功，文件路径已通过 URL 传递
            Ok(window_label)
        }
        Err(e) => Err(format!("Failed to create window: {}", e)),
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

/// 创建统一的 tauri-specta Builder
/// 用于命令注册和类型导出
pub fn create_specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        // 统一存储接口命令
        storage_get_file_content,
        storage_get_file_info,
        storage_connect,
        storage_disconnect,
        storage_list,
        storage_get_url,
        // 下载管理命令
        download_start,
        download_cancel,
        download_cancel_all,
        download_extract_file,
        // 系统对话框命令
        system_select_folder,
        system_select_file,
        // 压缩包处理命令（统一接口）
        archive_get_file_info,
        archive_get_file_content,
        // 插件发现命令
        plugin_discover,
        // 插件文件加载命令
        load_plugin_file,
        plugin_check_file_exists,
        // 插件管理命令
        plugin_install,
        plugin_uninstall,
        plugin_toggle,
        plugin_get_active,
        // 插件版本管理命令
        plugin_check_updates,
        plugin_update,
        // 窗口主题设置命令
        system_set_theme
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = create_specta_builder();

    // 在开发模式下自动导出 TypeScript 绑定
    #[cfg(debug_assertions)]
    {
        use specta_typescript::Typescript;

        builder
            .export(
                Typescript::default()
                    .formatter(specta_typescript::formatter::prettier)
                    .header("// @ts-nocheck"),
                "../src/types/tauri-commands.ts",
            )
            .expect("Failed to export TypeScript bindings");
    }

    let tauri_builder = tauri::Builder::default();

    let tauri_builder = tauri_builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init());

    let tauri_builder = tauri_builder
        .invoke_handler(builder.invoke_handler())
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
        })
        // 注册自定义协议处理器
        .register_asynchronous_uri_scheme_protocol("plugin-resource", move |_app, request, responder| {
            let uri = request.uri().to_string();
            println!("🌐 Received plugin-resource request: {}", uri);

            tauri::async_runtime::spawn(async move {
                // 解析 plugin-resource://pluginId/resourcePath
                match uri.parse::<url::Url>() {
                    Ok(parsed_uri) => {
                        let plugin_id = parsed_uri.host_str().unwrap_or("");
                        let path = parsed_uri.path();
                        let resource_path = if path.starts_with('/') {
                            &path[1..] // 移除开头的 '/'
                        } else {
                            path
                        };

                        println!("🔌 Plugin ID: '{}', Resource path: '{}'", plugin_id, resource_path);

                        // 使用插件发现系统来查找和加载资源
                        match load_plugin_resource_by_discovery(plugin_id.to_string(), resource_path.to_string()).await {
                            Ok(content) => {
                                println!("✅ Successfully loaded plugin resource: {} bytes", content.len());

                                // 根据文件扩展名设置Content-Type
                                let content_type = match resource_path.split('.').last() {
                                    Some("js") => "application/javascript",
                                    Some("css") => "text/css",
                                    Some("json") => "application/json",
                                    Some("wasm") => "application/wasm",
                                    Some("png") => "image/png",
                                    Some("jpg") | Some("jpeg") => "image/jpeg",
                                    Some("gif") => "image/gif",
                                    Some("svg") => "image/svg+xml",
                                    Some("ico") => "image/x-icon",
                                    Some("ttf") => "font/ttf",
                                    Some("woff") => "font/woff",
                                    Some("woff2") => "font/woff2",
                                    Some("eot") => "application/vnd.ms-fontobject",
                                    Some("otf") => "font/otf",
                                    Some("zip") => "application/zip",
                                    Some("pdf") => "application/pdf",
                                    Some("html") => "text/html",
                                    Some("xml") => "application/xml",
                                    _ => "application/octet-stream", // 默认二进制类型
                                };

                                let response = tauri::http::Response::builder()
                                    .status(200)
                                    .header("Content-Type", content_type)
                            .header("Access-Control-Allow-Origin", "*")
                            .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                            .header("Access-Control-Allow-Headers", "*");

                        match response.body(content) {
                            Ok(response) => {
                                responder.respond(response);
                                println!("✅ Plugin resource loaded: {} for plugin: {}", resource_path, plugin_id);
                            }
                            Err(e) => {
                                println!("❌ Failed to build response for {} (plugin {}): {}", resource_path, plugin_id, e);
                                let error_response = tauri::http::Response::builder()
                                    .status(500)
                                    .body("Internal server error".as_bytes().to_vec())
                                    .unwrap();
                                responder.respond(error_response);
                            }
                        }
                    }
                    Err(e) => {
                        println!("❌ Failed to load plugin resource {} for plugin {}: {}", resource_path, plugin_id, e);
                        let response = tauri::http::Response::builder()
                            .status(404)
                            .body("Resource not found".as_bytes().to_vec())
                            .unwrap();
                        responder.respond(response);
                    }
                }
                    }
                    Err(parse_error) => {
                        println!("❌ Failed to parse plugin-resource URI '{}': {}", uri, parse_error);
                        let error_response = tauri::http::Response::builder()
                            .status(400)
                            .body("Invalid URI format".as_bytes().to_vec())
                            .unwrap();
                        responder.respond(error_response);
                    }
                }
            });
        });

    tauri_builder
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
