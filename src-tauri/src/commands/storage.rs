// 统一存储接口命令
// 提供多协议存储连接和文件操作能力

use crate::storage::{StorageRequest, ConnectionConfig, get_storage_manager, ListOptions, DirectoryResult};
use std::collections::HashMap;

// 为类型导出添加 specta 支持
#[derive(specta::Type, serde::Serialize, serde::Deserialize)]
pub struct StorageRequestParams {
    pub protocol: String,
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub options: Option<HashMap<String, String>>,
}

// 通用的存储响应类型
#[derive(specta::Type, serde::Serialize, serde::Deserialize)]
pub struct StorageResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub metadata: Option<HashMap<String, String>>,
}

// 文件列表响应类型
#[derive(specta::Type, serde::Serialize, serde::Deserialize)]
pub struct FileListResponse {
    pub files: Vec<FileItem>,
    pub has_more: bool,
    pub next_marker: Option<String>,
}

#[derive(specta::Type, serde::Serialize, serde::Deserialize)]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified: Option<String>,
    pub url: Option<String>,
}

/// 通用存储请求
/// 支持各种 HTTP 方法的存储操作
#[tauri::command]
#[specta::specta]
pub async fn storage_request(
    protocol: String,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    options: Option<HashMap<String, String>>,
) -> Result<StorageResponse, String> {
    let manager_arc = get_storage_manager().await;

    // 如果是本地文件系统的连接检查，需要先创建临时客户端
    if protocol == "local" && method == "CHECK_ACCESS" {
        // 创建连接配置
        let config = ConnectionConfig {
            protocol: "local".to_string(),
            url: Some(url.clone()),
            access_key: None,
            secret_key: None,
            region: None,
            bucket: None,
            endpoint: None,
            username: None,
            password: None,
            extra_options: None,
        };

        // 使用 StorageManager 的 connect 方法 - 需要写锁
        let mut manager = manager_arc.write().await;
        match manager.connect(&config).await {
            Ok(_) => {
                // 返回成功响应
                return Ok(StorageResponse {
                    status: 200,
                    headers: HashMap::new(),
                    body: "OK".to_string(),
                    metadata: None,
                });
            }
            Err(e) => {
                return Err(format!("Local storage connection failed: {}", e));
            }
        }
    }

    // 如果是 HuggingFace 的连接检查，需要先创建临时客户端
    if protocol == "huggingface" && method == "CHECK_ACCESS" {
        // 创建连接配置
        let config = ConnectionConfig {
            protocol: "huggingface".to_string(),
            url: Some(url.clone()),
            access_key: None,
            secret_key: None,
            region: None,
            bucket: None,
            endpoint: None,
            username: None,
            password: None,
            extra_options: options.clone(),
        };

        // 使用 StorageManager 的 connect 方法 - 需要写锁
        let mut manager = manager_arc.write().await;
        match manager.connect(&config).await {
            Ok(_) => {
                // 返回成功响应
                return Ok(StorageResponse {
                    status: 200,
                    headers: HashMap::new(),
                    body: "OK".to_string(),
                    metadata: None,
                });
            }
            Err(e) => {
                return Err(format!("HuggingFace connection failed: {}", e));
            }
        }
    }

    let request = StorageRequest {
        method,
        url,
        headers,
        body,
        options,
    };

    // 对于普通请求，使用读锁（已优化为支持并发）
    let manager = manager_arc.read().await;
    match manager.request(&request).await {
        Ok(response) => Ok(StorageResponse {
            status: response.status,
            headers: response.headers,
            body: response.body,
            metadata: response.metadata.map(|v| {
                // 将 serde_json::Value 转换为 HashMap<String, String>
                if let serde_json::Value::Object(map) = v {
                    map.into_iter()
                        .map(|(k, v)| (k, v.to_string()))
                        .collect()
                } else {
                    HashMap::new()
                }
            }),
        }),
        Err(e) => Err(format!("Storage request failed: {}", e))
    }
}

/// 二进制数据请求
/// 用于获取文件的原始二进制数据
#[tauri::command]
#[specta::specta]
pub async fn storage_request_binary(
    _protocol: String,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    options: Option<HashMap<String, String>>,
) -> Result<Vec<u8>, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    let request = StorageRequest {
        method,
        url,
        headers,
        body: None,
        options,
    };

    match manager.request_binary(&request).await {
        Ok(data) => Ok(data),
        Err(e) => Err(format!("Binary request failed: {}", e))
    }
}

/// 连接到存储服务
/// 支持本地文件系统、WebDAV、OSS、HuggingFace 等多种协议
#[tauri::command]
#[specta::specta]
pub async fn storage_connect(config: ConnectionConfig) -> Result<bool, String> {
    let manager_arc = get_storage_manager().await;
    let mut manager = manager_arc.write().await;

    match manager.connect(&config).await {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Connection failed: {}", e))
    }
}

/// 断开存储连接
#[tauri::command]
#[specta::specta]
pub async fn storage_disconnect() -> Result<bool, String> {
    let manager_arc = get_storage_manager().await;
    let mut manager = manager_arc.write().await;

    match manager.disconnect().await {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Disconnect failed: {}", e))
    }
}

/// 列出目录内容
/// 支持分页和过滤选项
#[tauri::command]
#[specta::specta]
pub async fn storage_list(
    path: String,
    options: Option<ListOptions>,
) -> Result<DirectoryResult, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    match manager.list_directory(&path, options.as_ref()).await {
        Ok(result) => Ok(result),
        Err(e) => Err(format!("List directory failed: {}", e))
    }
}

/// 获取文件下载 URL
/// 根据存储类型生成相应的下载链接
#[tauri::command]
#[specta::specta]
pub async fn storage_get_url(path: String) -> Result<String, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    manager.get_download_url(&path).await
        .map_err(|e| format!("Failed to get download URL: {}", e))
}
