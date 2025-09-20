use async_trait::async_trait;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use url::Url;
use urlencoding;

use crate::storage::oss::{
    build_aws_auth_headers, build_full_path, build_object_url, build_oss_auth_headers,
    extract_object_key, generate_aws_presigned_url, generate_oss_presigned_url,
    normalize_uri_for_signing, parse_list_objects_response,
};
use crate::storage::traits::{
    ConnectionConfig, DirectoryResult, ListOptions, ProgressCallback, StorageClient, StorageError,
};
use crate::utils::http_downloader::HttpDownloader;

#[derive(Debug, Clone, PartialEq)]
enum OSSPlatform {
    AliyunOSS,
    AwsS3,
    TencentCOS,
    HuaweiOBS,
    MinIO,
    Custom,
}

pub struct OSSClient {
    client: Client,
    config: ConnectionConfig,
    connected: AtomicBool,
    endpoint: String,
    access_key: String,
    secret_key: String,
    bucket: String,
    prefix: String, // 从 bucket 字段解析出的路径前缀
    region: Option<String>,
    platform: OSSPlatform,
}

impl OSSClient {
    pub fn new(config: ConnectionConfig) -> Result<Self, StorageError> {
        let endpoint = config
            .url
            .clone()
            .ok_or_else(|| StorageError::InvalidConfig("OSS endpoint is required".to_string()))?;

        let access_key = config
            .access_key
            .clone()
            .ok_or_else(|| StorageError::InvalidConfig("OSS access key is required".to_string()))?;

        let secret_key = config
            .secret_key
            .clone()
            .ok_or_else(|| StorageError::InvalidConfig("OSS secret key is required".to_string()))?;

        let bucket_input = config
            .bucket
            .clone()
            .ok_or_else(|| StorageError::InvalidConfig("OSS bucket is required".to_string()))?;

        // 解析 bucket 字段，支持 "bucket/path/prefix" 格式
        let (bucket, prefix) = if let Some(slash_pos) = bucket_input.find('/') {
            let bucket = bucket_input[..slash_pos].to_string();
            let prefix = bucket_input[slash_pos + 1..].to_string();
            (
                bucket,
                if prefix.ends_with('/') {
                    prefix
                } else {
                    format!("{}/", prefix)
                },
            )
        } else {
            (bucket_input, String::new())
        };

        let region = config.region.clone();
        let platform = Self::detect_platform(&endpoint);

        Ok(Self {
            client: Client::new(),
            config,
            connected: AtomicBool::new(false),
            endpoint,
            access_key,
            secret_key,
            bucket,
            prefix,
            region,
            platform,
        })
    }

    /// 根据端点检测OSS平台类型
    fn detect_platform(endpoint: &str) -> OSSPlatform {
        let endpoint_lower = endpoint.to_lowercase();

        if endpoint_lower.contains("amazonaws.com") {
            OSSPlatform::AwsS3
        } else if endpoint_lower.contains("aliyuncs.com") || endpoint_lower.contains("oss-") {
            OSSPlatform::AliyunOSS
        } else if endpoint_lower.contains("myqcloud.com") || endpoint_lower.contains("cos.") {
            OSSPlatform::TencentCOS
        } else if endpoint_lower.contains("myhuaweicloud.com") || endpoint_lower.contains("obs.") {
            OSSPlatform::HuaweiOBS
        } else if endpoint_lower.contains("minio") {
            OSSPlatform::MinIO
        } else {
            OSSPlatform::Custom
        }
    }

    /// 构建认证头
    fn build_auth_headers(
        &self,
        method: &str,
        uri: &str,
        extra_headers: &HashMap<String, String>,
        query_string: Option<&str>,
    ) -> HashMap<String, String> {
        let host = self.get_host();

        match self.platform {
            OSSPlatform::AwsS3 => {
                let region = self
                    .region
                    .as_ref()
                    .unwrap_or(&"us-east-1".to_string())
                    .clone();
                build_aws_auth_headers(
                    method,
                    uri,
                    extra_headers,
                    query_string,
                    &self.access_key,
                    &self.secret_key,
                    &region,
                    &host,
                )
            }
            // 让腾讯云COS也使用统一的OSS签名机制
            _ => build_oss_auth_headers(
                method,
                uri,
                extra_headers,
                &self.access_key,
                &self.secret_key,
                &self.bucket,
                &host,
            ),
        }
    }

