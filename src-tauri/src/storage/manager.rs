use std::collections::HashMap;
use tokio::sync::{RwLock, Semaphore};
use std::sync::Arc;
use super::traits::{StorageClient, StorageRequest, StorageResponse, StorageError, ConnectionConfig, DirectoryResult, ListOptions};
use super::webdav_client::WebDAVClient;
use super::local_client::LocalFileSystemClient;
use super::oss_client::OSSClient;
use super::huggingface_client::HuggingFaceClient;

pub struct StorageManager {
    clients: HashMap<String, Arc<dyn StorageClient + Send + Sync>>,
    active_client: Option<String>,
    // 缓存的活跃客户端引用，减少HashMap查找
    cached_client: Option<Arc<dyn StorageClient + Send + Sync>>,
    // 并发控制：限制同时进行的请求数量
    request_semaphore: Arc<Semaphore>,
}

impl StorageManager {
    pub fn new() -> Self {
        Self {
            clients: HashMap::new(),
            active_client: None,
            cached_client: None,
            request_semaphore: Arc::new(Semaphore::new(10)), // 限制最多10个并发请求
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

        self.clients.insert(client_id.clone(), client.clone());
        self.active_client = Some(client_id);

        // 更新缓存的客户端引用
        self.cached_client = Some(client.clone());

        Ok(())
    }

    pub async fn disconnect(&mut self) -> Result<(), StorageError> {
        if let Some(client_id) = &self.active_client {
            if let Some(_client) = self.clients.remove(client_id) {
                // 注意：由于 StorageClient trait 的 disconnect 方法需要 &mut self，
                // 而我们现在使用 Arc<dyn StorageClient> 无法获得可变引用，
                // 所以我们依赖 Drop trait 来进行资源清理。
                // 这是合理的，因为大多数网络连接会在 Drop 时自动清理。
            }
        }
        self.active_client = None;

        // 清空缓存的客户端引用
        self.cached_client = None;

        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.active_client.is_some()
    }

    pub async fn request(&self, request: &StorageRequest) -> Result<StorageResponse, StorageError> {
        // 获取并发许可
        let _permit = self.request_semaphore.acquire().await.map_err(|_| {
            StorageError::ConnectionFailed("Request semaphore acquisition failed".to_string())
        })?;

        // 快速获取缓存的客户端引用
        let client = if let Some(ref client) = self.cached_client {
            client.clone()
        } else {
            return Err(StorageError::NotConnected);
        };

        // 直接执行请求，client 本身就是线程安全的
        client.request(request).await
    }

    pub async fn request_binary(&self, request: &StorageRequest) -> Result<Vec<u8>, StorageError> {
        // 获取并发许可
        let _permit = self.request_semaphore.acquire().await.map_err(|_| {
            StorageError::ConnectionFailed("Request semaphore acquisition failed".to_string())
        })?;

        // 快速获取缓存的客户端引用
        let client = if let Some(ref client) = self.cached_client {
            client.clone()
        } else {
            return Err(StorageError::NotConnected);
        };

        // 直接执行请求，client 本身就是线程安全的
        client.request_binary(request).await
    }

    pub async fn list_directory(&self, path: &str, options: Option<&ListOptions>) -> Result<DirectoryResult, StorageError> {
        // 获取并发许可
        let _permit = self.request_semaphore.acquire().await.map_err(|_| {
            StorageError::ConnectionFailed("Request semaphore acquisition failed".to_string())
        })?;

        // 快速获取缓存的客户端引用
        let client = if let Some(ref client) = self.cached_client {
            client.clone()
        } else {
            return Err(StorageError::NotConnected);
        };

        // 直接执行请求，client 本身就是线程安全的
        client.list_directory(path, options).await
    }

    pub fn get_current_client(&self) -> Option<Arc<dyn StorageClient + Send + Sync>> {
        self.cached_client.clone()
    }

    pub async fn get_download_url(&self, path: &str) -> Result<String, StorageError> {
        let client = self.cached_client.as_ref()
            .ok_or(StorageError::NotConnected)?;

        client.get_download_url(path)
    }
    pub fn supported_protocols(&self) -> Vec<&str> {
        vec!["webdav", "local", "oss", "huggingface"]
    }


}

// 全局存储管理器
static STORAGE_MANAGER: tokio::sync::OnceCell<Arc<RwLock<StorageManager>>> = tokio::sync::OnceCell::const_new();

pub async fn get_storage_manager() -> Arc<RwLock<StorageManager>> {
    let result = STORAGE_MANAGER.get_or_init(|| async {
        let manager = StorageManager::new();
        Arc::new(RwLock::new(manager))
    }).await.clone();
    result
}
