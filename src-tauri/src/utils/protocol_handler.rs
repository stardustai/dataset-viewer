use crate::archive::handlers::ArchiveHandler;
use crate::storage::manager::StorageManager;
use crate::storage::traits::StorageClient;
use std::sync::Arc;

/// 协议处理的公共工具
pub struct ProtocolHandler;

impl ProtocolHandler {
    /// 简单提取相对路径
    /// 从协议URL中提取路径部分，供各存储客户端使用
    pub fn extract_relative_path(protocol_url: &str, _client: &dyn StorageClient) -> String {
        // 特殊处理 local:// 协议中的 ~ 路径
        if protocol_url.starts_with("local://~/") {
            // 直接提取 ~/ 开头的路径，然后进行URL解码
            let encoded_path = protocol_url.strip_prefix("local://").unwrap_or("");

            // 使用 urlencoding crate 进行URL解码
            return urlencoding::decode(encoded_path)
                .map(|decoded| decoded.into_owned())
                .unwrap_or_else(|_| encoded_path.to_string());
        }

        // 对于所有其他协议（包括 WebDAV），传递完整的协议 URL
        // 让各存储客户端自己处理协议转换
        protocol_url.to_string()
    }
    /// 根据文件扩展名确定 Content-Type
    /// 这个方法可以被所有存储客户端共用
    pub fn get_content_type(url: &str) -> &'static str {
        match url.split('.').last() {
            Some("txt") | Some("md") | Some("log") => "text/plain; charset=utf-8",
            Some("json") => "application/json",
            Some("xml") => "application/xml",
            Some("html") => "text/html; charset=utf-8",
            Some("css") => "text/css",
            Some("js") => "application/javascript",
            Some("csv") => "text/csv; charset=utf-8",
            Some("pdf") => "application/pdf",
            Some("zip") => "application/zip",
            Some("png") => "image/png",
            Some("jpg") | Some("jpeg") => "image/jpeg",
            Some("gif") => "image/gif",
            Some("svg") => "image/svg+xml",
            Some("ico") => "image/x-icon",
            Some("ttf") => "font/ttf",
            Some("woff") => "font/woff",
            Some("woff2") => "font/woff2",
            Some("eot") => "application/vnd.ms-fontobject",
            Some("otf") => "font/otf",
            Some("webp") => "image/webp",
            Some("avif") => "image/avif",
            Some("mp4") => "video/mp4",
            Some("webm") => "video/webm",
            Some("mp3") => "audio/mpeg",
            Some("wav") => "audio/wav",
            Some("ogg") => "audio/ogg",
            Some("wasm") => "application/wasm", // WebAssembly
            _ => "application/octet-stream",
        }
    }

    /// 处理 OPTIONS 预检请求
    /// 所有存储客户端的OPTIONS处理都是相同的
    pub async fn handle_options_request(responder: tauri::UriSchemeResponder) {
        let response = tauri::http::Response::builder()
            .status(200)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "Range, Content-Type")
            .header("Access-Control-Max-Age", "86400")
            .body(Vec::new())
            .unwrap();
        responder.respond(response);
    }

    /// 处理不支持的方法
    /// 所有存储客户端的错误处理都是相似的
    pub async fn handle_unsupported_method(responder: tauri::UriSchemeResponder) {
        let response = tauri::http::Response::builder()
            .status(405)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "Range, Content-Type")
            .header("Allow", "GET, HEAD, OPTIONS")
            .body("Method Not Allowed".as_bytes().to_vec())
            .unwrap();
        responder.respond(response);
    }

    /// 处理没有客户端的错误
    pub async fn handle_no_client_error(responder: tauri::UriSchemeResponder) {
        let response = tauri::http::Response::builder()
            .status(503)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "Range, Content-Type")
            .body("No storage client available".as_bytes().to_vec())
            .unwrap();
        responder.respond(response);
    }

    /// 处理无效协议的错误
    pub async fn handle_invalid_protocol_error(responder: tauri::UriSchemeResponder) {
        let response = tauri::http::Response::builder()
            .status(400)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "Range, Content-Type")
            .body("Invalid protocol URL".as_bytes().to_vec())
            .unwrap();
        responder.respond(response);
    }

    /// 处理文件未找到错误
    pub async fn handle_file_not_found(responder: tauri::UriSchemeResponder) {
        let response = tauri::http::Response::builder()
            .status(404)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "Range, Content-Type")
            .body("File not found".as_bytes().to_vec())
            .unwrap();
        responder.respond(response);
    }

    /// 处理 HEAD 请求
    /// 所有存储客户端的HEAD请求处理逻辑都是相同的
    pub async fn handle_head_request(
        client: &dyn StorageClient,
        relative_path: &str,
        protocol_url: &str,
        responder: tauri::UriSchemeResponder,
    ) {
        match client.get_file_size(relative_path).await {
            Ok(size) => {
                let response = tauri::http::Response::builder()
                    .status(200)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                    .header("Access-Control-Allow-Headers", "Range, Content-Type")
                    .header("Content-Length", size.to_string())
                    .header("Content-Type", Self::get_content_type(protocol_url))
                    .header("Accept-Ranges", "bytes")
                    .body(Vec::new())
                    .unwrap();

                responder.respond(response);
            }
            Err(_) => {
                Self::handle_file_not_found(responder).await;
            }
        }
    }

    /// 解析Range头并处理Range请求
    /// 这个逻辑对所有存储客户端都是相同的
    pub fn parse_range_header(range_str: &str) -> Option<(u64, Option<u64>)> {
        if let Some(range_part) = range_str.strip_prefix("bytes=") {
            let parts: Vec<&str> = range_part.split('-').collect();
            if parts.len() == 2 {
                let start: u64 = parts[0].parse().ok()?;
                let end: Option<u64> = if parts[1].is_empty() {
                    None // 开放式范围
                } else {
                    parts[1].parse().ok()
                };
                return Some((start, end));
            }
        }
        None
    }

    /// 处理Range请求
    pub async fn handle_range_request(
        client: &dyn StorageClient,
        relative_path: &str,
        protocol_url: &str,
        range_str: &str,
        responder: tauri::UriSchemeResponder,
    ) {
        if let Some((start, end_opt)) = Self::parse_range_header(range_str) {
            let length = match end_opt {
                Some(end) => end - start + 1,
                None => 50 * 1024 * 1024, // 50MB for open range
            };

            match client.read_file_range(relative_path, start, length).await {
                Ok(data) => {
                    let end = start + data.len() as u64 - 1;
                    let response = tauri::http::Response::builder()
                        .status(206)
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                        .header("Access-Control-Allow-Headers", "Range, Content-Type")
                        .header("Content-Type", Self::get_content_type(protocol_url))
                        .header("Content-Length", data.len().to_string())
                        .header("Content-Range", format!("bytes {}-{}/", start, end))
                        .header("Accept-Ranges", "bytes")
                        .body(data)
                        .unwrap();
                    responder.respond(response);
                }
                Err(_) => {
                    Self::handle_file_not_found(responder).await;
                }
            }
        } else {
            let response = tauri::http::Response::builder()
                .status(400)
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                .header("Access-Control-Allow-Headers", "Range, Content-Type")
                .body("Invalid Range Header".as_bytes().to_vec())
                .unwrap();
            responder.respond(response);
        }
    }

    /// 处理完整文件GET请求
    pub async fn handle_full_file_request(
        client: &dyn StorageClient,
        relative_path: &str,
        protocol_url: &str,
        responder: tauri::UriSchemeResponder,
    ) {
        match client.read_full_file(relative_path).await {
            Ok(data) => {
                let response = tauri::http::Response::builder()
                    .status(200)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                    .header("Access-Control-Allow-Headers", "Range, Content-Type")
                    .header("Content-Type", Self::get_content_type(protocol_url))
                    .header("Content-Length", data.len().to_string())
                    .header("Accept-Ranges", "bytes")
                    .body(data)
                    .unwrap();

                responder.respond(response);
            }
            Err(_) => {
                Self::handle_file_not_found(responder).await;
            }
        }
    }

    /// 处理GET请求（包含Range和普通请求）
    /// 这个方法整合了Range和普通文件请求的处理逻辑
    pub async fn handle_get_request(
        client: &dyn StorageClient,
        relative_path: &str,
        protocol_url: &str,
        headers: tauri::http::HeaderMap,
        responder: tauri::UriSchemeResponder,
    ) {
        if let Some(range_header) = headers.get("Range") {
            if let Ok(range_str) = range_header.to_str() {
                Self::handle_range_request(
                    client,
                    relative_path,
                    protocol_url,
                    range_str,
                    responder,
                )
                .await;
            } else {
                let response = tauri::http::Response::builder()
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                    .header("Access-Control-Allow-Headers", "Range, Content-Type")
                    .status(400)
                    .body("Invalid Range Header".as_bytes().to_vec())
                    .unwrap();
                responder.respond(response);
            }
        } else {
            Self::handle_full_file_request(client, relative_path, protocol_url, responder).await;
        }
    }

    /// 处理压缩包内文件请求
    /// 支持标准HTTP Range头进行分块读取
    pub async fn handle_archive_file_request(
        archive_url: String,
        entry_path: String,
        method: String,
        headers: tauri::http::HeaderMap,
        responder: tauri::UriSchemeResponder,
        storage_manager: std::sync::Arc<tauri::async_runtime::RwLock<StorageManager>>,
    ) {
        let manager = storage_manager.read().await;

        if let Some(client) = manager.get_current_client() {
            let client_arc = client.clone();
            drop(manager);

            // 从URL中提取压缩包路径（移除查询参数）
            let archive_path = if let Ok(parsed_url) = url::Url::parse(&archive_url) {
                // 构建不含查询参数的URL
                let mut clean_url = parsed_url.clone();
                clean_url.set_query(None);
                Self::extract_relative_path(&clean_url.to_string(), &*client_arc)
            } else {
                Self::extract_relative_path(&archive_url, &*client_arc)
            };

            let archive_handler = ArchiveHandler::new();

            match method.as_str() {
                "HEAD" => {
                    Self::handle_archive_head_request(
                        client_arc,
                        &archive_handler,
                        &archive_path,
                        &entry_path,
                        responder,
                    )
                    .await;
                }
                "GET" => {
                    Self::handle_archive_get_request(
                        client_arc,
                        &archive_handler,
                        &archive_path,
                        &entry_path,
                        headers,
                        responder,
                    )
                    .await;
                }
                "OPTIONS" => Self::handle_options_request(responder).await,
                _ => Self::handle_unsupported_method(responder).await,
            }
        } else {
            Self::handle_no_client_error(responder).await;
        }
    }

    /// 处理压缩包内文件的HEAD请求
    pub async fn handle_archive_head_request(
        client: Arc<dyn StorageClient>,
        archive_handler: &ArchiveHandler,
        archive_path: &str,
        entry_path: &str,
        responder: tauri::UriSchemeResponder,
    ) {
        // 尝试获取压缩包内文件信息
        match archive_handler
            .get_file_preview_with_client(
                client,
                archive_path.to_string(),
                std::path::Path::new(archive_path)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                entry_path.to_string(),
                Some(1), // 只获取1字节来检查文件是否存在
                None,
                None::<fn(u64, u64)>,
                None,
            )
            .await
        {
            Ok(preview) => {
                let response = tauri::http::Response::builder()
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                    .header("Access-Control-Allow-Headers", "Range, Content-Type")
                    .status(200)
                    .header("Content-Length", preview.total_size.clone())
                    .header("Content-Type", Self::get_content_type(entry_path))
                    .header("Accept-Ranges", "bytes")
                    .body(Vec::new())
                    .unwrap();
                responder.respond(response);
            }
            Err(_) => {
                Self::handle_file_not_found(responder).await;
            }
        }
    }

    /// 处理压缩包内文件的GET请求
    pub async fn handle_archive_get_request(
        client: Arc<dyn StorageClient>,
        archive_handler: &ArchiveHandler,
        archive_path: &str,
        entry_path: &str,
        headers: tauri::http::HeaderMap,
        responder: tauri::UriSchemeResponder,
    ) {
        let filename = std::path::Path::new(archive_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // 检查是否是Range请求
        if let Some(range_header) = headers.get("Range") {
            if let Ok(range_str) = range_header.to_str() {
                if let Some((start, end_opt)) = Self::parse_range_header(range_str) {
                    let length = match end_opt {
                        Some(end) => end - start + 1,
                        None => 50 * 1024 * 1024, // 50MB for open range
                    };

                    match archive_handler
                        .get_file_preview_with_client(
                            client,
                            archive_path.to_string(),
                            filename,
                            entry_path.to_string(),
                            Some(length as u32),
                            Some(start),
                            None::<fn(u64, u64)>,
                            None,
                        )
                        .await
                    {
                        Ok(preview) => {
                            let actual_end = start + preview.content.len() as u64 - 1;
                            let response = tauri::http::Response::builder()
                                .header("Access-Control-Allow-Origin", "*")
                                .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                                .header("Access-Control-Allow-Headers", "Range, Content-Type")
                                .status(206)
                                .header("Content-Type", Self::get_content_type(entry_path))
                                .header("Content-Length", preview.content.len().to_string())
                                .header(
                                    "Content-Range",
                                    format!(
                                        "bytes {}-{}/{}",
                                        start, actual_end, preview.total_size
                                    ),
                                )
                                .header("Accept-Ranges", "bytes")
                                .body(preview.content.to_vec())
                                .unwrap();
                            responder.respond(response);
                        }
                        Err(_) => {
                            Self::handle_file_not_found(responder).await;
                        }
                    }
                } else {
                    let response = tauri::http::Response::builder()
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                        .header("Access-Control-Allow-Headers", "Range, Content-Type")
                        .status(400)
                        .body("Invalid Range Header".as_bytes().to_vec())
                        .unwrap();
                    responder.respond(response);
                }
            } else {
                let response = tauri::http::Response::builder()
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                    .header("Access-Control-Allow-Headers", "Range, Content-Type")
                    .status(400)
                    .body("Invalid Range Header".as_bytes().to_vec())
                    .unwrap();
                responder.respond(response);
            }
        } else {
            // 完整文件请求
            match archive_handler
                .get_file_preview_with_client(
                    client,
                    archive_path.to_string(),
                    filename,
                    entry_path.to_string(),
                    None, // 不限制大小，获取完整文件
                    None,
                    None::<fn(u64, u64)>,
                    None,
                )
                .await
            {
                Ok(preview) => {
                    let response = tauri::http::Response::builder()
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                        .header("Access-Control-Allow-Headers", "Range, Content-Type")
                        .status(200)
                        .header("Content-Type", Self::get_content_type(entry_path))
                        .header("Content-Length", preview.content.len().to_string())
                        .header("Accept-Ranges", "bytes")
                        .body(preview.content.to_vec())
                        .unwrap();
                    responder.respond(response);
                }
                Err(_) => {
                    Self::handle_file_not_found(responder).await;
                }
            }
        }
    }

    /// 通用的协议请求处理入口
    /// 这个方法可以被任何存储客户端使用
    pub async fn handle_protocol_request(
        protocol_prefix: &str,
        uri: String,
        method: String,
        headers: tauri::http::HeaderMap,
        responder: tauri::UriSchemeResponder,
        storage_manager: std::sync::Arc<tauri::async_runtime::RwLock<StorageManager>>,
    ) {
        // 解析协议 URL
        if let Some(protocol_url_part) = uri.strip_prefix(protocol_prefix) {
            let protocol_url = format!("{}{}", protocol_prefix, protocol_url_part);

            // 解析URL以检查查询参数
            if let Ok(parsed_url) = url::Url::parse(&protocol_url) {
                let query_pairs: std::collections::HashMap<String, String> = parsed_url
                    .query_pairs()
                    .map(|(k, v)| (k.to_string(), v.to_string()))
                    .collect();

                // 检查是否包含entry参数，表示这是压缩包内文件请求
                if let Some(entry_path) = query_pairs.get("entry") {
                    Self::handle_archive_file_request(
                        protocol_url,
                        entry_path.clone(),
                        method,
                        headers,
                        responder,
                        storage_manager,
                    )
                    .await;
                    return;
                }
            }

            // 使用传入的存储管理器
            let manager = storage_manager.read().await;

            // 获取当前的存储客户端
            if let Some(client) = manager.get_current_client() {
                // 智能提取相对路径
                let relative_path = Self::extract_relative_path(&protocol_url, &*client);

                match method.as_str() {
                    "HEAD" => {
                        Self::handle_head_request(
                            &*client,
                            &relative_path,
                            &protocol_url,
                            responder,
                        )
                        .await
                    }
                    "GET" => {
                        Self::handle_get_request(
                            &*client,
                            &relative_path,
                            &protocol_url,
                            headers,
                            responder,
                        )
                        .await
                    }
                    "OPTIONS" => Self::handle_options_request(responder).await,
                    _ => Self::handle_unsupported_method(responder).await,
                }
            } else {
                Self::handle_no_client_error(responder).await;
            }
        } else {
            Self::handle_invalid_protocol_error(responder).await;
        }
    }

    /// 通用存储协议注册函数
    /// 为指定协议注册异步URI scheme处理器
    pub fn register_storage_protocol(
        builder: tauri::Builder<tauri::Wry>,
        protocol: &str,
    ) -> tauri::Builder<tauri::Wry> {
        let protocol_scheme = format!("{}://", protocol);
        builder.register_asynchronous_uri_scheme_protocol(
            protocol,
            move |_app, request, responder| {
                let uri = request.uri().to_string();
                let method = request.method().as_str().to_string();
                let headers = request.headers().clone();
                let protocol_prefix = protocol_scheme.clone();

                tauri::async_runtime::spawn(async move {
                    let storage_manager = crate::storage::get_storage_manager().await;
                    Self::handle_protocol_request(
                        &protocol_prefix,
                        uri,
                        method,
                        headers,
                        responder,
                        storage_manager,
                    )
                    .await;
                });
            },
        )
    }

    /// 批量注册所有存储协议
    /// 注册所有支持的存储协议：webdav, oss, local, ssh, huggingface, smb
    pub fn register_all_storage_protocols(
        builder: tauri::Builder<tauri::Wry>,
    ) -> tauri::Builder<tauri::Wry> {
        let storage_protocols = ["webdav", "oss", "local", "ssh", "huggingface", "smb"];
        let mut tauri_builder = builder;
        for protocol in storage_protocols {
            tauri_builder = Self::register_storage_protocol(tauri_builder, protocol);
        }
        tauri_builder
    }
}
