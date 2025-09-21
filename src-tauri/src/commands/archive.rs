// 压缩包处理命令
// 提供压缩包分析、预览和格式支持功能

use crate::archive::{handlers::ArchiveHandler, types::*};
use crate::storage::get_storage_manager;
use std::sync::{Arc, LazyLock};

// 全局压缩包处理器
static ARCHIVE_HANDLER: LazyLock<Arc<ArchiveHandler>> =
    LazyLock::new(|| Arc::new(ArchiveHandler::new()));

/// 获取压缩包信息（统一接口）
/// 支持多种压缩格式的流式分析
#[tauri::command]
#[specta::specta]
pub async fn archive_get_file_info(
    url: String,
    filename: String,
    max_size: Option<u32>,
) -> Result<ArchiveInfo, String> {
    // 统一使用StorageClient接口进行流式分析
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    if let Some(client) = manager.get_current_client() {
        drop(manager);

        ARCHIVE_HANDLER
            .analyze_archive_with_client(client, url, filename, max_size)
            .await
    } else {
        Err("No storage client available. Please connect to a storage first (Local, WebDAV, S3, or HuggingFace)".to_string())
    }
}
