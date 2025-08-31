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

/// 管理文件类型关联
/// 统一的文件关联管理接口，支持注册选定的扩展名和取消未选中的扩展名
#[tauri::command]
#[specta::specta]
pub async fn system_manage_file_associations(
    selected_extensions: Vec<String>,
    unselected_extensions: Vec<String>,
    mime_types: Option<Vec<String>>, // Linux 平台需要的 MIME 类型列表
) -> Result<String, String> {
    manage_file_associations(selected_extensions, unselected_extensions, mime_types).await
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
// 文件扩展名列表现在由前端 src/utils/fileTypes.ts 提供

/// 统一的文件关联管理实现
async fn manage_file_associations(
    selected_extensions: Vec<String>,
    unselected_extensions: Vec<String>,
    _mime_types: Option<Vec<String>>,
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::env;

        let mut operations_count = 0;
        let mut errors = Vec::new();

        // 首先取消未选中的文件类型关联
        for ext in &unselected_extensions {
            // 删除扩展名关联
            let delete_ext_output = Command::new("reg")
                .args([
                    "delete",
                    &format!("HKCU\\Software\\Classes\\.{}", ext),
                    "/f",
                ])
                .output();

            if delete_ext_output.is_ok() {
                operations_count += 1;
            } else {
                errors.push(format!("Failed to remove association for .{}", ext));
            }

            // 也删除 Applications 下的关联（如果存在）
            let _ = Command::new("reg")
                .args([
                    "delete",
                    &format!("HKCU\\Software\\Classes\\Applications\\dataset-viewer.exe\\SupportedTypes\\.{}", ext),
                    "/f",
                ])
                .output();
        }

        // 然后注册选中的文件类型关联
        if !selected_extensions.is_empty() {
            let exe_path =
                env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
            let exe_path_str = exe_path.to_string_lossy();

            // 注册应用程序信息
            let _ = Command::new("reg")
                .args([
                    "add",
                    "HKCU\\Software\\Classes\\DatasetViewer.File\\shell\\open\\command",
                    "/v",
                    "",
                    "/d",
                    &format!("\"{}\" \"%1\"", exe_path_str),
                    "/f",
                ])
                .output();

            // 设置应用程序友好名称
            let _ = Command::new("reg")
                .args([
                    "add",
                    "HKCU\\Software\\Classes\\DatasetViewer.File",
                    "/v",
                    "",
                    "/d",
                    "Dataset Viewer File",
                    "/f",
                ])
                .output();

            for ext in &selected_extensions {
                // 设置扩展名关联
                let set_ext_output = Command::new("reg")
                    .args([
                        "add",
                        &format!("HKCU\\Software\\Classes\\.{}", ext),
                        "/v",
                        "",
                        "/d",
                        "DatasetViewer.File",
                        "/f",
                    ])
                    .output();

                if set_ext_output.is_ok() {
                    operations_count += 1;
                } else {
                    errors.push(format!("Failed to set association for .{}", ext));
                }

                // 也在 Applications 下注册支持
                let _ = Command::new("reg")
                    .args([
                        "add",
                        &format!("HKCU\\Software\\Classes\\Applications\\dataset-viewer.exe\\SupportedTypes\\.{}", ext),
                        "/v",
                        "",
                        "/d",
                        "",
                        "/f",
                    ])
                    .output();
            }

            // 刷新 shell 图标缓存
            let _ = Command::new("ie4uinit.exe").args(["-show"]).output();
        }

        if !errors.is_empty() && errors.len() > 3 {
            return Err(format!(
                "Multiple errors occurred: {} operations succeeded, {} failed",
                operations_count,
                errors.len()
            ));
        }

        Ok(format!(
            "Successfully managed {} file associations on Windows ({} selected, {} unselected)",
            operations_count,
            selected_extensions.len(),
            unselected_extensions.len()
        ))
    }

    #[cfg(target_os = "macos")]
    {
        // macOS 上的文件关联通过 Info.plist 预配置
        // 这里主要是刷新系统服务，让系统重新识别应用的关联能力
        let output = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
            .args(["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"])
            .output();

        match output {
            Ok(_) => Ok(format!(
                "File associations managed on macOS ({} selected, {} unselected)",
                selected_extensions.len(),
                unselected_extensions.len()
            )),
            Err(e) => Err(format!(
                "Failed to manage file associations on macOS: {}",
                e
            )),
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::env;
        use std::fs;
        use std::path::Path;

        let home_dir = env::var("HOME").map_err(|_| "Failed to get HOME directory".to_string())?;
        let desktop_dir = format!("{}/.local/share/applications", home_dir);
        let desktop_file_path = format!("{}/dataset-viewer.desktop", desktop_dir);

        if selected_extensions.is_empty() {
            // 如果没有选中的扩展名，删除 .desktop 文件
            if fs::remove_file(&desktop_file_path).is_ok() {
                let _ = Command::new("update-desktop-database")
                    .arg(&desktop_dir)
                    .output();
                return Ok("File associations cleared on Linux".to_string());
            } else {
                return Ok("No file associations found to clear on Linux".to_string());
            }
        }

        // 获取当前可执行文件路径
        let exe_path =
            env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
        let exe_path_str = exe_path.to_string_lossy();

        // 确保目录存在
        if let Some(parent) = Path::new(&desktop_file_path).parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        // 使用前端传递的 MIME 类型列表，转换为分号分隔的字符串
        let mime_type_string = _mime_types
            .as_ref()
            .map(|types| types.join(";"))
            .unwrap_or_default();

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
            exe_path_str, mime_type_string
        );

        fs::write(&desktop_file_path, desktop_content)
            .map_err(|e| format!("Failed to write desktop file: {}", e))?;

        // 更新 MIME 数据库
        let _ = Command::new("update-desktop-database")
            .arg(desktop_dir)
            .output();

        Ok(format!(
            "File associations managed on Linux ({} selected, {} unselected)",
            selected_extensions.len(),
            unselected_extensions.len()
        ))
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("File association management is not supported on this platform".to_string())
    }
}
