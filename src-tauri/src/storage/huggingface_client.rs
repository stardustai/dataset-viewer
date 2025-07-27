use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::storage::traits::{
    StorageClient, StorageRequest, StorageResponse, StorageError, ConnectionConfig,
    StorageCapabilities, DirectoryResult, StorageFile, ListOptions,
};

/// HuggingFace 数据集信息
#[derive(Debug, Deserialize)]
struct DatasetInfo {
    id: String,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

/// HuggingFace 数据集文件信息（来自 tree API）
#[derive(Debug, Clone, Deserialize)]
pub struct DatasetFile {
    #[serde(rename = "type")]
    pub file_type: String, // "file" 或 "directory"
    pub oid: String,       // Git 对象 ID
    pub size: u64,         // 文件大小
    pub path: String,      // 文件路径
}

#[derive(Debug, Deserialize)]
struct DatasetSearchResponse {
    datasets: Vec<DatasetInfo>,
}pub struct HuggingFaceClient {
    client: reqwest::Client,
    config: ConnectionConfig,
    base_url: String,
    api_url: String,
    api_token: Option<String>,
    connected: AtomicBool,
}

impl HuggingFaceClient {
    pub fn new(config: ConnectionConfig) -> Result<Self, StorageError> {
        let api_token = config.password.clone(); // API token 存储在 password 字段
        let base_url = "https://huggingface.co".to_string();
        let api_url = "https://huggingface.co/api".to_string();

        Ok(Self {
            client: Client::new(),
            config,
            api_token,
            base_url,
            api_url,
            connected: AtomicBool::new(false),
        })
    }

    /// 获取热门数据集
    async fn list_popular_datasets(&self, options: Option<&ListOptions>) -> Result<DirectoryResult, StorageError> {
        let page_size = options.and_then(|o| o.page_size).unwrap_or(20);

        let url = format!("{}?limit={}&sort=downloads&direction=-1",
            format!("{}/datasets", self.api_url), page_size);

        let response = self.client
            .get(&url)
            .headers(self.get_reqwest_headers())
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(
                format!("Failed to fetch datasets: {}", response.status())
            ));
        }

        let datasets_response: DatasetSearchResponse = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        let files: Vec<StorageFile> = datasets_response.datasets
            .into_iter()
            .map(|dataset| StorageFile {
                filename: dataset.id.replace('/', ":"), // 使用 : 替代 / 来避免路径解析问题
                basename: dataset.id.clone(), // 显示时仍然显示原始格式
                lastmod: dataset.updated_at.unwrap_or_else(|| "unknown".to_string()),
                size: 0,
                file_type: "directory".to_string(),
                mime: Some("application/x-directory".to_string()),
                etag: None,
            })
            .collect();

