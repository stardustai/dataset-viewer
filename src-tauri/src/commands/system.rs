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

/// 查询当前已关联的文件扩展名
/// 返回当前已设置为默认打开方式的文件扩展名列表
#[tauri::command]
#[specta::specta]
pub async fn system_get_current_file_associations() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        get_windows_current_associations().await
    }
    #[cfg(target_os = "macos")]
    {
        get_macos_current_associations().await
    }
    #[cfg(target_os = "linux")]
    {
        get_linux_current_associations().await
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("File association query is not supported on this platform".to_string())
    }
}

/// 管理文件类型关联
/// 统一的文件关联管理接口，支持注册选定的扩展名和取消未选中的扩展名
#[tauri::command]
#[specta::specta]
pub async fn system_manage_file_associations(
    selected_extensions: Vec<String>,
    unselected_extensions: Vec<String>
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        manage_windows_file_associations(selected_extensions, unselected_extensions).await
    }
    #[cfg(target_os = "macos")]
    {
        manage_macos_file_associations(selected_extensions, unselected_extensions).await
    }
    #[cfg(target_os = "linux")]
    {
        manage_linux_file_associations(selected_extensions, unselected_extensions).await
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("File association management is not supported on this platform".to_string())
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

/// 查询 Windows 平台当前文件关联状态
#[cfg(target_os = "windows")]
async fn get_windows_current_associations() -> Result<Vec<String>, String> {
    use std::process::Command;
    
    // 查询当前注册表中与我们应用关联的文件扩展名
    let output = Command::new("reg")
        .args([
            "query",
            "HKCU\\Software\\Classes",
            "/f",
            "DatasetViewer.File",
            "/s",
        ])
        .output();

    match output {
        Ok(result) => {
            let output_str = String::from_utf8_lossy(&result.stdout);
            let mut associated_extensions = Vec::new();
            
            // 解析注册表输出，提取文件扩展名
            for line in output_str.lines() {
                if line.starts_with("HKEY") && line.contains("Classes\\.") {
                    if let Some(ext_part) = line.split("Classes\\.").nth(1) {
                        if let Some(ext) = ext_part.split('\\').next() {
                            associated_extensions.push(ext.to_string());
                        }
                    }
                }
            }
            
            Ok(associated_extensions)
        }
        Err(_) => {
            // 如果查询失败，返回空列表
            Ok(vec![])
        }
    }
}

/// 查询 macOS 平台当前文件关联状态
#[cfg(target_os = "macos")]
async fn get_macos_current_associations() -> Result<Vec<String>, String> {
    // macOS 上的文件关联通过 Info.plist 预配置
    // 可以通过 lsappinfo 查询当前关联状态，但实现较复杂
    // 暂时返回空列表，让用户手动选择
    Ok(vec![])
}

/// 查询 Linux 平台当前文件关联状态
#[cfg(target_os = "linux")]
async fn get_linux_current_associations() -> Result<Vec<String>, String> {
    use std::fs;
    
    let home_dir = std::env::var("HOME").map_err(|_| "Failed to get HOME directory".to_string())?;
    let desktop_file_path = format!("{}/.local/share/applications/dataset-viewer.desktop", home_dir);
    
    // 读取 .desktop 文件并解析 MimeType
    match fs::read_to_string(&desktop_file_path) {
        Ok(content) => {
            let mut associated_extensions = Vec::new();
            
            // 查找 MimeType 行并解析
            for line in content.lines() {
                if line.starts_with("MimeType=") {
                    let mime_types = line.strip_prefix("MimeType=").unwrap_or("");
                    for mime_type in mime_types.split(';') {
                        let ext = match mime_type {
                            // Text files
                            "text/plain" => Some("txt"),
                            "application/json" => Some("json"),
                            "application/jsonlines" => Some("jsonl"),
                            "text/javascript" => Some("js"),
                            "text/typescript" => Some("ts"),
                            "text/jsx" => Some("jsx"),
                            "text/tsx" => Some("tsx"),
                            "text/html" => Some("html"),
                            "text/css" => Some("css"),
                            "text/scss" => Some("scss"),
                            "text/less" => Some("less"),
                            "text/x-python" => Some("py"),
                            "text/x-java-source" => Some("java"),
                            "text/x-c++src" => Some("cpp"),
                            "text/x-csrc" => Some("c"),
                            "text/x-php" => Some("php"),
                            "text/x-ruby" => Some("rb"),
                            "text/x-go" => Some("go"),
                            "text/x-rust" => Some("rs"),
                            "text/xml" => Some("xml"),
                            "text/yaml" => Some("yaml"),
                            "text/x-sql" => Some("sql"),
                            "text/x-shellscript" => Some("sh"),
                            "text/x-batch" => Some("bat"),
                            "text/x-powershell" => Some("ps1"),
                            "text/tab-separated-values" => Some("tsv"),
                            // Markdown
                            "text/markdown" => Some("md"),
                            // Word documents
                            "application/msword" => Some("doc"),
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => Some("docx"),
                            "application/rtf" => Some("rtf"),
                            // Presentations
                            "application/vnd.ms-powerpoint" => Some("ppt"),
                            "application/vnd.openxmlformats-officedocument.presentationml.presentation" => Some("pptx"),
                            "application/vnd.oasis.opendocument.presentation" => Some("odp"),
                            // Images
                            "image/jpeg" => Some("jpg"),
                            "image/png" => Some("png"),
                            "image/gif" => Some("gif"),
                            "image/webp" => Some("webp"),
                            "image/svg+xml" => Some("svg"),
                            "image/bmp" => Some("bmp"),
                            "image/x-icon" => Some("ico"),
                            "image/tiff" => Some("tiff"),
                            // PDF
                            "application/pdf" => Some("pdf"),
                            // Video
                            "video/mp4" => Some("mp4"),
                            "video/webm" => Some("webm"),
                            "video/ogg" => Some("ogv"),
                            "video/x-msvideo" => Some("avi"),
                            "video/quicktime" => Some("mov"),
                            "video/x-ms-wmv" => Some("wmv"),
                            "video/x-flv" => Some("flv"),
                            "video/x-matroska" => Some("mkv"),
                            "video/x-m4v" => Some("m4v"),
                            "video/x-ivf" => Some("ivf"),
                            "video/av01" => Some("av1"),
                            // Audio
                            "audio/mpeg" => Some("mp3"),
                            "audio/wav" => Some("wav"),
                            "audio/ogg" => Some("oga"),
                            "audio/aac" => Some("aac"),
                            "audio/flac" => Some("flac"),
                            "audio/mp4" => Some("m4a"),
                            "audio/x-ms-wma" => Some("wma"),
                            // Spreadsheets
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => Some("xlsx"),
                            "application/vnd.ms-excel" => Some("xls"),
                            "application/vnd.oasis.opendocument.spreadsheet" => Some("ods"),
                            "text/csv" => Some("csv"),
                            // Data files
                            "application/vnd.apache.parquet" => Some("parquet"),
                            // Point cloud
                            "application/pcd" => Some("pcd"),
                            "application/ply" => Some("ply"),
                            "application/xyz" => Some("xyz"),
                            "application/pts" => Some("pts"),
                            // Archives
                            "application/zip" => Some("zip"),
                            "application/x-tar" => Some("tar"),
                            "application/gzip" => Some("gz"),
                            "application/x-tar-gz" => Some("tgz"),
                            "application/x-bzip2" => Some("bz2"),
                            "application/x-xz" => Some("xz"),
                            "application/x-7z-compressed" => Some("7z"),
                            "application/vnd.rar" => Some("rar"),
                            "application/x-lz4" => Some("lz4"),
                            "application/zstd" => Some("zst"),
                            "application/x-brotli" => Some("br"),
                            _ => None,
                        };
                        if let Some(extension) = ext {
                            associated_extensions.push(extension.to_string());
                        }
                    }
                    break;
                }
            }
            
            Ok(associated_extensions)
        }
        Err(_) => {
            // 如果文件不存在或读取失败，返回空列表
            Ok(vec![])
        }
    }
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



/// Windows 平台统一文件关联管理
#[cfg(target_os = "windows")]
async fn manage_windows_file_associations(
    selected_extensions: Vec<String>,
    unselected_extensions: Vec<String>
) -> Result<String, String> {
    let mut operations_count = 0;

    // 首先取消未选中的文件类型关联
    for ext in &unselected_extensions {
        let output = Command::new("reg")
            .args([
                "delete",
                &format!("HKCU\\Software\\Classes\\.{}", ext),
                "/f",
            ])
            .output();
        
        if output.is_ok() {
            operations_count += 1;
        }
    }

    // 然后注册选中的文件类型关联
    if !selected_extensions.is_empty() {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to get executable path: {}", e))?;
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

        for ext in &selected_extensions {
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
                operations_count += 1;
            }
        }
    }

    Ok(format!(
        "Successfully managed {} file associations on Windows ({} selected, {} unselected)",
        operations_count,
        selected_extensions.len(),
        unselected_extensions.len()
    ))
}

/// macOS 平台统一文件关联管理
#[cfg(target_os = "macos")]
async fn manage_macos_file_associations(
    selected_extensions: Vec<String>,
    unselected_extensions: Vec<String>
) -> Result<String, String> {
    // macOS 上的文件关联通过 Info.plist 预配置
    // 这里主要是刷新系统服务，让系统重新识别应用的关联能力
    
    // 对于 macOS，我们需要通过 defaults 命令来管理用户级别的文件关联偏好
    // 但由于 Info.plist 已经声明了所有支持的类型，这里主要是清理用户的默认设置
    
    let mut operations_count = 0;
    
    // 取消未选中扩展名的默认关联（如果之前设置过）
    for ext in &unselected_extensions {
        // 尝试清除该扩展名的默认应用设置
        let output = Command::new("defaults")
            .args([
                "delete",
                "com.apple.LaunchServices/com.apple.launchservices.secure",
                &format!("LSHandlers.LSHandlerContentType.public.{}", ext),
            ])
            .output();
        
        if output.is_ok() {
            operations_count += 1;
        }
    }
    
    // 刷新 LaunchServices 数据库，使更改生效
    let output = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
        .args(["-kill", "-r", "-domain", "local", "-domain", "system", "-domain", "user"])
        .output();

    match output {
        Ok(_) => Ok(format!(
            "File associations managed on macOS ({} selected, {} operations performed)",
            selected_extensions.len(),
            operations_count
        )),
        Err(e) => Err(format!(
            "Failed to manage file associations on macOS: {}",
            e
        )),
    }
}

/// Linux 平台统一文件关联管理
#[cfg(target_os = "linux")]
async fn manage_linux_file_associations(
    selected_extensions: Vec<String>,
    unselected_extensions: Vec<String>
) -> Result<String, String> {
    use std::fs;
    use std::path::Path;

    let home_dir = std::env::var("HOME").map_err(|_| "Failed to get HOME directory".to_string())?;
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
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_path_str = exe_path.to_string_lossy();

    // 确保目录存在
    if let Some(parent) = Path::new(&desktop_file_path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // 为选定的扩展名生成 MIME 类型，使用更完整的映射表
    let mime_types = selected_extensions.iter()
        .filter_map(|ext| match ext.as_str() {
            // Text files
            "txt" => Some("text/plain"),
            "json" => Some("application/json"),
            "jsonl" => Some("application/jsonlines"),
            "js" => Some("text/javascript"),
            "ts" => Some("text/typescript"),
            "jsx" => Some("text/jsx"),
            "tsx" => Some("text/tsx"),
            "html" => Some("text/html"),
            "css" => Some("text/css"),
            "scss" => Some("text/scss"),
            "less" => Some("text/less"),
            "py" => Some("text/x-python"),
            "java" => Some("text/x-java-source"),
            "cpp" => Some("text/x-c++src"),
            "c" => Some("text/x-csrc"),
            "php" => Some("text/x-php"),
            "rb" => Some("text/x-ruby"),
            "go" => Some("text/x-go"),
            "rs" => Some("text/x-rust"),
            "xml" => Some("text/xml"),
            "yaml" | "yml" => Some("text/yaml"),
            "sql" => Some("text/x-sql"),
            "sh" => Some("text/x-shellscript"),
            "bat" => Some("text/x-batch"),
            "ps1" => Some("text/x-powershell"),
            "log" => Some("text/plain"),
            "config" => Some("text/plain"),
            "ini" => Some("text/plain"),
            "tsv" => Some("text/tab-separated-values"),
            // Markdown files
            "md" | "markdown" | "mdown" | "mkd" | "mdx" => Some("text/markdown"),
            // Word documents
            "doc" => Some("application/msword"),
            "docx" => Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            "rtf" => Some("application/rtf"),
            // Presentations
            "ppt" => Some("application/vnd.ms-powerpoint"),
            "pptx" => Some("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
            "odp" => Some("application/vnd.oasis.opendocument.presentation"),
            // Images
            "jpg" | "jpeg" => Some("image/jpeg"),
            "png" => Some("image/png"),
            "gif" => Some("image/gif"),
            "webp" => Some("image/webp"),
            "svg" => Some("image/svg+xml"),
            "bmp" => Some("image/bmp"),
            "ico" => Some("image/x-icon"),
            "tiff" | "tif" => Some("image/tiff"),
            // PDF
            "pdf" => Some("application/pdf"),
            // Video
            "mp4" => Some("video/mp4"),
            "webm" => Some("video/webm"),
            "ogv" => Some("video/ogg"),
            "avi" => Some("video/x-msvideo"),
            "mov" => Some("video/quicktime"),
            "wmv" => Some("video/x-ms-wmv"),
            "flv" => Some("video/x-flv"),
            "mkv" => Some("video/x-matroska"),
            "m4v" => Some("video/x-m4v"),
            "ivf" => Some("video/x-ivf"),
            "av1" => Some("video/av01"),
            // Audio
            "mp3" => Some("audio/mpeg"),
            "wav" => Some("audio/wav"),
            "oga" => Some("audio/ogg"),
            "aac" => Some("audio/aac"),
            "flac" => Some("audio/flac"),
            "ogg" => Some("audio/ogg"),
            "m4a" => Some("audio/mp4"),
            "wma" => Some("audio/x-ms-wma"),
            // Spreadsheets
            "xlsx" => Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "xls" => Some("application/vnd.ms-excel"),
            "ods" => Some("application/vnd.oasis.opendocument.spreadsheet"),
            "csv" => Some("text/csv"),
            // Data files
            "parquet" | "pqt" => Some("application/vnd.apache.parquet"),
            // Point cloud
            "pcd" => Some("application/pcd"),
            "ply" => Some("application/ply"),
            "xyz" => Some("application/xyz"),
            "pts" => Some("application/pts"),
            // Archives
            "zip" => Some("application/zip"),
            "tar" => Some("application/x-tar"),
            "gz" => Some("application/gzip"),
            "tgz" => Some("application/x-tar-gz"),
            "bz2" => Some("application/x-bzip2"),
            "xz" => Some("application/x-xz"),
            "7z" => Some("application/x-7z-compressed"),
            "rar" => Some("application/vnd.rar"),
            "lz4" => Some("application/x-lz4"),
            "zst" | "zstd" => Some("application/zstd"),
            "br" => Some("application/x-brotli"),
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

    Ok(format!(
        "File associations managed on Linux ({} selected, {} unselected)",
        selected_extensions.len(),
        unselected_extensions.len()
    ))
}