    /// 从 endpoint 提取 region（仅用于AWS S3）
    fn extract_region_from_endpoint(&self) -> Option<String> {
        if let Ok(url) = Url::parse(&self.endpoint) {
            if let Some(host) = url.host_str() {
                // 匹配 AWS S3 endpoint 格式: s3.region.amazonaws.com 或 bucket.s3.region.amazonaws.com
                if host.contains("amazonaws.com") {
                    let parts: Vec<&str> = host.split('.').collect();
                    for (i, part) in parts.iter().enumerate() {
                        if *part == "s3" && i + 1 < parts.len() && parts[i + 1] != "amazonaws" {
                            return Some(parts[i + 1].to_string());
                        }
                    }
                }
            }
        }
        None
    }

    /// 获取主机名
    fn get_host(&self) -> String {
        if let Ok(url) = Url::parse(&self.endpoint) {
            url.host_str().unwrap_or("").to_string()
        } else {
            "".to_string()
        }
    }

    /// 生成预签名下载 URL
    fn generate_download_url(
        &self,
        object_key: &str,
        expires_in_seconds: i64,
    ) -> Result<String, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        // 根据平台选择不同的预签名URL算法
        if self.platform == OSSPlatform::AwsS3 {
            let region = if let Some(region) = &self.region {
                region.clone()
            } else if let Some(extracted_region) = self.extract_region_from_endpoint() {
                extracted_region
            } else {
                "us-east-1".to_string()
            };

            generate_aws_presigned_url(
                &self.endpoint,
                object_key,
                expires_in_seconds,
                &self.access_key,
                &self.secret_key,
                &region,
                &self.bucket,
            )
            .map_err(|e| StorageError::RequestFailed(e))
        } else {
            // 其他OSS平台使用标准OSS预签名URL
            generate_oss_presigned_url(
                &self.endpoint,
                object_key,
                expires_in_seconds,
                &self.access_key,
                &self.secret_key,
                &self.bucket,
            )
            .map_err(|e| StorageError::RequestFailed(e))
        }
    }

    /// 使用 HTTP 请求列出目录内容
    async fn list_directory_with_http(
        &self,
        prefix: &str,
        options: &ListOptions,
    ) -> Result<DirectoryResult, StorageError> {
        let mut query_params = vec![("delimiter".to_string(), "/".to_string())];

        // 只对 AWS S3 使用 list-type=2
        if self.platform == OSSPlatform::AwsS3 {
            query_params.push(("list-type".to_string(), "2".to_string()));
        }

        if !prefix.is_empty() {
            query_params.push(("prefix".to_string(), prefix.to_string()));
        }

        if let Some(page_size) = options.page_size {
            query_params.push(("max-keys".to_string(), page_size.to_string()));
        }

        if let Some(marker) = &options.marker {
            let param_name = if self.platform == OSSPlatform::AwsS3 {
                "continuation-token"
            } else {
                "marker"
            };
            query_params.push((param_name.to_string(), marker.clone()));
        }

        let query_string = query_params
            .iter()
            .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");

        // 获取实际的 bucket 名称（不包含路径前缀）
        let actual_bucket = if let Some(slash_pos) = self.config.bucket.as_ref().unwrap().find('/')
        {
            &self.config.bucket.as_ref().unwrap()[..slash_pos]
        } else {
            &self.bucket
        };

        // 检查是否为虚拟主机风格：端点的主机名应该以 bucket 名称开头
        let is_virtual_hosted = if let Ok(parsed_url) = Url::parse(&self.endpoint) {
            if let Some(host) = parsed_url.host_str() {
                host.starts_with(&format!("{}.oss-", actual_bucket))
                    || host.starts_with(&format!("{}.s3", actual_bucket))
                    || host.starts_with(&format!("{}.cos.", actual_bucket))
            } else {
                false
            }
        } else {
            false
        };

        let (signing_uri, url) = if is_virtual_hosted {
            // 虚拟主机风格 - AWS S3
            let signing_uri = "/".to_string();
            let list_url = format!("{}/?{}", self.endpoint.trim_end_matches('/'), query_string);
            (signing_uri, list_url)
        } else {
            // 路径风格 - 对于 AWS S3，签名 URI 应该包含 bucket 名称
            let signing_uri = if self.platform == OSSPlatform::AwsS3 {
                format!("/{}/", actual_bucket)
            } else {
                "/".to_string()
            };
            let list_url = format!(
                "{}/{}?{}",
                self.endpoint.trim_end_matches('/'),
                actual_bucket,
                query_string
            );
            (signing_uri, list_url)
        };

        let headers =
            self.build_auth_headers("GET", &signing_uri, &HashMap::new(), Some(&query_string));
        let mut req_builder = self.client.get(&url);

        for (key, value) in headers {
            req_builder = req_builder.header(&key, &value);
        }

        let response = req_builder.send().await.map_err(|e| {
            StorageError::NetworkError(format!("List directory request failed: {}", e))
        })?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(StorageError::RequestFailed(format!(
                "List directory failed with status {}: {}",
                status, body
            )));
        }

        let xml_content = response.text().await.map_err(|e| {
            StorageError::NetworkError(format!("Failed to read response body: {}", e))
        })?;

        parse_list_objects_response(&xml_content, prefix)
    }
}

