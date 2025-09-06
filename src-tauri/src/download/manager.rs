use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::broadcast;

use crate::download::{progress::ProgressTracker, provider::DownloadProviderFactory, types::*};
use crate::storage::traits::ProgressCallback;

/// 简化的下载管理器
/// 专注于任务管理、UI交互和进度跟踪
pub struct DownloadManager {
    active_downloads: Arc<Mutex<HashMap<String, broadcast::Sender<()>>>>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            active_downloads: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 统一的下载接口
    pub async fn download_with_progress(
        &self,
        app: tauri::AppHandle,
        request: DownloadRequest,
        save_path: Option<String>,
    ) -> DownloadResult {
        // 获取合适的下载提供者
        let provider = DownloadProviderFactory::get_provider(&request.url).await?;

        // 获取文件大小
        let file_size = provider.get_file_size(&request).await?;

        // 设置下载（文件对话框、取消信号、进度跟踪器）
        let (save_path, _cancel_tx, mut cancel_rx, progress_tracker) =
            self.setup_download(&app, &request.filename, Some(file_size), save_path)?;

        // 发送开始下载事件
        progress_tracker.emit_started(DownloadStarted {
            filename: request.filename.clone(),
            total_size: file_size,
        });

        // 创建进度回调
        let progress_callback =
            self.create_progress_callback(&progress_tracker, &request.filename, file_size);

        // 执行下载
        let download_result = provider
            .download(
                &request,
                &save_path,
                Some(progress_callback),
                &mut cancel_rx,
            )
            .await;

        // 处理下载完成
        self.handle_download_completion(
            &request.filename,
            download_result,
            &save_path,
            &progress_tracker,
        )
    }

    /// 取消指定文件的下载
    pub fn cancel_download(&self, filename: &str) -> Result<String, String> {
        let mut downloads = self.active_downloads.lock().unwrap();

        if let Some(cancel_sender) = downloads.remove(filename) {
            let _ = cancel_sender.send(());
            Ok(format!(
                "Download cancellation signal sent for: {}",
                filename
            ))
        } else {
            Err(format!("No active download found for: {}", filename))
        }
    }

    /// 取消所有活跃的下载
    pub fn cancel_all_downloads(&self) -> Result<String, String> {
        let mut downloads = self.active_downloads.lock().unwrap();
        let count = downloads.len();

        if count == 0 {
            return Ok("No active downloads to cancel".to_string());
        }

        for (_, cancel_sender) in downloads.drain() {
            let _ = cancel_sender.send(());
        }

        Ok(format!("Cancellation signal sent to {} downloads", count))
    }

    /// 下载压缩包内文件
    pub async fn download_archive_file_with_progress(
        &self,
        app: tauri::AppHandle,
        archive_path: String,
        archive_filename: String,
        entry_path: String,
        entry_filename: String,
        save_path: Option<String>,
    ) -> DownloadResult {
        // 设置下载
        let (save_path, _cancel_tx, mut cancel_rx, progress_tracker) =
            self.setup_download(&app, &entry_filename, None, save_path)?;

        // 执行压缩包文件下载
        let result = self
            .execute_archive_download(
                &progress_tracker,
                &archive_path,
                &archive_filename,
                &entry_path,
                &entry_filename,
                &save_path,
                &mut cancel_rx,
            )
            .await;

        self.handle_download_completion(&entry_filename, result, &save_path, &progress_tracker)
    }

    // === 私有辅助方法 ===

    /// 显示文件保存对话框
    fn show_save_file_dialog(
        app: &tauri::AppHandle,
        filename: &str,
    ) -> Result<Option<std::path::PathBuf>, String> {
        use std::sync::mpsc;
        let (tx, rx) = mpsc::channel();

        app.dialog()
            .file()
            .set_file_name(filename)
            .save_file(move |file_path| {
                let _ = tx.send(file_path);
            });

        match rx.recv() {
            Ok(Some(file)) => file
                .into_path()
                .map(Some)
                .map_err(|e| format!("Failed to get path: {}", e)),
            Ok(None) => Ok(None),
            Err(_) => Err("Failed to receive file path".to_string()),
        }
    }

