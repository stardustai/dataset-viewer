use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use futures_util::StreamExt;

use crate::storage::traits::{
    StorageClient, StorageRequest, StorageResponse, StorageError, ConnectionConfig,
    StorageCapabilities, DirectoryResult, StorageFile, ListOptions, ProgressCallback,
};

/// HuggingFace 数据集信息
#[derive(Debug, Deserialize)]
struct DatasetInfo {
    id: String,
    #[serde(rename = "lastModified")]
    last_modified: Option<String>,
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

// HuggingFace API 直接返回数组，不需要包装结构体
pub struct HuggingFaceClient {
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

        let datasets: Vec<DatasetInfo> = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        let files: Vec<StorageFile> = datasets
            .into_iter()
            .map(|dataset| StorageFile {
                filename: dataset.id.replace('/', ":"), // 使用 : 替代 / 来避免路径解析问题
                basename: dataset.id.replace('/', ":"), // 统一使用 : 分隔符格式
                lastmod: dataset.last_modified.unwrap_or_else(|| "unknown".to_string()),
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

        let datasets: Vec<DatasetInfo> = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        let files: Vec<StorageFile> = datasets
            .into_iter()
            .map(|dataset| StorageFile {
                filename: dataset.id.replace('/', ":"), // 用于前端路径导航
                basename: dataset.id.replace('/', ":"), // 统一使用 : 分隔符格式
                lastmod: dataset.last_modified.unwrap_or_else(|| "unknown".to_string()),
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

        let datasets: Vec<DatasetInfo> = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        let files: Vec<StorageFile> = datasets
            .into_iter()
            .map(|dataset| StorageFile {
                filename: dataset.id.replace('/', ":"), // 用于前端路径导航
                basename: dataset.id.replace('/', ":"), // 统一使用 : 分隔符格式
                lastmod: dataset.last_modified.unwrap_or_else(|| "unknown".to_string()),
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
    async fn list_dataset_files(&self, dataset_id: &str, subpath: &str) -> Result<DirectoryResult, StorageError> {
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

    /// 解析路径 - 处理前端传来的协议URL或简单路径格式
    fn parse_path(&self, path: &str) -> Result<(String, String), StorageError> {
        if path == "/" || path.is_empty() {
            return Err(StorageError::InvalidConfig("Root path not supported".to_string()));
        }

        // 处理协议URL格式：huggingface://owner:dataset/file_path
        let path_to_parse = if path.starts_with("huggingface://") {
            path.strip_prefix("huggingface://").unwrap()
        } else {
            path.trim_start_matches('/')
        };

        // 处理搜索路径
        if path_to_parse.starts_with("search/") {
            return Err(StorageError::InvalidConfig("Search paths should be handled separately".to_string()));
        }

        // 路径格式：{owner}:{dataset}/{file_path}
        let parts: Vec<&str> = path_to_parse.split('/').collect();

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

        // 只在有非空 token 时才添加 Authorization 头
        if let Some(token) = &self.api_token {
            if !token.trim().is_empty() {
                if let Ok(auth_value) = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token)) {
                    headers.insert(reqwest::header::AUTHORIZATION, auth_value);
                }
            }
        }

        headers
    }

    /// 统一的请求构建方法
    fn build_request(&self, method: &str, url: &str) -> Result<reqwest::RequestBuilder, StorageError> {
        let req_builder = match method {
            "GET" => self.client.get(url),
            "HEAD" => self.client.head(url),
            "POST" => self.client.post(url),
            "PUT" => self.client.put(url),
            "DELETE" => self.client.delete(url),
            _ => return Err(StorageError::RequestFailed("Unsupported method".to_string())),
        };

        // 总是添加认证头（如果没有token，get_reqwest_headers会自动处理）
        Ok(req_builder.headers(self.get_reqwest_headers()))
    }
}

#[async_trait]
impl StorageClient for HuggingFaceClient {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<(), StorageError> {
        self.config = config.clone();
        self.api_token = config.password.clone();
        self.connected.store(true, Ordering::Relaxed);
        Ok(())
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
                self.list_dataset_files(&dataset_id, &file_path).await
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

        // 处理 huggingface:// 协议 URL
        let actual_url = if request.url.starts_with("huggingface://") {
            // 解析 huggingface://owner:dataset/file_path 或 huggingface://organization 格式
            let hf_url = request.url.strip_prefix("huggingface://").unwrap_or(&request.url);

            if hf_url.is_empty() {
                // 根路径，返回数据集列表页面
                "https://huggingface.co/datasets".to_string()
            } else {
                // 检查是否包含路径分隔符
                let parts: Vec<&str> = hf_url.splitn(2, '/').collect();
                let first_part = parts[0];
                
                if first_part.contains(':') {
                    // 路径格式：owner:dataset/file_path
                    let dataset_parts: Vec<&str> = first_part.split(':').collect();
                    if dataset_parts.len() == 2 {
                        let owner = dataset_parts[0];
                        let dataset = dataset_parts[1];
                        let dataset_id = format!("{}/{}", owner, dataset);
                        
                        if parts.len() == 2 {
                            // 有文件路径
                            let file_path = parts[1];
                            format!("https://huggingface.co/datasets/{}/resolve/main/{}", dataset_id, file_path)
                        } else {
                            // 只有数据集，返回数据集页面
                            format!("https://huggingface.co/datasets/{}", dataset_id)
                        }
                    } else {
                        return Err(StorageError::RequestFailed("Invalid dataset identifier format".to_string()));
                    }
                } else if !first_part.contains('/') {
                    // 这是一个组织名称，返回组织页面
                    format!("https://huggingface.co/{}", first_part)
                } else {
                    // 只有 owner，返回 owner 的数据集列表
                    format!("https://huggingface.co/datasets?search={}", first_part)
                }
            }
        } else {
            return Err(StorageError::RequestFailed("Only huggingface:// protocol URLs are supported".to_string()));
        };

        let mut req_builder = self.build_request(&request.method, &actual_url)?;

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

        // 处理 huggingface:// 协议 URL
        let actual_url = if request.url.starts_with("huggingface://") {
            // 解析 huggingface://owner:dataset/file_path 格式
            let hf_url = request.url.strip_prefix("huggingface://").unwrap_or(&request.url);

            if hf_url.is_empty() {
                return Err(StorageError::RequestFailed("Invalid HuggingFace URL for binary request".to_string()));
            } else {
                // 路径格式：owner:dataset/file_path
                let parts: Vec<&str> = hf_url.splitn(2, '/').collect();
                let dataset_id_part = parts[0];
                
                if dataset_id_part.contains(':') && parts.len() == 2 {
                    let dataset_parts: Vec<&str> = dataset_id_part.split(':').collect();
                    if dataset_parts.len() == 2 {
                        let owner = dataset_parts[0];
                        let dataset = dataset_parts[1];
                        let file_path = parts[1];
                        let dataset_id = format!("{}/{}", owner, dataset);
                        // 构建文件下载 URL
                        format!("https://huggingface.co/datasets/{}/resolve/main/{}", dataset_id, file_path)
                    } else {
                        return Err(StorageError::RequestFailed("Invalid dataset identifier format for binary request".to_string()));
                    }
                } else {
                    return Err(StorageError::RequestFailed("Invalid HuggingFace URL format for binary request".to_string()));
                }
            }
        } else {
            return Err(StorageError::RequestFailed("Only huggingface:// protocol URLs are supported".to_string()));
        };

        let mut req_builder = match request.method.as_str() {
            "GET" => self.client.get(&actual_url),
            "HEAD" => self.client.head(&actual_url),
            _ => return Err(StorageError::RequestFailed("Unsupported method for binary request".to_string())),
        };

        // 总是添加认证头（如果没有token，get_reqwest_headers会自动处理）
        req_builder = req_builder.headers(self.get_reqwest_headers());

        // 添加自定义头
        for (key, value) in &request.headers {
            if let Ok(header_name) = reqwest::header::HeaderName::from_bytes(key.as_bytes()) {
                if let Ok(header_value) = reqwest::header::HeaderValue::from_str(value) {
                    req_builder = req_builder.header(header_name, header_value);
                    println!("HuggingFace: Added custom header to binary request: {} = {}", key, value);
                }
            }
        }

        println!("HuggingFace: Sending binary {} request to: {}", request.method, actual_url);
        let response = req_builder
            .send()
            .await
            .map_err(|e| {
                println!("HuggingFace: Network error during binary request: {}", e);
                StorageError::NetworkError(e.to_string())
            })?;

        let status = response.status();
        println!("HuggingFace: Received binary response with status: {}", status);

        if !status.is_success() {
            println!("HuggingFace: Binary request failed with status: {}", status);
            return Err(StorageError::RequestFailed(
                format!("Request failed with status: {}", status)
            ));
        }

        let bytes_result = response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| StorageError::RequestFailed(e.to_string()));

        bytes_result
    }

    async fn read_file_range(&self, path: &str, start: u64, length: u64) -> Result<Vec<u8>, StorageError> {
        self.read_file_range_with_progress(path, start, length, None, None).await
    }

    async fn read_file_range_with_progress(
        &self,
        path: &str,
        start: u64,
        length: u64,
        progress_callback: Option<ProgressCallback>,
        mut cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<Vec<u8>, StorageError> {
        let (dataset_id, file_path) = self.parse_path(path)?;
        let download_url = self.build_download_url(&dataset_id, &file_path);
        
        println!("[DEBUG] HuggingFace read_file_range:");
        println!("[DEBUG] - path: {}", path);
        println!("[DEBUG] - dataset_id: {}", dataset_id);
        println!("[DEBUG] - file_path: {}", file_path);
        println!("[DEBUG] - download_url: {}", download_url);
        println!("[DEBUG] - range: bytes={}-{}", start, start + length - 1);

        // 直接使用 HTTP 客户端，不通过 request_binary
        let mut req_builder = self.client.get(&download_url);
        req_builder = req_builder.headers(self.get_reqwest_headers());
        req_builder = req_builder.header("Range", format!("bytes={}-{}", start, start + length - 1));

        let response = req_builder.send().await
            .map_err(|e| StorageError::NetworkError(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(format!("HTTP {}: {}", response.status(), response.status().canonical_reason().unwrap_or("error.unknown"))));
        }

        // 使用流式读取以支持进度回调
        let mut result = Vec::with_capacity(length as usize);
        let mut downloaded = 0u64;
        let mut stream = response.bytes_stream();

        while let Some(chunk_result) = stream.next().await {
            // 检查取消信号
            if let Some(ref mut cancel_rx) = cancel_rx {
                if cancel_rx.try_recv().is_ok() {
                    return Err(StorageError::RequestFailed("download.cancelled".to_string()));
                }
            }

            let chunk = chunk_result
                .map_err(|e| StorageError::NetworkError(format!("Failed to read chunk: {}", e)))?;
            
            result.extend_from_slice(&chunk);
            downloaded += chunk.len() as u64;

            // 调用进度回调
            if let Some(ref callback) = progress_callback {
                callback(downloaded, length);
            }
        }

        Ok(result)
    }

    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        let (dataset_id, file_path) = self.parse_path(path)?;
        let download_url = self.build_download_url(&dataset_id, &file_path);

        // 直接使用 HTTP 客户端，不通过 request_binary
        let mut req_builder = self.client.get(&download_url);
        req_builder = req_builder.headers(self.get_reqwest_headers());

        let response = req_builder.send().await
            .map_err(|e| StorageError::NetworkError(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(format!("HTTP {}: {}", response.status(), response.status().canonical_reason().unwrap_or("error.unknown"))));
        }

        let bytes = response.bytes().await
            .map_err(|e| StorageError::NetworkError(format!("Failed to read response body: {}", e)))?;

        Ok(bytes.to_vec())
    }

    async fn get_file_size(&self, path: &str) -> Result<u64, StorageError> {
        println!("[DEBUG] HuggingFace get_file_size called with:");
        println!("[DEBUG] - path: {}", path);
        
        let (dataset_id, file_path) = self.parse_path(path)?;
        
        println!("[DEBUG] - dataset_id: {}", dataset_id);
        println!("[DEBUG] - file_path: {}", file_path);

        // 使用 tree API 获取文件信息
        let tree_url = format!("{}/datasets/{}/tree/main", self.api_url, dataset_id);
        let url = if !file_path.is_empty() {
            // 如果文件路径包含目录分隔符，则添加 path 参数
            if file_path.contains('/') {
                let dir_path = file_path.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("");
                format!("{}?path={}", tree_url, urlencoding::encode(dir_path))
            } else {
                // 根目录文件，不添加 path 参数
                tree_url
            }
        } else {
            tree_url
        };
        
        println!("[DEBUG] - tree API URL: {}", url);

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
            
            println!("[DEBUG] - fallback to HEAD request: {}", download_url);

            let response = self.client
                .head(&download_url)
                .headers(self.get_reqwest_headers())
                .send()
                .await
                .map_err(|e| StorageError::NetworkError(e.to_string()))?;

            if !response.status().is_success() {
                return Err(StorageError::RequestFailed(
                    format!("HEAD request failed: {}", response.status())
                ));
            }

            if let Some(content_length) = response.headers().get("content-length") {
                content_length.to_str()
                    .map_err(|e| StorageError::RequestFailed(e.to_string()))?
                    .parse::<u64>()
                    .map_err(|e| StorageError::RequestFailed(e.to_string()))
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