        Ok(DirectoryResult {
            files,
            has_more: false,
            next_marker: None,
            total_count: None,
            path: "/".to_string(),
        })
    }

    /// 搜索数据集
    async fn search_datasets(&self, query: &str, options: Option<&ListOptions>) -> Result<DirectoryResult, StorageError> {
        let page_size = options.and_then(|o| o.page_size).unwrap_or(20);

        let url = format!("{}?search={}&limit={}&sort=downloads&direction=-1",
            format!("{}/datasets", self.api_url),
            urlencoding::encode(query),
            page_size);

        let response = self.client
            .get(&url)
            .headers(self.get_reqwest_headers())
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(
                format!("Failed to search datasets: {}", response.status())
            ));
        }

        let datasets_response: DatasetSearchResponse = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        let files: Vec<StorageFile> = datasets_response.datasets
            .into_iter()
            .map(|dataset| StorageFile {
                filename: dataset.id.replace('/', ":"), // 用于前端路径导航
                basename: dataset.id.clone(), // 显示原始格式
                lastmod: dataset.updated_at.unwrap_or_else(|| "unknown".to_string()),
                size: 0,
                file_type: "directory".to_string(),
                mime: Some("application/x-directory".to_string()),
                etag: None,
            })
            .collect();

        Ok(DirectoryResult {
            files,
            has_more: false,
            next_marker: None,
            total_count: None,
            path: format!("/search/{}", urlencoding::encode(query)),
        })
    }

    /// 根据组织名称搜索数据集
    async fn list_organization_datasets(&self, org_name: &str, options: Option<&ListOptions>) -> Result<DirectoryResult, StorageError> {
        let page_size = options.and_then(|o| o.page_size).unwrap_or(20);

        // 使用 author 参数搜索特定组织的数据集
        let url = format!("{}?author={}&limit={}&sort=downloads&direction=-1",
            format!("{}/datasets", self.api_url),
            urlencoding::encode(org_name),
            page_size);

        let response = self.client
            .get(&url)
            .headers(self.get_reqwest_headers())
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(
                format!("Failed to fetch organization datasets: {}", response.status())
            ));
        }

        let datasets_response: DatasetSearchResponse = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        let files: Vec<StorageFile> = datasets_response.datasets
            .into_iter()
            .map(|dataset| StorageFile {
                filename: dataset.id.replace('/', ":"), // 用于前端路径导航
                basename: dataset.id.clone(), // 显示原始格式
                lastmod: dataset.updated_at.unwrap_or_else(|| "unknown".to_string()),
                size: 0,
                file_type: "directory".to_string(),
                mime: Some("application/x-directory".to_string()),
                etag: None,
            })
            .collect();

        Ok(DirectoryResult {
            files,
            has_more: false,
            next_marker: None,
            total_count: None,
            path: org_name.to_string(),
        })
    }

    /// 列出数据集文件
    async fn list_dataset_files(&mut self, dataset_id: &str, subpath: &str) -> Result<DirectoryResult, StorageError> {
        // 使用 tree API 获取完整的文件信息
        let url = if subpath.is_empty() {
            format!("{}/datasets/{}/tree/main", self.api_url, dataset_id)
        } else {
            format!("{}/datasets/{}/tree/main/{}", self.api_url, dataset_id, subpath)
        };

        let response = self.client
            .get(&url)
            .headers(self.get_reqwest_headers())
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(
                format!("Failed to fetch dataset files for {}/{}: {} - The path may not exist or may not be a directory",
                    dataset_id, subpath, response.status())
            ));
        }

        let files_data: Vec<DatasetFile> = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        let files: Vec<StorageFile> = files_data
            .into_iter()
            .filter_map(|file| {
                // 过滤出当前目录的直接子项
                let relative_path = if subpath.is_empty() {
                    file.path.clone()
                } else {
                    // 移除子路径前缀
                    if file.path.starts_with(&format!("{}/", subpath)) {
                        file.path[subpath.len() + 1..].to_string()
                    } else {
                        return None; // 不是当前目录的子项
                    }
                };

                // 只显示直接子项（不包含更深层的路径）
                if relative_path.contains('/') {
                    // 这是更深层的文件/目录，获取第一级目录名
                    let first_part = relative_path.split('/').next().unwrap();
                    // 检查是否已经有同名目录
                    Some(StorageFile {
                        filename: first_part.to_string(),
                        basename: first_part.to_string(),
                        lastmod: "unknown".to_string(),
                        size: 0, // 目录大小设为0
                        file_type: "directory".to_string(),
                        mime: Some("application/x-directory".to_string()),
                        etag: None,
                    })
                } else {
                    // 这是当前目录的直接子项
                    Some(StorageFile {
                        filename: relative_path.clone(),
                        basename: relative_path.clone(),
                        lastmod: "unknown".to_string(),
                        size: file.size,
                        file_type: if file.file_type == "directory" { "directory" } else { "file" }.to_string(),
                        mime: if file.file_type == "directory" {
                            Some("application/x-directory".to_string())
                        } else {
                            Some(self.get_mime_type(&relative_path))
                        },
                        etag: Some(file.oid),
                    })
                }
            })
            .collect();

        // 去重（因为可能有多个深层文件属于同一个中间目录）
        let mut unique_files: Vec<StorageFile> = Vec::new();
        for file in files {
            if !unique_files.iter().any(|f| f.filename == file.filename) {
                unique_files.push(file);
            }
        }

        let path = if subpath.is_empty() {
            dataset_id.replace('/', ":")
        } else {
            format!("{}/{}", dataset_id.replace('/', ":"), subpath)
        };

        let total_count = unique_files.len() as u64;

        Ok(DirectoryResult {
            files: unique_files,
            has_more: false,
            next_marker: None,
            total_count: Some(total_count),
            path,
        })
    }
    /// 获取 MIME 类型
    fn get_mime_type(&self, filename: &str) -> String {
        let ext = filename.split('.').last().unwrap_or("").to_lowercase();
        match ext.as_str() {
            "json" => "application/json".to_string(),
            "csv" => "text/csv".to_string(),
            "txt" => "text/plain".to_string(),
            "md" => "text/markdown".to_string(),
            "parquet" => "application/octet-stream".to_string(),
            "arrow" => "application/octet-stream".to_string(),
            "jsonl" => "application/jsonlines".to_string(),
            "tsv" => "text/tab-separated-values".to_string(),
            _ => "application/octet-stream".to_string(),
        }
    }

    /// 构建文件下载 URL
    fn build_download_url(&self, dataset_id: &str, file_path: &str) -> String {
        format!("{}/datasets/{}/resolve/main/{}", self.base_url, dataset_id, file_path)
    }

    /// 解析路径 - 处理前端传来的简单路径格式
    fn parse_path(&self, path: &str) -> Result<(String, String), StorageError> {
        if path == "/" || path.is_empty() {
            return Err(StorageError::InvalidConfig("Root path not supported".to_string()));
        }

        let path_trimmed = path.trim_start_matches('/');

        // 处理搜索路径
        if path_trimmed.starts_with("search/") {
            return Err(StorageError::InvalidConfig("Search paths should be handled separately".to_string()));
        }

        // 前端传来的路径格式：{owner}:{dataset}/{file_path}
        let parts: Vec<&str> = path_trimmed.split('/').collect();

        if parts.is_empty() {
            return Err(StorageError::InvalidConfig("Empty path".to_string()));
        }

        let dataset_id_part = parts[0];

        // 必须包含 : 分隔符
        if !dataset_id_part.contains(':') {
            return Err(StorageError::InvalidConfig(format!("Dataset identifier must use : separator, got: {}", dataset_id_part)));
        }

        let dataset_parts: Vec<&str> = dataset_id_part.split(':').collect();
        if dataset_parts.len() != 2 {
            return Err(StorageError::InvalidConfig(format!("Invalid dataset identifier format: {}", dataset_id_part)));
        }

        let owner = dataset_parts[0];
        let dataset = dataset_parts[1];

        if owner.is_empty() || dataset.is_empty() {
            return Err(StorageError::InvalidConfig("Owner and dataset name cannot be empty".to_string()));
        }

        let dataset_id = format!("{}/{}", owner, dataset);
        let file_path = if parts.len() > 1 {
            parts[1..].join("/")
        } else {
            String::new()
        };

        Ok((dataset_id, file_path))
    }

    /// 转换为 reqwest 头
    fn get_reqwest_headers(&self) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();

        headers.insert(
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("application/json")
        );

        if let Some(token) = &self.api_token {
            if let Ok(auth_value) = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token)) {
                headers.insert(reqwest::header::AUTHORIZATION, auth_value);
            }
        }

        headers
    }
}

