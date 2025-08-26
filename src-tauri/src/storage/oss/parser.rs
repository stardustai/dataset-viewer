use quick_xml::Reader;
use quick_xml::events::Event;
use urlencoding;
use chrono::Utc;

use crate::storage::traits::{StorageError, DirectoryResult, StorageFile};

/// 解析 OSS 协议 URL 并返回对象键和实际 URL
///
/// # Arguments
/// * `url` - OSS 协议 URL (例如: "oss://bucket/path/to/file")
/// * `endpoint` - OSS 端点
/// * `configured_bucket` - 配置的 bucket 名称
///
/// # Returns
/// * `Result<(String, String), StorageError>` - (对象键, 实际 HTTP URL)
pub fn parse_oss_url(
    url: &str,
    endpoint: &str,
    configured_bucket: &str,
) -> Result<(String, String), StorageError> {
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
        let bucket_name = configured_bucket.split('/').next().unwrap_or(configured_bucket);
        if !bucket_name.eq(url_bucket) {
            return Err(StorageError::RequestFailed(format!(
                "Bucket mismatch: url='{}' != configured='{}'", url_bucket, bucket_name
            )));
        }

        // 构建实际的 OSS HTTP URL
        let actual_url = build_object_url(endpoint, object_key);
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
/// * `endpoint` - OSS 端点
/// * `configured_bucket` - 配置的 bucket 名称
/// * `prefix` - 路径前缀
///
/// # Returns
/// * `Result<String, StorageError>` - 对象键
pub fn extract_object_key(
    path: &str,
    endpoint: &str,
    configured_bucket: &str,
    prefix: &str,
) -> Result<String, StorageError> {
    if path.starts_with("oss://") {
        // 如果是 OSS 协议 URL，直接解析出对象键，不添加前缀
        // 因为协议 URL 已经包含了完整的路径
        let (object_key, _) = parse_oss_url(path, endpoint, configured_bucket)?;
        Ok(object_key)
    } else {
        // 如果是相对路径，则添加前缀
        let key = path.trim_start_matches('/').to_string();
        Ok(build_full_path(&key, prefix))
    }
}

/// 构建完整路径（添加前缀）
pub fn build_full_path(path: &str, prefix: &str) -> String {
    if prefix.is_empty() {
        path.to_string()
    } else {
        format!("{}{}", prefix, path.trim_start_matches('/'))
    }
}

/// 构建对象的完整 URL
pub fn build_object_url(endpoint: &str, object_key: &str) -> String {
    // 对对象键进行URL编码，以正确处理中文和特殊字符
    let encoded_key = urlencoding::encode(object_key);
    format!("{}/{}", endpoint.trim_end_matches('/'), encoded_key)
}

/// 标准化 URI 路径，处理编码/解码（用于签名）
pub fn normalize_uri_for_signing(uri: &str) -> String {
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

/// 解析 XML 列表响应
pub fn parse_list_objects_response(xml_content: &str, prefix: &str) -> Result<DirectoryResult, StorageError> {
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
                                        lastmod: Utc::now().to_rfc3339(),
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
                    "NextContinuationToken" => {
                        // List Objects v2 uses NextContinuationToken instead of NextMarker
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
