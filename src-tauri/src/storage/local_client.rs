use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::fs;
use tokio::io::AsyncReadExt;

use super::traits::{
    ConnectionConfig, DirectoryResult, ListOptions, ProgressCallback, StorageClient, StorageError,
    StorageFile,
};
use crate::utils::chunk_size;
use crate::utils::path_utils::PathUtils;

/// 本机文件系统存储客户端
pub struct LocalFileSystemClient {
    root_path: Option<PathBuf>,
    connected: AtomicBool,
}

impl LocalFileSystemClient {
    pub fn new() -> Self {
        Self {
            root_path: None,
            connected: AtomicBool::new(false),
        }
    }

    /// 构建完整路径并进行安全检查
    /// 支持绝对路径和相对路径两种模式，以及 local:// 协议
    fn build_safe_path(&self, path: &str) -> Result<PathBuf, StorageError> {
        // 处理 local:// 协议 URL（统一使用两个斜杠）
        let actual_path = if path.starts_with("local://") {
            let stripped = path.strip_prefix("local://").unwrap_or(path);
            stripped
        } else {
            path
        };

        // 如果路径以 ~ 开头，直接展开
        if actual_path.starts_with('~') {
            let expanded_path_str = PathUtils::expand_home_dir(actual_path)?;
            return Ok(PathBuf::from(expanded_path_str));
        }

        // 所有其他情况，直接使用路径（前端应该传递完整路径）
        let path_buf = PathBuf::from(actual_path);
        Ok(path_buf)
    }

    /// 获取文件的 MIME 类型
    fn get_mime_type(path: &Path) -> Option<String> {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| match ext.to_lowercase().as_str() {
                "txt" | "md" | "log" => "text/plain",
                "html" | "htm" => "text/html",
                "css" => "text/css",
                "js" => "application/javascript",
                "json" => "application/json",
                "xml" => "application/xml",
                "pdf" => "application/pdf",
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "svg" => "image/svg+xml",
                "mp3" => "audio/mpeg",
                "mp4" => "video/mp4",
                "zip" => "application/zip",
                "tar" => "application/x-tar",
                "gz" => "application/gzip",
                _ => "application/octet-stream",
            })
            .map(|s| s.to_string())
    }

    /// 格式化文件修改时间
    fn format_modification_time(metadata: &std::fs::Metadata) -> String {
        metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| {
                let seconds = duration.as_secs();
                chrono::DateTime::from_timestamp(seconds as i64, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string())
            })
            .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string())
    }
}

#[async_trait]
impl StorageClient for LocalFileSystemClient {
    async fn connect(
        &mut self,
        config: &super::traits::ConnectionConfig,
    ) -> Result<(), StorageError> {
        // 检查是否是本机文件系统协议
        if config.protocol != "local" {
            return Err(StorageError::ProtocolNotSupported(config.protocol.clone()));
        }

        // 检查根路径是否提供
        let root_path = config
            .url
            .as_ref()
            .ok_or_else(|| StorageError::InvalidConfig("Root path is required".to_string()))?;

        // 展开 ~ 为用户主目录
        let expanded_path = if root_path.starts_with('~') {
            let expanded_path_str = PathUtils::expand_home_dir(root_path)?;
            PathBuf::from(expanded_path_str)
        } else {
            PathBuf::from(root_path)
        };

        // 验证路径是否存在
        if !expanded_path.exists() {
            return Err(StorageError::ConnectionFailed(format!(
                "Path does not exist: {}",
                expanded_path.display()
            )));
        }

        if !expanded_path.is_dir() {
            return Err(StorageError::ConnectionFailed(format!(
                "Path is not a directory: {}",
                expanded_path.display()
            )));
        }

        self.root_path = Some(expanded_path);
        self.connected.store(true, Ordering::Relaxed);

        Ok(())
    }

    async fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    async fn list_directory(
        &self,
        path: &str,
        _options: Option<&ListOptions>,
    ) -> Result<DirectoryResult, StorageError> {
        let dir_path = self.build_safe_path(path)?;

        if !dir_path.exists() {
            return Err(StorageError::RequestFailed(
                "Directory not found".to_string(),
            ));
        }

        if !dir_path.is_dir() {
            return Err(StorageError::RequestFailed(
                "Path is not a directory".to_string(),
            ));
        }

        let mut entries = fs::read_dir(&dir_path)
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to read directory: {}", e)))?;

        let mut files = Vec::new();

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to read directory entry: {}", e)))?
        {
            let file_path = entry.path();
            let file_name = file_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string();

            let metadata = entry
                .metadata()
                .await
                .map_err(|e| StorageError::IoError(format!("Failed to get metadata: {}", e)))?;

            let is_directory = metadata.is_dir();
            let size = if is_directory {
                "0".to_string()
            } else {
                metadata.len().to_string()
            };
            let mime_type = if is_directory {
                None
            } else {
                Self::get_mime_type(&file_path)
            };

            let storage_file = StorageFile {
                filename: file_name.clone(),
                basename: file_name,
                lastmod: Self::format_modification_time(&metadata),
                size,
                file_type: if is_directory { "directory" } else { "file" }.to_string(),
                mime: mime_type,
                etag: None, // 本机文件系统不需要 ETag
            };

            files.push(storage_file);
        }

        Ok(DirectoryResult {
            files,
            has_more: false,
            next_marker: None,
            total_count: None,
            path: path.to_string(),
        })
    }

