use async_trait::async_trait;
use base64::engine::general_purpose;
use base64::Engine;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use quick_xml::Reader;
use quick_xml::events::Event;
use futures_util::StreamExt;

use crate::storage::traits::{StorageClient, StorageRequest, StorageResponse, StorageError, ConnectionConfig, StorageCapabilities, DirectoryResult, StorageFile, ListOptions, ProgressCallback};

pub struct WebDAVClient {
    client: Client,
    download_client: Client, // 专门用于下载的客户端，配置更长超时
    config: ConnectionConfig,
    auth_header: Option<String>,
    connected: AtomicBool,
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

        // 配置普通请求的HTTP客户端
        let client = Client::builder()
            .timeout(Duration::from_secs(30))           // 总超时时间
            .connect_timeout(Duration::from_secs(10))   // 连接超时
            .pool_idle_timeout(Duration::from_secs(90)) // 连接池空闲超时
            .pool_max_idle_per_host(10)                 // 每个主机最大空闲连接数
            .tcp_keepalive(Duration::from_secs(60))     // TCP keepalive
            .build()
            .map_err(|e| StorageError::InvalidConfig(format!("Failed to create HTTP client: {}", e)))?;

        // 配置下载专用的HTTP客户端，使用更长的超时时间
        let download_client = Client::builder()
            .timeout(Duration::from_secs(600))          // 下载总超时时间：10分钟
            .connect_timeout(Duration::from_secs(10))   // 连接超时保持不变
            .pool_idle_timeout(Duration::from_secs(300)) // 连接池空闲超时：5分钟
            .pool_max_idle_per_host(5)                  // 下载连接数较少
            .tcp_keepalive(Duration::from_secs(60))     // TCP keepalive
            .build()
            .map_err(|e| StorageError::InvalidConfig(format!("Failed to create download HTTP client: {}", e)))?;

        Ok(WebDAVClient {
            client,
            download_client,
            config,
            auth_header,
            connected: AtomicBool::new(false),
        })
    }

    /// 执行单次请求
    async fn execute_request_internal(&self, request: &StorageRequest) -> Result<StorageResponse, StorageError> {
        // 处理 webdav:// 协议 URL
        let actual_url = self.parse_webdav_url(&request.url)?;

        let mut req_builder = match request.method.as_str() {
            "GET" => self.client.get(&actual_url),
            "POST" => self.client.post(&actual_url),
            "PUT" => self.client.put(&actual_url),
            "DELETE" => self.client.delete(&actual_url),
            "HEAD" => self.client.head(&actual_url),
            "PROPFIND" => {
                self.client.request(
                    reqwest::Method::from_bytes(b"PROPFIND").unwrap(),
                    &actual_url,
                )
            },
            _ => return Err(StorageError::RequestFailed(format!("Unsupported method: {}", request.method))),
        };

        // 添加认证头
        if let Some(ref auth) = self.auth_header {
            req_builder = req_builder.header("Authorization", auth);
        }

        // 添加其他头部
        for (key, value) in &request.headers {
            req_builder = req_builder.header(key, value);
        }

        // 添加请求体
        if let Some(ref body) = request.body {
            req_builder = req_builder.body(body.clone());
        }

        let response = req_builder.send().await
            .map_err(|e| {
                if e.is_timeout() {
                    StorageError::NetworkError(format!("Request timeout: {}", e))
                } else if e.is_connect() {
                    StorageError::ConnectionFailed(format!("Connection failed: {}", e))
                } else {
                    StorageError::NetworkError(e.to_string())
                }
            })?;

        let status = response.status().as_u16();
        let headers = response.headers().iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let body = response.text().await
            .map_err(|e| StorageError::NetworkError(format!("Failed to read response body: {}", e)))?;

        Ok(StorageResponse {
            status,
            headers,
            body,
            metadata: None,
        })
    }

    /// 判断错误是否应该重试
    fn should_retry_internal(&self, error: &StorageError) -> bool {
        match error {
            StorageError::NetworkError(msg) => {
                // 网络相关错误通常可以重试
                msg.contains("timeout") || 
                msg.contains("connection") ||
                msg.contains("dns") ||
                msg.contains("refused")
            },
            StorageError::RequestFailed(_) => false, // HTTP错误通常不重试
            _ => false,
        }
    }
}

