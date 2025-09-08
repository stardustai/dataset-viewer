use async_trait::async_trait;
use russh::client::{self, Handle};
use russh_keys;
use russh_sftp::client::SftpSession;
use std::io::SeekFrom;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::sync::Mutex;

use crate::storage::traits::{
    ConnectionConfig, DirectoryResult, ListOptions, ProgressCallback, StorageClient, StorageError,
    StorageFile,
};
use crate::utils::path_utils::PathUtils;

pub struct SSHClient {
    config: ConnectionConfig,
    handle: Arc<Mutex<Option<Handle<Client>>>>,
    sftp: Arc<Mutex<Option<SftpSession>>>,
    connected: Arc<std::sync::atomic::AtomicBool>,
}

// SSH客户端处理器
struct Client {}

#[async_trait]
impl client::Handler for Client {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // 在生产环境中，应该验证服务器密钥
        Ok(true)
    }
}

impl SSHClient {
    /// 解析 SSH/SFTP 错误并返回用户友好的错误消息
    fn parse_ssh_error(
        error: &russh_sftp::client::error::Error,
        operation: &str,
        path: &str,
    ) -> StorageError {
        let error_msg = format!("{}", error);
        let error_lower = error_msg.to_lowercase();

        if error_lower.contains("permission") {
            StorageError::RequestFailed(format!("Permission denied {} file: {}", operation, path))
        } else if error_lower.contains("not found") || error_lower.contains("no such file") {
            StorageError::RequestFailed(format!("File not found: {}", path))
        } else if error_lower.contains("not a directory") {
            StorageError::RequestFailed(format!("Path is not a directory: {}", path))
        } else if error_lower.contains("directory") && operation == "accessing" {
            StorageError::RequestFailed(format!("Path is a directory, not a file: {}", path))
        } else if error_lower.contains("failure") {
            StorageError::RequestFailed(format!(
                "SSH operation failed for {}: {} (possible permission or access issue)",
                operation, path
            ))
        } else {
            StorageError::RequestFailed(format!("Failed to {} {}: {}", operation, path, error))
        }
    }

    /// 解析 std::io::Error 并返回用户友好的错误消息
    fn parse_io_error(error: &std::io::Error, operation: &str, path: &str) -> StorageError {
        match error.kind() {
            std::io::ErrorKind::NotFound => {
                StorageError::NotFound(format!("File not found: {}", path))
            }
            std::io::ErrorKind::PermissionDenied => {
                StorageError::RequestFailed(format!("Permission denied: {}", path))
            }
            _ => {
                StorageError::RequestFailed(format!("Failed to {} {}: {}", operation, path, error))
            }
        }
    }

    pub fn new(config: ConnectionConfig) -> Result<Self, StorageError> {
        Ok(SSHClient {
            config,
            handle: Arc::new(Mutex::new(None)),
            sftp: Arc::new(Mutex::new(None)),
            connected: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        })
    }

