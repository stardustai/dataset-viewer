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