#[async_trait]
impl StorageClient for WebDAVClient {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<(), StorageError> {
        self.validate_config(config)?;
        
        // 更新配置
        self.config = config.clone();
        
        // 重新生成认证头
        self.auth_header = if let (Some(username), Some(password)) = (&config.username, &config.password) {
            let credentials = general_purpose::STANDARD.encode(format!("{}:{}", username, password));
            Some(format!("Basic {}", credentials))
        } else {
            None
        };
        
        // 测试连接
        let test_request = StorageRequest {
            method: "PROPFIND".to_string(),
            url: config.url.clone().unwrap(),
            headers: {
                let mut headers = HashMap::new();
                headers.insert("Depth".to_string(), "0".to_string());
                headers.insert("Content-Type".to_string(), "application/xml".to_string());
                headers
            },
            body: Some(r#"<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
  </D:prop>
</D:propfind>"#.to_string()),
            options: None,
        };
        
        match self.execute_request_internal(&test_request).await {
            Ok(_) => {
                self.connected.store(true, Ordering::Relaxed);
                Ok(())
            },
            Err(e) => {
                self.connected.store(false, Ordering::Relaxed);
                Err(StorageError::ConnectionFailed(format!("WebDAV connection test failed: {}", e)))
            }
        }
    }

    async fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    async fn list_directory(&self, path: &str, options: Option<&ListOptions>) -> Result<DirectoryResult, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        let actual_url = self.parse_path_to_url(path)?;
        
        let propfind_body = r#"<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:getcontenttype/>
    <D:getetag/>
  </D:prop>
</D:propfind>"#;

        let request = StorageRequest {
            method: "PROPFIND".to_string(),
            url: actual_url.clone(),
            headers: {
                let mut headers = HashMap::new();
                headers.insert("Depth".to_string(), "1".to_string());
                headers.insert("Content-Type".to_string(), "application/xml".to_string());
                headers
            },
            body: Some(propfind_body.to_string()),
            options: None,
        };

        let response = self.execute_request_internal(&request).await?;
        
        if response.status < 200 || response.status >= 300 {
            return Err(StorageError::RequestFailed(
                format!("PROPFIND failed with status {}", response.status)
            ));
        }

        let files = self.parse_webdav_xml(&response.body, &actual_url)?;
        
        // 应用列表选项
        let result_files = if let Some(opts) = options {
            self.apply_list_options(files, opts)
        } else {
            files
        };

        Ok(DirectoryResult {
            files: result_files,
            has_more: false, // WebDAV通常返回完整列表
            next_marker: None,
            total_count: None,
            path: path.to_string(),
        })
    }

    async fn request(&self, request: &StorageRequest) -> Result<StorageResponse, StorageError> {
        let max_retries = 3;
        let mut last_error = None;
        
        for attempt in 0..=max_retries {
            match self.execute_request_internal(request).await {
                Ok(response) => return Ok(response),
                Err(e) => {
                    last_error = Some(e.clone());
                    
                    // 如果不应该重试或者已经是最后一次尝试，直接返回错误
                    if !self.should_retry_internal(&e) || attempt == max_retries {
                        break;
                    }
                    
                    // 指数退避：1秒、2秒、4秒
                    let delay = Duration::from_secs(1 << attempt);
                    tokio::time::sleep(delay).await;
                }
            }
        }
        
        Err(last_error.unwrap_or_else(|| StorageError::RequestFailed("error.unknown".to_string())))
    }

