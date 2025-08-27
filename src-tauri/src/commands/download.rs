// 下载管理命令
// 提供文件下载、进度监控和取消功能

use crate::download::{DownloadManager, DownloadRequest};
use crate::storage::get_storage_manager;
use std::collections::HashMap;
use std::sync::LazyLock;

// 全局下载管理器
static DOWNLOAD_MANAGER: LazyLock<DownloadManager> =
    LazyLock::new(DownloadManager::new);

/// 带进度显示的文件下载
/// 支持实时进度更新和下载取消功能
#[tauri::command]
pub async fn download_file_with_progress(
    app: tauri::AppHandle,
    method: String,
    url: String,
    filename: String,
    headers: HashMap<String, String>,
    save_path: Option<String>,
) -> Result<String, String> {
    // 获取存储管理器并处理下载URL（避免死锁）
    let download_url = {
        let manager_arc = get_storage_manager().await;
        let manager = manager_arc.read().await;

        // 通过存储客户端获取正确的下载 URL
        // 每个存储客户端会根据自己的特点处理路径到 URL 的转换
        match manager.get_download_url(&url).await {
            Ok(processed_url) => {
                processed_url
            },
            Err(_e) => {
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

    DOWNLOAD_MANAGER.download_with_progress(app, request, save_path).await
}

/// 取消指定文件的下载
#[tauri::command]
pub async fn cancel_download(filename: String) -> Result<String, String> {
    DOWNLOAD_MANAGER.cancel_download(&filename)
}

/// 取消所有正在进行的下载
#[tauri::command]
pub async fn cancel_all_downloads() -> Result<String, String> {
    DOWNLOAD_MANAGER.cancel_all_downloads()
}

/// 下载压缩包内的文件（带进度）
/// 支持从压缩包中提取单个文件并下载
#[tauri::command]
pub async fn download_archive_file_with_progress(
    app: tauri::AppHandle,
    archive_path: String,
    archive_filename: String,
    entry_path: String,
    entry_filename: String,
    save_path: Option<String>,
) -> Result<String, String> {
    // 使用统一的下载管理器来处理压缩包文件下载，支持取消功能
    DOWNLOAD_MANAGER
        .download_archive_file_with_progress(
            app,
            archive_path,
            archive_filename,
            entry_path,
            entry_filename,
            save_path,
        )
        .await
}

/// 获取系统默认下载路径
/// 根据操作系统返回合适的下载目录
#[tauri::command]
pub async fn get_default_download_path(filename: String) -> Result<String, String> {
    // 获取系统默认下载目录
    if let Some(download_dir) = dirs::download_dir() {
        let save_path = download_dir.join(&filename);
        Ok(save_path.to_string_lossy().to_string())
    } else {
        // 如果无法获取下载目录，使用用户主目录
        if let Some(home_dir) = dirs::home_dir() {
            let save_path = home_dir.join("Downloads").join(&filename);
            Ok(save_path.to_string_lossy().to_string())
        } else {
            Err("无法确定下载路径".to_string())
        }
    }
}
