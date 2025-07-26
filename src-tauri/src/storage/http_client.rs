/// HTTP Storage Client for archive analysis
use crate::storage::traits::StorageClient;
use std::collections::HashMap;
use async_trait::async_trait;
use std::io::Cursor;

/// HTTP客户端实现Storage接口，用于处理HTTP URL的压缩文件
pub struct HttpStorageClient {
    url: String,
    headers: HashMap<String, String>,
}

impl HttpStorageClient {
    pub fn new(url: &str, headers: &HashMap<String, String>) -> Self {
        Self {
            url: url.to_string(),
            headers: headers.clone(),
        }
    }
}

#[async_trait]
impl StorageClient for HttpStorageClient {
    async fn read_file_range(&self, _file_path: &str, start: u64, length: u64) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
        use reqwest;

        let client = reqwest::Client::new();
        let mut request = client.get(&self.url);

        // 添加Range头
        let range_header = format!("bytes={}-{}", start, start + length - 1);
        request = request.header("Range", range_header);

        // 添加自定义头
        for (key, value) in &self.headers {
            request = request.header(key, value);
        }

        let response = request.send().await?;

        if !response.status().is_success() && response.status() != 206 {
            return Err(format!("HTTP request failed: {}", response.status()).into());
        }

        let bytes = response.bytes().await?;
        Ok(bytes.to_vec())
    }

    async fn read_full_file(&self, _file_path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
        use reqwest;

        let client = reqwest::Client::new();
        let mut request = client.get(&self.url);

        // 添加自定义头
        for (key, value) in &self.headers {
            request = request.header(key, value);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(format!("HTTP request failed: {}", response.status()).into());
        }

        let bytes = response.bytes().await?;
        Ok(bytes.to_vec())
    }

    async fn get_file_size(&self, _file_path: &str) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
        use reqwest;

        let client = reqwest::Client::new();
        let mut request = client.head(&self.url);

        // 添加自定义头
        for (key, value) in &self.headers {
            request = request.header(key, value);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(format!("HTTP HEAD request failed: {}", response.status()).into());
        }

        if let Some(content_length) = response.headers().get("content-length") {
            let size_str = content_length.to_str()
                .map_err(|e| format!("Invalid content-length header: {}", e))?;
            let size = size_str.parse::<u64>()
                .map_err(|e| format!("Failed to parse content-length: {}", e))?;
            Ok(size)
        } else {
            Err("No content-length header found".into())
        }
    }

    async fn file_exists(&self, _file_path: &str) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        use reqwest;

        let client = reqwest::Client::new();
        let mut request = client.head(&self.url);

        // 添加自定义头
        for (key, value) in &self.headers {
            request = request.header(key, value);
        }

        let response = request.send().await?;
        Ok(response.status().is_success())
    }

    fn get_client_type(&self) -> String {
        "HTTP".to_string()
    }
}