    /// 设置下载的公共逻辑
    fn setup_download(
        &self,
        app: &tauri::AppHandle,
        filename: &str,
        _file_size: Option<u64>,
        custom_save_path: Option<String>,
    ) -> Result<
        (
            std::path::PathBuf,
            broadcast::Sender<()>,
            broadcast::Receiver<()>,
            ProgressTracker,
        ),
        String,
    > {
        // 获取保存路径
        let save_path = if let Some(custom_path) = custom_save_path {
            let path = std::path::PathBuf::from(custom_path);
            if let Some(parent) = path.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    return Err(format!("Failed to create directory: {}", e));
                }
            }
            path
        } else {
            match Self::show_save_file_dialog(app, filename)? {
                Some(path) => path,
                None => return Err("download.cancelled".to_string()),
            }
        };

        // 创建取消信号
        let (cancel_tx, cancel_rx) = broadcast::channel::<()>(1);
        {
            let mut downloads = self.active_downloads.lock().unwrap();
            downloads.insert(filename.to_string(), cancel_tx.clone());
        }

        // 创建进度跟踪器
        let progress_tracker = ProgressTracker::new(app.clone());

        Ok((save_path, cancel_tx, cancel_rx, progress_tracker))
    }

    /// 创建进度回调
    fn create_progress_callback(
        &self,
        progress_tracker: &ProgressTracker,
        filename: &str,
        total_size: u64,
    ) -> ProgressCallback {
        let progress_tracker_clone = progress_tracker.clone();
        let filename_clone = filename.to_string();

        std::sync::Arc::new(move |downloaded: u64, actual_total: u64| {
            // 使用实际的总大小（由存储客户端提供），如果为0则使用预先获取的大小
            let effective_total = if actual_total > 0 {
                actual_total
            } else {
                total_size
            };

            if progress_tracker_clone.should_emit_progress(downloaded, effective_total) {
                let progress =
                    progress_tracker_clone.calculate_progress(downloaded, effective_total);
                progress_tracker_clone.emit_progress(DownloadProgress {
                    filename: filename_clone.clone(),
                    downloaded,
                    total_size: effective_total,
                    progress,
                });
            }
        })
    }

    /// 处理下载完成的公共逻辑
    fn handle_download_completion(
        &self,
        filename: &str,
        result: Result<String, String>,
        save_path: &std::path::Path,
        progress_tracker: &ProgressTracker,
    ) -> DownloadResult {
        {
            let mut downloads = self.active_downloads.lock().unwrap();
            downloads.remove(filename);
        }

        match result {
            Ok(success_msg) => {
                progress_tracker.emit_completed(DownloadCompleted {
                    filename: filename.to_string(),
                    file_path: save_path.display().to_string(),
                });
                Ok(success_msg)
            }
            Err(error) => {
                if !error.contains("cancelled") {
                    let _ = std::fs::remove_file(save_path);
                }
                progress_tracker.emit_error(DownloadError {
                    filename: filename.to_string(),
                    error: error.clone(),
                });
                Err(error)
            }
        }
    }

    /// 执行压缩包文件下载
    async fn execute_archive_download(
        &self,
        _progress_tracker: &ProgressTracker,
        _archive_path: &str,
        _archive_filename: &str,
        _entry_path: &str,
        _entry_filename: &str,
        _save_path: &std::path::Path,
        _cancel_rx: &mut broadcast::Receiver<()>,
    ) -> Result<String, String> {
        // TODO: 实现压缩包文件下载
        // 这需要压缩包处理服务的支持
        Err("Archive download not implemented yet".to_string())
    }
}

impl Default for DownloadManager {
    fn default() -> Self {
        Self::new()
    }
}
