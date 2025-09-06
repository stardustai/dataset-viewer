use async_trait::async_trait;
use smb::packets::fscc::FileAccessMask;
use smb::resource::Resource;
use smb::{Client, ClientConfig, FileCreateArgs, UncPath};
use std::str::FromStr;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tokio::task::spawn_blocking;

use crate::storage::traits::{
    ConnectionConfig, DirectoryResult, ListOptions, ProgressCallback, StorageClient, StorageError,
};

pub struct SMBClient {
    config: ConnectionConfig,
    client: Arc<Mutex<Option<Client>>>,
    connected: AtomicBool,
}

impl SMBClient {
    pub fn new(config: ConnectionConfig) -> Result<Self, StorageError> {
        Ok(SMBClient {
            config,
            client: Arc::new(Mutex::new(None)),
            connected: AtomicBool::new(false),
        })
    }

    /// 建立SMB连接
    async fn establish_connection_internal(&self) -> Result<(), StorageError> {
        if self.connected.load(Ordering::Acquire) {
            return Ok(());
        }

        let server = self.config.url.clone().unwrap_or_default();
        let share = self.config.share.clone().unwrap_or_default();
        let username = self.config.username.clone().unwrap_or_default();
        let password = self.config.password.clone().unwrap_or_default();

        // 创建客户端配置
        let client_config = ClientConfig::default();
        let mut client = Client::new(client_config);

        // 构建 UNC 路径
        let unc_path_str = format!("\\\\{}\\{}", server, share);
        let unc_path = UncPath::from_str(&unc_path_str)
            .map_err(|e| StorageError::InvalidConfig(format!("Invalid UNC path: {}", e)))?;

        // 连接到共享
        client
            .share_connect(&unc_path, &username, password)
            .await
            .map_err(|e| {
                StorageError::ConnectionFailed(format!(
                    "Failed to connect to SMB share {}: {}",
                    share, e
                ))
            })?;

        // 存储客户端
        {
            let mut client_guard = self.client.lock().unwrap();
            *client_guard = Some(client);
        }

        self.connected.store(true, Ordering::Release);
        Ok(())
    }

    /// 构建 UNC 路径
    fn build_unc_path(&self, path: &str) -> Result<UncPath, StorageError> {
        let server = self.config.url.as_deref().unwrap_or("");
        let share = self.config.share.as_deref().unwrap_or("");

        let clean_path = path.trim_start_matches('/');
        let smb_path = if clean_path.is_empty() {
            "".to_string()
        } else {
            clean_path.replace('/', "\\")
        };

        let full_path = if smb_path.is_empty() {
            format!("\\\\{}\\{}", server, share)
        } else {
            format!("\\\\{}\\{}\\{}", server, share, smb_path)
        };

        UncPath::from_str(&full_path).map_err(|e| {
            StorageError::InvalidConfig(format!("Invalid UNC path '{}': {}", full_path, e))
        })
    }
}

#[async_trait]
impl StorageClient for SMBClient {
    fn protocol(&self) -> &str {
        "smb"
    }

    fn validate_config(&self, config: &ConnectionConfig) -> Result<(), StorageError> {
        if config.url.is_none() || config.url.as_ref().unwrap().is_empty() {
            return Err(StorageError::InvalidConfig(
                "SMB server URL is required".into(),
            ));
        }
        Ok(())
    }
    async fn connect(&mut self, _config: &ConnectionConfig) -> Result<(), StorageError> {
        self.establish_connection_internal().await
    }