    /// 读取文件的指定范围
    async fn read_file_range(
        &self,
        path: &str,
        start: u64,
        length: u64,
    ) -> Result<Vec<u8>, StorageError> {
        self.read_file_range_with_progress(path, start, length, None, None)
            .await
    }

    async fn read_file_range_with_progress(
        &self,
        path: &str,
        start: u64,
        length: u64,
        progress_callback: Option<ProgressCallback>,
        mut cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<Vec<u8>, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        log::debug!(
            "本地文件读取范围: path={}, start={}, length={}",
            path,
            start,
            length
        );

        let file_path = self.build_safe_path(path)?;

        if !file_path.exists() {
            return Err(StorageError::RequestFailed("File not found".to_string()));
        }

        let mut file = fs::File::open(&file_path)
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to open file: {}", e)))?;

        use tokio::io::AsyncSeekExt;

        // 定位到起始位置
        file.seek(std::io::SeekFrom::Start(start))
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to seek in file: {}", e)))?;

        // 使用分块读取来处理大文件，与其他存储客户端保持一致
        let chunk_size = chunk_size::calculate_local_read_chunk_size(length);
        let mut result = Vec::with_capacity(length as usize);
        let mut remaining = length;
        let mut total_read = 0u64;

        while remaining > 0 {
            // 检查取消信号
            if let Some(ref mut cancel_rx) = cancel_rx {
                if cancel_rx.try_recv().is_ok() {
                    return Err(StorageError::RequestFailed(
                        "download.cancelled".to_string(),
                    ));
                }
            }

            let current_chunk_size = std::cmp::min(remaining, chunk_size as u64) as usize;
            let mut chunk = vec![0u8; current_chunk_size];

            let bytes_read = file
                .read(&mut chunk)
                .await
                .map_err(|e| StorageError::IoError(format!("Failed to read file: {}", e)))?;

            if bytes_read == 0 {
                // 到达文件末尾
                break;
            }

            chunk.truncate(bytes_read);
            result.extend_from_slice(&chunk);
            total_read += bytes_read as u64;
            remaining = remaining.saturating_sub(bytes_read as u64);

            // 调用进度回调
            if let Some(ref callback) = progress_callback {
                callback(total_read, length);
            }
        }

        log::debug!(
            "本地文件实际读取到 {} 字节，请求 {} 字节",
            result.len(),
            length
        );
        Ok(result)
    }

    /// 读取完整文件
    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        let file_path = self.build_safe_path(path)?;

        if !file_path.exists() {
            return Err(StorageError::RequestFailed("File not found".to_string()));
        }

        fs::read(&file_path)
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to read file: {}", e)))
    }

    /// 获取文件大小
    async fn get_file_size(&self, path: &str) -> Result<u64, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        let file_path = self.build_safe_path(path)?;

        if !file_path.exists() {
            return Err(StorageError::RequestFailed("File not found".to_string()));
        }

        let metadata = fs::metadata(&file_path)
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to get file metadata: {}", e)))?;

        if metadata.is_dir() {
            return Err(StorageError::RequestFailed(
                "Path is a directory, not a file".to_string(),
            ));
        }

        Ok(metadata.len())
    }

    fn protocol(&self) -> &str {
        "local"
    }

    fn validate_config(&self, config: &ConnectionConfig) -> Result<(), StorageError> {
        if config.protocol != "local" {
            return Err(StorageError::InvalidConfig(format!(
                "Expected protocol 'local', got '{}'",
                config.protocol
            )));
        }

        if config.url.is_none() {
            return Err(StorageError::InvalidConfig(
                "Root path is required for local file system".to_string(),
            ));
        }

        Ok(())
    }

    /// 高效的本地文件下载实现，使用流式复制
    async fn download_file(
        &self,
        path: &str,
        save_path: &std::path::Path,
        progress_callback: Option<ProgressCallback>,
        mut cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<(), StorageError> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let source_path = self.build_safe_path(path)?;

        if !source_path.exists() {
            return Err(StorageError::NotFound(format!(
                "Source file does not exist: {:?}",
                source_path
            )));
        }

        let file_size = fs::metadata(&source_path)
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to get file metadata: {}", e)))?
            .len();

        let mut source_file = fs::File::open(&source_path)
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to open source file: {}", e)))?;

        let mut dest_file = fs::File::create(save_path).await.map_err(|e| {
            StorageError::IoError(format!("Failed to create destination file: {}", e))
        })?;

        let chunk_size = chunk_size::calculate_optimal_chunk_size(file_size);
        let mut buffer = vec![0u8; chunk_size];
        let mut copied = 0u64;

        loop {
            // 检查取消信号
            if let Some(ref mut cancel_rx) = cancel_rx {
                if cancel_rx.try_recv().is_ok() {
                    let _ = fs::remove_file(save_path).await;
                    return Err(StorageError::RequestFailed(
                        "download.cancelled".to_string(),
                    ));
                }
            }

            let bytes_read = source_file.read(&mut buffer).await.map_err(|e| {
                StorageError::IoError(format!("Failed to read from source file: {}", e))
            })?;

            if bytes_read == 0 {
                break; // EOF
            }

            dest_file
                .write_all(&buffer[..bytes_read])
                .await
                .map_err(|e| {
                    StorageError::IoError(format!("Failed to write to destination file: {}", e))
                })?;

            copied += bytes_read as u64;

            // 调用进度回调
            if let Some(ref callback) = progress_callback {
                callback(copied, file_size);
            }
        }

        dest_file.flush().await.map_err(|e| {
            StorageError::IoError(format!("Failed to flush destination file: {}", e))
        })?;

        Ok(())
    }
}
