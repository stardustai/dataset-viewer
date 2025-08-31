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

/// 注册支持的文件类型关联 (兼容性方法)
/// 仅注册应用程序能力，不设置为默认程序
/// 现在接受前端提供的扩展名列表
#[tauri::command]
#[specta::specta]
pub async fn system_register_files(extensions: Vec<String>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        register_windows_file_associations(extensions).await
    }
    #[cfg(target_os = "macos")]
    {
        register_macos_file_associations().await
    }
    #[cfg(target_os = "linux")]
    {
        register_linux_file_associations(extensions).await
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("File association registration is not supported on this platform".to_string())
    }
}

/// 获取所有支持的文件扩展名列表
/// 返回应用程序可以处理的所有文件类型
/// 现在由前端提供，后端不再维护文件扩展名列表
#[tauri::command]
#[specta::specta]
pub async fn system_get_supported_extensions() -> Result<Vec<String>, String> {
    // 返回空列表，让前端使用 fileTypes.ts 中的 FILE_EXTENSIONS
    Ok(vec![])
}

/// 注册选定的文件类型关联
/// 只为用户选择的文件类型设置默认程序关联
#[tauri::command]
#[specta::specta]
pub async fn system_register_selected_files(extensions: Vec<String>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        register_windows_selected_file_associations(extensions).await
    }
    #[cfg(target_os = "macos")]
    {
        register_macos_selected_file_associations(extensions).await
    }
    #[cfg(target_os = "linux")]
    {
        register_linux_selected_file_associations(extensions).await
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("File association registration is not supported on this platform".to_string())
    }
}

