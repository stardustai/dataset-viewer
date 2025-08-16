use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio::io::{AsyncWriteExt, AsyncReadExt};
use futures_util::StreamExt;
use tauri_plugin_dialog::DialogExt;
use reqwest;
use tokio_util;

use crate::download::{types::*, progress::ProgressTracker};
use crate::storage::{get_storage_manager};
use crate::archive::handlers::ArchiveHandler;
use crate::utils::chunk_size;

pub struct DownloadManager {
    active_downloads: Arc<Mutex<HashMap<String, broadcast::Sender<()>>>>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            active_downloads: Arc::new(Mutex::new(HashMap::new())),
        }
    }    /// 显示文件保存对话框的公共方法
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
            Ok(Some(file)) => {
                file.into_path()
                    .map(Some)
                    .map_err(|e| format!("Failed to get path: {}", e))
            },
            Ok(None) => Ok(None), // 用户取消不再是错误
            Err(_) => Err("Failed to receive file path".to_string()),
        }
    }

    /// 设置下载的公共逻辑：文件对话框、取消信号、进度跟踪器
    fn setup_download(
        &self,
        app: &tauri::AppHandle,
        filename: &str,
        total_size: Option<u64>,
        custom_save_path: Option<String>,
    ) -> Result<(std::path::PathBuf, broadcast::Sender<()>, broadcast::Receiver<()>, ProgressTracker), String> {
        // 获取保存路径
        let save_path = if let Some(custom_path) = custom_save_path {
            // 使用提供的自定义路径（已经是完整的文件路径）
            let path = std::path::PathBuf::from(custom_path);

            // 确保父目录存在
            if let Some(parent) = path.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    return Err(format!("Failed to create directory: {}", e));
                }
                println!("Ensured parent directory exists: {:?}", parent);
            }

            path
        } else {
            // 显示保存文件对话框
            println!("No custom save path provided, showing file dialog");
            match Self::show_save_file_dialog(app, filename)? {
                Some(path) => path,
                None => return Err("download.cancelled".to_string()), // 特殊错误标识用户取消
            }
        };

        // 创建取消信号
        let (cancel_tx, cancel_rx) = broadcast::channel::<()>(1);

        // 将取消发送器存储到管理器
        {
            let mut downloads = self.active_downloads.lock().unwrap();
            downloads.insert(filename.to_string(), cancel_tx.clone());
        }

        // 创建进度跟踪器
        let progress_tracker = ProgressTracker::new(app.clone());

        // 发送开始下载事件
        progress_tracker.emit_started(DownloadStarted {
            filename: filename.to_string(),
            total_size: total_size.unwrap_or(0),
        });

        Ok((save_path, cancel_tx, cancel_rx, progress_tracker))
    }

    /// 处理下载完成的公共逻辑
    fn handle_download_completion(
        &self,
        filename: &str,
        result: Result<String, String>,
        save_path: &std::path::Path,
        progress_tracker: &ProgressTracker,
    ) -> DownloadResult {
        // 从管理器中移除下载任务
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
                // 如果不是用户取消，删除部分下载的文件
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

    pub async fn download_with_progress(
        &self,
        app: tauri::AppHandle,
        request: DownloadRequest,
        save_path: Option<String>,
    ) -> DownloadResult {
        // 检测URL协议，如果是本地文件则使用专门的处理方法
        if request.url.starts_with("file:///") {
            return self.handle_local_file_download(app, request, save_path).await;
        }

        // 设置下载（文件对话框、取消信号、进度跟踪器）
        let (save_path, _cancel_tx, mut cancel_rx, progress_tracker) =
            self.setup_download(&app, &request.filename, None, save_path)?;

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
                response.status().canonical_reason().unwrap_or("error.unknown")
            ));
        }

        // 获取文件总大小
        let total_size = response.content_length().unwrap_or(0);

        // 更新开始下载事件的总大小
        progress_tracker.emit_started(DownloadStarted {
            filename: request.filename.clone(),
            total_size,
        });

        // 执行实际下载
        let download_result = self
            .execute_download(
                &progress_tracker,
                response,
                &save_path,
                &request.filename,
                total_size,
                &mut cancel_rx,
            )
            .await;

        self.handle_download_completion(
            &request.filename,
            download_result,
            &save_path,
            &progress_tracker,
        )
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

    /// 取消所有活跃的下载
    pub fn cancel_all_downloads(&self) -> Result<String, String> {
        let mut downloads = self.active_downloads.lock().unwrap();
        let count = downloads.len();

        if count == 0 {
            return Ok("No active downloads to cancel".to_string());
        }

        // 发送取消信号给所有下载
        for (_, cancel_sender) in downloads.drain() {
            let _ = cancel_sender.send(());
        }

        Ok(format!("Cancellation signal sent to {} downloads", count))
    }

    /// 处理本地文件下载
    async fn handle_local_file_download(
        &self,
        app: tauri::AppHandle,
        request: DownloadRequest,
        save_path: Option<String>,
    ) -> DownloadResult {
        // 从URL中提取路径部分
        let path_str = if request.url.starts_with("file:///") {
            request.url.strip_prefix("file:///").unwrap_or(&request.url)
        } else {
            &request.url
        };

        // 构建完整的文件路径
        let source_file_path = {
            let path_buf = std::path::PathBuf::from(path_str);
            if path_buf.is_relative() {
                // 对于相对路径，使用下载目录作为基础路径
                if let Some(downloads_dir) = dirs::download_dir() {
                    downloads_dir.join(path_buf)
                } else {
                    path_buf
                }
            } else {
                path_buf
            }
        };

        // 检查源文件是否存在
        if !source_file_path.exists() {
            return Err(format!("Source file does not exist: {:?}", source_file_path));
        }

        let source_file_path = match source_file_path.canonicalize() {
             Ok(path) => path,
             Err(e) => {
                 return Err(format!("Failed to canonicalize source path: {}", e));
             }
         };

         // 获取文件大小
         let file_size = match std::fs::metadata(&source_file_path) {
             Ok(metadata) => metadata.len(),
             Err(e) => {
                 return Err(format!("Failed to get file metadata: {}", e));
             }
         };

         // 设置下载（文件对话框、取消信号、进度跟踪器）
         let (save_path, _cancel_tx, mut cancel_rx, progress_tracker) =
             self.setup_download(&app, &request.filename, Some(file_size), save_path)?;

         // 更新开始下载事件
         progress_tracker.emit_started(crate::download::types::DownloadStarted {
             filename: request.filename.clone(),
             total_size: file_size,
         });

         // 执行本地文件复制
         let download_result = self
             .execute_local_file_download(
                 &progress_tracker,
                 &source_file_path,
                 &save_path,
                 &request.filename,
                 file_size,
                 &mut cancel_rx,
             )
             .await;

         self.handle_download_completion(
             &request.filename,
             download_result,
             &save_path,
             &progress_tracker,
         )
     }

    /// 下载压缩包内文件的统一方法，支持取消功能
    pub async fn download_archive_file_with_progress(
        &self,
        app: tauri::AppHandle,
        archive_path: String,
        archive_filename: String,
        entry_path: String,
        entry_filename: String,
        save_path: Option<String>,
    ) -> DownloadResult {
        // 设置下载（文件对话框、取消信号、进度跟踪器）
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

        // 处理下载完成
        self.handle_download_completion(&entry_filename, result, &save_path, &progress_tracker)
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

    /// 通用的文件写入和进度跟踪方法
    async fn write_file_with_progress<R>(
        &self,
        progress_tracker: &ProgressTracker,
        mut reader: R,
        save_path: &std::path::Path,
        filename: &str,
        total_size: u64,
        cancel_rx: &mut broadcast::Receiver<()>,
        chunk_size: usize,
    ) -> Result<String, String>
    where
        R: AsyncReadExt + Unpin,
    {
        // 创建文件
        let mut file = tokio::fs::File::create(save_path)
            .await
            .map_err(|e| format!("Failed to create file: {}", e))?;

        let mut written: u64 = 0;
        let mut buffer = vec![0u8; chunk_size];

        loop {
            // 检查是否收到取消信号
            if cancel_rx.try_recv().is_ok() {
                // 删除部分下载的文件
                let _ = tokio::fs::remove_file(save_path).await;
                return Err("download.cancelled".to_string());
            }

            // 读取数据块
            let bytes_read = reader.read(&mut buffer)
                .await
                .map_err(|e| format!("Failed to read data: {}", e))?;

            if bytes_read == 0 {
                break; // 读取完成
            }

            // 写入文件
            file.write_all(&buffer[..bytes_read])
                .await
                .map_err(|e| format!("Failed to write data: {}", e))?;

            written += bytes_read as u64;

            // 发送进度更新事件
            if progress_tracker.should_emit_progress(written, bytes_read) {
                let progress = progress_tracker.calculate_progress(written, total_size);

                progress_tracker.emit_progress(DownloadProgress {
                    filename: filename.to_string(),
                    downloaded: written,
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

    async fn execute_download(
        &self,
        progress_tracker: &ProgressTracker,
        response: reqwest::Response,
        save_path: &std::path::Path,
        filename: &str,
        total_size: u64,
        cancel_rx: &mut broadcast::Receiver<()>,
    ) -> Result<String, String> {
        // 使用流式读取器包装HTTP响应
        let stream_reader = tokio_util::io::StreamReader::new(
            response.bytes_stream().map(|result| {
                result.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
            })
        );

        self.write_file_with_progress(
            progress_tracker,
            stream_reader,
            save_path,
            filename,
            total_size,
            cancel_rx,
            chunk_size::calculate_optimal_chunk_size(total_size),
        ).await
    }

    /// 执行本地文件下载的核心逻辑
    async fn execute_local_file_download(
        &self,
        progress_tracker: &ProgressTracker,
        source_path: &std::path::Path,
        save_path: &std::path::Path,
        filename: &str,
        total_size: u64,
        cancel_rx: &mut broadcast::Receiver<()>,
    ) -> Result<String, String> {
        // 打开源文件
        let source_file = tokio::fs::File::open(source_path)
            .await
            .map_err(|e| format!("Failed to open source file: {}", e))?;

        self.write_file_with_progress(
            progress_tracker,
            source_file,
            save_path,
            filename,
            total_size,
            cancel_rx,
            chunk_size::calculate_optimal_chunk_size(total_size),
        ).await
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
            return Err("download.cancelled".to_string());
        }

        // 获取存储管理器和客户端
        let manager_arc = get_storage_manager().await;
        let manager = manager_arc.read().await;
        let client_lock = manager.get_current_client()
            .ok_or_else(|| "No storage client available".to_string())?;
        drop(manager);

        let client = client_lock;

        // 创建压缩包处理器
        let archive_handler = ArchiveHandler::new();

        // 检查取消信号
        if cancel_rx.try_recv().is_ok() {
            return Err("download.cancelled".to_string());
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
            Some(cancel_rx), // 传递取消信号
        ).await.map_err(|e| {
            // 如果是取消操作，直接返回取消标识
            if e.contains("download.cancelled") {
                "download.cancelled".to_string()
            } else {
                format!("Failed to extract file from archive: {}", e)
            }
        })?;

        let file_data = file_preview.content;

        // 检查取消信号
        if cancel_rx.try_recv().is_ok() {
            return Err("download.cancelled".to_string());
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
