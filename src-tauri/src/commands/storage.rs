// 统一存储接口命令
// 提供多协议存储连接和文件操作能力

use crate::storage::{get_storage_manager, ConnectionConfig, DirectoryResult, ListOptions};

/// 连接到存储服务
/// 支持本地文件系统、WebDAV、S3、HuggingFace 等多种协议
#[tauri::command]
#[specta::specta]
pub async fn storage_connect(config: ConnectionConfig) -> Result<bool, String> {
    let manager_arc = get_storage_manager().await;
    let mut manager = manager_arc.write().await;

    match manager.connect(&config).await {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Connection failed: {}", e)),
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
        Err(e) => Err(format!("Disconnect failed: {}", e)),
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
        Err(e) => Err(format!("List directory failed: {}", e)),
    }
}