    async fn request_binary(&self, request: &StorageRequest) -> Result<Vec<u8>, StorageError> {
        // 处理 webdav:// 协议 URL
        let actual_url = self.parse_webdav_url(&request.url)?;

        let mut req_builder = match request.method.as_str() {
            "GET" => self.download_client.get(&actual_url),
            "POST" => self.download_client.post(&actual_url),
            "PUT" => self.download_client.put(&actual_url),
            _ => return Err(StorageError::RequestFailed(format!("Unsupported binary method: {}", request.method))),
        };

        // 添加认证头
        if let Some(ref auth) = self.auth_header {
            req_builder = req_builder.header("Authorization", auth);
        }

        // 添加其他头部
        for (key, value) in &request.headers {
            req_builder = req_builder.header(key, value);
        }

        // 添加请求体
        if let Some(ref body) = request.body {
            req_builder = req_builder.body(body.clone());
        }

        let response = req_builder.send().await
            .map_err(|e| StorageError::NetworkError(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(
                format!("HTTP {}: {}", response.status(), response.status().canonical_reason().unwrap_or("Unknown"))
            ));
        }

        let bytes = response.bytes().await
            .map_err(|e| StorageError::NetworkError(format!("Failed to read response body: {}", e)))?;

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
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        println!("WebDAV读取文件范围: path={}, start={}, length={}", path, start, length);

        // 处理协议URL格式
        let actual_url = self.parse_path_to_url(path)?;

        // 使用下载专用客户端进行文件范围读取
        let mut request = self.download_client.get(&actual_url);
        if let Some(auth) = &self.auth_header {
            request = request.header("Authorization", auth);
        }

        // 设置 Range 头
        let range_header = format!("bytes={}-{}", start, start + length - 1);
        request = request.header("Range", range_header.clone());

        println!("WebDAV Range请求: URL={}, Range={}", actual_url, range_header);

        let response = request.send().await
            .map_err(|e| StorageError::NetworkError(format!("Request failed: {}", e)))?;

        let status = response.status();
        println!("WebDAV Range请求响应状态: {}", status);

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(
                format!("HTTP {}: {}", response.status(), response.status().canonical_reason().unwrap_or("Unknown"))
            ));
        }

        let content_length = response.headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        println!("WebDAV预期接收 {} 字节，实际Content-Length: {}", length, content_length);

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

        println!("WebDAV实际接收到 {} 字节", result.len());

        Ok(result)
    }

    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        // 处理协议URL格式
        let actual_url = self.parse_path_to_url(path)?;

        let mut request = self.download_client.get(&actual_url);
        if let Some(auth) = &self.auth_header {
            request = request.header("Authorization", auth);
        }

        let response = request.send().await
            .map_err(|e| StorageError::NetworkError(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(
                format!("HTTP {}: {}", response.status(), response.status().canonical_reason().unwrap_or("Unknown"))
            ));
        }

        let bytes = response.bytes().await
            .map_err(|e| StorageError::NetworkError(format!("Failed to read response body: {}", e)))?;

        Ok(bytes.to_vec())
    }

    async fn get_file_size(&self, path: &str) -> Result<u64, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        // 处理协议URL格式
        let actual_url = self.parse_path_to_url(path)?;

        let mut request = self.client.head(&actual_url);
        if let Some(auth) = &self.auth_header {
            request = request.header("Authorization", auth);
        }

        let response = request.send().await
            .map_err(|e| StorageError::NetworkError(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(
                format!("HTTP {}: {}", response.status(), response.status().canonical_reason().unwrap_or("Unknown"))
            ));
        }

        // 尝试从 Content-Length 头获取文件大小
        if let Some(content_length) = response.headers().get("content-length") {
            if let Ok(length_str) = content_length.to_str() {
                if let Ok(length) = length_str.parse::<u64>() {
                    return Ok(length);
                }
            }
        }

        Err(StorageError::RequestFailed("Unable to determine file size".to_string()))
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

    fn get_download_url(&self, path: &str) -> Result<String, StorageError> {
        // 如果传入的已经是完整 URL，直接返回
        if path.starts_with("http://") || path.starts_with("https://") {
            return Ok(path.to_string());
        }

        // 使用统一的URL构建方法
        let base_url = self.config.url.as_ref()
            .ok_or_else(|| StorageError::InvalidConfig("WebDAV URL not configured".to_string()))?;

        let clean_base = base_url.trim_end_matches('/');

        // 统一的路径处理：移除开头的斜杠
        let clean_path = path.trim_start_matches('/');
        let download_url = format!("{}/{}", clean_base, clean_path);

        Ok(download_url)
    }
}