#[async_trait]
#[async_trait]
impl StorageClient for HuggingFaceClient {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<(), StorageError> {
        self.config = config.clone();
        self.api_token = config.password.clone();
        self.connected.store(true, Ordering::Relaxed);
        Ok(())
    }

    async fn disconnect(&self) {
        self.connected.store(false, Ordering::Relaxed);
    }

    async fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    async fn list_directory(&self, path: &str, options: Option<&ListOptions>) -> Result<DirectoryResult, StorageError> {
        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        // 根路径：显示热门数据集列表
        if path == "/" || path.is_empty() {
            return self.list_popular_datasets(options).await;
        }

        // 搜索路径: /search/{query}
        if let Some(query) = path.strip_prefix("/search/") {
            let decoded_query = urlencoding::decode(query)
                .map_err(|e| StorageError::InvalidConfig(e.to_string()))?;
            return self.search_datasets(&decoded_query, options).await;
        }

        // 检查是否是组织名称（不包含 '/' 和 ':'）
        let path_trimmed = path.trim_start_matches('/');
        if !path_trimmed.contains('/') && !path_trimmed.contains(':') && !path_trimmed.is_empty() {
            // 这是一个组织名称，返回该组织下的数据集
            return self.list_organization_datasets(path_trimmed, options).await;
        }

        // 尝试解析数据集路径
        match self.parse_path(path) {
            Ok((dataset_id, file_path)) => {
                // 创建临时客户端实例来处理数据集文件列表
                let mut temp_client = HuggingFaceClient::new(self.config.clone())?;
                temp_client.connected.store(true, Ordering::Relaxed);
                temp_client.api_token = self.api_token.clone();

                temp_client.list_dataset_files(&dataset_id, &file_path).await
            }
            Err(_) => {
                // 如果路径解析失败，尝试将其视为组织名称
                self.list_organization_datasets(path_trimmed, options).await
            }
        }
    }

    async fn request(&self, request: &StorageRequest) -> Result<StorageResponse, StorageError> {
        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        let mut req_builder = match request.method.as_str() {
            "GET" => self.client.get(&request.url),
            "HEAD" => self.client.head(&request.url),
            "POST" => self.client.post(&request.url),
            "PUT" => self.client.put(&request.url),
            "DELETE" => self.client.delete(&request.url),
            _ => return Err(StorageError::RequestFailed("Unsupported method".to_string())),
        };

        // 添加认证头
        req_builder = req_builder.headers(self.get_reqwest_headers());

        // 添加自定义头
        for (key, value) in &request.headers {
            if let Ok(header_name) = reqwest::header::HeaderName::from_bytes(key.as_bytes()) {
                if let Ok(header_value) = reqwest::header::HeaderValue::from_str(value) {
                    req_builder = req_builder.header(header_name, header_value);
                }
            }
        }

        // 添加请求体
        if let Some(body) = &request.body {
            req_builder = req_builder.body(body.clone());
        }

        let response = req_builder
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        let status = response.status().as_u16();
        let headers: HashMap<String, String> = response
            .headers()
            .iter()
            .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let body = response
            .text()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        Ok(StorageResponse {
            status,
            headers,
            body,
            metadata: None,
        })
    }

