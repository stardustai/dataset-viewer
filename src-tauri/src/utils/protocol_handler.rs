use crate::storage::manager::StorageManager;
use crate::storage::traits::StorageClient;

/// 协议处理的公共工具
pub struct ProtocolHandler;

impl ProtocolHandler {
    /// 智能提取相对路径，避免路径重复
    /// 这个方法可以被所有存储客户端共用
    pub fn extract_relative_path(protocol_url: &str, _client: &dyn StorageClient) -> String {
        // 解析协议 URL
        let Ok(url) = url::Url::parse(protocol_url) else {
            return protocol_url.to_string();
        };

        let full_path = url.path();

        // 直接返回路径，让各个存储客户端自己处理路径解析
        // 移除前导斜杠，因为大多数存储客户端不需要它
        full_path.trim_start_matches('/').to_string()
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
                    .status(400)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                    .header("Access-Control-Allow-Headers", "Range, Content-Type")
                    .body("Invalid Range Header".as_bytes().to_vec())
                    .unwrap();
                responder.respond(response);
            }
        } else {
            Self::handle_full_file_request(client, relative_path, protocol_url, responder).await;
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