    /// 建立SSH连接
    async fn establish_connection(&self, config: &ConnectionConfig) -> Result<(), StorageError> {
        let server = config
            .url
            .as_ref()
            .ok_or_else(|| StorageError::InvalidConfig("SSH server URL is required".to_string()))?;

        let port = config.port.unwrap_or(22);
        let username = config
            .username
            .as_ref()
            .ok_or_else(|| StorageError::InvalidConfig("SSH username is required".to_string()))?;

        // 创建SSH配置
        let ssh_config = Arc::new(client::Config::default());
        let sh = Client {};

        // 建立连接 - 修正类型问题
        let mut handle = client::connect(ssh_config, (server.as_str(), port), sh)
            .await
            .map_err(|e| StorageError::ConnectionFailed(format!("SSH connect failed: {}", e)))?;

        // 认证
        let auth_result = if let Some(password) = &config.password {
            // 密码认证
            handle
                .authenticate_password(username, password)
                .await
                .map_err(|e| {
                    StorageError::AuthenticationFailed(format!(
                        "SSH password authentication failed: {}",
                        e
                    ))
                })
        } else if let Some(private_key_path) = &config.private_key_path {
            // 私钥认证 - 展开路径中的 ~
            let expanded_private_key_path = PathUtils::expand_home_dir(private_key_path)?;
            let key_pair = russh_keys::load_secret_key(
                &expanded_private_key_path,
                config.passphrase.as_deref(),
            )
            .map_err(|e| {
                StorageError::AuthenticationFailed(format!(
                    "Failed to load SSH private key from '{}': {}",
                    expanded_private_key_path, e
                ))
            })?;
            handle
                .authenticate_publickey(username, Arc::new(key_pair))
                .await
                .map_err(|e| {
                    StorageError::AuthenticationFailed(format!(
                        "SSH private key authentication failed: {}",
                        e
                    ))
                })
        } else {
            return Err(StorageError::InvalidConfig(
                "Either password or private key is required for SSH authentication".to_string(),
            ));
        }?;

        if !auth_result {
            return Err(StorageError::AuthenticationFailed(
                "SSH authentication failed".to_string(),
            ));
        }

        // 创建SFTP会话
        let channel = handle.channel_open_session().await.map_err(|e| {
            StorageError::ConnectionFailed(format!("Failed to open channel: {}", e))
        })?;

        channel.request_subsystem(true, "sftp").await.map_err(|e| {
            StorageError::ConnectionFailed(format!("Failed to request SFTP subsystem: {}", e))
        })?;

        let sftp = SftpSession::new(channel.into_stream()).await.map_err(|e| {
            StorageError::ConnectionFailed(format!("Failed to create SFTP session: {}", e))
        })?;

        // 保存连接
        *self.handle.lock().await = Some(handle);
        *self.sftp.lock().await = Some(sftp);
        self.connected
            .store(true, std::sync::atomic::Ordering::Relaxed);

        Ok(())
    }

    /// 获取文件的完整路径
    fn get_full_path(&self, path: &str) -> String {
        // 如果是SSH协议URL，解析出实际的文件路径
        if path.starts_with("ssh://") {
            // 协议URL已经包含完整的绝对路径，直接解析返回
            return self
                .parse_ssh_url(path)
                .unwrap_or_else(|_| path.to_string());
        }

        // 对于相对路径，需要与 root_path 拼接
        let root_path = self.config.root_path.as_deref().unwrap_or("/");
        if path.is_empty() || path == "/" {
            root_path.to_string()
        } else {
            let clean_path = path.trim_start_matches('/');
            if root_path.ends_with('/') {
                format!("{}{}", root_path, clean_path)
            } else {
                format!("{}/{}", root_path, clean_path)
            }
        }
    }

    /// 解析SSH协议URL，提取文件路径
    fn parse_ssh_url(&self, ssh_url: &str) -> Result<String, StorageError> {
        if !ssh_url.starts_with("ssh://") {
            return Ok(ssh_url.to_string());
        }

        let without_protocol = ssh_url.strip_prefix("ssh://").unwrap();

        if let Some(path_start) = without_protocol.find('/') {
            let path = &without_protocol[path_start..];
            Ok(path.to_string())
        } else {
            Ok("/".to_string())
        }
    }

    /// 格式化文件大小
    fn format_file_size(size: u64) -> String {
        size.to_string()
    }

    /// 格式化修改时间
    fn format_mtime(mtime: SystemTime) -> String {
        match mtime.duration_since(UNIX_EPOCH) {
            Ok(duration) => {
                let secs = duration.as_secs();
                let dt = chrono::DateTime::from_timestamp(secs as i64, 0)
                    .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap());
                dt.format("%Y-%m-%d %H:%M:%S").to_string()
            }
            Err(_) => "1970-01-01 00:00:00".to_string(),
        }
    }
}

#[async_trait]
impl StorageClient for SSHClient {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<(), StorageError> {
        self.validate_config(config)?;
        self.config = config.clone();
        self.establish_connection(config).await
    }

    async fn is_connected(&self) -> bool {
        self.connected.load(std::sync::atomic::Ordering::Relaxed)
    }

