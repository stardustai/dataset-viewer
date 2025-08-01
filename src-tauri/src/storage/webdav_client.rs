use async_trait::async_trait;
use base64::engine::general_purpose;
use base64::Engine;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use quick_xml::Reader;
use quick_xml::events::Event;
use futures_util::StreamExt;

use crate::storage::traits::{StorageClient, StorageRequest, StorageResponse, StorageError, ConnectionConfig, StorageCapabilities, DirectoryResult, StorageFile, ListOptions, ProgressCallback};

pub struct WebDAVClient {
    client: Client,
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

        Ok(Self {
            client: Client::new(),
            config,
            auth_header,
            connected: AtomicBool::new(false),
        })
    }
}

#[async_trait]
impl StorageClient for WebDAVClient {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<(), StorageError> {
        // 更新内部配置
        self.config = config.clone();
        self.auth_header = if let (Some(username), Some(password)) = (&config.username, &config.password) {
            let credentials = general_purpose::STANDARD.encode(format!("{}:{}", username, password));
            Some(format!("Basic {}", credentials))
        } else {
            None
        };

        let base_url = config.url.as_ref()
            .ok_or_else(|| StorageError::InvalidConfig("WebDAV URL is required".to_string()))?;

        // 标准化基础 URL - 确保以斜杠结尾
        let normalized_url = if base_url.ends_with('/') {
            base_url.clone()
        } else {
            format!("{}/", base_url)
        };

        // 发送简单的 PROPFIND 请求测试连接
        let propfind_body = r#"<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop>
    <resourcetype/>
  </prop>
</propfind>"#;

        let mut req_builder = self.client.request(
            reqwest::Method::from_bytes(b"PROPFIND").unwrap(),
            &normalized_url
        );

        if let Some(auth) = &self.auth_header {
            req_builder = req_builder.header("Authorization", auth);
        }

        req_builder = req_builder
            .header("Depth", "0")
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(propfind_body);

        let response = req_builder.send().await
            .map_err(|e| StorageError::NetworkError(format!("Connection test failed: {}", e)))?;

        if response.status().is_success() {
            self.connected.store(true, Ordering::Relaxed);
            Ok(())
        } else {
            Err(StorageError::RequestFailed(format!(
                "WebDAV connection test failed with status: {}",
                response.status()
            )))
        }
    }

    async fn disconnect(&self) {
        // WebDAV 是无状态的，不需要显式断开连接，只需要更新连接状态
        self.connected.store(false, Ordering::Relaxed);
    }

    async fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    async fn list_directory(&self, path: &str, options: Option<&ListOptions>) -> Result<DirectoryResult, StorageError> {
        let base_url = self.config.url.as_ref()
            .ok_or_else(|| StorageError::InvalidConfig("WebDAV URL is required".to_string()))?;

        // 标准化基础 URL
        let normalized_base_url = base_url.trim_end_matches('/');

        // 简化路径处理：前端应传递相对于WebDAV根目录的路径，不包含/webdav前缀
        let clean_path = path.trim_start_matches('/').trim_end_matches('/');

        let url = if clean_path.is_empty() {
            format!("{}/", normalized_base_url)
        } else {
            format!("{}/{}/", normalized_base_url, clean_path)
        };

        // 添加调试日志
        log::debug!("WebDAV list_directory - path: '{}', base_url: '{}', final_url: '{}'", path, base_url, url);

        // 创建PROPFIND请求
        let propfind_body = r#"<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop>
    <resourcetype/>
    <getcontentlength/>
    <getlastmodified/>
    <getcontenttype/>
  </prop>
</propfind>"#;

        let mut req_builder = self.client.request(
            reqwest::Method::from_bytes(b"PROPFIND").unwrap(),
            &url
        );

        // 添加认证头
        if let Some(auth) = &self.auth_header {
            req_builder = req_builder.header("Authorization", auth);
        }

        // 添加WebDAV特定头
        req_builder = req_builder
            .header("Depth", "1")
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(propfind_body);

        let response = req_builder.send().await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        let status = response.status().as_u16();
        if !(200..300).contains(&status) {
            return Err(StorageError::RequestFailed(format!(
                "PROPFIND failed with status: {} for URL: '{}'. Request path: '{}'. Check if path exists on WebDAV server.",
                status, url, path
            )));
        }

        let body = response.text().await
            .map_err(|e| StorageError::NetworkError(e.to_string()))?;

        // 解析XML响应
        let files = self.parse_webdav_xml(&body, &url)?;

        // 应用选项（排序、过滤等）
        let mut result_files = files;
        if let Some(opts) = options {
            result_files = self.apply_list_options(result_files, opts);
        }

        Ok(DirectoryResult {
            files: result_files,
            has_more: false, // WebDAV通常返回完整列表
            next_marker: None,
            total_count: None,
            path: path.to_string(),
        })
    }

