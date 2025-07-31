use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio::io::AsyncWriteExt;
use futures_util::StreamExt;
use tauri_plugin_dialog::DialogExt;
use reqwest;

use crate::download::{types::*, progress::ProgressTracker};
use crate::storage::get_storage_manager;
use crate::archive::handlers::ArchiveHandler;

pub struct DownloadManager {
    active_downloads: Arc<Mutex<HashMap<String, broadcast::Sender<()>>>>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            active_downloads: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn download_with_progress(
        &self,
        app: tauri::AppHandle,
        request: DownloadRequest,
    ) -> DownloadResult {
        // 显示保存文件对话框
        let file_path = app
            .dialog()
            .file()
            .set_file_name(&request.filename)
            .blocking_save_file();

        let save_path = match file_path {
            Some(path) => path
                .into_path()
                .map_err(|e| format!("Failed to get path: {}", e))?,
            None => return Err("User cancelled file save".to_string()),
        };

        // 创建HTTP客户端和请求
        let client = reqwest::Client::new();
        let mut request_builder = self.build_request(&client, &request)?;

        // 添加headers
        for (key, value) in &request.headers {
            request_builder = request_builder.header(key, value);
        }

        // 发送请求并获取响应
        let response = request_builder.send().await.map_err(|e| {
            format!("Request failed: {}", e)
        })?;

        if !response.status().is_success() {
            return Err(format!(
                "Download failed with status: {} - {}",
                response.status().as_u16(),
                response.status().canonical_reason().unwrap_or("Unknown error")
            ));
        }

        // 获取文件总大小
        let total_size = response.content_length().unwrap_or(0);

        // 创建取消信号
        let (cancel_tx, mut cancel_rx) = broadcast::channel::<()>(1);

        // 将取消发送器存储到管理器
        {
            let mut downloads = self.active_downloads.lock().unwrap();
            downloads.insert(request.filename.clone(), cancel_tx);
        }

        // 创建进度跟踪器
        let progress_tracker = ProgressTracker::new(app);

        // 发送开始下载事件
        progress_tracker.emit_started(DownloadStarted {
            filename: request.filename.clone(),
            total_size,
        });

        // 执行实际下载
        match self
            .execute_download(
                &progress_tracker,
                response,
                &save_path,
                &request.filename,
                total_size,
                &mut cancel_rx,
            )
            .await
        {
            Ok(result) => {
                // 下载完成，从管理器中移除
                {
                    let mut downloads = self.active_downloads.lock().unwrap();
                    downloads.remove(&request.filename);
                }

                progress_tracker.emit_completed(DownloadCompleted {
                    filename: request.filename,
                    file_path: save_path.display().to_string(),
                });

                Ok(result)
            }
            Err(error) => {
                // 下载失败，清理资源
                {
                    let mut downloads = self.active_downloads.lock().unwrap();
                    downloads.remove(&request.filename);
                }

                // 如果不是用户取消，删除部分下载的文件
                if !error.contains("cancelled") {
                    let _ = tokio::fs::remove_file(&save_path).await;
                }

                progress_tracker.emit_error(DownloadError {
                    filename: request.filename,
                    error: error.clone(),
                });

                Err(error)
            }
        }
    }

    pub fn cancel_download(&self, filename: &str) -> Result<String, String> {
        let mut downloads = self.active_downloads.lock().unwrap();

        if let Some(cancel_sender) = downloads.remove(filename) {
            // 发送取消信号
            let _ = cancel_sender.send(());
            Ok(format!("Download cancellation signal sent for: {}", filename))
        } else {
            Err(format!("No active download found for: {}", filename))
        }
    }

    /// 下载压缩包内文件的统一方法，支持取消功能
    pub async fn download_archive_file_with_progress(
        &self,
        app: tauri::AppHandle,
        archive_path: String,
        archive_filename: String,
        entry_path: String,
        entry_filename: String,
    ) -> DownloadResult {
        // 显示保存文件对话框
        let file_path = app
            .dialog()
            .file()
            .set_file_name(&entry_filename)
            .blocking_save_file();

        let save_path = match file_path {
            Some(path) => path
                .into_path()
                .map_err(|e| format!("Failed to get path: {}", e))?,
            None => return Err("User cancelled file save".to_string()),
        };

        // 创建取消信号
        let (cancel_tx, mut cancel_rx) = broadcast::channel::<()>(1);

        // 将取消发送器存储到管理器
        {
            let mut downloads = self.active_downloads.lock().unwrap();
            downloads.insert(entry_filename.clone(), cancel_tx);
        }

        // 创建进度跟踪器
        let progress_tracker = ProgressTracker::new(app.clone());

        // 发送开始下载事件
        progress_tracker.emit_started(DownloadStarted {
            filename: entry_filename.clone(),
            total_size: 0, // 初始时未知大小
        });

        // 执行压缩包文件下载
        match self
            .execute_archive_download(
                &progress_tracker,
                &archive_path,
                &archive_filename,
                &entry_path,
                &entry_filename,
                &save_path,
                &mut cancel_rx,
            )
            .await
        {
            Ok(result) => {
                // 下载完成，从管理器中移除
                {
                    let mut downloads = self.active_downloads.lock().unwrap();
                    downloads.remove(&entry_filename);
                }

                progress_tracker.emit_completed(DownloadCompleted {
                    filename: entry_filename,
                    file_path: save_path.display().to_string(),
                });

                Ok(result)
            }
            Err(error) => {
                // 下载失败，清理资源
                {
                    let mut downloads = self.active_downloads.lock().unwrap();
                    downloads.remove(&entry_filename);
                }

                // 如果不是用户取消，删除部分下载的文件
                if !error.contains("cancelled") {
                    let _ = tokio::fs::remove_file(&save_path).await;
                }

                progress_tracker.emit_error(DownloadError {
                    filename: entry_filename,
                    error: error.clone(),
                });

                Err(error)
            }
        }
    }