impl WebDAVClient {
    fn parse_webdav_xml(&self, xml_body: &str, current_path: &str) -> Result<Vec<StorageFile>, StorageError> {
        let mut reader = Reader::from_str(xml_body);
        reader.trim_text(true);
        
        let mut files = Vec::new();
        let mut current_response = WebDAVResponse::default();
        let mut in_response = false;
        let mut in_href = false;
        let mut in_prop = false;
        let mut in_resourcetype = false;
        let mut in_getcontentlength = false;
        let mut in_getlastmodified = false;
        let mut in_getcontenttype = false;
        
        let mut buf = Vec::new();
        
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    match e.name().as_ref() {
                        b"D:response" | b"response" => {
                            in_response = true;
                            current_response = WebDAVResponse::default();
                        },
                        b"D:href" | b"href" if in_response => in_href = true,
                        b"D:prop" | b"prop" if in_response => in_prop = true,
                        b"D:resourcetype" | b"resourcetype" if in_prop => in_resourcetype = true,
                        b"D:getcontentlength" | b"getcontentlength" if in_prop => in_getcontentlength = true,
                        b"D:getlastmodified" | b"getlastmodified" if in_prop => in_getlastmodified = true,
                        b"D:getcontenttype" | b"getcontenttype" if in_prop => in_getcontenttype = true,
                        b"D:collection" | b"collection" if in_resourcetype => {
                            current_response.is_directory = true;
                        },
                        _ => {},
                    }
                },
                Ok(Event::End(ref e)) => {
                    match e.name().as_ref() {
                        b"D:response" | b"response" => {
                            if in_response {
                                if let Some(file) = self.webdav_response_to_storage_file(current_response.clone(), current_path) {
                                    files.push(file);
                                }
                                in_response = false;
                            }
                        },
                        b"D:href" | b"href" => in_href = false,
                        b"D:prop" | b"prop" => in_prop = false,
                        b"D:resourcetype" | b"resourcetype" => in_resourcetype = false,
                        b"D:getcontentlength" | b"getcontentlength" => in_getcontentlength = false,
                        b"D:getlastmodified" | b"getlastmodified" => in_getlastmodified = false,
                        b"D:getcontenttype" | b"getcontenttype" => in_getcontenttype = false,
                        _ => {},
                    }
                },
                Ok(Event::Text(e)) => {
                    let text = e.unescape().unwrap_or_default();
                    if in_href {
                        current_response.href = text.to_string();
                    } else if in_getcontentlength {
                        current_response.size = text.parse().unwrap_or(0);
                    } else if in_getlastmodified {
                        current_response.lastmod = text.to_string();
                    } else if in_getcontenttype {
                        current_response.content_type = Some(text.to_string());
                    }
                },
                Ok(Event::Eof) => break,
                Err(e) => return Err(StorageError::RequestFailed(format!("XML parsing error: {}", e))),
                _ => {},
            }
            buf.clear();
        }
        
        Ok(files)
    }

    fn webdav_response_to_storage_file(&self, resp: WebDAVResponse, current_url: &str) -> Option<StorageFile> {
        if resp.href.is_empty() {
            return None;
        }
        
        // 解码URL
        let decoded_href = urlencoding::decode(&resp.href).ok()?.to_string();
        
        // 提取文件名
        let filename = if decoded_href.ends_with('/') {
            // 目录
            let path_without_slash = decoded_href.trim_end_matches('/');
            path_without_slash.split('/').last()?.to_string()
        } else {
            // 文件
            decoded_href.split('/').last()?.to_string()
        };
        
        // 跳过当前目录本身
        if filename.is_empty() || filename == "." {
            return None;
        }
        
        // 检查是否是当前目录本身（通过比较URL）
        let current_url_normalized = current_url.trim_end_matches('/');
        let href_normalized = decoded_href.trim_end_matches('/');
        if href_normalized == current_url_normalized {
            return None;
        }
        
        let file_type = if resp.is_directory {
            "directory".to_string()
        } else {
            "file".to_string()
        };
        
        Some(StorageFile {
            filename: filename.clone(),
            basename: filename,
            lastmod: resp.lastmod,
            size: resp.size,
            file_type,
            mime: resp.content_type,
            etag: None,
        })
    }

    fn apply_list_options(&self, mut files: Vec<StorageFile>, options: &ListOptions) -> Vec<StorageFile> {
        // 应用前缀过滤
        if let Some(prefix) = &options.prefix {
            files.retain(|f| f.filename.starts_with(prefix));
        }
        
        // 应用排序
        if let Some(sort_by) = &options.sort_by {
            let ascending = options.sort_order.as_deref() != Some("desc");
            
            match sort_by.as_str() {
                "name" => {
                    files.sort_by(|a, b| {
                        if ascending {
                            a.filename.cmp(&b.filename)
                        } else {
                            b.filename.cmp(&a.filename)
                        }
                    });
                },
                "size" => {
                    files.sort_by(|a, b| {
                        if ascending {
                            a.size.cmp(&b.size)
                        } else {
                            b.size.cmp(&a.size)
                        }
                    });
                },
                "modified" => {
                    files.sort_by(|a, b| {
                        if ascending {
                            a.lastmod.cmp(&b.lastmod)
                        } else {
                            b.lastmod.cmp(&a.lastmod)
                        }
                    });
                },
                _ => {}, // 不支持的排序字段
            }
        }
        
        // 应用分页
        if let Some(page_size) = options.page_size {
            let start_index = if let Some(marker) = &options.marker {
                // 简单实现：marker作为起始索引
                marker.parse::<usize>().unwrap_or(0)
            } else {
                0
            };
            
            let end_index = std::cmp::min(start_index + page_size as usize, files.len());
            files = files[start_index..end_index].to_vec();
        }
        
        files
    }

    fn parse_webdav_url(&self, webdav_url: &str) -> Result<String, StorageError> {
        // 如果已经是 http/https URL，直接返回
        if webdav_url.starts_with("http://") || webdav_url.starts_with("https://") {
            return Ok(webdav_url.to_string());
        }
        
        // 如果是 webdav:// 协议，转换为 http://
        if webdav_url.starts_with("webdav://") {
            return Ok(webdav_url.replace("webdav://", "http://"));
        }
        
        // 如果是 webdavs:// 协议，转换为 https://
        if webdav_url.starts_with("webdavs://") {
            return Ok(webdav_url.replace("webdavs://", "https://"));
        }
        
        // 其他情况，假设是相对路径，使用配置的基础URL
        let base_url = self.config.url.as_ref()
            .ok_or_else(|| StorageError::InvalidConfig("WebDAV URL not configured".to_string()))?;
        
        let clean_base = base_url.trim_end_matches('/');
        let clean_path = webdav_url.trim_start_matches('/');
        
        Ok(format!("{}/{}", clean_base, clean_path))
    }

    fn parse_path_to_url(&self, path: &str) -> Result<String, StorageError> {
        let base_url = self.config.url.as_ref()
            .ok_or_else(|| StorageError::InvalidConfig("WebDAV URL not configured".to_string()))?;
        
        let clean_base = base_url.trim_end_matches('/');
        let clean_path = path.trim_start_matches('/');
        
        Ok(format!("{}/{}", clean_base, clean_path))
    }
}

#[derive(Default, Clone)]
struct WebDAVResponse {
    href: String,
    size: u64,
    lastmod: String,
    content_type: Option<String>,
    is_directory: bool,
}
