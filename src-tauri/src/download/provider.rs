use async_trait::async_trait;
use std::path::Path;
use tokio::sync::broadcast;

use crate::download::types::DownloadRequest;
use crate::storage::{get_storage_manager, traits::ProgressCallback};

/// 下载提供者接口
/// 统一所有下载方式的接口，所有协议都通过存储客户端处理
#[async_trait]
pub trait DownloadProvider: Send + Sync {
    /// 获取文件大小
    async fn get_file_size(&self, request: &DownloadRequest) -> Result<u64, String>;

    /// 执行下载
    async fn download(
        &self,
        request: &DownloadRequest,
        save_path: &Path,
        progress_callback: Option<ProgressCallback>,
        cancel_rx: &mut broadcast::Receiver<()>,
    ) -> Result<String, String>;
}

/// 下载提供者工厂
pub struct DownloadProviderFactory;

impl DownloadProviderFactory {
    /// 根据URL选择合适的下载提供者
    /// 所有协议（HTTP、local://、ssh://、webdav://、oss://、huggingface://）
    /// 都通过当前连接的存储客户端处理
    pub async fn get_provider(_url: &str) -> Result<Box<dyn DownloadProvider>, String> {
        Ok(Box::new(StorageDownloadProvider::new().await?))
    }
}

/// 统一的存储下载提供者
/// 所有下载都通过存储客户端的流式 download_file 方法处理
pub struct StorageDownloadProvider {
    client: std::sync::Arc<dyn crate::storage::traits::StorageClient + Send + Sync>,
}

impl StorageDownloadProvider {
    pub async fn new() -> Result<Self, String> {
        let manager_arc = get_storage_manager().await;
        let manager = manager_arc.read().await;
        let client = manager
            .get_current_client()
            .ok_or_else(|| "No storage client connected".to_string())?;

        Ok(Self { client })
    }
}

#[async_trait]
impl DownloadProvider for StorageDownloadProvider {
    async fn get_file_size(&self, request: &DownloadRequest) -> Result<u64, String> {
        self.client
            .get_file_size(&request.url)
            .await
            .map_err(|e| format!("Failed to get file size: {}", e))
    }

    async fn download(
        &self,
        request: &DownloadRequest,
        save_path: &Path,
        progress_callback: Option<ProgressCallback>,
        cancel_rx: &mut broadcast::Receiver<()>,
    ) -> Result<String, String> {
        self.client
            .download_file(&request.url, save_path, progress_callback, Some(cancel_rx))
            .await
            .map(|_| format!("File downloaded successfully to: {}", save_path.display()))
            .map_err(|e| {
                if e.to_string().contains("download.cancelled") {
                    "download.cancelled".to_string()
                } else {
                    format!("Storage client download failed: {}", e)
                }
            })
    }
}
