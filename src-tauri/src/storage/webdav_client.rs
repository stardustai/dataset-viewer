use async_trait::async_trait;
use base64::engine::general_purpose;
use base64::Engine;
use reqwest::Client;
use std::collections::HashMap;

use crate::storage::traits::{StorageClient, StorageRequest, StorageResponse, StorageError, ConnectionConfig, StorageCapabilities};

pub struct WebDAVClient {
    client: Client,
    #[allow(dead_code)]
    config: ConnectionConfig,
    auth_header: Option<String>,
    connected: bool,
}

impl WebDAVClient {
    pub fn new(config: ConnectionConfig) -> Result<Self, StorageError> {
        let _base_url = config.url.clone()
            .ok_or_else(|| StorageError::InvalidConfig("WebDAV URL is required".to_string()))?;

        let auth_header = if let (Some(username), Some(password)) = (&config.username, &config.password) {
            let credentials = general_purpose::STANDARD.encode(format!("{}:{}", username, password));
            Some(format!("Basic {}", credentials))
        } else {
            None
        };

        Ok(Self {
            client: Client::new(),
            config,
            auth_header,
            connected: false,
        })
    }
}

#[async_trait]
impl StorageClient for WebDAVClient {
    async fn connect(&self) -> Result<(), StorageError> {
        // 这里可以添加连接测试逻辑
        // 比如发送一个 OPTIONS 或 PROPFIND 请求来验证连接
        Ok(())
    }

    async fn disconnect(&self) -> Result<(), StorageError> {
        // WebDAV 是无状态的，不需要显式断开连接
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }

    async fn request(&self, request: &StorageRequest) -> Result<StorageResponse, StorageError> {
        let mut req_builder = match request.method.as_str() {
            "GET" => self.client.get(&request.url),
            "POST" => self.client.post(&request.url),
            "PUT" => self.client.put(&request.url),
            "DELETE" => self.client.delete(&request.url),
            "HEAD" => self.client.head(&request.url),
            "PROPFIND" => {
                self.client.request(
                    reqwest::Method::from_bytes(b"PROPFIND").unwrap(),
                    &request.url
                )
            },
            _ => return Err(StorageError::RequestFailed(format!("Unsupported method: {}", request.method))),
        };

        // 添加认证头
        if let Some(auth) = &self.auth_header {
            req_builder = req_builder.header("Authorization", auth);
        }

        // 添加其他头
        for (key, value) in &request.headers {
            req_builder = req_builder.header(key, value);
        }

        // 添加 body
        if let Some(body) = &request.body {
            req_builder = req_builder.body(body.clone());
        }

        let response = req_builder.send().await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        let status = response.status().as_u16();
        let headers: HashMap<String, String> = response.headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let body = response.text().await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        Ok(StorageResponse {
            status,
            headers,
            body,
            metadata: None,
        })
    }

    async fn request_binary(&self, request: &StorageRequest) -> Result<Vec<u8>, StorageError> {
        let mut req_builder = match request.method.as_str() {
            "GET" => self.client.get(&request.url),
            "POST" => self.client.post(&request.url),
            "PUT" => self.client.put(&request.url),
            "DELETE" => self.client.delete(&request.url),
            "HEAD" => self.client.head(&request.url),
            "PROPFIND" => {
                self.client.request(
                    reqwest::Method::from_bytes(b"PROPFIND").unwrap(),
                    &request.url
                )
            },
            _ => return Err(StorageError::RequestFailed(format!("Unsupported method: {}", request.method))),
        };

        // 添加认证头
        if let Some(auth) = &self.auth_header {
            req_builder = req_builder.header("Authorization", auth);
        }

        // 添加其他头
        for (key, value) in &request.headers {
            req_builder = req_builder.header(key, value);
        }

        // 添加 body
        if let Some(body) = &request.body {
            req_builder = req_builder.body(body.clone());
        }

        let response = req_builder.send().await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        let bytes = response.bytes().await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        Ok(bytes.to_vec())
    }

    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            supports_directories: true,
            supports_metadata: true,
            supports_streaming: true,
            supports_range_requests: true,
            supports_multipart_upload: false,
            supports_encryption: false,
            max_file_size: None,
            supported_methods: vec![
                "GET".to_string(),
                "PUT".to_string(),
                "DELETE".to_string(),
                "PROPFIND".to_string(),
                "MKCOL".to_string(),
            ],
        }
    }

    fn protocol(&self) -> &str {
        "webdav"
    }

    fn validate_config(&self, config: &ConnectionConfig) -> Result<(), StorageError> {
        if config.protocol != "webdav" {
            return Err(StorageError::InvalidConfig(
                format!("Expected protocol 'webdav', got '{}'", config.protocol)
            ));
        }

        if config.url.is_none() {
            return Err(StorageError::InvalidConfig("URL is required for WebDAV".to_string()));
        }

        Ok(())
    }
}
