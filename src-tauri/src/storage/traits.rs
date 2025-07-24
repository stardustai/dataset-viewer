use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    #[allow(dead_code)]
    pub options: Option<serde_json::Value>,
}

/// 连接配置
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub extra_options: Option<HashMap<String, String>>,
}

/// 存储客户端错误类型
#[derive(Debug, thiserror::Error)]
#[allow(dead_code)]
pub enum StorageError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Request failed: {0}")]
    RequestFailed(String),

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
    async fn connect(&self) -> Result<(), StorageError>;

    /// 断开连接
    async fn disconnect(&self) -> Result<(), StorageError>;

    /// 检查是否已连接
    #[allow(dead_code)]
    fn is_connected(&self) -> bool;

    /// 发起请求
    async fn request(&self, request: &StorageRequest) -> Result<StorageResponse, StorageError>;

    /// 发起二进制请求
    async fn request_binary(&self, request: &StorageRequest) -> Result<Vec<u8>, StorageError>;

    /// 获取客户端能力
    fn capabilities(&self) -> StorageCapabilities;

    /// 获取协议名称
    #[allow(dead_code)]
    fn protocol(&self) -> &str;

    /// 验证配置
    #[allow(dead_code)]
    fn validate_config(&self, config: &ConnectionConfig) -> Result<(), StorageError>;
}

/// 存储能力描述
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageCapabilities {
    pub supports_streaming: bool,
    pub supports_range_requests: bool,
    pub supports_multipart_upload: bool,
    pub supports_metadata: bool,
    pub supports_encryption: bool,
    pub supports_directories: bool,
    pub max_file_size: Option<u64>,
    pub supported_methods: Vec<String>,
}

impl Default for StorageCapabilities {
    fn default() -> Self {
        Self {
            supports_streaming: false,
            supports_range_requests: false,
            supports_multipart_upload: false,
            supports_metadata: false,
            supports_encryption: false,
            supports_directories: false,
            max_file_size: None,
            supported_methods: vec!["GET".to_string(), "HEAD".to_string()],
        }
    }
}