    async fn request(&self, request: &StorageRequest) -> Result<StorageResponse, StorageError> {
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
                    &actual_url
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
                    &actual_url
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

    /// 读取文件的指定范围
    async fn read_file_range(&self, path: &str, start: u64, length: u64) -> Result<Vec<u8>, StorageError> {
        self.read_file_range_with_progress(path, start, length, None).await
    }

    async fn read_file_range_with_progress(
        &self,
        path: &str,
        start: u64,
        length: u64,
        progress_callback: Option<ProgressCallback>,
    ) -> Result<Vec<u8>, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        println!("WebDAV读取文件范围: path={}, start={}, length={}", path, start, length);

        // 处理协议URL格式
        let actual_url = self.parse_path_to_url(path)?;

        let mut request = self.client.get(&actual_url);
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

    /// 读取完整文件
    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        // 处理协议URL格式
        let actual_url = self.parse_path_to_url(path)?;

        let mut request = self.client.get(&actual_url);
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

    /// 获取文件大小
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
    /// 解析WebDAV PROPFIND响应的XML
    fn parse_webdav_xml(&self, xml_body: &str, current_path: &str) -> Result<Vec<StorageFile>, StorageError> {
        let mut files = Vec::new();
        let mut reader = Reader::from_str(xml_body);
        reader.trim_text(true);

        let mut current_response: Option<WebDAVResponse> = None;
        let mut in_href = false;
        let mut in_getcontentlength = false;
        let mut in_getlastmodified = false;
        let mut in_getcontenttype = false;
        let mut in_resourcetype = false;

        loop {
            match reader.read_event() {
                Ok(Event::Start(ref e)) => {
                    match e.name().as_ref() {
                        b"D:response" | b"response" => {
                            current_response = Some(WebDAVResponse::default());
                        }
                        b"D:href" | b"href" => {
                            in_href = true;
                        }
                        b"D:getcontentlength" | b"getcontentlength" | b"lp1:getcontentlength" => {
                            in_getcontentlength = true;
                        }
                        b"D:getlastmodified" | b"getlastmodified" | b"lp1:getlastmodified" => {
                            in_getlastmodified = true;
                        }
                        b"D:getcontenttype" | b"getcontenttype" | b"lp1:getcontenttype" => {
                            in_getcontenttype = true;
                        }
                        b"D:resourcetype" | b"resourcetype" | b"lp1:resourcetype" => {
                            in_resourcetype = true;
                        }
                        b"D:collection" | b"collection" => {
                            if in_resourcetype {
                                if let Some(ref mut resp) = current_response {
                                    resp.is_directory = true;
                                }
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Empty(ref e)) => {
                    // 处理自闭合标签，如 <D:collection/>
                    match e.name().as_ref() {
                        b"D:collection" | b"collection" => {
                            if in_resourcetype {
                                if let Some(ref mut resp) = current_response {
                                    resp.is_directory = true;
                                }
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Text(e)) => {
                    if let Some(ref mut resp) = current_response {
                        let text = e.unescape().unwrap_or_default();
                        if in_href {
                            resp.href = text.to_string();
                        } else if in_getcontentlength {
                            resp.size = text.parse().unwrap_or(0);
                        } else if in_getlastmodified {
                            resp.lastmod = text.to_string();
                        } else if in_getcontenttype {
                            resp.content_type = Some(text.to_string());
                        }
                    }
                }
                Ok(Event::End(ref e)) => {
                    match e.name().as_ref() {
                        b"D:response" | b"response" => {
                            if let Some(resp) = current_response.take() {
                                if let Some(file) = self.webdav_response_to_storage_file(resp, current_path) {
                                    files.push(file);
                                }
                            }
                        }
                        b"D:href" | b"href" => {
                            in_href = false;
                        }
                        b"D:getcontentlength" | b"getcontentlength" | b"lp1:getcontentlength" => {
                            in_getcontentlength = false;
                        }
                        b"D:getlastmodified" | b"getlastmodified" | b"lp1:getlastmodified" => {
                            in_getlastmodified = false;
                        }
                        b"D:getcontenttype" | b"getcontenttype" | b"lp1:getcontenttype" => {
                            in_getcontenttype = false;
                        }
                        b"D:resourcetype" | b"resourcetype" | b"lp1:resourcetype" => {
                            in_resourcetype = false;
                        }
                        _ => {}
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    return Err(StorageError::RequestFailed(format!("XML parsing error: {}", e)));
                }
                _ => {}
            }
        }

        Ok(files)
    }

    /// 将WebDAV响应转换为StorageFile
    fn webdav_response_to_storage_file(&self, resp: WebDAVResponse, current_url: &str) -> Option<StorageFile> {
        // 解码URL
        let href = urlencoding::decode(&resp.href).ok()?.to_string();

        // 跳过当前目录 - 需要处理多种可能的当前目录格式
        let current_url_clean = current_url.trim_end_matches('/');
        let current_url_with_slash = format!("{}/", current_url_clean);

        // 跳过当前目录的各种表示形式
        if href == current_url || href == current_url_clean ||
           href == current_url_with_slash || href == format!("{}/", current_url) {
            return None;
        }

        // 也跳过与当前URL相同的路径（去除协议和域名部分后）
        if let Ok(parsed_url) = url::Url::parse(current_url) {
            let current_path = parsed_url.path();

            // 对current_path进行URL解码以便比较
            if let Ok(decoded_current_path) = urlencoding::decode(current_path) {
                let decoded_current_path = decoded_current_path.to_string();

                if href == decoded_current_path || href == format!("{}/", decoded_current_path.trim_end_matches('/')) {
                    return None;
                }

                // 额外检查：去掉尾部斜杠后比较
                let decoded_current_clean = decoded_current_path.trim_end_matches('/');
                let href_clean = href.trim_end_matches('/');

                if href_clean == decoded_current_clean {
                    return None;
                }
            }
        }

        // 提取文件名
        let filename = href.trim_end_matches('/').split('/').last()?.to_string();
        if filename.is_empty() {
            return None;
        }

        Some(StorageFile {
            filename: filename.clone(), // 使用相对文件名，不包含完整路径
            basename: filename.clone(),
            lastmod: resp.lastmod.clone(),
            size: resp.size,
            file_type: if resp.is_directory { "directory".to_string() } else { "file".to_string() },
            mime: resp.content_type.or_else(|| {
                if resp.is_directory {
                    Some("httpd/unix-directory".to_string())
                } else {
                    Some("application/octet-stream".to_string())
                }
            }),
            etag: None,
        })
    }

    /// 应用列表选项（排序、过滤等）
    fn apply_list_options(&self, mut files: Vec<StorageFile>, options: &ListOptions) -> Vec<StorageFile> {
        // 过滤前缀
        if let Some(prefix) = &options.prefix {
            files.retain(|f| f.basename.starts_with(prefix));
        }

        // 排序
        if let Some(sort_by) = &options.sort_by {
            let desc = options.sort_order.as_deref() == Some("desc");

            match sort_by.as_str() {
                "name" => {
                    files.sort_by(|a, b| {
                        let cmp = a.basename.cmp(&b.basename);
                        if desc { cmp.reverse() } else { cmp }
                    });
                }
                "size" => {
                    files.sort_by(|a, b| {
                        let cmp = a.size.cmp(&b.size);
                        if desc { cmp.reverse() } else { cmp }
                    });
                }
                "modified" => {
                    files.sort_by(|a, b| {
                        let cmp = a.lastmod.cmp(&b.lastmod);
                        if desc { cmp.reverse() } else { cmp }
                    });
                }
                _ => {}
            }
        }

        // 分页
        if let Some(page_size) = options.page_size {
            let start = options.marker.as_deref()
                .and_then(|m| m.parse::<usize>().ok())
                .unwrap_or(0);
            files = files.into_iter().skip(start).take(page_size as usize).collect();
        }

        files
    }

    /// 解析 WebDAV 协议 URL 并返回实际的 HTTP/HTTPS URL
    ///
    /// # Arguments
    /// * `webdav_url` - WebDAV 协议 URL (例如: "webdav://host/path/to/file")
    ///
    /// # Returns
    /// * `Result<String, StorageError>` - 实际的 HTTP/HTTPS URL
    fn parse_webdav_url(&self, webdav_url: &str) -> Result<String, StorageError> {
        if !webdav_url.starts_with("webdav://") {
            return Err(StorageError::RequestFailed("Only webdav:// protocol URLs are supported".to_string()));
        }

        // 解析 webdav://host/path 格式
        let url_without_protocol = webdav_url.strip_prefix("webdav://").unwrap_or(webdav_url);
        let parts: Vec<&str> = url_without_protocol.splitn(2, '/').collect();

        if parts.len() >= 2 {
            let host = parts[0];
            let path = parts[1];
            // 构建实际的 HTTP/HTTPS URL
            Ok(format!("{}/{}", self.config.url.as_ref().unwrap_or(&format!("https://{}", host)), path))
        } else if parts.len() == 1 {
            // 只有主机，没有路径
            Ok(self.config.url.as_ref().unwrap_or(&format!("https://{}", parts[0])).clone())
        } else {
            Err(StorageError::RequestFailed("Invalid WebDAV URL format".to_string()))
        }
    }

    /// 解析路径并返回实际的 HTTP/HTTPS URL
    /// 支持 webdav:// 协议 URL 和传统相对路径
    ///
    /// # Arguments
    /// * `path` - 路径或 WebDAV 协议 URL
    ///
    /// # Returns
    /// * `Result<String, StorageError>` - 实际的 HTTP/HTTPS URL
    fn parse_path_to_url(&self, path: &str) -> Result<String, StorageError> {
        if path.starts_with("webdav://") {
            self.parse_webdav_url(path)
        } else {
            // 传统相对路径处理（保持向后兼容）
            let base_url = self.config.url.as_ref()
                .ok_or_else(|| StorageError::InvalidConfig("WebDAV URL not configured".to_string()))?
                .trim_end_matches('/');
            let clean_path = path.trim_start_matches('/');
            Ok(format!("{}/{}", base_url, clean_path))
        }
    }
}

/// WebDAV响应的中间数据结构
#[derive(Default)]
struct WebDAVResponse {
    href: String,
    size: u64,
    lastmod: String,
    content_type: Option<String>,
    is_directory: bool,
}
