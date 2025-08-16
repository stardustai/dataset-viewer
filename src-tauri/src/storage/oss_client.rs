use async_trait::async_trait;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha1;
use sha2::Sha256;
use url::Url;
use urlencoding;
use quick_xml::Reader;
use quick_xml::events::Event;
use base64::Engine;
use futures_util::StreamExt;
use std::time::Duration;
// AWS SDK imports for presigned URLs
use aws_config::{BehaviorVersion, Region};
use aws_credential_types::Credentials;
use aws_sdk_s3::{Client as S3Client, Config};
use aws_sdk_s3::presigning::PresigningConfig;

use crate::storage::traits::{
    StorageClient, StorageRequest, StorageResponse, StorageError,
    ConnectionConfig, StorageCapabilities, DirectoryResult, StorageFile, ListOptions, ProgressCallback
};

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
    // AWS S3 client for presigned URLs (只在 AWS S3 平台时使用)
    aws_s3_client: Option<S3Client>,
}

impl OSSClient {
    pub fn new(config: ConnectionConfig) -> Result<Self, StorageError> {
        let endpoint = config.url.clone()
            .ok_or_else(|| StorageError::InvalidConfig("OSS endpoint is required".to_string()))?;

        let access_key = config.access_key.clone()
            .ok_or_else(|| StorageError::InvalidConfig("OSS access key is required".to_string()))?;

        let secret_key = config.secret_key.clone()
            .ok_or_else(|| StorageError::InvalidConfig("OSS secret key is required".to_string()))?;

        let bucket_input = config.bucket.clone()
            .ok_or_else(|| StorageError::InvalidConfig("OSS bucket is required".to_string()))?;

        // 解析 bucket 字段，支持 "bucket/path/prefix" 格式
        let (bucket, prefix) = if let Some(slash_pos) = bucket_input.find('/') {
            let bucket = bucket_input[..slash_pos].to_string();
            let prefix = bucket_input[slash_pos + 1..].to_string();
            (bucket, if prefix.ends_with('/') { prefix } else { format!("{}/", prefix) })
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
            aws_s3_client: None, // 将在连接时初始化
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

    /// 构建完整路径（添加前缀）
    fn build_full_path(&self, path: &str) -> String {
        if self.prefix.is_empty() {
            path.to_string()
        } else {
            format!("{}{}", self.prefix, path.trim_start_matches('/'))
        }
    }

    /// 生成 OSS 签名
    fn generate_signature(
        &self,
        method: &str,
        uri: &str,
        headers: &HashMap<String, String>,
        date: &str,
    ) -> String {
        // 构建签名字符串
        let mut string_to_sign = format!("{}\n", method);

        // Content-MD5
        string_to_sign.push_str(&format!("{}\n", headers.get("Content-MD5").unwrap_or(&String::new())));

        // Content-Type
        string_to_sign.push_str(&format!("{}\n", headers.get("Content-Type").unwrap_or(&String::new())));

        // Date
        string_to_sign.push_str(&format!("{}\n", date));

        // Canonicalized OSS Headers
        let mut oss_headers: Vec<_> = headers
            .iter()
            .filter(|(k, _)| k.to_lowercase().starts_with("x-oss-"))
            .collect();
        oss_headers.sort_by(|a, b| a.0.cmp(b.0));

        for (key, value) in oss_headers {
            string_to_sign.push_str(&format!("{}:{}\n", key.to_lowercase(), value));
        }

        // Canonicalized Resource
        // 根据OSS文档，签名中的URI应该是解码后的UTF-8形式
        let normalized_uri = self.normalize_uri_for_signing(&uri);

        let canonicalized_resource = if normalized_uri == "/" {
            format!("/{}/", self.bucket)
        } else {
            format!("/{}{}", self.bucket, normalized_uri)
        };

        string_to_sign.push_str(&canonicalized_resource);

        // 打印调试信息（仅在开发环境）
        #[cfg(debug_assertions)]
        {
            println!("DEBUG: StringToSign:");
            println!("{}", string_to_sign);

            // 如果需要测试签名生成，应该使用环境变量或测试配置文件
            // 而不是硬编码凭据
        }

        // 计算 HMAC-SHA1 签名
        type HmacSha1 = Hmac<sha1::Sha1>;
        let mut mac = HmacSha1::new_from_slice(self.secret_key.as_bytes())
            .expect("HMAC can take key of any size");
        mac.update(string_to_sign.as_bytes());
        let result = mac.finalize();
        let signature = base64::engine::general_purpose::STANDARD.encode(result.into_bytes());

        // 打印调试信息（仅在开发环境）
        #[cfg(debug_assertions)]
        {
            println!("DEBUG: Generated signature: {}", signature);
            println!("DEBUG: Secret key length: {}", self.secret_key.len());
        }

        signature
    }

    /// 构建认证头
    fn build_auth_headers(&self, method: &str, uri: &str, extra_headers: &HashMap<String, String>, query_string: Option<&str>) -> HashMap<String, String> {
        match self.platform {
            OSSPlatform::AwsS3 => self.build_aws_auth_headers(method, uri, extra_headers, query_string),
            _ => self.build_oss_auth_headers(method, uri, extra_headers),
        }
    }

    /// 构建阿里云OSS等兼容平台的认证头
    fn build_oss_auth_headers(&self, method: &str, uri: &str, extra_headers: &HashMap<String, String>) -> HashMap<String, String> {
        let now = Utc::now();
        let date = now.format("%a, %d %b %Y %H:%M:%S GMT").to_string();

        let mut headers = extra_headers.clone();
        headers.insert("Date".to_string(), date.clone());
        headers.insert("Host".to_string(), self.get_host());

        let signature = self.generate_signature(method, uri, &headers, &date);
        let authorization = format!("OSS {}:{}", self.access_key, signature);

        headers.insert("Authorization".to_string(), authorization);
        headers
    }

    /// 构建AWS S3的认证头
    fn build_aws_auth_headers(&self, method: &str, uri: &str, extra_headers: &HashMap<String, String>, query_string: Option<&str>) -> HashMap<String, String> {
        let now = Utc::now();
        let date_stamp = now.format("%Y%m%d").to_string();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let region = self.region.as_ref().unwrap_or(&"us-east-1".to_string()).clone();

        // 计算请求体的SHA256哈希（空请求体）
        let payload_hash = self.sha256_hex("");

        let mut headers = extra_headers.clone();
        headers.insert("Host".to_string(), self.get_host());
        headers.insert("X-Amz-Date".to_string(), amz_date.clone());
        headers.insert("x-amz-content-sha256".to_string(), payload_hash.clone());

        // 构建规范请求
        let canonical_request = self.build_canonical_request_with_payload(method, uri, &headers, &payload_hash, query_string.unwrap_or(""));

        // 构建待签名字符串
        let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, region);
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{}\n{}\n{}",
            amz_date,
            credential_scope,
            self.sha256_hex(&canonical_request)
        );

        // 计算签名
        let signature = self.calculate_aws_signature(&string_to_sign, &date_stamp, &region);

        // 构建Authorization头
        let authorization = format!(
            "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            self.access_key,
            credential_scope,
            self.get_signed_headers(&headers),
            signature
        );

        headers.insert("Authorization".to_string(), authorization);
        headers
    }

