use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;

use std::sync::atomic::{AtomicBool, Ordering};

use crate::storage::traits::{
    ConnectionConfig, DirectoryResult, ListOptions, ProgressCallback, StorageClient, StorageError,
    StorageFile,
};
use crate::utils::http_downloader::HttpDownloader;

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
    pub oid: String,  // Git 对象 ID
    pub size: u64,    // 文件大小
    pub path: String, // 文件路径
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
    async fn list_popular_datasets(
        &self,
        options: Option<&ListOptions>,
    ) -> Result<DirectoryResult, StorageError> {
        let page_size = options.and_then(|o| o.page_size).unwrap_or(20);

        // 构建基础 URL
        let mut url = format!("{}/datasets?limit={}", self.api_url, page_size);

        // 如果有 marker，添加为 cursor 参数（HuggingFace API 的分页参数）
        if let Some(marker) = options.and_then(|o| o.marker.as_ref()) {
            if !marker.is_empty() {
                url.push_str(&format!("&cursor={}", urlencoding::encode(marker)));
            }
        }

        let response = self
            .client
            .get(&url)
            .headers(self.get_reqwest_headers())
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(format!(
                "Failed to fetch datasets: {}",
                response.status()
            )));
        }

        // 提取 Link header 信息以及下一页的 cursor（在消耗 response 之前）
        let (has_more, next_cursor) = if let Some(link_header) = response.headers().get("Link") {
            if let Ok(link_str) = link_header.to_str() {
                let has_more = link_str.contains("rel=\"next\"");

                // 从 Link header 中提取 cursor 参数
                let next_cursor = if has_more {
                    // 提取形如 <https://huggingface.co/api/datasets?cursor=xxx&limit=20>; rel="next" 的链接
                    link_str
                        .split(',')
                        .find(|part| part.contains("rel=\"next\""))
                        .and_then(|next_part| {
                            // 提取 URL 部分
                            next_part
                                .trim()
                                .strip_prefix('<')
                                .and_then(|s| s.split('>').next())
                        })
                        .and_then(|url| {
                            // 从 URL 中提取 cursor 参数
                            url.split('&')
                                .find(|param| param.starts_with("cursor="))
                                .and_then(|cursor_param| cursor_param.strip_prefix("cursor="))
                                .map(|cursor| {
                                    urlencoding::decode(cursor).unwrap_or_default().into_owned()
                                })
                        })
                } else {
                    None
                };

                (has_more, next_cursor)
            } else {
                (false, None)
            }
        } else {
            (false, None)
        };

        let datasets: Vec<DatasetInfo> = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        let files: Vec<StorageFile> = datasets
            .into_iter()
            .map(|dataset| StorageFile {
                filename: dataset.id.replace('/', ":"), // 使用 : 替代 / 来避免路径解析问题
                basename: dataset.id.replace('/', ":"), // 统一使用 : 分隔符格式
                lastmod: dataset
                    .last_modified
                    .unwrap_or_else(|| "unknown".to_string()),
                size: "0".to_string(),
                file_type: "directory".to_string(),
                mime: Some("application/x-directory".to_string()),
                etag: None,
            })
            .collect();

        // 根据 Link header 或返回数量判断是否有更多数据
        let has_more = if !has_more {
            // 如果没有 Link header 信息，根据返回数量判断
            files.len() == page_size as usize
        } else {
            has_more
        };

        Ok(DirectoryResult {
            files,
            has_more,
            next_marker: next_cursor, // 使用从 Link header 提取的 cursor
            total_count: None,
            path: "/".to_string(),
        })
    }

    /// 搜索数据集
    async fn search_datasets(
        &self,
        query: &str,
        options: Option<&ListOptions>,
    ) -> Result<DirectoryResult, StorageError> {
        let page_size = options.and_then(|o| o.page_size).unwrap_or(20);

        // 构建基础 URL
        let mut url = format!(
            "{}/datasets?search={}&limit={}",
            self.api_url,
            urlencoding::encode(query),
            page_size
        );

        // 如果有 marker，添加为 cursor 参数
        if let Some(marker) = options.and_then(|o| o.marker.as_ref()) {
            if !marker.is_empty() {
                url.push_str(&format!("&cursor={}", urlencoding::encode(marker)));
            }
        }

        let response = self
            .client
            .get(&url)
            .headers(self.get_reqwest_headers())
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(format!(
                "Failed to search datasets: {}",
                response.status()
            )));
        }

        // 提取 Link header 信息以及下一页的 cursor（在消耗 response 之前）
        let (has_more, next_cursor) = if let Some(link_header) = response.headers().get("Link") {
            if let Ok(link_str) = link_header.to_str() {
                let has_more = link_str.contains("rel=\"next\"");

                // 从 Link header 中提取 cursor 参数
                let next_cursor = if has_more {
                    // 提取形如 <https://huggingface.co/api/datasets?cursor=xxx&limit=20>; rel="next" 的链接
                    link_str
                        .split(',')
                        .find(|part| part.contains("rel=\"next\""))
                        .and_then(|next_part| {
                            // 提取 URL 部分
                            next_part
                                .trim()
                                .strip_prefix('<')
                                .and_then(|s| s.split('>').next())
                        })
                        .and_then(|url| {
                            // 从 URL 中提取 cursor 参数
                            url.split('&')
                                .find(|param| param.starts_with("cursor="))
                                .and_then(|cursor_param| cursor_param.strip_prefix("cursor="))
                                .map(|cursor| {
                                    urlencoding::decode(cursor).unwrap_or_default().into_owned()
                                })
                        })
                } else {
                    None
                };

                (has_more, next_cursor)
            } else {
                (false, None)
            }
        } else {
            (false, None)
        };

        let datasets: Vec<DatasetInfo> = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        let files: Vec<StorageFile> = datasets
            .into_iter()
            .map(|dataset| StorageFile {
                filename: dataset.id.replace('/', ":"), // 用于前端路径导航
                basename: dataset.id.replace('/', ":"), // 统一使用 : 分隔符格式
                lastmod: dataset
                    .last_modified
                    .unwrap_or_else(|| "unknown".to_string()),
                size: "0".to_string(),
                file_type: "directory".to_string(),
                mime: Some("application/x-directory".to_string()),
                etag: None,
            })
            .collect();

        // 根据 Link header 或返回数量判断是否有更多数据（has_more 已经在上面从 header 中提取了）
        let has_more = if !has_more {
            // 如果没有 Link header 信息，根据返回数量判断
            files.len() == page_size as usize
        } else {
            has_more
        };

        Ok(DirectoryResult {
            files,
            has_more,
            next_marker: next_cursor, // 使用从 Link header 提取的 cursor
            total_count: None,
            path: format!("/search/{}", urlencoding::encode(query)),
        })
    }

    /// 根据组织名称搜索数据集
    async fn list_organization_datasets(
        &self,
        org_name: &str,
        options: Option<&ListOptions>,
    ) -> Result<DirectoryResult, StorageError> {
        let page_size = options.and_then(|o| o.page_size).unwrap_or(20);

        // 构建基础 URL
        let mut url = format!(
            "{}/datasets?author={}&limit={}",
            self.api_url,
            urlencoding::encode(org_name),
            page_size
        );

        // 如果有 marker，添加为 cursor 参数
        if let Some(marker) = options.and_then(|o| o.marker.as_ref()) {
            if !marker.is_empty() {
                url.push_str(&format!("&cursor={}", urlencoding::encode(marker)));
            }
        }

        let response = self
            .client
            .get(&url)
            .headers(self.get_reqwest_headers())
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(format!(
                "Failed to fetch organization datasets: {}",
                response.status()
            )));
        }

        // 提取 Link header 信息以及下一页的 cursor（在消耗 response 之前）
        let (has_more, next_cursor) = if let Some(link_header) = response.headers().get("link") {
            if let Ok(link_str) = link_header.to_str() {
                let has_more = link_str.contains("rel=\"next\"");

                // 从 Link header 中提取 cursor 参数
                let next_cursor = if has_more {
                    // 提取形如 <https://huggingface.co/api/datasets?cursor=xxx&limit=20>; rel="next" 的链接
                    link_str
                        .split(',')
                        .find(|part| part.contains("rel=\"next\""))
                        .and_then(|next_part| {
                            // 提取 URL 部分
                            next_part
                                .trim()
                                .strip_prefix('<')
                                .and_then(|s| s.split('>').next())
                        })
                        .and_then(|url| {
                            // 从 URL 中提取 cursor 参数
                            url.split('&')
                                .find(|param| param.starts_with("cursor="))
                                .and_then(|cursor_param| cursor_param.strip_prefix("cursor="))
                                .map(|cursor| {
                                    urlencoding::decode(cursor).unwrap_or_default().into_owned()
                                })
                        })
                } else {
                    None
                };

                (has_more, next_cursor)
            } else {
                (false, None)
            }
        } else {
            (false, None)
        };

        let datasets: Vec<DatasetInfo> = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        let files: Vec<StorageFile> = datasets
            .into_iter()
            .map(|dataset| StorageFile {
                filename: dataset.id.replace('/', ":"), // 用于前端路径导航
                basename: dataset.id.replace('/', ":"), // 统一使用 : 分隔符格式
                lastmod: dataset
                    .last_modified
                    .unwrap_or_else(|| "unknown".to_string()),
                size: "0".to_string(),
                file_type: "directory".to_string(),
                mime: Some("application/x-directory".to_string()),
                etag: None,
            })
            .collect();

        Ok(DirectoryResult {
            files,
            has_more,
            next_marker: next_cursor, // 使用从 Link header 提取的 cursor
            total_count: None,
            path: org_name.to_string(),
        })
    }

    /// 列出数据集文件
    async fn list_dataset_files(
        &self,
        owner: &str,
        dataset: &str,
        subpath: &str,
        _options: Option<&ListOptions>,
    ) -> Result<DirectoryResult, StorageError> {
        let dataset_id = format!("{}/{}", owner, dataset);
        // 使用 tree API 获取完整的文件信息
        let url = if subpath.is_empty() {
            format!("{}/datasets/{}/tree/main", self.api_url, dataset_id)
        } else {
            format!(
                "{}/datasets/{}/tree/main/{}",
                self.api_url, dataset_id, subpath
            )
        };

        let response = self
            .client
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
                        size: "0".to_string(), // 目录大小设为0
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
                        size: file.size.to_string(),
                        file_type: if file.file_type == "directory" {
                            "directory"
                        } else {
                            "file"
                        }
                        .to_string(),
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

        let total_count = unique_files.len().to_string();

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
        format!(
            "{}/datasets/{}/resolve/main/{}",
            self.base_url, dataset_id, file_path
        )
    }

    /// 解析路径 - 处理前端传来的协议URL或简单路径格式
    fn parse_path(&self, path: &str) -> Result<(String, String), StorageError> {
        if path == "/" || path.is_empty() {
            return Err(StorageError::InvalidConfig(
                "Root path not supported".to_string(),
            ));
        }

        // 处理协议URL格式：huggingface://owner:dataset/file_path
        let path_to_parse = if path.starts_with("huggingface://") {
            path.strip_prefix("huggingface://").unwrap()
        } else {
            path.trim_start_matches('/')
        };

        // 处理搜索路径
        if path_to_parse.starts_with("search/") {
            return Err(StorageError::InvalidConfig(
                "Search paths should be handled separately".to_string(),
            ));
        }

        // 路径格式：{owner}:{dataset}/{file_path}
        let parts: Vec<&str> = path_to_parse.split('/').collect();

        if parts.is_empty() {
            return Err(StorageError::InvalidConfig("Empty path".to_string()));
        }

        let dataset_id_part = parts[0];

        // 必须包含 : 分隔符
        if !dataset_id_part.contains(':') {
            return Err(StorageError::InvalidConfig(format!(
                "Dataset identifier must use : separator, got: {}",
                dataset_id_part
            )));
        }

        let dataset_parts: Vec<&str> = dataset_id_part.split(':').collect();
        if dataset_parts.len() != 2 {
            return Err(StorageError::InvalidConfig(format!(
                "Invalid dataset identifier format: {}",
                dataset_id_part
            )));
        }

        let owner = dataset_parts[0];
        let dataset = dataset_parts[1];

        if owner.is_empty() || dataset.is_empty() {
            return Err(StorageError::InvalidConfig(
                "Owner and dataset name cannot be empty".to_string(),
            ));
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
            reqwest::header::HeaderValue::from_static("application/json"),
        );

        // 只在有非空 token 时才添加 Authorization 头
        if let Some(token) = &self.api_token {
            if !token.trim().is_empty() {
                if let Ok(auth_value) =
                    reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token))
                {
                    headers.insert(reqwest::header::AUTHORIZATION, auth_value);
                }
            }
        }

        headers
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

    async fn list_directory(
        &self,
        path: &str,
        options: Option<&ListOptions>,
    ) -> Result<DirectoryResult, StorageError> {
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
                // 分解 dataset_id (owner/dataset) 为 owner 和 dataset
                let parts: Vec<&str> = dataset_id.split('/').collect();
                if parts.len() != 2 {
                    return Err(StorageError::InvalidConfig(format!(
                        "Invalid dataset ID format, expected 'owner/dataset': {}",
                        dataset_id
                    )));
                }
                let (owner, dataset) = (parts[0], parts[1]);
                self.list_dataset_files(owner, dataset, &file_path, options)
                    .await
            }
            Err(_) => {
                // 如果路径解析失败，尝试将其视为组织名称
                self.list_organization_datasets(path_trimmed, options).await
            }
        }
    }

    async fn read_file_range(
        &self,
        path: &str,
        start: u64,
        length: u64,
    ) -> Result<Vec<u8>, StorageError> {
        self.read_file_range_with_progress(path, start, length, None, None)
            .await
    }

    async fn read_file_range_with_progress(
        &self,
        path: &str,
        start: u64,
        length: u64,
        progress_callback: Option<ProgressCallback>,
        mut cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<Vec<u8>, StorageError> {
        use futures_util::StreamExt; // 这里需要StreamExt用于内存读取

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
        req_builder =
            req_builder.header("Range", format!("bytes={}-{}", start, start + length - 1));

        let response = req_builder
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(format!(
                "HTTP {}: {}",
                response.status(),
                response
                    .status()
                    .canonical_reason()
                    .unwrap_or("error.unknown")
            )));
        }

        // 使用流式读取以支持进度回调
        let mut result = Vec::with_capacity(length as usize);
        let mut downloaded = 0u64;
        let mut stream = response.bytes_stream();

        while let Some(chunk_result) = stream.next().await {
            // 检查取消信号
            if let Some(ref mut cancel_rx) = cancel_rx {
                if cancel_rx.try_recv().is_ok() {
                    return Err(StorageError::RequestFailed(
                        "download.cancelled".to_string(),
                    ));
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

        let response = req_builder
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(format!(
                "HTTP {}: {}",
                response.status(),
                response
                    .status()
                    .canonical_reason()
                    .unwrap_or("error.unknown")
            )));
        }

        let bytes = response.bytes().await.map_err(|e| {
            StorageError::NetworkError(format!("Failed to read response body: {}", e))
        })?;

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

        let response = self
            .client
            .get(&url)
            .headers(self.get_reqwest_headers())
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(format!(
                "Failed to fetch file info: {}",
                response.status()
            )));
        }

        let files: Vec<DatasetFile> = response
            .json()
            .await
            .map_err(|e| StorageError::RequestFailed(e.to_string()))?;

        // 找到目标文件
        if let Some(file) = files
            .iter()
            .find(|f| f.path == file_path && f.file_type == "file")
        {
            Ok(file.size)
        } else {
            // 降级到 HEAD 请求
            let download_url = self.build_download_url(&dataset_id, &file_path);

            println!("[DEBUG] - fallback to HEAD request: {}", download_url);

            let response = self
                .client
                .head(&download_url)
                .headers(self.get_reqwest_headers())
                .send()
                .await
                .map_err(|e| StorageError::NetworkError(e.to_string()))?;

            if !response.status().is_success() {
                return Err(StorageError::RequestFailed(format!(
                    "HEAD request failed: {}",
                    response.status()
                )));
            }

            if let Some(content_length) = response.headers().get("content-length") {
                content_length
                    .to_str()
                    .map_err(|e| StorageError::RequestFailed(e.to_string()))?
                    .parse::<u64>()
                    .map_err(|e| StorageError::RequestFailed(e.to_string()))
            } else {
                Err(StorageError::RequestFailed(
                    "Content-Length header not found".to_string(),
                ))
            }
        }
    }

    fn get_download_url(&self, path: &str) -> Result<String, StorageError> {
        let (dataset_id, file_path) = self.parse_path(path)?;
        Ok(self.build_download_url(&dataset_id, &file_path))
    }

    fn protocol(&self) -> &str {
        "huggingface"
    }

    fn validate_config(&self, config: &ConnectionConfig) -> Result<(), StorageError> {
        if config.protocol != "huggingface" {
            return Err(StorageError::InvalidConfig(
                "Invalid protocol for HuggingFace client".to_string(),
            ));
        }
        // API token 是可选的
        Ok(())
    }

    /// 高效的 HuggingFace 文件下载实现，使用 HTTP 流式下载
    async fn download_file(
        &self,
        path: &str,
        save_path: &std::path::Path,
        progress_callback: Option<ProgressCallback>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<(), StorageError> {
        let (dataset_id, file_path) = self.parse_path(path)?;
        let download_url = self.build_download_url(&dataset_id, &file_path);

        // 准备认证头（如果有 API token）
        let auth_header = self
            .api_token
            .as_ref()
            .filter(|t| !t.trim().is_empty())
            .map(|token| format!("Bearer {}", token));

        // 使用通用HTTP下载工具
        HttpDownloader::download_with_auth(
            &self.client,
            &download_url,
            auth_header.as_deref(),
            save_path,
            progress_callback,
            cancel_rx,
        )
        .await
    }
}