    async fn list_directory(
        &self,
        path: &str,
        options: Option<&ListOptions>,
    ) -> Result<DirectoryResult, StorageError> {
        if !self.connected.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        let full_path = self.get_full_path(path);
        let mut sftp_guard = self.sftp.lock().await;
        let sftp = sftp_guard
            .as_mut()
            .ok_or_else(|| StorageError::NotConnected)?;

        let entries = sftp
            .read_dir(&full_path)
            .await
            .map_err(|e| Self::parse_ssh_error(&e, "read directory", &full_path))?;

        let mut files = Vec::new();
        for entry in entries {
            let filename = entry.file_name().to_string();

            // 跳过 . 和 ..
            if filename == "." || filename == ".." {
                continue;
            }

            let metadata = entry.metadata();
            let is_dir = metadata.is_dir();
            let file_type = if is_dir { "directory" } else { "file" };

            let file = StorageFile {
                filename: filename.clone(),
                basename: filename,
                lastmod: Self::format_mtime(metadata.modified().unwrap_or(UNIX_EPOCH)),
                size: Self::format_file_size(metadata.len()),
                file_type: file_type.to_string(),
                mime: if is_dir {
                    None
                } else {
                    Some("application/octet-stream".to_string())
                },
                etag: None,
            };

            files.push(file);
        }

        // 按选项排序
        let sort_by = options
            .and_then(|o| o.sort_by.clone())
            .unwrap_or_else(|| "name".to_string());
        let sort_order = options
            .and_then(|o| o.sort_order.clone())
            .unwrap_or_else(|| "asc".to_string());

        files.sort_by(|a, b| {
            let cmp = match sort_by.as_str() {
                "size" => a
                    .size
                    .parse::<u64>()
                    .unwrap_or(0)
                    .cmp(&b.size.parse::<u64>().unwrap_or(0)),
                "modified" => a.lastmod.cmp(&b.lastmod),
                _ => a.filename.cmp(&b.filename),
            };

            if sort_order == "desc" {
                cmp.reverse()
            } else {
                cmp
            }
        });

        Ok(DirectoryResult {
            files,
            has_more: false,
            next_marker: None,
            total_count: None,
            path: path.to_string(),
        })
    }

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
        if !self.connected.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        if let Some(ref mut cancel_rx) = cancel_rx {
            if cancel_rx.try_recv().is_ok() {
                return Err(StorageError::RequestFailed(
                    "download.cancelled".to_string(),
                ));
            }
        }

        let full_path = self.get_full_path(path);
        let mut sftp_guard = self.sftp.lock().await;
        let sftp = sftp_guard
            .as_mut()
            .ok_or_else(|| StorageError::NotConnected)?;

        // 打开文件
        let mut file = sftp
            .open(&full_path)
            .await
            .map_err(|e| Self::parse_ssh_error(&e, "open", &full_path))?;

        // 设置文件指针位置
        file.seek(SeekFrom::Start(start)).await.map_err(|e| {
            StorageError::RequestFailed(format!("Failed to seek to position {}: {}", start, e))
        })?;

        // 分块读取
        let chunk_size = std::cmp::min(8192u64, length);
        let mut result = Vec::with_capacity(length as usize);
        let mut remaining = length;
        let mut total_read = 0u64;

        while remaining > 0 {
            let current_chunk_size = std::cmp::min(remaining, chunk_size) as usize;
            let mut chunk = vec![0u8; current_chunk_size];

            let bytes_read = file
                .read(&mut chunk)
                .await
                .map_err(|e| Self::parse_io_error(&e, "read", &full_path))?;

            if bytes_read == 0 {
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

            // 检查取消信号
            if let Some(ref mut cancel_rx) = cancel_rx {
                if cancel_rx.try_recv().is_ok() {
                    return Err(StorageError::RequestFailed(
                        "download.cancelled".to_string(),
                    ));
                }
            }
        }

        Ok(result)
    }

    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        if !self.connected.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        let full_path = self.get_full_path(path);
        let mut sftp_guard = self.sftp.lock().await;
        let sftp = sftp_guard
            .as_mut()
            .ok_or_else(|| StorageError::NotConnected)?;