#[async_trait]
impl StorageClient for OSSClient {
    async fn connect(&mut self, config: &ConnectionConfig) -> Result<(), StorageError> {
        // 更新配置
        self.config = config.clone();

        if let Some(endpoint) = &config.url {
            self.endpoint = endpoint.clone();
            self.platform = Self::detect_platform(&endpoint);
        }
        if let Some(access_key) = &config.access_key {
            self.access_key = access_key.clone();
        }
        if let Some(secret_key) = &config.secret_key {
            self.secret_key = secret_key.clone();
        }
        if let Some(bucket_input) = &config.bucket {
            // 重新解析 bucket 路径
            let (bucket, prefix) = if let Some(slash_pos) = bucket_input.find('/') {
                let bucket = bucket_input[..slash_pos].to_string();
                let prefix = bucket_input[slash_pos + 1..].to_string();
                (
                    bucket,
                    if prefix.ends_with('/') {
                        prefix
                    } else {
                        format!("{}/", prefix)
                    },
                )
            } else {
                (bucket_input.clone(), String::new())
            };
            self.bucket = bucket;
            self.prefix = prefix;
        }
        self.region = config.region.clone();

        // 简化配置：统一使用HTTP方式，避免AWS SDK的复杂性和兼容性问题
        println!("使用统一的HTTP客户端，支持所有S3兼容服务");

        // 测试连接 - 使用HEAD请求测试一个不存在的对象，避免需要ListBucket权限
        // 这种方法只需要基本的认证权限，不需要特定的bucket权限
        // 如果用户指定了路径前缀，在该前缀下进行测试
        let test_object = if !self.prefix.is_empty() {
            format!("{}{}", self.prefix, "__connection_test__")
        } else {
            "__connection_test__".to_string()
        };

        println!("开始连接测试:");
        println!("  test_object: {}", test_object);

        // 获取实际的 bucket 名称（不包含路径前缀）
        let actual_bucket = if let Some(slash_pos) = self.config.bucket.as_ref().unwrap().find('/')
        {
            &self.config.bucket.as_ref().unwrap()[..slash_pos]
        } else {
            &self.bucket
        };

        println!("  actual_bucket: {}", actual_bucket);

        // 检查是否为虚拟主机风格：端点的主机名应该以 bucket 名称开头
        let is_virtual_hosted = if let Ok(parsed_url) = Url::parse(&self.endpoint) {
            if let Some(host) = parsed_url.host_str() {
                // 对于 AWS S3，如果主机名包含 bucket 名称，则为虚拟主机风格
                if self.platform == OSSPlatform::AwsS3 {
                    host.starts_with(&format!("{}.s3", actual_bucket))
                } else {
                    host.starts_with(&format!("{}.oss-", actual_bucket))
                        || host.starts_with(&format!("{}.cos.", actual_bucket))
                }
            } else {
                false
            }
        } else {
            false
        };

        println!("  is_virtual_hosted: {}", is_virtual_hosted);

        let (uri, url) = if is_virtual_hosted {
            // 虚拟主机风格
            let test_uri = format!("/{}", test_object);
            let test_url = format!("{}/{}", self.endpoint.trim_end_matches('/'), test_object);
            (test_uri, test_url)
        } else {
            // 路径风格
            let test_uri = format!("/{}/{}", actual_bucket, test_object);
            let test_url = format!(
                "{}/{}/{}",
                self.endpoint.trim_end_matches('/'),
                actual_bucket,
                test_object
            );
            (test_uri, test_url)
        };

        println!("  test_uri: {}", uri);
        println!("  test_url: {}", url);

        let headers = self.build_auth_headers("HEAD", &uri, &HashMap::new(), None);
        let mut req_builder = self.client.head(&url);

        for (key, value) in headers {
            req_builder = req_builder.header(&key, &value);
        }

        println!("发送连接测试请求...");
        let response = req_builder.send().await.map_err(|e| {
            println!("连接测试失败: {}", e);
            StorageError::NetworkError(format!("OSS connection test failed: {}", e))
        })?;

        let status = response.status();
        println!("连接测试响应状态: {}", status);

        // 对于连接测试，200/404都表示认证成功
        // 404表示对象不存在但认证有效，这正是我们想要的
        if status.is_success() || status == reqwest::StatusCode::NOT_FOUND {
            self.connected.store(true, Ordering::Relaxed);
            println!("连接测试成功");
            Ok(())
        } else {
            let body = response.text().await.unwrap_or_default();
            println!("连接测试失败，响应体: {}", body);
            Err(StorageError::RequestFailed(format!(
                "OSS connection test failed with status {}: {}",
                status, body
            )))
        }
    }

