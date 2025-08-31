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

/// 注册支持的文件类型关联
/// 将应用程序注册为特定文件类型的默认程序
#[tauri::command]
#[specta::specta]
pub async fn system_register_files() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        register_windows_file_associations().await
    }
    #[cfg(target_os = "macos")]
    {
        register_macos_file_associations().await
    }
    #[cfg(target_os = "linux")]
    {
        register_linux_file_associations().await
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("File association registration is not supported on this platform".to_string())
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

/// Windows 平台文件关联注册
#[cfg(target_os = "windows")]
async fn register_windows_file_associations() -> Result<String, String> {
    // 获取当前可执行文件路径
    let exe_path =
        std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_path_str = exe_path.to_string_lossy();

    // 定义支持的文件扩展名
    let extensions = vec![
        "csv", "xlsx", "xls", "ods", "parquet", "pqt", "zip", "tar", "gz", "tgz", "bz2", "xz",
        "7z", "rar", "lz4", "zst", "zstd", "br", "txt", "json", "jsonl", "js", "ts", "jsx", "tsx",
        "html", "css", "scss", "less", "py", "java", "cpp", "c", "php", "rb", "go", "rs", "xml",
        "yaml", "yml", "sql", "sh", "bat", "ps1", "log", "config", "ini", "tsv", "md", "markdown",
        "mdown", "mkd", "mdx",
    ];

    let mut registered_count = 0;

    for ext in extensions {
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

    Ok(format!(
        "Successfully registered {} file associations on Windows",
        registered_count
    ))
}

/// macOS 平台文件关联注册
#[cfg(target_os = "macos")]
async fn register_macos_file_associations() -> Result<String, String> {
    // macOS 上文件关联通过 Info.plist 和 Launch Services 处理
    // 在构建时已经通过 tauri.conf.json 中的 fileAssociations 配置
    // 这里可以刷新 Launch Services 数据库
    let output = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
        .args(["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"])
        .output();

    match output {
        Ok(_) => Ok("File associations refreshed successfully on macOS".to_string()),
        Err(e) => Err(format!(
            "Failed to refresh file associations on macOS: {}",
            e
        )),
    }
}

/// Linux 平台文件关联注册
#[cfg(target_os = "linux")]
async fn register_linux_file_associations() -> Result<String, String> {
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