/// 取消注册指定的文件类型关联
/// 移除指定文件类型的默认程序关联
#[tauri::command]
#[specta::specta]
pub async fn system_unregister_files(extensions: Vec<String>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        unregister_windows_file_associations(extensions).await
    }
    #[cfg(target_os = "macos")]
    {
        unregister_macos_file_associations(extensions).await
    }
    #[cfg(target_os = "linux")]
    {
        unregister_linux_file_associations(extensions).await
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("File association unregistration is not supported on this platform".to_string())
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
// 文件扩展名列表现在由前端 src/utils/fileTypes.ts 提供

/// Windows 平台选择性文件关联注册
#[cfg(target_os = "windows")]
async fn register_windows_selected_file_associations(extensions: Vec<String>) -> Result<String, String> {
    // 获取当前可执行文件路径
    let exe_path =
        std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_path_str = exe_path.to_string_lossy();

    let mut registered_count = 0;

    for ext in &extensions {
        // 注册文件类型
        let output = Command::new("reg")
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

        if output.is_ok() {
            registered_count += 1;
        }
    }

    // 如果注册了任何文件类型，就注册应用程序信息
    if registered_count > 0 {
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
    }

    Ok(format!(
        "Successfully registered {} file associations on Windows",
        registered_count
    ))
}

/// Windows 平台文件关联取消注册
#[cfg(target_os = "windows")]
async fn unregister_windows_file_associations(extensions: Vec<String>) -> Result<String, String> {
    let mut unregistered_count = 0;

    for ext in &extensions {
        // 删除文件类型关联
        let output = Command::new("reg")
            .args([
                "delete",
                &format!("HKCU\\Software\\Classes\\.{}", ext),
                "/f",
            ])
            .output();

        if output.is_ok() {
            unregistered_count += 1;
        }
    }

    Ok(format!(
        "Successfully unregistered {} file associations on Windows",
        unregistered_count
    ))
}

/// Windows 平台文件关联注册 (仅注册能力，不设置为默认)
/// 让系统知道应用程序可以打开这些文件类型，但不设置为默认程序
#[cfg(target_os = "windows")]
async fn register_windows_file_associations(extensions: Vec<String>) -> Result<String, String> {
    // 获取当前可执行文件路径
    let exe_path =
        std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_path_str = exe_path.to_string_lossy();

    // 仅注册应用程序信息，不设置文件类型默认关联
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

    // 注册应用程序到"打开方式"列表中，但不设为默认
    let _ = Command::new("reg")
        .args([
            "add",
            "HKCU\\Software\\Classes\\Applications\\dataset-viewer.exe\\shell\\open\\command",
            "/v",
            "",
            "/d",
            &format!("\"{}\" \"%1\"", exe_path_str),
            "/f",
        ])
        .output();

    Ok(format!(
        "Registered application capability for {} file types (not as default handler)",
        extensions.len()
    ))
}

/// macOS 平台文件关联注册 (仅注册能力，不设置为默认)
/// 让系统知道应用程序可以打开这些文件类型，但不设置为默认程序
#[cfg(target_os = "macos")]
async fn register_macos_file_associations() -> Result<String, String> {
    // macOS 上的文件关联通过 Info.plist 预配置，这里主要是刷新系统服务
    let output = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
        .args(["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"])
        .output();

    match output {
        Ok(_) => Ok("Registered application capability for file types (not as default handler)".to_string()),
        Err(e) => Err(format!(
            "Failed to refresh file associations on macOS: {}",
            e
        )),
    }
}

/// macOS 平台选择性文件关联注册
#[cfg(target_os = "macos")]
async fn register_macos_selected_file_associations(extensions: Vec<String>) -> Result<String, String> {
    // macOS 上的文件关联通过 Info.plist 预配置，这里主要是刷新系统服务
    let output = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
        .args(["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"])
        .output();

    match output {
        Ok(_) => Ok(format!("File associations registered for {} extensions on macOS", extensions.len())),
        Err(e) => Err(format!(
            "Failed to refresh file associations on macOS: {}",
            e
        )),
    }
}

/// macOS 平台文件关联取消注册
#[cfg(target_os = "macos")]
async fn unregister_macos_file_associations(_extensions: Vec<String>) -> Result<String, String> {
    // macOS 的文件关联主要通过系统偏好设置管理，这里提供清理缓存功能
    let output = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
        .args(["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"])
        .output();

    match output {
        Ok(_) => Ok("File association cache cleared on macOS".to_string()),
        Err(e) => Err(format!(
            "Failed to clear file association cache on macOS: {}",
            e
        )),
    }
}

/// Linux 平台文件关联注册 (仅注册能力，不设置为默认)
/// 让系统知道应用程序可以打开这些文件类型，但不设置为默认程序
#[cfg(target_os = "linux")]
async fn register_linux_file_associations(extensions: Vec<String>) -> Result<String, String> {
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

    let desktop_content = format!(
        "[Desktop Entry]\n\
        Name=Dataset Viewer\n\
        Comment=Modern dataset viewer with large file streaming support\n\
        Exec={} %f\n\
        Icon=dataset-viewer\n\
        Terminal=false\n\
        Type=Application\n\
        Categories=Office;Development;\n\
        NoDisplay=true\n",
        exe_path_str
    );

    fs::write(&desktop_file_path, desktop_content)
        .map_err(|e| format!("Failed to write desktop file: {}", e))?;

    // 更新 MIME 数据库
    let _ = Command::new("update-desktop-database")
        .arg(desktop_dir)
        .output();

    Ok(format!(
        "Registered application capability for {} file types (not as default handler)",
        extensions.len()
    ))
}

/// Linux 平台选择性文件关联注册
#[cfg(target_os = "linux")]
async fn register_linux_selected_file_associations(extensions: Vec<String>) -> Result<String, String> {
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

    // 为选定的扩展名生成 MIME 类型
    let mime_types = extensions.iter()
        .filter_map(|ext| match ext.as_str() {
            "csv" => Some("text/csv"),
            "txt" => Some("text/plain"),
            "json" => Some("application/json"),
            "html" => Some("text/html"),
            "css" => Some("text/css"),
            "js" => Some("application/javascript"),
            "py" => Some("text/x-python"),
            "java" => Some("text/x-java-source"),
            "cpp" | "c" => Some("text/x-c++"),
            "xml" => Some("application/xml"),
            "yaml" | "yml" => Some("text/yaml"),
            "md" | "markdown" => Some("text/markdown"),
            "zip" => Some("application/zip"),
            "tar" => Some("application/x-tar"),
            "gz" => Some("application/gzip"),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join(";");

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
        exe_path_str, mime_types
    );

    fs::write(&desktop_file_path, desktop_content)
        .map_err(|e| format!("Failed to write desktop file: {}", e))?;

    // 更新 MIME 数据库
    let _ = Command::new("update-desktop-database")
        .arg(desktop_dir)
        .output();

    Ok(format!("File associations registered for {} extensions on Linux", extensions.len()))
}

/// Linux 平台文件关联取消注册
#[cfg(target_os = "linux")]
async fn unregister_linux_file_associations(_extensions: Vec<String>) -> Result<String, String> {
    use std::fs;

    let home_dir = std::env::var("HOME").map_err(|_| "Failed to get HOME directory".to_string())?;
    let desktop_dir = format!("{}/.local/share/applications", home_dir);
    let desktop_file_path = format!("{}/dataset-viewer.desktop", desktop_dir);

    // 删除 .desktop 文件
    if fs::remove_file(&desktop_file_path).is_ok() {
        // 更新 MIME 数据库
        let _ = Command::new("update-desktop-database")
            .arg(desktop_dir)
            .output();
        
        Ok("File associations unregistered on Linux".to_string())
    } else {
        Ok("No file associations found to unregister on Linux".to_string())
    }
}