    async fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
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

        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        println!(
            "OSS读取文件范围: path={}, start={}, length={}",
            path, start, length
        );

        // 处理 oss:// 协议 URL
        let object_key = extract_object_key(
            path,
            &self.endpoint,
            &self.config.bucket.as_ref().unwrap_or(&String::new()),
            &self.prefix,
        )?;

        let url = build_object_url(&self.endpoint, &object_key);

        println!("构建的URL: {}", url);

        let uri = if let Ok(parsed_url) = Url::parse(&url) {
            parsed_url.path().to_string()
        } else {
            // 如果无法解析URL，则直接使用编码后的路径
            format!("/{}", urlencoding::encode(&object_key))
        };

        // 对于签名，使用解码后的URI（OSS签名需要原始的未编码路径）
        let signing_uri = normalize_uri_for_signing(&uri);

        let mut headers = HashMap::new();
        // 添加范围请求头
        let end = start + length - 1;
        let range_header = format!("bytes={}-{}", start, end);
        headers.insert("Range".to_string(), range_header.clone());

        println!("Range请求头: {}", range_header);

        let auth_headers = self.build_auth_headers("GET", &signing_uri, &headers, None);

        let mut req_builder = self.client.get(&url);
        for (key, value) in auth_headers {
            req_builder = req_builder.header(&key, &value);
        }

