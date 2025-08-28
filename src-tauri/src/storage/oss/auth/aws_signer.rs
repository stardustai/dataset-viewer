use crate::utils::crypto::{hmac_sha256, hmac_sha256_bytes, sha256_hex};
use chrono::Utc;
use std::collections::HashMap;

/// 构建AWS S3的认证头
pub fn build_aws_auth_headers(
    method: &str,
    uri: &str,
    extra_headers: &HashMap<String, String>,
    query_string: Option<&str>,
    access_key: &str,
    secret_key: &str,
    region: &str,
    host: &str,
) -> HashMap<String, String> {
    let now = Utc::now();
    let date_stamp = now.format("%Y%m%d").to_string();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();

    // 计算请求体的SHA256哈希（空请求体）
    let payload_hash = sha256_hex("");

    let mut headers = extra_headers.clone();
    headers.insert("Host".to_string(), host.to_string());
    headers.insert("X-Amz-Date".to_string(), amz_date.clone());
    headers.insert("x-amz-content-sha256".to_string(), payload_hash.clone());

    // 构建规范请求
    let canonical_request = build_canonical_request_with_payload(
        method,
        uri,
        &headers,
        &payload_hash,
        query_string.unwrap_or(""),
    );

    // 构建待签名字符串
    let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, region);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        sha256_hex(&canonical_request)
    );

    // 计算签名
    let signature = calculate_aws_signature(&string_to_sign, &date_stamp, region, secret_key);

    // 构建Authorization头
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        access_key,
        credential_scope,
        get_signed_headers(&headers),
        signature
    );

    headers.insert("Authorization".to_string(), authorization);
    headers
}

/// 构建AWS S3规范请求
fn build_canonical_request_with_payload(
    method: &str,
    uri: &str,
    headers: &HashMap<String, String>,
    payload_hash: &str,
    query_string: &str,
) -> String {
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
        .join("\n")
        + "\n";

    let signed_headers = get_signed_headers(headers);

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

/// 获取签名头部列表
fn get_signed_headers(headers: &HashMap<String, String>) -> String {
    let mut header_names: Vec<_> = headers.keys().map(|k| k.to_lowercase()).collect();
    header_names.sort();
    header_names.join(";")
}

/// 计算AWS签名
fn calculate_aws_signature(
    string_to_sign: &str,
    date_stamp: &str,
    region: &str,
    secret_key: &str,
) -> String {
    // AWS4 签名密钥派生
    let k_date = hmac_sha256(&format!("AWS4{}", secret_key), date_stamp);
    let k_region = hmac_sha256_bytes(&k_date, region);
    let k_service = hmac_sha256_bytes(&k_region, "s3");
    let k_signing = hmac_sha256_bytes(&k_service, "aws4_request");

    // 计算最终签名
    let signature = hmac_sha256_bytes(&k_signing, string_to_sign);
    hex::encode(signature)
}

/// 生成AWS S3预签名URL
pub fn generate_aws_presigned_url(
    endpoint: &str,
    object_key: &str,
    expires_in_seconds: i64,
    access_key: &str,
    secret_key: &str,
    region: &str,
    bucket: &str,
) -> Result<String, String> {
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();

    // AWS限制：最大7天
    let max_expires = 7 * 24 * 3600;
    let expires = if expires_in_seconds > max_expires {
        max_expires
    } else {
        expires_in_seconds
    };

    // 构建查询参数
    let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, region);
    let credential = format!("{}/{}", access_key, credential_scope);

    let mut query_params = vec![
        (
            "X-Amz-Algorithm".to_string(),
            "AWS4-HMAC-SHA256".to_string(),
        ),
        (
            "X-Amz-Credential".to_string(),
            urlencoding::encode(&credential).to_string(),
        ),
        ("X-Amz-Date".to_string(), amz_date.clone()),
        ("X-Amz-Expires".to_string(), expires.to_string()),
        ("X-Amz-SignedHeaders".to_string(), "host".to_string()),
    ];

    // 排序查询参数
    query_params.sort_by(|a, b| a.0.cmp(&b.0));
    let query_string = query_params
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");

    // 检查是否为虚拟主机风格
    let host = if let Ok(url) = url::Url::parse(endpoint) {
        url.host_str().unwrap_or("").to_string()
    } else {
        "".to_string()
    };

    let is_virtual_hosted = host.starts_with(&format!("{}.s3", bucket));

    let (canonical_uri, object_url) = if is_virtual_hosted {
        // 虚拟主机风格 - 对于S3预签名URL，路径需要进行URI编码，但保持斜杠
        let encoded_key = object_key
            .split('/')
            .map(|segment| urlencoding::encode(segment).to_string())
            .collect::<Vec<_>>()
            .join("/");
        let uri = format!("/{}", encoded_key);
        let url = format!("{}{}", endpoint.trim_end_matches('/'), uri);
        (uri, url)
    } else {
        // 路径风格
        let encoded_key = object_key
            .split('/')
            .map(|segment| urlencoding::encode(segment).to_string())
            .collect::<Vec<_>>()
            .join("/");
        let uri = format!("/{}/{}", bucket, encoded_key);
        let url = format!("{}{}", endpoint.trim_end_matches('/'), uri);
        (uri, url)
    };

    // 构建规范请求
    let canonical_request = format!(
        "GET\n{}\n{}\nhost:{}\n\nhost\nUNSIGNED-PAYLOAD",
        canonical_uri, query_string, host
    );

    // 构建待签名字符串
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        sha256_hex(&canonical_request)
    );

    // 计算签名
    let signature = calculate_aws_signature(&string_to_sign, &date_stamp, region, secret_key);

    // 构建最终URL
    Ok(format!(
        "{}?{}&X-Amz-Signature={}",
        object_url, query_string, signature
    ))
}