    fn build_request(
        &self,
        client: &reqwest::Client,
        request: &DownloadRequest,
    ) -> Result<reqwest::RequestBuilder, String> {
        let request_builder = match request.method.as_str() {
            "GET" => client.get(&request.url),
            "POST" => client.post(&request.url),
            "PUT" => client.put(&request.url),
            "DELETE" => client.delete(&request.url),
            "HEAD" => client.head(&request.url),
            "PROPFIND" => client.request(
                reqwest::Method::from_bytes(b"PROPFIND").unwrap(),
                &request.url,
            ),
            _ => return Err(format!("Unsupported method: {}", request.method)),
        };

        Ok(request_builder)
    }

    async fn execute_download(
        &self,
        progress_tracker: &ProgressTracker,
        response: reqwest::Response,
        save_path: &std::path::Path,
        filename: &str,
        total_size: u64,
        cancel_rx: &mut broadcast::Receiver<()>,
    ) -> Result<String, String> {
        // 创建文件
        let mut file = tokio::fs::File::create(save_path)
            .await
            .map_err(|e| format!("Failed to create file: {}", e))?;

        // 流式下载
        let mut downloaded: u64 = 0;
        let mut stream = response.bytes_stream();

        while let Some(chunk_result) = stream.next().await {
            // 检查是否收到取消信号
            if cancel_rx.try_recv().is_ok() {
                // 删除部分下载的文件
                let _ = tokio::fs::remove_file(save_path).await;
                return Err("Download cancelled by user".to_string());
            }

            let chunk = chunk_result.map_err(|e| format!("Failed to read chunk: {}", e))?;

            // 写入文件
            file.write_all(&chunk)
                .await
                .map_err(|e| format!("Failed to write chunk: {}", e))?;

            downloaded += chunk.len() as u64;

            // 发送进度更新事件
            if progress_tracker.should_emit_progress(downloaded, chunk.len()) {
                let progress = progress_tracker.calculate_progress(downloaded, total_size);

                progress_tracker.emit_progress(DownloadProgress {
                    filename: filename.to_string(),
                    downloaded,
                    total_size,
                    progress,
                });
            }
        }

        file.flush()
            .await
            .map_err(|e| format!("Failed to flush file: {}", e))?;

        Ok(format!(
            "File downloaded successfully to: {}",
            save_path.display()
        ))
    }

    /// 执行压缩包文件下载的核心逻辑
    async fn execute_archive_download(
        &self,
        progress_tracker: &ProgressTracker,
        archive_path: &str,
        archive_filename: &str,
        entry_path: &str,
        entry_filename: &str,
        save_path: &std::path::Path,
        cancel_rx: &mut broadcast::Receiver<()>,
    ) -> Result<String, String> {
        // 检查是否收到取消信号
        if cancel_rx.try_recv().is_ok() {
            return Err("Download cancelled by user".to_string());
        }

        // 获取存储管理器和客户端
        let manager = get_storage_manager().await;
        let manager = manager.lock().await;
        let client = manager.get_current_client()
            .ok_or_else(|| "No storage client available".to_string())?;

        // 创建压缩包处理器
        let archive_handler = ArchiveHandler::new();

        // 检查取消信号
        if cancel_rx.try_recv().is_ok() {
            return Err("Download cancelled by user".to_string());
        }

        // 创建文件
        let mut file = tokio::fs::File::create(save_path)
            .await
            .map_err(|e| format!("Failed to create file: {}", e))?;

        // 创建进度回调，用于显示提取进度
        let progress_tracker_clone = progress_tracker.clone();
        let entry_filename_clone = entry_filename.to_string();
        let progress_callback = move |downloaded: u64, total: u64| {
            let progress = if total > 0 { ((downloaded * 100) / total) as u32 } else { 0 };
            progress_tracker_clone.emit_progress(DownloadProgress {
                filename: entry_filename_clone.clone(),
                downloaded,
                total_size: total,
                progress,
            });
        };

        // 使用文件预览方法提取完整文件内容，并显示提取进度
        let file_preview = archive_handler.get_file_preview_with_client(
            client,
            archive_path.to_string(),
            archive_filename.to_string(),
            entry_path.to_string(),
            Some(4 * 1024 * 1024 * 1024), // 4GB 限制
            Some(progress_callback), // 使用进度回调显示提取进度
        ).await.map_err(|e| {
            format!("Failed to extract file from archive: {}", e)
        })?;
        
        let file_data = file_preview.content;

        // 检查取消信号
        if cancel_rx.try_recv().is_ok() {
            return Err("Download cancelled by user".to_string());
        }

        // 写入文件
        file.write_all(&file_data)
            .await
            .map_err(|e| format!("Failed to write to file: {}", e))?;

        // 刷新文件缓冲区
        file.flush()
            .await
            .map_err(|e| format!("Failed to flush file: {}", e))?;

        // 最终进度报告
        let file_size = file_data.len() as u64;
        progress_tracker.emit_progress(DownloadProgress {
            filename: entry_filename.to_string(),
            downloaded: file_size,
            total_size: file_size,
            progress: 100,
        });

        Ok(format!(
            "Archive file downloaded successfully to: {}",
            save_path.display()
        ))
    }
}

impl Default for DownloadManager {
    fn default() -> Self {
        Self::new()
    }
}