    async fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Acquire)
    }

    async fn list_directory(
        &self,
        path: &str,
        _options: Option<&ListOptions>,
    ) -> Result<DirectoryResult, StorageError> {
        self.establish_connection_internal().await?;

        log::debug!("Listing SMB directory: {}", path);

        // 目前返回空目录 - 实际实现需要复杂的SMB协议处理
        Ok(DirectoryResult {
            files: Vec::new(),
            has_more: false,
            next_marker: None,
            total_count: Some("0".to_string()),
            path: path.to_string(),
        })
    }

    async fn get_file_size(&self, path: &str) -> Result<u64, StorageError> {
        self.establish_connection_internal().await?;

        let unc_path = self.build_unc_path(path)?;
        let client_arc = self.client.clone();
        let path_clone = path.to_string();

        spawn_blocking(move || -> Result<u64, StorageError> {
            tokio::runtime::Handle::current().block_on(async {
                let mut client_guard = client_arc.lock().unwrap();
                if let Some(ref mut client) = *client_guard {
                    // 打开文件来获取大小
                    let file_args = FileCreateArgs::make_open_existing(
                        FileAccessMask::new().with_generic_read(true),
                    );
                    let resource =
                        client
                            .create_file(&unc_path, &file_args)
                            .await
                            .map_err(|e| {
                                StorageError::IoError(format!(
                                    "Failed to open file {}: {}",
                                    path_clone, e
                                ))
                            })?;

                    if let Resource::File(file) = resource {
                        // 使用 get_len trait 获取文件大小
                        use smb::resource::file_util::GetLen;
                        let size = file.get_len().await.map_err(|e| {
                            StorageError::IoError(format!("Failed to get file size: {}", e))
                        })?;
                        Ok(size)
                    } else {
                        Err(StorageError::IoError("Expected file resource".to_string()))
                    }
                } else {
                    Err(StorageError::NotConnected)
                }
            })
        })
        .await
        .map_err(|e| StorageError::IoError(format!("Tokio join error: {}", e)))?
    }

    async fn read_file_range(
        &self,
        path: &str,
        start: u64,
        length: u64,
    ) -> Result<Vec<u8>, StorageError> {
        self.establish_connection_internal().await?;

        let unc_path = self.build_unc_path(path)?;
        let client_arc = self.client.clone();
        let path_clone = path.to_string();

        spawn_blocking(move || -> Result<Vec<u8>, StorageError> {
            tokio::runtime::Handle::current().block_on(async {
                let mut client_guard = client_arc.lock().unwrap();
                if let Some(ref mut client) = *client_guard {
                    // 打开文件
                    let file_args = FileCreateArgs::make_open_existing(
                        FileAccessMask::new().with_generic_read(true),
                    );
                    let resource =
                        client
                            .create_file(&unc_path, &file_args)
                            .await
                            .map_err(|e| {
                                StorageError::IoError(format!(
                                    "Failed to open file {}: {}",
                                    path_clone, e
                                ))
                            })?;

                    if let Resource::File(file) = resource {
                        // 读取指定范围的数据
                        let mut buffer = vec![0u8; length as usize];
                        let bytes_read =
                            file.read_block(&mut buffer, start, false)
                                .await
                                .map_err(|e| {
                                    StorageError::IoError(format!("Failed to read file: {}", e))
                                })?;

                        buffer.truncate(bytes_read);
                        Ok(buffer)
                    } else {
                        Err(StorageError::IoError("Expected file resource".to_string()))
                    }
                } else {
                    Err(StorageError::NotConnected)
                }
            })
        })
        .await
        .map_err(|e| StorageError::IoError(format!("Tokio join error: {}", e)))?
    }

    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        // 获取文件大小然后读取整个文件
        let file_size = self.get_file_size(path).await?;
        self.read_file_range(path, 0, file_size).await
    }

    fn get_download_url(&self, path: &str) -> Result<String, StorageError> {
        // SMB doesn't provide direct download URLs, return the SMB path
        let server = self.config.url.as_ref().ok_or_else(|| {
            StorageError::InvalidConfig("SMB server URL not configured".to_string())
        })?;
        let share =
            self.config.share.as_ref().ok_or_else(|| {
                StorageError::InvalidConfig("SMB share not configured".to_string())
            })?;

        let clean_path = path.trim_start_matches('/');
        let smb_path = if clean_path.is_empty() {
            "".to_string()
        } else {
            clean_path.replace('/', "\\")
        };

        let full_path = if smb_path.is_empty() {
            format!("smb://{}/{}", server, share)
        } else {
            format!("smb://{}/{}/{}", server, share, smb_path)
        };

        Ok(full_path)
    }

    /// SMB 文件下载实现，使用分块读取（待实现完整 SMB 流式支持）
    async fn download_file(
        &self,
        path: &str,
        save_path: &std::path::Path,
        progress_callback: Option<ProgressCallback>,
        mut cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<(), StorageError> {
        use tokio::io::AsyncWriteExt;

        // 获取文件大小
        let file_size = self.get_file_size(path).await?;

        // 创建本地文件
        let mut file = tokio::fs::File::create(save_path)
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to create file: {}", e)))?;

        // 使用较大的块大小减少网络请求次数
        let chunk_size = std::cmp::max(
            crate::utils::chunk_size::calculate_optimal_chunk_size(file_size),
            1024 * 1024, // 至少 1MB
        );
        let mut written = 0u64;

        while written < file_size {
            // 检查取消信号
            if let Some(ref mut cancel_rx) = cancel_rx {
                if cancel_rx.try_recv().is_ok() {
                    let _ = tokio::fs::remove_file(save_path).await;
                    return Err(StorageError::RequestFailed(
                        "download.cancelled".to_string(),
                    ));
                }
            }

            let remaining = file_size - written;
            let current_chunk_size = std::cmp::min(chunk_size as u64, remaining);

            let chunk_data = self
                .read_file_range(path, written, current_chunk_size)
                .await?;

            file.write_all(&chunk_data)
                .await
                .map_err(|e| StorageError::IoError(format!("Failed to write data: {}", e)))?;

            written += chunk_data.len() as u64;

            // 调用进度回调
            if let Some(ref callback) = progress_callback {
                callback(written, file_size);
            }

            // 如果读取的数据少于请求的数据，说明文件结束了
            if chunk_data.len() < current_chunk_size as usize {
                break;
            }
        }

        file.flush()
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to flush file: {}", e)))?;

        Ok(())
    }
}
