// 统一存储接口命令
// 提供多协议存储连接和文件操作能力

use crate::storage::{ConnectionConfig, get_storage_manager, ListOptions, DirectoryResult};



/// 文件读取接口
/// 支持完整读取和区间读取，统一返回二进制数据
#[tauri::command]
#[specta::specta]
pub async fn storage_read_file(
    path: String,
    start: Option<String>,
    length: Option<String>,
) -> Result<Vec<u8>, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    // 获取当前客户端
    let client = manager.get_current_client()
        .ok_or_else(|| "No storage client connected".to_string())?;

    // 解析字符串参数为数字
    let start_u64 = if let Some(start_str) = start {
        Some(start_str.parse::<u64>()
            .map_err(|e| format!("Invalid start parameter: {}", e))?)
    } else {
        None
    };

    let length_u64 = if let Some(length_str) = length {
        Some(length_str.parse::<u64>()
            .map_err(|e| format!("Invalid length parameter: {}", e))?)
    } else {
        None
    };

    // 根据参数选择读取方式
    let result = if let Some(start_pos) = start_u64 {
        if let Some(read_length) = length_u64 {
            // 区间读取
            client.read_file_range(&path, start_pos, read_length).await
        } else {
            // 从指定位置读取到文件末尾
            let total_size = client.get_file_size(&path).await
                .map_err(|e| format!("Failed to get file size: {}", e))?;
            let read_length = total_size.saturating_sub(start_pos);
            client.read_file_range(&path, start_pos, read_length).await
        }
    } else {
        // 读取完整文件
        client.read_full_file(&path).await
    };

    result.map_err(|e| format!("Failed to read file: {}", e))
}

/// 获取文件大小
#[tauri::command]
#[specta::specta]
pub async fn storage_get_file_size(path: String) -> Result<String, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    let client = manager.get_current_client()
        .ok_or_else(|| "No storage client connected".to_string())?;

    let size = client.get_file_size(&path).await
        .map_err(|e| format!("Failed to get file size: {}", e))?;

    // 返回字符串格式的文件大小，避免 u64 的 BigInt 问题
    Ok(size.to_string())
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