    /// AWS S3签名辅助方法


    fn build_canonical_request_with_payload(&self, method: &str, uri: &str, headers: &HashMap<String, String>, payload_hash: &str, query_string: &str) -> String {
        // 规范化URI
        let canonical_uri = if uri.is_empty() || uri == "/" {
            "/".to_string()
        } else {
            uri.to_string()
        };

        // 规范化查询字符串 - 按键名排序
        let canonical_query_string = if query_string.is_empty() {
            String::new()
        } else {
            let mut params: Vec<&str> = query_string.split('&').collect();
            params.sort();
            params.join("&")
        };

        // 规范化头部
        let mut sorted_headers: Vec<_> = headers.iter().collect();
        sorted_headers.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));

        let canonical_headers: String = sorted_headers
            .iter()
            .map(|(k, v)| format!("{}:{}", k.to_lowercase(), v.trim()))
            .collect::<Vec<_>>()
            .join("\n") + "\n";

        let signed_headers = self.get_signed_headers(headers);

        format!(
            "{}\n{}\n{}\n{}\n{}\n{}",
            method,
            canonical_uri,
            canonical_query_string,
            canonical_headers,
            signed_headers,
            payload_hash
        )
    }

    fn get_signed_headers(&self, headers: &HashMap<String, String>) -> String {
        let mut header_names: Vec<_> = headers.keys().map(|k| k.to_lowercase()).collect();
        header_names.sort();
        header_names.join(";")
    }

    fn sha256_hex(&self, data: &str) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(data.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn calculate_aws_signature(&self, string_to_sign: &str, date_stamp: &str, region: &str) -> String {

        // AWS4 签名密钥派生
        let k_date = self.hmac_sha256(&format!("AWS4{}", self.secret_key), date_stamp);
        let k_region = self.hmac_sha256_bytes(&k_date, region);
        let k_service = self.hmac_sha256_bytes(&k_region, "s3");
        let k_signing = self.hmac_sha256_bytes(&k_service, "aws4_request");

        // 计算最终签名
        let signature = self.hmac_sha256_bytes(&k_signing, string_to_sign);
        hex::encode(signature)
    }

    fn hmac_sha256(&self, key: &str, data: &str) -> Vec<u8> {
        type HmacSha256 = Hmac<Sha256>;
        let mut mac = HmacSha256::new_from_slice(key.as_bytes())
            .expect("HMAC can take key of any size");
        mac.update(data.as_bytes());
        mac.finalize().into_bytes().to_vec()
    }

    fn hmac_sha256_bytes(&self, key: &[u8], data: &str) -> Vec<u8> {
        type HmacSha256 = Hmac<Sha256>;
        let mut mac = HmacSha256::new_from_slice(key)
            .expect("HMAC can take key of any size");
        mac.update(data.as_bytes());
        mac.finalize().into_bytes().to_vec()
    }

    /// 初始化 AWS S3 客户端用于预签名 URL
    async fn init_aws_s3_client(&mut self) -> Result<(), StorageError> {
        // 从 endpoint 解析出 region
        let region = if let Some(ref region) = self.region {
            region.clone()
        } else {
            // 尝试从 endpoint 提取 region
            self.extract_region_from_endpoint()
                .unwrap_or_else(|| "us-east-1".to_string())
        };

        // 创建 AWS 凭证
        let credentials = Credentials::new(
            self.access_key.clone(),
            self.secret_key.clone(),
            None, // session_token
            None, // expiration
            "OSSClient", // provider_name
        );

        // 创建 AWS 配置
        let mut config_builder = Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new(region))
            .credentials_provider(credentials);

        // 如果不是标准 AWS endpoint，设置自定义 endpoint
        if !self.endpoint.contains("amazonaws.com") {
            config_builder = config_builder.endpoint_url(&self.endpoint);
        }

        let config = config_builder.build();
        let s3_client = S3Client::from_conf(config);

        self.aws_s3_client = Some(s3_client);
        Ok(())
    }

    /// 从 endpoint 提取 region
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

    /// 构建对象的完整 URL
    fn build_object_url(&self, object_key: &str) -> String {
        // 对对象键进行URL编码，以正确处理中文和特殊字符
        let encoded_key = urlencoding::encode(object_key);
        format!("{}/{}", self.endpoint.trim_end_matches('/'), encoded_key)
    }

    /// 解析 XML 列表响应
    fn parse_list_objects_response(&self, xml_content: &str, prefix: &str) -> Result<DirectoryResult, StorageError> {
        let mut reader = Reader::from_str(xml_content);
        reader.trim_text(true);

        let mut files = Vec::new();
        let mut buf = Vec::new();
        let mut current_object: Option<StorageFile> = None;
        let mut current_prefix: Option<String> = None;
        let mut current_text = String::new();
        let mut is_truncated = false;
        let mut next_marker: Option<String> = None;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let element_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if element_name == "Contents" {
                        current_object = Some(StorageFile {
                            filename: String::new(),
                            basename: String::new(),
                            lastmod: String::new(),
                            size: 0,
                            file_type: "file".to_string(),
                            mime: None,
                            etag: None,
                        });
                    } else if element_name == "CommonPrefixes" {
                        current_prefix = Some(String::new());
                    }
                    current_text.clear();
                }
                Ok(Event::Text(e)) => {
                    current_text = e.unescape().unwrap_or_default().to_string();
                }
                Ok(Event::End(ref e)) => {
                    let element_name_bytes = e.name();
                    let element_name = String::from_utf8_lossy(element_name_bytes.as_ref());

                    if let Some(ref mut obj) = current_object {
                        match element_name.as_ref() {
                            "Key" => {
                                // 对于OSS，filename应该是相对于当前prefix的路径，而不是完整的object key
                                let relative_path = current_text.strip_prefix(prefix).unwrap_or(&current_text);
                                obj.filename = relative_path.to_string();
                                obj.basename = current_text.rsplit('/').next().unwrap_or(&current_text).to_string();
                            }
                            "LastModified" => {
                                obj.lastmod = current_text.clone();
                            }
                            "Size" => {
                                obj.size = current_text.parse().unwrap_or(0);
                            }
                            "ETag" => {
                                obj.etag = Some(current_text.trim_matches('"').to_string());
                            }
                            "Contents" => {
                                if let Some(obj) = current_object.take() {
                                    // 只添加当前前缀下的直接子项
                                    let relative_path = obj.filename.strip_prefix(prefix).unwrap_or(&obj.filename);
                                    if !relative_path.is_empty() && !relative_path.contains('/') {
                                        files.push(obj);
                                    }
                                }
                            }
                            _ => {}
                        }
                    }

                    // 处理 CommonPrefixes (文件夹)
                    if let Some(ref mut prefix_val) = current_prefix {
                        match element_name.as_ref() {
                            "Prefix" => {
                                *prefix_val = current_text.clone();
                            }
                            "CommonPrefixes" => {
                                if let Some(prefix_path) = current_prefix.take() {
                                    // 只添加当前前缀下的直接子目录
                                    let relative_path = prefix_path.strip_prefix(prefix).unwrap_or(&prefix_path);
                                    if !relative_path.is_empty() && !relative_path.trim_end_matches('/').contains('/') {
                                        let dir_name = relative_path.trim_end_matches('/');
                                        files.push(StorageFile {
                                            filename: dir_name.to_string(),
                                            basename: dir_name.to_string(),
                                            lastmod: chrono::Utc::now().to_rfc3339(),
                                            size: 0,
                                            file_type: "directory".to_string(),
                                            mime: None,
                                            etag: None,
                                        });
                                    }
                                }
                            }
                            _ => {}
                        }
                    }

                    match element_name.as_ref() {
                        "IsTruncated" => {
                            is_truncated = current_text == "true";
                        }
                        "NextMarker" => {
                            next_marker = Some(current_text.clone());
                        }
                        _ => {}
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(StorageError::RequestFailed(format!("XML parsing error: {}", e))),
                _ => {}
            }
            buf.clear();
        }

        Ok(DirectoryResult {
            files,
            has_more: is_truncated,
            next_marker,
            total_count: None,
            path: prefix.to_string(),
        })
    }

    /// 标准化 URI 路径，处理编码/解码
    fn normalize_uri_for_signing(&self, uri: &str) -> String {
        match urlencoding::decode(uri) {
            Ok(decoded) => decoded.to_string(),
            Err(_) => {
                // 如果解码失败，可能路径本身就没有编码
                if uri.starts_with('/') {
                    uri.to_string()
                } else {
                    format!("/{}", uri)
                }
            }
        }
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
                (bucket, if prefix.ends_with('/') { prefix } else { format!("{}/", prefix) })
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
        let actual_bucket = if let Some(slash_pos) = self.config.bucket.as_ref().unwrap().find('/') {
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
                    host.starts_with(&format!("{}.oss-", actual_bucket)) ||
                    host.starts_with(&format!("{}.cos.", actual_bucket))
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
            let test_url = format!("{}/{}/{}", self.endpoint.trim_end_matches('/'), actual_bucket, test_object);
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
        let response = req_builder.send().await
            .map_err(|e| {
                println!("连接测试失败: {}", e);
                StorageError::NetworkError(format!("OSS connection test failed: {}", e))
            })?;

        let status = response.status();
        println!("连接测试响应状态: {}", status);

        // 对于连接测试，200/404都表示认证成功
        // 404表示对象不存在但认证有效，这正是我们想要的
        if status.is_success() || status == reqwest::StatusCode::NOT_FOUND {
            self.connected.store(true, Ordering::Relaxed);

            // 如果是 AWS S3 平台，初始化 AWS S3 客户端用于预签名 URL
            if self.platform == OSSPlatform::AwsS3 {
                if let Err(e) = self.init_aws_s3_client().await {
                    println!("警告: AWS S3 客户端初始化失败: {}, 将使用兼容模式", e);
                    // 不阻止连接，因为其他功能仍可正常工作
                }
            }

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

    async fn request(&self, req: &StorageRequest) -> Result<StorageResponse, StorageError> {
        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        // 处理 oss:// 协议 URL
        let (object_key, actual_url) = self.parse_oss_url(&req.url)?;

        // 对于签名，使用对象键路径
        let signing_uri = self.normalize_uri_for_signing(&format!("/{}", object_key));

        // 构建认证头
        let signing_method = if req.method == "LIST" { "GET" } else { &req.method };
        let auth_headers = self.build_auth_headers(signing_method, &signing_uri, &req.headers, None);

        // 发送请求
        let mut req_builder = match req.method.as_str() {
            "GET" => self.client.get(&actual_url),
            "HEAD" => self.client.head(&actual_url),
            "PUT" => self.client.put(&actual_url),
            "POST" => self.client.post(&actual_url),
            "DELETE" => self.client.delete(&actual_url),
            "LIST" => {
                // 特殊处理列表请求
                let query_params = if let Some(body) = &req.body {
                    serde_json::from_str::<serde_json::Value>(body)
                        .map_err(|e| StorageError::RequestFailed(format!("Invalid list request body: {}", e)))?
                } else {
                    serde_json::Value::Null
                };

                // 构建 LIST 请求 URL - 直接使用标准化的端点
                let mut list_url = format!("{}/?list-type=2", self.endpoint.trim_end_matches('/'));

                if let Some(prefix) = query_params.get("prefix").and_then(|v| v.as_str()) {
                    if !prefix.is_empty() {
                        list_url.push_str(&format!("&prefix={}", urlencoding::encode(prefix)));
                    }
                }
                if let Some(delimiter) = query_params.get("delimiter").and_then(|v| v.as_str()) {
                    list_url.push_str(&format!("&delimiter={}", urlencoding::encode(delimiter)));
                }
                if let Some(max_keys) = query_params.get("max-keys").and_then(|v| v.as_u64()) {
                    list_url.push_str(&format!("&max-keys={}", max_keys));
                }
                if let Some(marker) = query_params.get("marker").and_then(|v| v.as_str()) {
                    list_url.push_str(&format!("&continuation-token={}", urlencoding::encode(marker)));
                }

                self.client.get(&list_url)
            }
            _ => return Err(StorageError::RequestFailed(format!("Unsupported method: {}", req.method))),
        };

        // 添加认证头
        for (key, value) in auth_headers {
            req_builder = req_builder.header(&key, &value);
        }

        // 添加请求体
        if let Some(body) = &req.body {
            if req.method != "LIST" {
                req_builder = req_builder.body(body.clone());
            }
        }

        let response = req_builder.send().await
            .map_err(|e| StorageError::NetworkError(format!("Request failed: {}", e)))?;

        let status = response.status().as_u16();
        let headers: HashMap<String, String> = response
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let body = response.text().await.unwrap_or_default();

        Ok(StorageResponse {
            status,
            headers,
            body,
            metadata: None,
        })
    }

    async fn request_binary(&self, req: &StorageRequest) -> Result<Vec<u8>, StorageError> {
        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        // 处理 oss:// 协议 URL
        let (object_key, actual_url) = self.parse_oss_url(&req.url)?;

        // 对于签名，使用对象键路径
        let signing_uri = self.normalize_uri_for_signing(&format!("/{}", object_key));

        let auth_headers = self.build_auth_headers(&req.method, &signing_uri, &req.headers, None);

        let mut req_builder = match req.method.as_str() {
            "GET" => self.client.get(&actual_url),
            "HEAD" => self.client.head(&actual_url),
            _ => return Err(StorageError::RequestFailed(format!("Unsupported binary method: {}", req.method))),
        };

        for (key, value) in auth_headers {
            req_builder = req_builder.header(&key, &value);
        }

        let response = req_builder.send().await
            .map_err(|e| StorageError::NetworkError(format!("Binary request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(format!(
                "Binary request failed with status: {}",
                response.status()
            )));
        }

        response.bytes().await
            .map(|bytes| bytes.to_vec())
            .map_err(|e| StorageError::RequestFailed(format!("Failed to read response body: {}", e)))
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
        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        println!("OSS读取文件范围: path={}, start={}, length={}", path, start, length);

        // 处理 oss:// 协议 URL
        let object_key = self.extract_object_key(path)?;

        let url = self.build_object_url(&object_key);

        println!("构建的URL: {}", url);

        let uri = if let Ok(parsed_url) = Url::parse(&url) {
            parsed_url.path().to_string()
        } else {
            // 如果无法解析URL，则直接使用编码后的路径
            format!("/{}", urlencoding::encode(&object_key))
        };

        // 对于签名，使用解码后的URI（OSS签名需要原始的未编码路径）
        let signing_uri = match urlencoding::decode(&uri) {
            Ok(decoded) => decoded.to_string(),
            Err(_) => {
                // 如果解码失败，可能路径本身就没有编码，直接使用
                if uri.starts_with('/') {
                    uri
                } else {
                    format!("/{}", uri)
                }
            }
        };

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

        let response = req_builder.send().await
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

        let content_length = response.headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        println!("预期接收 {} 字节，实际Content-Length: {}", length, content_length);

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

    fn capabilities(&self) -> StorageCapabilities {
        StorageCapabilities {
            supports_streaming: true,
            supports_range_requests: true,
            supports_multipart_upload: false,
            supports_metadata: true,
            supports_encryption: false,
            supports_directories: true,
            max_file_size: Some(5 * 1024 * 1024 * 1024), // 5GB
            supported_methods: vec![
                "GET".to_string(),
                "HEAD".to_string(),
                "PUT".to_string(),
                "DELETE".to_string(),
            ],
        }
    }

    async fn list_directory(&self, path: &str, options: Option<&ListOptions>) -> Result<DirectoryResult, StorageError> {
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
            // 协议URL包含完整路径，直接解析对象键；若无对象路径则视为根目录
            let object_key = match self.extract_object_key(path) {
                Ok(k) => k,
                Err(_) => String::new(),
            };
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
            self.build_full_path(&path_prefix)
        };

        // 统一使用 HTTP 请求方式（简单可靠）
        self.list_directory_with_http(&full_prefix, options).await
    }

    async fn read_full_file(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        // 处理 oss:// 协议 URL
        let object_key = self.extract_object_key(path)?;

        let url = self.build_object_url(&object_key);

        println!("构建的URL: {}", url);

        let uri = if let Ok(parsed_url) = Url::parse(&url) {
            parsed_url.path().to_string()
        } else {
            // 如果无法解析URL，则直接使用编码后的路径
            format!("/{}", urlencoding::encode(&object_key))
        };

        // 对于签名，使用解码后的URI（OSS签名需要原始的未编码路径）
        let signing_uri = match urlencoding::decode(&uri) {
            Ok(decoded) => decoded.to_string(),
            Err(_) => {
                // 如果解码失败，可能路径本身就没有编码，直接使用
                if uri.starts_with('/') {
                    uri
                } else {
                    format!("/{}", uri)
                }
            }
        };

        let auth_headers = self.build_auth_headers("GET", &signing_uri, &HashMap::new(), None);

        let mut req_builder = self.client.get(&url);
        for (key, value) in auth_headers {
            req_builder = req_builder.header(&key, &value);
        }

        let response = req_builder.send().await
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

        let content_length = response.headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        println!("Content-Length: {}", content_length);

        let bytes = response.bytes().await
            .map_err(|e| StorageError::RequestFailed(format!("Failed to read file content: {}", e)))?;

        println!("实际接收到 {} 字节", bytes.len());

        Ok(bytes.to_vec())
    }

    async fn get_file_size(&self, path: &str) -> Result<u64, StorageError> {
        if !self.is_connected().await {
            return Err(StorageError::NotConnected);
        }

        // 处理 oss:// 协议 URL
        let object_key = self.extract_object_key(path)?;

        let url = self.build_object_url(&object_key);
        let uri = if let Ok(parsed_url) = Url::parse(&url) {
            parsed_url.path().to_string()
        } else {
            // 如果无法解析URL，则直接使用编码后的路径
            format!("/{}", urlencoding::encode(&object_key))
        };

        // 对于签名，使用解码后的URI（OSS签名需要原始的未编码路径）
        let signing_uri = match urlencoding::decode(&uri) {
            Ok(decoded) => decoded.to_string(),
            Err(_) => {
                // 如果解码失败，可能路径本身就没有编码，直接使用
                if uri.starts_with('/') {
                    uri
                } else {
                    format!("/{}", uri)
                }
            }
        };

        let auth_headers = self.build_auth_headers("HEAD", &signing_uri, &HashMap::new(), None);

        let mut req_builder = self.client.head(&url);
        for (key, value) in auth_headers {
            req_builder = req_builder.header(&key, &value);
        }

        let response = req_builder.send().await
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
            return Err(StorageError::InvalidConfig("OSS endpoint is required".to_string()));
        }
        if config.access_key.is_none() {
            return Err(StorageError::InvalidConfig("OSS access key is required".to_string()));
        }
        if config.secret_key.is_none() {
            return Err(StorageError::InvalidConfig("OSS secret key is required".to_string()));
        }
        if config.bucket.is_none() {
            return Err(StorageError::InvalidConfig("OSS bucket is required".to_string()));
        }
        Ok(())
    }

    fn get_download_url(&self, path: &str) -> Result<String, StorageError> {
        // 从传入的路径/URL 中提取对象键
        let object_key = self.extract_object_key(path)?;

        // 生成 1 小时有效期的预签名下载 URL
        if self.platform == OSSPlatform::AwsS3 {
            // 对于 AWS S3，使用 futures::executor::block_on 来同步执行异步操作
            futures::executor::block_on(async {
                self.generate_download_url(&object_key, 3600).await
            })
        } else {
            self.generate_download_url_sync(&object_key, 3600)
        }
    }


}