    async fn request_binary(&self, request: &StorageRequest) -> Result<Vec<u8>, StorageError> {
        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        let mut req_builder = match request.method.as_str() {
            "GET" => self.client.get(&request.url),
            "HEAD" => self.client.head(&request.url),
            _ => return Err(StorageError::RequestFailed("Unsupported method for binary request".to_string())),
        };

        // 添加认证头
        req_builder = req_builder.headers(self.get_reqwest_headers());

        // 添加自定义头
        for (key, value) in &request.headers {
            if let Ok(header_name) = reqwest::header::HeaderName::from_bytes(key.as_bytes()) {
                if let Ok(header_value) = reqwest::header::HeaderValue::from_str(value) {
                    req_builder = req_builder.header(header_name, header_value);
                }
            }
        }

        let response = req_builder
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(
                format!("Request failed with status: {}", response.status())
            ));
        }

        response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| StorageError::RequestFailed(e.to_string()))
    }

    async fn read_file_range(&self, path: &str, start: u64, length: u64) -> Result<Vec<u8>, StorageError> {
        let (dataset_id, file_path) = self.parse_path(path)?;
        let download_url = self.build_download_url(&dataset_id, &file_path);

        let mut headers = HashMap::new();
        headers.insert("Range".to_string(), format!("bytes={}-{}", start, start + length - 1));

        let request = StorageRequest {
            method: "GET".to_string(),
            url: download_url,
            headers,
            body: None,
            options: None,
        };

        self.request_binary(&request).await
    }

    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        let (dataset_id, file_path) = self.parse_path(path)?;
        let download_url = self.build_download_url(&dataset_id, &file_path);

        let request = StorageRequest {
            method: "GET".to_string(),
            url: download_url,
            headers: HashMap::new(),
            body: None,
            options: None,
        };

        self.request_binary(&request).await
    }

    async fn get_file_size(&self, path: &str) -> Result<u64, StorageError> {
        let (dataset_id, file_path) = self.parse_path(path)?;

        // 使用 tree API 获取文件信息
        let tree_url = format!("{}/api/datasets/{}/tree/main", self.api_url, dataset_id);
        let query_params = if !file_path.is_empty() {
            format!("?path={}", urlencoding::encode(&file_path))
        } else {
            String::new()
        };
        let url = format!("{}{}", tree_url, query_params);

        let response = self.client
            .get(&url)
            .headers(self.get_reqwest_headers())
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(
                format!("Failed to fetch file info: {}", response.status())
            ));
        }

        let files: Vec<DatasetFile> = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        // 找到目标文件
        if let Some(file) = files.iter().find(|f| f.path == file_path && f.file_type == "file") {
            Ok(file.size)
        } else {
            // 降级到 HEAD 请求
            let download_url = self.build_download_url(&dataset_id, &file_path);

            let request = StorageRequest {
                method: "HEAD".to_string(),
                url: download_url,
                headers: HashMap::new(),
                body: None,
                options: None,
            };

            let response = self.request(&request).await?;

            if let Some(content_length) = response.headers.get("content-length") {
                content_length.parse::<u64>().map_err(|e| StorageError::RequestFailed(e.to_string()))
            } else {
                Err(StorageError::RequestFailed("Content-Length header not found".to_string()))
            }
        }
    }

    fn get_download_url(&self, path: &str) -> Result<String, StorageError> {
        let (dataset_id, file_path) = self.parse_path(path)?;
        Ok(self.build_download_url(&dataset_id, &file_path))
    }

    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            supports_streaming: true,
            supports_range_requests: true,
            supports_multipart_upload: false,
            supports_metadata: true,
            supports_encryption: false,
            supports_directories: true,
            max_file_size: None,
            supported_methods: vec![
                "GET".to_string(),
                "HEAD".to_string(),
            ],
        }
    }

    fn protocol(&self) -> &str {
        "huggingface"
    }

    fn validate_config(&self, config: &ConnectionConfig) -> Result<(), StorageError> {
        if config.protocol != "huggingface" {
            return Err(StorageError::InvalidConfig("Invalid protocol for HuggingFace client".to_string()));
        }
        // API token 是可选的
        Ok(())
    }
}
