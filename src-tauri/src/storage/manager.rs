use std::collections::HashMap;
use tokio::sync::Mutex;
use std::sync::Arc;
use std::time::{Duration, Instant};
use super::traits::{StorageClient, StorageRequest, StorageResponse, StorageError, ConnectionConfig, StorageCapabilities, DirectoryResult, ListOptions};
use super::webdav_client::WebDAVClient;
use super::local_client::LocalFileSystemClient;
use super::oss_client::OSSClient;
use super::huggingface_client::HuggingFaceClient;

pub struct StorageManager {
    clients: HashMap<String, Arc<dyn StorageClient + Send + Sync>>,
    active_client: Option<String>,
    last_health_check: Option<Instant>,
    health_check_interval: Duration,
}

impl StorageManager {
    pub fn new() -> Self {
        Self {
            clients: HashMap::new(),
            active_client: None,
            last_health_check: None,
            health_check_interval: Duration::from_secs(30), // 30秒检查一次
        }
    }

    pub async fn connect(&mut self, config: &ConnectionConfig) -> Result<(), StorageError> {
        let client: Arc<dyn StorageClient + Send + Sync> = match config.protocol.as_str() {
            "webdav" => {
                let mut client = WebDAVClient::new(config.clone())?;
                client.connect(config).await?;
                Arc::new(client)
            },
            "local" => {
                let mut client = LocalFileSystemClient::new();
                client.connect(config).await?;
                Arc::new(client)
            },
            "oss" => {
                let mut client = OSSClient::new(config.clone())?;
                client.connect(config).await?;
                Arc::new(client)
            },
            "huggingface" => {
                let mut client = HuggingFaceClient::new(config.clone())?;
                client.connect(config).await?;
                Arc::new(client)
            },
            _ => return Err(StorageError::UnsupportedProtocol(config.protocol.clone())),
        };

        let client_id = format!("{}_{}", config.protocol, chrono::Utc::now().timestamp());

        self.clients.insert(client_id.clone(), client);
        self.active_client = Some(client_id);

        Ok(())
    }

    pub async fn disconnect(&mut self) -> Result<(), StorageError> {
        if let Some(client_id) = &self.active_client {
            if let Some(client) = self.clients.remove(client_id) {
                client.disconnect().await;
            }
            self.active_client = None;
        }
        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.active_client.is_some()
    }

    pub async fn request(&mut self, request: &StorageRequest) -> Result<StorageResponse, StorageError> {
        self.ensure_healthy_connection().await?;
        if let Some(client_id) = &self.active_client {
            if let Some(client) = self.clients.get(client_id) {
                return client.request(request).await;
            }
        }
        Err(StorageError::NotConnected)
    }

    pub async fn request_binary(&mut self, request: &StorageRequest) -> Result<Vec<u8>, StorageError> {
        self.ensure_healthy_connection().await?;
        if let Some(client_id) = &self.active_client {
            if let Some(client) = self.clients.get(client_id) {
                return client.request_binary(request).await;
            }
        }
        Err(StorageError::NotConnected)
    }

    pub async fn list_directory(&mut self, path: &str, options: Option<&ListOptions>) -> Result<DirectoryResult, StorageError> {
        self.ensure_healthy_connection().await?;
        if let Some(client_id) = &self.active_client {
            if let Some(client) = self.clients.get(client_id) {
                return client.list_directory(path, options).await;
            }
        }
        Err(StorageError::NotConnected)
    }

    pub fn current_capabilities(&self) -> Option<StorageCapabilities> {
        let client_id = self.active_client.as_ref()?;
        let client = self.clients.get(client_id)?;
        Some(client.capabilities())
    }

    pub fn get_current_client(&self) -> Option<Arc<dyn StorageClient>> {
        let client_id = self.active_client.as_ref()?;
        let client = self.clients.get(client_id)?;
        Some(client.clone())
    }

    pub fn get_download_url(&self, path: &str) -> Result<String, StorageError> {
        let client_id = self.active_client.as_ref()
            .ok_or(StorageError::NotConnected)?;
        let client = self.clients.get(client_id)
            .ok_or(StorageError::NotConnected)?;

        client.get_download_url(path)
    }
    pub fn supported_protocols(&self) -> Vec<&str> {
        vec!["webdav", "local", "oss", "huggingface"]
    }

    /// 健康检查：验证当前连接是否正常
    pub async fn health_check(&mut self) -> Result<bool, StorageError> {
        if let Some(client_id) = &self.active_client {
            if let Some(client) = self.clients.get(client_id) {
                let is_healthy = client.is_connected().await;
                self.last_health_check = Some(Instant::now());
                return Ok(is_healthy);
            }
        }
        Ok(false)
    }

    /// 检查是否需要进行健康检查
    fn should_health_check(&self) -> bool {
        match self.last_health_check {
            Some(last_check) => last_check.elapsed() >= self.health_check_interval,
            None => true,
        }
    }

    /// 在关键操作前自动进行健康检查
    async fn ensure_healthy_connection(&mut self) -> Result<(), StorageError> {
        if self.should_health_check() {
            let is_healthy = self.health_check().await?;
            if !is_healthy {
                return Err(StorageError::ConnectionFailed("Connection health check failed".to_string()));
            }
        }
        Ok(())
     }
}

// 全局存储管理器
static STORAGE_MANAGER: tokio::sync::OnceCell<Arc<Mutex<StorageManager>>> = tokio::sync::OnceCell::const_new();

pub async fn get_storage_manager() -> Arc<Mutex<StorageManager>> {
    let result = STORAGE_MANAGER.get_or_init(|| async {
        let manager = StorageManager::new();
        Arc::new(Mutex::new(manager))
    }).await.clone();
    result
}
