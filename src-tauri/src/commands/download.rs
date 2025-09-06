// 下载管理命令
// 提供文件下载、进度监控和取消功能

use crate::download::{DownloadManager, DownloadRequest};
use std::sync::LazyLock;

// 全局下载管理器
static DOWNLOAD_MANAGER: LazyLock<DownloadManager> = LazyLock::new(DownloadManager::new);

/// 开始文件下载
/// 支持实时进度更新和下载取消功能
#[tauri::command]
#[specta::specta]
pub async fn download_start(
    app: tauri::AppHandle,
    url: String,
    filename: String,
    save_path: Option<String>,
) -> Result<String, String> {
    // 如果没有指定保存路径，使用默认下载路径
    let final_save_path = match save_path {
        Some(path) => Some(path),
        None => Some(get_default_download_path(&filename)?),
    };

    let request = DownloadRequest { url, filename };

    DOWNLOAD_MANAGER
        .download_with_progress(app, request, final_save_path)
        .await
}

/// 取消指定文件的下载
#[tauri::command]
#[specta::specta]
pub async fn download_cancel(filename: String) -> Result<String, String> {
    DOWNLOAD_MANAGER.cancel_download(&filename)
}

/// 取消所有正在进行的下载
#[tauri::command]
#[specta::specta]
pub async fn download_cancel_all() -> Result<String, String> {
    DOWNLOAD_MANAGER.cancel_all_downloads()
}

/// 从压缩包中提取文件下载
/// 支持从压缩包中提取单个文件并下载
#[tauri::command]
#[specta::specta]
pub async fn download_extract_file(
    app: tauri::AppHandle,
    archive_path: String,
    archive_filename: String,
    entry_path: String,
    entry_filename: String,
    save_path: Option<String>,
) -> Result<String, String> {
    // 如果没有指定保存路径，使用默认下载路径
    let final_save_path = match save_path {
        Some(path) => Some(path),
        None => Some(get_default_download_path(&entry_filename)?),
    };

    // 使用统一的下载管理器来处理压缩包文件下载，支持取消功能
    DOWNLOAD_MANAGER
        .download_archive_file_with_progress(
            app,
            archive_path,
            archive_filename,
            entry_path,
            entry_filename,
            final_save_path,
        )
        .await
}

/// 获取系统默认下载路径的内部函数
/// 当用户未指定保存路径时自动调用
fn get_default_download_path(filename: &str) -> Result<String, String> {
    // 获取系统默认下载目录
    if let Some(download_dir) = dirs::download_dir() {
        let save_path = download_dir.join(filename);
        Ok(save_path.to_string_lossy().to_string())
    } else {
        // 如果无法获取下载目录，使用用户主目录
        if let Some(home_dir) = dirs::home_dir() {
            let save_path = home_dir.join("Downloads").join(filename);
            Ok(save_path.to_string_lossy().to_string())
        } else {
            Err("无法确定下载路径".to_string())
        }
    }
}
