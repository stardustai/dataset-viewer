use async_trait::async_trait;
use ssh2::{Session, Sftp};
use std::collections::HashMap;
use std::io::{Read, Seek};
use std::net::TcpStream;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::task::spawn_blocking;

use crate::storage::traits::{
    ConnectionConfig, DirectoryResult, ListOptions, StorageClient, StorageError, StorageFile,
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

            let file = sftp.open(Path::new(&full_path)).map_err(|e| {
                StorageError::RequestFailed(format!("Failed to open file {}: {}", full_path, e))
            })?;

            let mut file = file;

            // 设置文件指针位置
            file.seek(std::io::SeekFrom::Start(start)).map_err(|e| {
                StorageError::RequestFailed(format!("Failed to seek to position {}: {}", start, e))
            })?;

            let mut buffer = vec![0u8; length as usize];
            let bytes_read = file
                .read(&mut buffer)
                .map_err(|e| StorageError::RequestFailed(format!("Failed to read file: {}", e)))?;

            buffer.resize(bytes_read, 0);
            Ok(buffer)
        })
        .await
        .map_err(|e| StorageError::RequestFailed(format!("Task join error: {}", e)))?
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

    fn get_download_headers(&self) -> HashMap<String, String> {
        // SSH doesn't use HTTP headers for authentication
        HashMap::new()
    }
}