        let mut file = sftp
            .open(&full_path)
            .await
            .map_err(|e| Self::parse_ssh_error(&e, "open", &full_path))?;

        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .await
            .map_err(|e| Self::parse_io_error(&e, "read", &full_path))?;

        Ok(buffer)
    }

    async fn get_file_size(&self, path: &str) -> Result<u64, StorageError> {
        if !self.connected.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        let full_path = self.get_full_path(path);
        let mut sftp_guard = self.sftp.lock().await;
        let sftp = sftp_guard
            .as_mut()
            .ok_or_else(|| StorageError::NotConnected)?;

        let metadata = sftp.metadata(&full_path).await.map_err(|e| {
            StorageError::RequestFailed(format!(
                "Failed to get file stats for {}: {}",
                full_path, e
            ))
        })?;

        Ok(metadata.len())
    }

    fn protocol(&self) -> &str {
        "ssh"
    }

    fn validate_config(&self, config: &ConnectionConfig) -> Result<(), StorageError> {
        if config.protocol != "ssh" {
            return Err(StorageError::InvalidConfig(format!(
                "Expected protocol 'ssh', got '{}'",
                config.protocol
            )));
        }

        if config.url.is_none() {
            return Err(StorageError::InvalidConfig(
                "SSH server URL is required".to_string(),
            ));
        }

        if config.username.is_none() {
            return Err(StorageError::InvalidConfig(
                "SSH username is required".to_string(),
            ));
        }

        if config.password.is_none() && config.private_key_path.is_none() {
            return Err(StorageError::InvalidConfig(
                "Either password or private key path is required for SSH authentication"
                    .to_string(),
            ));
        }

        Ok(())
    }

    fn get_download_url(&self, path: &str) -> Result<String, StorageError> {
        let server = self.config.url.as_ref().ok_or_else(|| {
            StorageError::InvalidConfig("SSH server URL not configured".to_string())
        })?;
        let port = self.config.port.unwrap_or(22);
        let username = self.config.username.as_ref().ok_or_else(|| {
            StorageError::InvalidConfig("SSH username not configured".to_string())
        })?;

        let full_path = self.get_full_path(path);
        let port_suffix = if port != 22 {
            format!(":{}", port)
        } else {
            String::new()
        };

        Ok(format!(
            "ssh://{}@{}{}{}",
            username, server, port_suffix, full_path
        ))
    }

    async fn download_file(
        &self,
        path: &str,
        save_path: &std::path::Path,
        progress_callback: Option<ProgressCallback>,
        mut cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<(), StorageError> {
        let file_size = self.get_file_size(path).await?;
        let mut local_file = tokio::fs::File::create(save_path)
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to create local file: {}", e)))?;

        let chunk_size = std::cmp::min(64 * 1024, file_size / 100).max(8 * 1024);
        let mut downloaded = 0u64;

        while downloaded < file_size {
            let remaining = file_size - downloaded;
            let current_chunk_size = std::cmp::min(chunk_size, remaining);

            // 避免所有权问题，每次传递 None 而不是 cancel_rx 的引用
            let chunk_data = if let Some(ref mut rx) = cancel_rx {
                if rx.try_recv().is_ok() {
                    let _ = tokio::fs::remove_file(save_path).await;
                    return Err(StorageError::RequestFailed(
                        "download.cancelled".to_string(),
                    ));
                }
                self.read_file_range(path, downloaded, current_chunk_size)
                    .await?
            } else {
                self.read_file_range(path, downloaded, current_chunk_size)
                    .await?
            };

            local_file
                .write_all(&chunk_data)
                .await
                .map_err(|e| StorageError::IoError(format!("Failed to write data: {}", e)))?;

            downloaded += chunk_data.len() as u64;

            // 调用进度回调
            if let Some(ref callback) = progress_callback {
                callback(downloaded, file_size);
            }

            if chunk_data.len() < current_chunk_size as usize {
                break;
            }
        }

        local_file
            .flush()
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to flush local file: {}", e)))?;

        Ok(())
    }
}