        let response = req_builder
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(format!("Range request failed: {}", e)))?;

        let status = response.status();
        println!("OSS Range请求响应状态: {}", status);

        if !status.is_success() {
            let error_body = response.text().await.unwrap_or_default();
            println!("OSS Range请求失败，响应体: {}", error_body);
            return Err(StorageError::RequestFailed(format!(
                "Range request failed with status {}: {}",
                status, error_body
            )));
        }

        let content_length = response
            .headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        println!(
            "预期接收 {} 字节，实际Content-Length: {}",
            length, content_length
        );

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
                .map_err(|e| StorageError::RequestFailed(format!("Failed to read chunk: {}", e)))?;

            result.extend_from_slice(&chunk);
            downloaded += chunk.len() as u64;

            // 调用进度回调
            if let Some(ref callback) = progress_callback {
                callback(downloaded, length);
            }
        }

        println!("实际接收到 {} 字节", result.len());

        Ok(result)
    }

    async fn list_directory(
        &self,
        path: &str,
        options: Option<&ListOptions>,
    ) -> Result<DirectoryResult, StorageError> {
        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        let options = options.unwrap_or(&ListOptions {
            page_size: Some(1000),
            marker: None,
            prefix: None,
            recursive: Some(false),
            sort_by: None,
            sort_order: None,
        });

        // 处理路径：如果是协议URL，直接解析；如果是相对路径，则添加前缀
        let full_prefix = if path.starts_with("oss://") {
            // 协议URL包含完整路径，直接解析对象键
            let object_key = extract_object_key(
                path,
                &self.endpoint,
                &self.config.bucket.as_ref().unwrap_or(&String::new()),
                &self.prefix,
            )?;
            // 对于目录列举，确保路径以斜杠结尾（除非是根目录）
            if object_key.is_empty() {
                String::new()
            } else if object_key.ends_with('/') {
                object_key
            } else {
                format!("{}/", object_key)
            }
        } else {
            // 相对路径，需要标准化并添加前缀
            let path_prefix = if path == "/" || path.is_empty() {
                String::new()
            } else {
                let trimmed = path.trim_start_matches('/').trim_end_matches('/');
                if trimmed.is_empty() {
                    String::new()
                } else {
                    format!("{}/", trimmed)
                }
            };
            build_full_path(&path_prefix, &self.prefix)
        };

        // 统一使用 HTTP 请求方式（简单可靠）
        self.list_directory_with_http(&full_prefix, options).await
    }

    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        // 处理 oss:// 协议 URL
        let object_key = extract_object_key(
            path,
            &self.endpoint,
            &self.config.bucket.as_ref().unwrap_or(&String::new()),
            &self.prefix,
        )?;

        let url = build_object_url(&self.endpoint, &object_key);

        println!("构建的URL: {}", url);

        let uri = if let Ok(parsed_url) = Url::parse(&url) {
            parsed_url.path().to_string()
        } else {
            // 如果无法解析URL，则直接使用编码后的路径
            format!("/{}", urlencoding::encode(&object_key))
        };

        // 对于签名，使用解码后的URI（OSS签名需要原始的未编码路径）
        let signing_uri = normalize_uri_for_signing(&uri);

        let auth_headers = self.build_auth_headers("GET", &signing_uri, &HashMap::new(), None);

        let mut req_builder = self.client.get(&url);
        for (key, value) in auth_headers {
            req_builder = req_builder.header(&key, &value);
        }

        let response = req_builder
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(format!("Get file request failed: {}", e)))?;

        let status = response.status();
        println!("OSS文件请求响应状态: {}", status);

        if !status.is_success() {
            let error_body = response.text().await.unwrap_or_default();
            println!("OSS文件请求失败，响应体: {}", error_body);
            return Err(StorageError::RequestFailed(format!(
                "Get file failed with status {}: {}",
                status, error_body
            )));
        }

        let content_length = response
            .headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        println!("Content-Length: {}", content_length);

        let bytes = response.bytes().await.map_err(|e| {
            StorageError::RequestFailed(format!("Failed to read file content: {}", e))
        })?;

        println!("实际接收到 {} 字节", bytes.len());

        Ok(bytes.to_vec())
    }

    async fn get_file_size(&self, path: &str) -> Result<u64, StorageError> {
        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        // 处理 oss:// 协议 URL
        let object_key = extract_object_key(
            path,
            &self.endpoint,
            &self.config.bucket.as_ref().unwrap_or(&String::new()),
            &self.prefix,
        )?;

        let url = build_object_url(&self.endpoint, &object_key);
        let uri = if let Ok(parsed_url) = Url::parse(&url) {
            parsed_url.path().to_string()
        } else {
            // 如果无法解析URL，则直接使用编码后的路径
            format!("/{}", urlencoding::encode(&object_key))
        };

        // 对于签名，使用解码后的URI（OSS签名需要原始的未编码路径）
        let signing_uri = normalize_uri_for_signing(&uri);

        let auth_headers = self.build_auth_headers("HEAD", &signing_uri, &HashMap::new(), None);

        let mut req_builder = self.client.head(&url);
        for (key, value) in auth_headers {
            req_builder = req_builder.header(&key, &value);
        }

        let response = req_builder
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(format!("Head request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(format!(
                "Head request failed with status: {}",
                response.status()
            )));
        }

        response
            .headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| StorageError::RequestFailed("No content-length header".to_string()))
    }

    fn protocol(&self) -> &str {
        "oss"
    }

    fn validate_config(&self, config: &ConnectionConfig) -> Result<(), StorageError> {
        if config.url.is_none() {
            return Err(StorageError::InvalidConfig(
                "OSS endpoint is required".to_string(),
            ));
        }
        if config.access_key.is_none() {
            return Err(StorageError::InvalidConfig(
                "OSS access key is required".to_string(),
            ));
        }
        if config.secret_key.is_none() {
            return Err(StorageError::InvalidConfig(
                "OSS secret key is required".to_string(),
            ));
        }
        if config.bucket.is_none() {
            return Err(StorageError::InvalidConfig(
                "OSS bucket is required".to_string(),
            ));
        }
        Ok(())
    }

    /// 高效的 OSS 文件下载实现，使用 HTTP 流式下载
    async fn download_file(
        &self,
        path: &str,
        save_path: &std::path::Path,
        progress_callback: Option<ProgressCallback>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<(), StorageError> {
        // 从路径中提取对象键
        let object_key = extract_object_key(
            path,
            &self.endpoint,
            &self.config.bucket.as_ref().unwrap_or(&String::new()),
            &self.prefix,
        )?;

        // 构建下载 URL
        let download_url = self.generate_download_url(&object_key, 3600)?;

        // 使用通用HTTP下载工具
        HttpDownloader::download_with_auth(
            &self.client,
            &download_url,
            None, // OSS使用预签名URL，不需要额外认证头
            save_path,
            progress_callback,
            cancel_rx,
        )
        .await
    }
}
