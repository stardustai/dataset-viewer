use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

/// 进度回调函数类型
pub type ProgressCallback = Arc<dyn Fn(u64, u64) + Send + Sync>;

/// 统一的文件信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct StorageFile {
    pub filename: String,
    pub basename: String,
    pub lastmod: String,
    pub size: String, // 使用字符串表示大数字
    #[serde(rename = "type")]
    pub file_type: String, // "file" or "directory"
    pub mime: Option<String>,
    pub etag: Option<String>,
}

/// 统一的目录列表结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryResult {
    pub files: Vec<StorageFile>,
    pub has_more: bool,
    pub next_marker: Option<String>,
    pub total_count: Option<String>, // 使用字符串表示大数字
    pub path: String,
}

/// 统一的列表选项
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ListOptions {
    pub page_size: Option<u32>,
    pub marker: Option<String>,
    pub prefix: Option<String>,
    pub recursive: Option<bool>,
    pub sort_by: Option<String>,    // "name", "size", "modified"
    pub sort_order: Option<String>, // "asc", "desc"
}

/// 统一的存储响应结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub metadata: Option<serde_json::Value>,
}

/// 统一的存储请求结构
#[derive(Debug, Clone)]
pub struct StorageRequest {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

/// 连接配置
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub protocol: String,
    pub url: Option<String>,
    pub access_key: Option<String>,
    pub secret_key: Option<String>,
    pub region: Option<String>,
    pub bucket: Option<String>,
    pub endpoint: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    // SSH 特定字段
    pub port: Option<u16>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub root_path: Option<String>,
    // SMB 特定字段
    pub share: Option<String>,
    pub domain: Option<String>,
    pub extra_options: Option<HashMap<String, String>>,
}

/// 存储客户端错误类型
#[derive(Debug, Clone, thiserror::Error)]
pub enum StorageError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Request failed: {0}")]
    RequestFailed(String),

    #[error("File not found: {0}")]
    NotFound(String),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Protocol not supported: {0}")]
    ProtocolNotSupported(String),

    #[error("Unsupported protocol: {0}")]
    UnsupportedProtocol(String),

    #[error("Not connected")]
    NotConnected,

    #[error("IO error: {0}")]
    IoError(String),

    #[error("Network error: {0}")]
    NetworkError(String),
}

/// 统一存储客户端接口
#[async_trait]
pub trait StorageClient: Send + Sync {
    /// 连接到存储服务
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<(), StorageError>;

    /// 检查是否已连接
    async fn is_connected(&self) -> bool;

    /// 列出目录内容
    async fn list_directory(
        &self,
        path: &str,
        options: Option<&ListOptions>,
    ) -> Result<DirectoryResult, StorageError>;

    /// 读取文件的指定范围（用于压缩包等需要随机访问的场景）
    async fn read_file_range(
        &self,
        path: &str,
        start: u64,
        length: u64,
    ) -> Result<Vec<u8>, StorageError>;

    /// 读取文件的指定范围，支持进度回调和取消信号
    async fn read_file_range_with_progress(
        &self,
        path: &str,
        start: u64,
        length: u64,
        progress_callback: Option<ProgressCallback>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<Vec<u8>, StorageError> {
        // 默认实现：忽略取消信号，调用不带进度的版本，并在完成后调用一次进度回调
        let _ = cancel_rx; // 避免未使用警告
        let result = self.read_file_range(path, start, length).await?;
        if let Some(callback) = progress_callback {
            callback(length, length);
        }
        Ok(result)
    }

    /// 读取完整文件（用于小文件或完整下载）
    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError>;

    /// 读取完整文件，支持进度回调和取消信号
    async fn read_full_file_with_progress(
        &self,
        path: &str,
        progress_callback: Option<ProgressCallback>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<Vec<u8>, StorageError> {
        // 默认实现：忽略取消信号，调用不带进度的版本，并在完成后调用一次进度回调
        let _ = cancel_rx; // 避免未使用警告
        let result = self.read_full_file(path).await?;
        if let Some(callback) = progress_callback {
            let size = result.len() as u64;
            callback(size, size);
        }
        Ok(result)
    }

    /// 获取文件大小
    async fn get_file_size(&self, path: &str) -> Result<u64, StorageError>;

    /// 下载文件到指定路径，支持进度回调和取消
    /// 各个存储客户端应该实现高效的流式下载策略
    /// 默认实现使用分块读取，但建议各客户端根据协议特性优化
    async fn download_file(
        &self,
        path: &str,
        save_path: &std::path::Path,
        progress_callback: Option<ProgressCallback>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<(), StorageError>;

    /// 获取协议名称
    fn protocol(&self) -> &str;

    /// 验证配置是否有效
    #[allow(dead_code)] // API 保留方法
    fn validate_config(&self, config: &ConnectionConfig) -> Result<(), StorageError>;
}