impl OSSClient {
    /// 生成预签名下载 URL (异步版本，用于 AWS S3)
    async fn generate_download_url(&self, object_key: &str, expires_in_seconds: i64) -> Result<String, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        // 对于AWS S3，使用AWS SDK的预签名功能会更可靠
        if self.platform == OSSPlatform::AwsS3 {
            return self.generate_aws_presigned_url_v4(object_key, expires_in_seconds).await;
        }

        // 对于其他OSS平台，使用传统的签名方法
        self.generate_oss_presigned_url(object_key, expires_in_seconds)
    }

    /// 生成预签名下载 URL (同步版本，用于非 AWS S3 平台)
    fn generate_download_url_sync(&self, object_key: &str, expires_in_seconds: i64) -> Result<String, StorageError> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err(StorageError::NotConnected);
        }

        // 只适用于非 AWS S3 平台
        self.generate_oss_presigned_url(object_key, expires_in_seconds)
    }

    /// 使用 AWS SDK 生成 SigV4 预签名 URL
    async fn generate_aws_presigned_url_v4(&self, object_key: &str, expires_in_seconds: i64) -> Result<String, StorageError> {
        // 检查 AWS S3 客户端是否已初始化
        let s3_client = self.aws_s3_client.as_ref()
            .ok_or_else(|| StorageError::InvalidConfig("AWS S3 client not initialized".to_string()))?;

        // 获取实际的 bucket 名称（不包含路径前缀）
        let actual_bucket = if let Some(slash_pos) = self.config.bucket.as_ref().unwrap().find('/') {
            &self.config.bucket.as_ref().unwrap()[..slash_pos]
        } else {
            &self.bucket
        };

        // AWS SDK 限制：预签名 URL 最大有效期为 7 天
        let max_expires = 7 * 24 * 3600; // 7 days in seconds
        let expires_duration = if expires_in_seconds > max_expires {
            println!("警告: 请求的过期时间超过 AWS 限制（7天），使用最大值");
            Duration::from_secs(max_expires as u64)
        } else {
            Duration::from_secs(expires_in_seconds as u64)
        };

        // 创建预签名配置
        let presigning_config = PresigningConfig::expires_in(expires_duration)
            .map_err(|e| StorageError::InvalidConfig(format!("Invalid presigning config: {}", e)))?;

        // 生成预签名 URL
        let presigned_request = s3_client
            .get_object()
            .bucket(actual_bucket)
            .key(object_key)
            .presigned(presigning_config)
            .await
            .map_err(|e| StorageError::RequestFailed(format!("Failed to generate presigned URL: {}", e)))?;

        Ok(presigned_request.uri().to_string())
    }

    /// 生成OSS预签名URL（阿里云等）
    fn generate_oss_presigned_url(&self, object_key: &str, expires_in_seconds: i64) -> Result<String, StorageError> {
        // 计算过期时间戳
        let now = Utc::now().timestamp();
        let expires = now + expires_in_seconds;

        // 构建对象 URL
        let object_url = format!("{}/{}", self.endpoint.trim_end_matches('/'),
            urlencoding::encode(object_key));

        // 构建查询参数 - 使用OSS格式
        let mut query_params = HashMap::new();
        query_params.insert("OSSAccessKeyId".to_string(), self.access_key.clone());
        query_params.insert("Expires".to_string(), expires.to_string());

        // 构建待签名字符串
        let uri = format!("/{}", object_key);
        let method = "GET";
        let content_md5 = "";
        let content_type = "";

        // 构建 Canonicalized Resource
        let canonicalized_resource = format!("/{}{}", self.bucket, uri);

        // 构建签名字符串
        let string_to_sign = format!("{}\n{}\n{}\n{}\n{}",
            method, content_md5, content_type, expires, canonicalized_resource);

        // 生成签名
        let signature = self.sign_string(&string_to_sign);
        query_params.insert("Signature".to_string(), signature);

        // 构建最终 URL
        let query_string: String = query_params.iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");

        Ok(format!("{}?{}", object_url, query_string))
    }

    /// 签名字符串
    fn sign_string(&self, string_to_sign: &str) -> String {
        type HmacSha1 = Hmac<sha1::Sha1>;
        let mut mac = HmacSha1::new_from_slice(self.secret_key.as_bytes())
            .expect("HMAC can take key of any size");
        mac.update(string_to_sign.as_bytes());
        let result = mac.finalize();
        base64::engine::general_purpose::STANDARD.encode(result.into_bytes())
    }

    /// 解析 OSS 协议 URL 并返回对象键和实际 URL
    ///
    /// # Arguments
    /// * `url` - OSS 协议 URL (例如: "oss://bucket/path/to/file")
    ///
    /// # Returns
    /// * `Result<(String, String), StorageError>` - (对象键, 实际 HTTP URL)
    fn parse_oss_url(&self, url: &str) -> Result<(String, String), StorageError> {
        if !url.starts_with("oss://") {
            return Err(StorageError::RequestFailed("Only oss:// protocol URLs are supported".to_string()));
        }

        // 解析 oss://bucket/path/to/file 格式
        let oss_url = url.strip_prefix("oss://").unwrap_or(url);
        let parts: Vec<&str> = oss_url.splitn(2, '/').collect();

        if !parts.is_empty() {
            let url_bucket = parts[0];
            let object_key = if parts.len() >= 2 { parts[1] } else { "" };

            // 校验 URL 中的 bucket 与配置的 bucket 一致
            if let Some(cfg_bucket) = self.config.bucket.as_ref() {
                let configured_bucket = cfg_bucket.split('/').next().unwrap_or(cfg_bucket);
                if !configured_bucket.eq(url_bucket) {
                    return Err(StorageError::RequestFailed(format!(
                        "Bucket mismatch: url='{}' != configured='{}'", url_bucket, configured_bucket
                    )));
                }
            }

            // 构建实际的 OSS HTTP URL
            let actual_url = self.build_object_url(object_key);
            Ok((object_key.to_string(), actual_url))
        } else {
            Err(StorageError::RequestFailed("Invalid OSS URL format".to_string()))
        }
    }

    /// 解析 OSS 协议 URL 并返回对象键
    /// 如果不是 OSS 协议 URL，则返回原路径（去除前导斜杠）
    ///
    /// # Arguments
    /// * `path` - 路径或 OSS 协议 URL
    ///
    /// # Returns
    /// * `Result<String, StorageError>` - 对象键
    fn extract_object_key(&self, path: &str) -> Result<String, StorageError> {
        if path.starts_with("oss://") {
            // 如果是 OSS 协议 URL，直接解析出对象键，不添加前缀
            // 因为协议 URL 已经包含了完整的路径
            let (object_key, _) = self.parse_oss_url(path)?;
            Ok(object_key)
        } else {
            // 如果是相对路径，则添加前缀
            let key = path.trim_start_matches('/').to_string();
            Ok(self.build_full_path(&key))
        }
    }

    /// 使用 HTTP 请求列出目录内容
    async fn list_directory_with_http(
        &self,
        prefix: &str,
        options: &ListOptions,
    ) -> Result<DirectoryResult, StorageError> {
        let mut query_params = vec![
            ("list-type".to_string(), "2".to_string()),
            ("delimiter".to_string(), "/".to_string()),
        ];

        if !prefix.is_empty() {
            query_params.push(("prefix".to_string(), prefix.to_string()));
        }

        if let Some(page_size) = options.page_size {
            query_params.push(("max-keys".to_string(), page_size.to_string()));
        }

        if let Some(marker) = &options.marker {
            query_params.push(("continuation-token".to_string(), marker.clone()));
        }

        let query_string = query_params
            .iter()
            .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");

        // 获取实际的 bucket 名称（不包含路径前缀）
        let actual_bucket = if let Some(slash_pos) = self.config.bucket.as_ref().unwrap().find('/') {
            &self.config.bucket.as_ref().unwrap()[..slash_pos]
        } else {
            &self.bucket
        };

        // 检查是否为虚拟主机风格：端点的主机名应该以 bucket 名称开头
        let is_virtual_hosted = if let Ok(parsed_url) = Url::parse(&self.endpoint) {
            if let Some(host) = parsed_url.host_str() {
                host.starts_with(&format!("{}.oss-", actual_bucket)) ||
                host.starts_with(&format!("{}.s3", actual_bucket)) ||
                host.starts_with(&format!("{}.cos.", actual_bucket))
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
            let list_url = format!("{}/{}?{}", self.endpoint.trim_end_matches('/'), actual_bucket, query_string);
            (signing_uri, list_url)
        };

        let headers = self.build_auth_headers("GET", &signing_uri, &HashMap::new(), Some(&query_string));
        let mut req_builder = self.client.get(&url);

        for (key, value) in headers {
            req_builder = req_builder.header(&key, &value);
        }

        let response = req_builder.send().await
            .map_err(|e| StorageError::NetworkError(format!("List directory request failed: {}", e)))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(StorageError::RequestFailed(format!(
                "List directory failed with status {}: {}",
                status, body
            )));
        }

        let xml_content = response.text().await
            .map_err(|e| StorageError::NetworkError(format!("Failed to read response body: {}", e)))?;

        self.parse_list_objects_response(&xml_content, prefix)
    }
}
