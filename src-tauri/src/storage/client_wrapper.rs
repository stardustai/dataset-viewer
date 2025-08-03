use std::sync::Arc;
use tokio::sync::RwLock;
use async_trait::async_trait;
use crate::storage::traits::{StorageClient, StorageError, StorageRequest, StorageResponse, ConnectionConfig, ListOptions, DirectoryResult, StorageCapabilities};

/// A wrapper that implements StorageClient and delegates to a RwLock-wrapped client
pub struct StorageClientWrapper {
    inner: Arc<RwLock<dyn StorageClient + Send + Sync>>,
    // Cache protocol to avoid async calls in sync methods
    protocol: String,
}

impl StorageClientWrapper {
    pub async fn new(inner: Arc<RwLock<dyn StorageClient + Send + Sync>>) -> Self {
        let client = inner.read().await;
        let protocol = client.protocol().to_string();
        drop(client);
        
        Self { 
            inner,
            protocol,
        }
    }
}

#[async_trait]
impl StorageClient for StorageClientWrapper {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<(), StorageError> {
        let mut client = self.inner.write().await;
        client.connect(config).await
    }

    async fn disconnect(&mut self) -> Result<(), StorageError> {
        let mut client = self.inner.write().await;
        client.disconnect().await
    }

    async fn is_connected(&self) -> bool {
        let client = self.inner.read().await;
        client.is_connected().await
    }

    async fn request(&self, request: &StorageRequest) -> Result<StorageResponse, StorageError> {
        let client = self.inner.read().await;
        client.request(request).await
    }

    async fn request_binary(&self, request: &StorageRequest) -> Result<Vec<u8>, StorageError> {
        let client = self.inner.read().await;
        client.request_binary(request).await
    }

    async fn list_directory(
        &self,
        path: &str,
        options: Option<&ListOptions>,
    ) -> Result<DirectoryResult, StorageError> {
        let client = self.inner.read().await;
        client.list_directory(path, options).await
    }

    fn capabilities(&self) -> StorageCapabilities {
        // This is synchronous, so we can't access the inner client
        // Return a basic capabilities object
        StorageCapabilities::default()
    }

    fn get_download_url(&self, _path: &str) -> Result<String, StorageError> {
        // This is synchronous, so we can't access the inner client
        // Return an error indicating this operation is not supported in the wrapper
        Err(StorageError::RequestFailed("get_download_url not supported in wrapper".to_string()))
    }

    async fn read_file_range(&self, path: &str, start: u64, length: u64) -> Result<Vec<u8>, StorageError> {
        let client = self.inner.read().await;
        client.read_file_range(path, start, length).await
    }

    async fn get_file_size(&self, path: &str) -> Result<u64, StorageError> {
        let client = self.inner.read().await;
        client.get_file_size(path).await
    }

    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        let client = self.inner.read().await;
        client.read_full_file(path).await
    }

    fn protocol(&self) -> &str {
        &self.protocol
    }

    fn validate_config(&self, _config: &ConnectionConfig) -> Result<(), StorageError> {
        // This is synchronous, so we can't access the inner client
        // Return OK as a placeholder
        Ok(())
    }
}