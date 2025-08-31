// 系统控制命令
// 提供系统集成、窗口管理和平台特定功能

use std::process::Command;

/// 显示文件夹选择对话框
/// 跨平台的目录选择功能
#[tauri::command]
#[specta::specta]
pub async fn system_select_folder(_app: tauri::AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "ios")]
    {
        return Err("Folder selection is not supported on iOS platform".to_string());
    }

    #[cfg(desktop)]
    {
        use std::sync::mpsc;
        use tauri_plugin_dialog::DialogExt;

        let (tx, rx) = mpsc::channel();

        _app.dialog()
            .file()
            .set_title("选择目录")
            .pick_folder(move |folder| {
                let _ = tx.send(folder);
            });

        match rx.recv() {
            Ok(Some(folder)) => {
                let path_buf = folder
                    .into_path()
                    .map_err(|e| format!("Failed to get path: {}", e))?;

                // 确保返回正确的绝对路径
                let path_str = if cfg!(target_os = "windows") {
                    path_buf.to_string_lossy().to_string()
                } else {
                    // 对于 Unix 系统，确保路径以 / 开头
                    let path_str = path_buf.to_string_lossy().to_string();
                    if path_str.starts_with('/') {
                        path_str
                    } else {
                        format!("/{}", path_str)
                    }
                };

                println!("Selected folder path: {}", path_str);
                Ok(Some(path_str))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(format!("Failed to receive folder selection: {}", e)),
        }
    }
}

/// 注册支持的文件类型关联（仅能力注册，不设置为默认）
/// 让系统知道应用程序可以打开这些文件类型，但不设置为默认应用
#[tauri::command]
#[specta::specta]
pub async fn system_register_file_capabilities(extensions: Vec<String>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        register_windows_file_capabilities(extensions).await
    }
    #[cfg(target_os = "macos")]
    {
        register_macos_file_capabilities().await
    }
    #[cfg(target_os = "linux")]
    {
        register_linux_file_capabilities(extensions).await
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("File capability registration is not supported on this platform".to_string())
    }
}

/// 设置应用主题
/// 支持自动、亮色、暗色三种主题模式
#[tauri::command]
#[specta::specta]
pub async fn system_set_theme(app: tauri::AppHandle, theme: String) -> Result<String, String> {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("main") {
        let tauri_theme = match theme.as_str() {
            "dark" => Some(tauri::Theme::Dark),
            "light" => Some(tauri::Theme::Light),
            "system" => None, // None 表示使用系统默认主题
            _ => return Err(format!("Unknown theme: {}", theme)),
        };

        match window.set_theme(tauri_theme) {
            Ok(_) => {
                let theme_description = match theme.as_str() {
                    "dark" => "Dark",
                    "light" => "Light",
                    "system" => "System default",
                    _ => "Unknown",
                };
                Ok(format!("Window theme set to {}", theme_description))
            }
            Err(e) => Err(format!("Failed to set window theme: {}", e)),
        }
    } else {
        Err("Main window not found".to_string())
    }
}

// 平台特定的文件关联实现

/// Windows 平台文件能力注册（仅注册能力，不设置为默认）
#[cfg(target_os = "windows")]
async fn register_windows_file_capabilities(extensions: Vec<String>) -> Result<String, String> {
    // 获取当前可执行文件路径
    let exe_path =
        std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_path_str = exe_path.to_string_lossy();
    let app_name = "dataset-viewer.exe";

    let mut registered_count = 0;

    // 注册应用程序能力（不设置为默认）
    let app_key = format!("HKCU\\Software\\Classes\\Applications\\{}", app_name);

    // 注册应用程序基本信息
    let _ = Command::new("reg")
        .args([
            "add",
            &format!("{}\\shell\\open\\command", app_key),
            "/v",
            "",
            "/d",
            &format!("\"{}\" \"%1\"", exe_path_str),
            "/f",
        ])
        .output();

    // 注册支持的文件扩展名（仅能力注册）
    for ext in extensions {
        let output = Command::new("reg")
            .args([
                "add",
                &format!("{}\\SupportedTypes", app_key),
                "/v",
                &format!(".{}", ext),
                "/d",
                "",
                "/f",
            ])
            .output();

        if output.is_ok() {
            registered_count += 1;
        }
    }

    Ok(format!(
        "Successfully registered capability for {} file types on Windows",
        registered_count
    ))
}

/// macOS 平台文件能力注册（仅注册能力，不设置为默认）
#[cfg(target_os = "macos")]
async fn register_macos_file_capabilities() -> Result<String, String> {
    // macOS 上文件关联通过 Info.plist 和 Launch Services 处理
    // 在构建时已经通过 tauri.conf.json 中的 fileAssociations 配置
    // 这里只刷新 Launch Services 数据库，让系统知道应用能力
    let output = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
        .args(["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"])
        .output();

    match output {
        Ok(_) => Ok("File capabilities refreshed successfully on macOS".to_string()),
        Err(e) => Err(format!(
            "Failed to refresh file capabilities on macOS: {}",
            e
        )),
    }
}

/// Linux 平台文件能力注册（仅注册能力，不设置为默认）
#[cfg(target_os = "linux")]
async fn register_linux_file_capabilities(extensions: Vec<String>) -> Result<String, String> {
    use std::fs;
    use std::path::Path;

    // 获取当前可执行文件路径
    let exe_path =
        std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_path_str = exe_path.to_string_lossy();

    // 创建 .desktop 文件
    let home_dir = std::env::var("HOME").map_err(|_| "Failed to get HOME directory".to_string())?;
    let desktop_dir = format!("{}/.local/share/applications", home_dir);
    let desktop_file_path = format!("{}/dataset-viewer.desktop", desktop_dir);

    // 确保目录存在
    if let Some(parent) = Path::new(&desktop_file_path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // 生成基本 MIME 类型（简化映射，让前端处理复杂逻辑）
    let mime_types: Vec<String> = extensions
        .iter()
        .map(|ext| {
            match ext.as_str() {
                "csv" => "text/csv",
                "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "json" => "application/json",
                "txt" => "text/plain",
                "pdf" => "application/pdf",
                "zip" => "application/zip",
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                _ => "application/octet-stream", // 通用类型
            }
            .to_string()
        })
        .collect();

    let mime_string = mime_types.join(";");

    let desktop_content = format!(
        "[Desktop Entry]\n\
        Name=Dataset Viewer\n\
        Comment=Modern dataset viewer with large file streaming support\n\
        Exec={} %f\n\
        Icon=dataset-viewer\n\
        Terminal=false\n\
        Type=Application\n\
        Categories=Office;Development;\n\
        MimeType={};\n",
        exe_path_str, mime_string
    );

    fs::write(&desktop_file_path, desktop_content)
        .map_err(|e| format!("Failed to write desktop file: {}", e))?;

    // 更新 MIME 数据库（仅注册能力，不设置为默认）
    let _ = Command::new("update-desktop-database")
        .arg(desktop_dir)
        .output();

    Ok(format!(
        "File capabilities registered successfully for {} types on Linux",
        extensions.len()
    ))
}
