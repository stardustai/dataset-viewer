use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::storage::traits::{
    ConnectionConfig, DirectoryResult, ListOptions, ProgressCallback, StorageClient, StorageError,
    StorageFile,
};

pub struct SMBClient {
    config: ConnectionConfig,
    connected: AtomicBool,
}

impl SMBClient {
    pub fn new(config: ConnectionConfig) -> Result<Self, StorageError> {
        Ok(SMBClient {
            config,
            connected: AtomicBool::new(false),
        })
    }

    /// 解析 SMB URL 并提取服务器、共享和路径信息
    fn parse_smb_url(&self, path: &str) -> Result<(String, String, String), StorageError> {
        // 处理 smb://server/share/path 格式
        if path.starts_with("smb://") {
            let path_without_protocol = &path[6..]; // 去掉 "smb://"
            let parts: Vec<&str> = path_without_protocol.splitn(3, '/').collect();
            
            if parts.is_empty() {
                return Err(StorageError::InvalidConfig("Invalid SMB URL format".to_string()));
            }
            
            let server = parts[0].to_string();
            let share = if parts.len() > 1 { parts[1].to_string() } else { String::new() };
            let file_path = if parts.len() > 2 { parts[2].to_string() } else { String::new() };
            
            Ok((server, share, file_path))
        } else {
            // 对于相对路径，使用配置中的服务器信息
            let server = self.config.url.clone()
                .ok_or_else(|| StorageError::InvalidConfig("SMB server URL not configured".to_string()))?;
            let share = self.config.extra_options.as_ref()
                .and_then(|opts| opts.get("share"))
                .cloned()
                .unwrap_or_default();
            
            Ok((server, share, path.to_string()))
        }
    }
}

#[async_trait]
impl StorageClient for SMBClient {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<(), StorageError> {
        self.validate_config(config)?;
        self.config = config.clone();

        // TODO: Implement actual SMB connection
        // For now, just mark as connected for development
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
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        // TODO: Implement actual SMB directory listing
        // For now, return empty result for development
        Ok(DirectoryResult {
            files: vec![],
            has_more: false,
            next_marker: None,
            total_count: None,
            path: path.to_string(),
        })
    }

    async fn read_file_range(
        &self,
        _path: &str,
        _start: u64,
        _length: u64,
    ) -> Result<Vec<u8>, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        // TODO: Implement actual SMB file range reading
        Err(StorageError::RequestFailed("SMB file reading not yet implemented".to_string()))
    }

    async fn read_full_file(&self, _path: &str) -> Result<Vec<u8>, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        // TODO: Implement actual SMB full file reading
        Err(StorageError::RequestFailed("SMB file reading not yet implemented".to_string()))
    }

    async fn get_file_size(&self, _path: &str) -> Result<u64, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        // TODO: Implement actual SMB file size retrieval
        Err(StorageError::RequestFailed("SMB file size retrieval not yet implemented".to_string()))
    }

    fn protocol(&self) -> &str {
        "smb"
    }

    fn validate_config(&self, config: &ConnectionConfig) -> Result<(), StorageError> {
        if config.protocol != "smb" {
            return Err(StorageError::InvalidConfig(format!(
                "Expected protocol 'smb', got '{}'",
                config.protocol
            )));
        }

        if config.url.is_none() {
            return Err(StorageError::InvalidConfig(
                "SMB server URL is required".to_string(),
            ));
        }

        if config.username.is_none() {
            return Err(StorageError::InvalidConfig(
                "SMB username is required".to_string(),
            ));
        }

        if config.password.is_none() {
            return Err(StorageError::InvalidConfig(
                "SMB password is required".to_string(),
            ));
        }

        Ok(())
    }

    fn get_download_url(&self, path: &str) -> Result<String, StorageError> {
        // SMB doesn't provide direct download URLs, return the SMB path
        if path.starts_with("smb://") {
            Ok(path.to_string())
        } else {
            // 构建 SMB URL
            let server = self.config.url.as_ref()
                .ok_or_else(|| StorageError::InvalidConfig("SMB server URL not configured".to_string()))?;
            let share = self.config.extra_options.as_ref()
                .and_then(|opts| opts.get("share"))
                .cloned()
                .unwrap_or_default();
            
            if share.is_empty() {
                return Err(StorageError::InvalidConfig("SMB share not configured".to_string()));
            }
            
            let clean_path = path.trim_start_matches('/');
            Ok(format!("smb://{}/{}/{}", server, share, clean_path))
        }
    }

    fn get_download_headers(&self) -> HashMap<String, String> {
        // SMB doesn't use HTTP headers for authentication
        HashMap::new()
    }
}