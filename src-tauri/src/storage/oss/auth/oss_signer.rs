use crate::utils::crypto::hmac_sha1_base64;
use chrono::Utc;
use std::collections::HashMap;

/// 生成 OSS 签名（适用于阿里云OSS、华为OBS、MinIO等）
pub fn generate_oss_signature(
    method: &str,
    uri: &str,
    headers: &HashMap<String, String>,
    date: &str,
    secret_key: &str,
    bucket: &str,
) -> String {
    // 构建签名字符串
    let mut string_to_sign = format!("{}\n", method);

    // Content-MD5
    string_to_sign.push_str(&format!(
        "{}\n",
        headers.get("Content-MD5").unwrap_or(&String::new())
    ));

    // Content-Type
    string_to_sign.push_str(&format!(
        "{}\n",
        headers.get("Content-Type").unwrap_or(&String::new())
    ));

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
    let normalized_uri = normalize_uri_for_signing(uri);

    let canonicalized_resource = if normalized_uri == "/" {
        format!("/{}/", bucket)
    } else {
        format!("/{}{}", bucket, normalized_uri)
    };

    string_to_sign.push_str(&canonicalized_resource);

    // 打印调试信息（仅在开发环境）
    #[cfg(debug_assertions)]
    {}

    // 计算 HMAC-SHA1 签名
    let signature = hmac_sha1_base64(secret_key, &string_to_sign);

    // 打印调试信息（仅在开发环境）
    #[cfg(debug_assertions)]
    {}

    signature
}

/// 构建阿里云OSS等兼容平台的认证头
pub fn build_oss_auth_headers(
    method: &str,
    uri: &str,
    extra_headers: &HashMap<String, String>,
    access_key: &str,
    secret_key: &str,
    bucket: &str,
    host: &str,
) -> HashMap<String, String> {
    let now = Utc::now();
    let date = now.format("%a, %d %b %Y %H:%M:%S GMT").to_string();

    let mut headers = extra_headers.clone();
    headers.insert("Date".to_string(), date.clone());
    headers.insert("Host".to_string(), host.to_string());

    let signature = generate_oss_signature(method, uri, &headers, &date, secret_key, bucket);
    let authorization = format!("OSS {}:{}", access_key, signature);

    headers.insert("Authorization".to_string(), authorization);
    headers
}

/// 标准化 URI 路径，处理编码/解码（用于签名）
fn normalize_uri_for_signing(uri: &str) -> String {
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

/// 生成OSS预签名URL（阿里云等）
pub fn generate_oss_presigned_url(
    endpoint: &str,
    object_key: &str,
    expires_in_seconds: i64,
    access_key: &str,
    secret_key: &str,
    bucket: &str,
) -> Result<String, String> {
    // 计算过期时间戳
    let now = Utc::now().timestamp();
    let expires = now + expires_in_seconds;

    // 构建对象 URL
    let object_url = format!(
        "{}/{}",
        endpoint.trim_end_matches('/'),
        urlencoding::encode(object_key)
    );

    // 构建查询参数 - 使用OSS格式
    let mut query_params = HashMap::new();
    query_params.insert("OSSAccessKeyId".to_string(), access_key.to_string());
    query_params.insert("Expires".to_string(), expires.to_string());

    // 构建待签名字符串
    let uri = format!("/{}", object_key);
    let method = "GET";
    let content_md5 = "";
    let content_type = "";

    // 构建 Canonicalized Resource
    let canonicalized_resource = format!("/{}{}", bucket, uri);

    // 构建签名字符串
    let string_to_sign = format!(
        "{}\n{}\n{}\n{}\n{}",
        method, content_md5, content_type, expires, canonicalized_resource
    );

    // 生成签名
    let signature = hmac_sha1_base64(secret_key, &string_to_sign);
    query_params.insert("Signature".to_string(), signature);

    // 构建最终 URL
    let query_string: String = query_params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    Ok(format!("{}?{}", object_url, query_string))
}
