use async_trait::async_trait;
use ssh2::{Session, Sftp};
use std::io::{Read, Seek};
use std::net::TcpStream;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::task::spawn_blocking;
use url::Url;

use crate::storage::traits::{
    ConnectionConfig, DirectoryResult, ListOptions, ProgressCallback, StorageClient, StorageError,
    StorageFile,
};

pub struct SSHClient {
    config: ConnectionConfig,
    session: Arc<Mutex<Option<Session>>>,
    sftp: Arc<Mutex<Option<Sftp>>>,
    connected: Arc<std::sync::atomic::AtomicBool>,
}

impl SSHClient {
    pub fn new(config: ConnectionConfig) -> Result<Self, StorageError> {
        Ok(SSHClient {
            config,
            session: Arc::new(Mutex::new(None)),
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

        let server_clone = server.clone();
        let username_clone = username.clone();
        let password = config.password.clone();
        let private_key_path = config.private_key_path.clone();
        let passphrase = config.passphrase.clone();

        let session = spawn_blocking(move || -> Result<Session, StorageError> {
            // 建立TCP连接
            let tcp = TcpStream::connect(format!("{}:{}", server_clone, port)).map_err(|e| {
                StorageError::ConnectionFailed(format!(
                    "Failed to connect to {}:{}: {}",
                    server_clone, port, e
                ))
            })?;

            tcp.set_read_timeout(Some(Duration::from_secs(30)))
                .map_err(|e| {
                    StorageError::ConnectionFailed(format!("Failed to set read timeout: {}", e))
                })?;
            tcp.set_write_timeout(Some(Duration::from_secs(30)))
                .map_err(|e| {
                    StorageError::ConnectionFailed(format!("Failed to set write timeout: {}", e))
                })?;

            // 创建SSH会话
            let mut sess = Session::new().map_err(|e| {
                StorageError::ConnectionFailed(format!("Failed to create SSH session: {}", e))
            })?;

            sess.set_tcp_stream(tcp);
            sess.handshake().map_err(|e| {
                StorageError::ConnectionFailed(format!("SSH handshake failed: {}", e))
            })?;

            // 认证
            if let Some(key_path) = private_key_path {
                // 私钥认证
                let public_key_path = format!("{}.pub", key_path);
                sess.userauth_pubkey_file(
                    &username_clone,
                    Some(Path::new(&public_key_path)),
                    Path::new(&key_path),
                    passphrase.as_deref(),
                )
                .map_err(|e| {
                    StorageError::ConnectionFailed(format!(
                        "SSH private key authentication failed: {}",
                        e
                    ))
                })?;
            } else if let Some(password) = password {
                // 密码认证
                sess.userauth_password(&username_clone, &password)
                    .map_err(|e| {
                        StorageError::ConnectionFailed(format!(
                            "SSH password authentication failed: {}",
                            e
                        ))
                    })?;
            } else {
                return Err(StorageError::InvalidConfig(
                    "Either password or private key is required for SSH authentication".to_string(),
                ));
            }

            if !sess.authenticated() {
                return Err(StorageError::ConnectionFailed(
                    "SSH authentication failed".to_string(),
                ));
            }

            Ok(sess)
        })
        .await
        .map_err(|e| StorageError::ConnectionFailed(format!("Task join error: {}", e)))??;

        let session_arc = Arc::new(Mutex::new(session));

        // 创建SFTP会话
        let sftp = spawn_blocking({
            let session_clone = session_arc.clone();
            move || -> Result<Sftp, StorageError> {
                let session = session_clone.lock().unwrap();
                let sftp = session.sftp().map_err(|e| {
                    StorageError::ConnectionFailed(format!("Failed to create SFTP session: {}", e))
                })?;
                Ok(sftp)
            }
        })
        .await
        .map_err(|e| StorageError::ConnectionFailed(format!("Task join error: {}", e)))??;

        // 提取 session 从 Arc<Mutex<Session>>
        let session_final = {
            let session_guard = session_arc.lock().unwrap();
            (*session_guard).clone()
        };

        *self.session.lock().unwrap() = Some(session_final);
        *self.sftp.lock().unwrap() = Some(sftp);
        self.connected
            .store(true, std::sync::atomic::Ordering::Relaxed);

        Ok(())
    }

    /// 获取文件的完整路径
    fn get_full_path(&self, path: &str) -> String {
        // 如果是SSH协议URL，解析出实际的文件路径
        let actual_path = if path.starts_with("ssh://") {
            self.parse_ssh_url(path)
                .unwrap_or_else(|_| path.to_string())
        } else {
            path.to_string()
        };

        let root_path = self.config.root_path.as_deref().unwrap_or("/");
        if actual_path.is_empty() || actual_path == "/" {
            root_path.to_string()
        } else {
            let clean_path = actual_path.trim_start_matches('/');
            if root_path.ends_with('/') {
                format!("{}{}", root_path, clean_path)
            } else {
                format!("{}/{}", root_path, clean_path)
            }
        }
    }

    /// 解析SSH协议URL，提取文件路径
    fn parse_ssh_url(&self, ssh_url: &str) -> Result<String, StorageError> {
        // ssh://user@host:port/path 格式解析
        if !ssh_url.starts_with("ssh://") {
            return Ok(ssh_url.to_string());
        }

        let without_protocol = ssh_url.strip_prefix("ssh://").unwrap();

        // 找到路径部分（第一个 '/' 之后的内容）
        if let Some(path_start) = without_protocol.find('/') {
            let path = &without_protocol[path_start..];
            Ok(path.to_string())
        } else {
            // 如果没有路径部分，默认为根路径
            Ok("/".to_string())
        }
    }

    /// 格式化文件大小
    fn format_file_size(size: u64) -> String {
        size.to_string()
    }

    /// 格式化修改时间
    fn format_mtime(mtime: u64) -> String {
        let datetime = SystemTime::UNIX_EPOCH + Duration::from_secs(mtime);
        match datetime.duration_since(UNIX_EPOCH) {
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
        let sftp = self.sftp.clone();
        let path_owned = path.to_string();
        let sort_by = options
            .and_then(|o| o.sort_by.clone())
            .unwrap_or_else(|| "name".to_string());
        let sort_order = options
            .and_then(|o| o.sort_order.clone())
            .unwrap_or_else(|| "asc".to_string());

        spawn_blocking(move || -> Result<DirectoryResult, StorageError> {
            let sftp_guard = sftp.lock().unwrap();
            let sftp = sftp_guard
                .as_ref()
                .ok_or_else(|| StorageError::NotConnected)?;

            let entries = sftp.readdir(Path::new(&full_path)).map_err(|e| {
                StorageError::RequestFailed(format!(
                    "Failed to read directory {}: {}",
                    full_path, e
                ))
            })?;

            let mut files = Vec::new();
            for (file_path, stat) in entries {
                let filename = file_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                // 跳过 . 和 ..
                if filename == "." || filename == ".." {
                    continue;
                }

                let is_dir = stat.is_dir();
                let file_type = if is_dir { "directory" } else { "file" };

                let file = StorageFile {
                    filename: filename.clone(),
                    basename: filename,
                    lastmod: Self::format_mtime(stat.mtime.unwrap_or(0)),
                    size: Self::format_file_size(stat.size.unwrap_or(0)),
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
                path: path_owned,
            })
        })
        .await
        .map_err(|e| StorageError::RequestFailed(format!("Task join error: {}", e)))?
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

        let full_path = self.get_full_path(path);
        let sftp = self.sftp.clone();

        // 在spawn_blocking之前检查取消信号
        if let Some(ref mut cancel_rx) = cancel_rx {
            if cancel_rx.try_recv().is_ok() {
                return Err(StorageError::RequestFailed(
                    "download.cancelled".to_string(),
                ));
            }
        }

        let result = spawn_blocking(move || -> Result<Vec<u8>, StorageError> {
            let sftp_guard = sftp.lock().unwrap();
            let sftp = sftp_guard
                .as_ref()
                .ok_or_else(|| StorageError::NotConnected)?;

            let file = sftp.open(Path::new(&full_path)).map_err(|e| {
                StorageError::RequestFailed(format!("Failed to open file {}: {}", full_path, e))
            })?;

            let mut file = file;

            // 设置文件指针位置
            file.seek(std::io::SeekFrom::Start(start)).map_err(|e| {
                StorageError::RequestFailed(format!("Failed to seek to position {}: {}", start, e))
            })?;

            // 使用分块读取来处理大文件并支持进度回调
            let chunk_size = std::cmp::min(8192u64, length); // 8KB chunks
            let mut result = Vec::with_capacity(length as usize);
            let mut remaining = length;
            let mut total_read = 0u64;

            while remaining > 0 {
                let current_chunk_size = std::cmp::min(remaining, chunk_size) as usize;
                let mut chunk = vec![0u8; current_chunk_size];

                let bytes_read = file.read(&mut chunk).map_err(|e| {
                    StorageError::RequestFailed(format!("Failed to read file: {}", e))
                })?;

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

            Ok(result)
        })
        .await
        .map_err(|e| StorageError::RequestFailed(format!("Task join error: {}", e)))?;

        // 完成后再次检查取消信号
        if let Some(ref mut cancel_rx) = cancel_rx {
            if cancel_rx.try_recv().is_ok() {
                return Err(StorageError::RequestFailed(
                    "download.cancelled".to_string(),
                ));
            }
        }

        result
    }

    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        if !self.connected.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        let full_path = self.get_full_path(path);
        let sftp = self.sftp.clone();

        spawn_blocking(move || -> Result<Vec<u8>, StorageError> {
            let sftp_guard = sftp.lock().unwrap();
            let sftp = sftp_guard
                .as_ref()
                .ok_or_else(|| StorageError::NotConnected)?;

            let mut file = sftp.open(Path::new(&full_path)).map_err(|e| {
                StorageError::RequestFailed(format!("Failed to open file {}: {}", full_path, e))
            })?;

            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer)
                .map_err(|e| StorageError::RequestFailed(format!("Failed to read file: {}", e)))?;

            Ok(buffer)
        })
        .await
        .map_err(|e| StorageError::RequestFailed(format!("Task join error: {}", e)))?
    }

    async fn get_file_size(&self, path: &str) -> Result<u64, StorageError> {
        if !self.connected.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        let full_path = self.get_full_path(path);
        let sftp = self.sftp.clone();

        spawn_blocking(move || -> Result<u64, StorageError> {
            let sftp_guard = sftp.lock().unwrap();
            let sftp = sftp_guard
                .as_ref()
                .ok_or_else(|| StorageError::NotConnected)?;

            let stat = sftp.stat(Path::new(&full_path)).map_err(|e| {
                StorageError::RequestFailed(format!(
                    "Failed to get file stats for {}: {}",
                    full_path, e
                ))
            })?;

            Ok(stat.size.unwrap_or(0))
        })
        .await
        .map_err(|e| StorageError::RequestFailed(format!("Task join error: {}", e)))?
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
        // SSH doesn't provide direct download URLs, return the SSH path
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

    /// 高效的 SSH/SFTP 文件下载实现，使用 SFTP 流式传输
    async fn download_file(
        &self,
        path: &str,
        save_path: &std::path::Path,
        progress_callback: Option<ProgressCallback>,
        _cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<(), StorageError> {
        let config = self.config.clone();
        let remote_path = self.get_full_path(path);
        let save_path = save_path.to_path_buf();

        // 在阻塞线程中执行 SFTP 文件传输
        tokio::task::spawn_blocking(move || {
            // 解析主机信息
            let (host, port) = if let Some(url_str) = &config.url {
                if url_str.starts_with("ssh://") || url_str.starts_with("sftp://") {
                    let url = Url::parse(url_str).map_err(|e| {
                        StorageError::InvalidConfig(format!("Invalid SSH URL: {}", e))
                    })?;
                    let host = url.host_str().ok_or_else(|| {
                        StorageError::InvalidConfig("No host in SSH URL".to_string())
                    })?;
                    let port = url.port().unwrap_or(22);
                    (host.to_string(), port)
                } else {
                    (url_str.clone(), config.port.unwrap_or(22))
                }
            } else {
                return Err(StorageError::InvalidConfig(
                    "SSH host/URL is required".to_string(),
                ));
            };

            let username = config.username.as_ref().ok_or_else(|| {
                StorageError::InvalidConfig("SSH username is required".to_string())
            })?;

            // 建立 SSH 连接
            let tcp = TcpStream::connect(&format!("{}:{}", host, port)).map_err(|e| {
                StorageError::ConnectionFailed(format!("TCP connect failed: {}", e))
            })?;

            let mut session = Session::new().map_err(|e| {
                StorageError::ConnectionFailed(format!("Session create failed: {}", e))
            })?;
            session.set_tcp_stream(tcp);
            session.handshake().map_err(|e| {
                StorageError::ConnectionFailed(format!("SSH handshake failed: {}", e))
            })?;

            // SSH 认证
            if let Some(password) = &config.password {
                session.userauth_password(username, password).map_err(|e| {
                    StorageError::AuthenticationFailed(format!("Password auth failed: {}", e))
                })?;
            } else if let Some(private_key) = &config.private_key_path {
                session
                    .userauth_pubkey_file(
                        username,
                        None,
                        Path::new(private_key),
                        config.passphrase.as_deref(),
                    )
                    .map_err(|e| {
                        StorageError::AuthenticationFailed(format!("Key auth failed: {}", e))
                    })?;
            }

            // 创建 SFTP 通道
            let sftp = session.sftp().map_err(|e| {
                StorageError::ConnectionFailed(format!("SFTP session failed: {}", e))
            })?;

            // 获取文件信息
            let stat = sftp
                .stat(Path::new(&remote_path))
                .map_err(|e| StorageError::IoError(format!("Failed to stat remote file: {}", e)))?;
            let file_size = stat.size.unwrap_or(0);

            // 打开远程文件
            let mut remote_file = sftp
                .open(Path::new(&remote_path))
                .map_err(|e| StorageError::IoError(format!("Failed to open remote file: {}", e)))?;

            // 创建本地文件
            let mut local_file = std::fs::File::create(&save_path).map_err(|e| {
                StorageError::IoError(format!("Failed to create local file: {}", e))
            })?;

            // 流式传输文件
            let chunk_size = if file_size > 0 {
                std::cmp::min(64 * 1024, file_size as usize / 100).max(8 * 1024)
            } else {
                64 * 1024
            };
            let mut buffer = vec![0u8; chunk_size];
            let mut downloaded = 0u64;

            loop {
                let bytes_read = remote_file.read(&mut buffer).map_err(|e| {
                    StorageError::IoError(format!("Failed to read from remote file: {}", e))
                })?;

                if bytes_read == 0 {
                    break; // EOF
                }

                std::io::Write::write_all(&mut local_file, &buffer[..bytes_read]).map_err(|e| {
                    StorageError::IoError(format!("Failed to write to local file: {}", e))
                })?;

                downloaded += bytes_read as u64;

                // 调用进度回调
                if let Some(ref callback) = progress_callback {
                    callback(downloaded, file_size);
                }
            }

            std::io::Write::flush(&mut local_file)
                .map_err(|e| StorageError::IoError(format!("Failed to flush local file: {}", e)))?;

            Ok(())
        })
        .await
        .map_err(|e| StorageError::IoError(format!("Blocking task failed: {}", e)))?
    }
}
