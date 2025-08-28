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
        let protocol = client.protocol();
        println!("使用{}存储客户端进行流式分析: {}", protocol, url);
        drop(manager);

        ARCHIVE_HANDLER
            .analyze_archive_with_client(client, url, filename, max_size)
            .await
    } else {
        Err("No storage client available. Please connect to a storage first (Local, WebDAV, OSS, or HuggingFace)".to_string())
    }
}

/// 获取压缩包内文件内容（统一接口）
/// 支持压缩包内文件的流式预览
#[tauri::command(rename_all = "camelCase")]
#[specta::specta]
pub async fn archive_get_file_content(
    url: String,
    filename: String,
    entry_path: String,
    max_preview_size: Option<u32>,
    offset: Option<String>, // 使用字符串表示大数字
) -> Result<FilePreview, String> {
    // 统一使用StorageClient接口进行流式预览
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    if let Some(client) = manager.get_current_client() {
        let protocol = client.protocol();
        println!(
            "使用{}存储客户端进行流式预览: {} -> {}",
            protocol, url, entry_path
        );
        drop(manager);

        ARCHIVE_HANDLER
            .get_file_preview_with_client(
                client,
                url,
                filename,
                entry_path,
                max_preview_size,
                offset.and_then(|s| s.parse::<u64>().ok()), // 将字符串转换为u64
                None::<fn(u64, u64)>,                       // 不使用进度回调
                None,                                       // 不使用取消信号
            )
            .await
    } else {
        Err("No storage client available. Please connect to a storage first (Local, WebDAV, OSS, or HuggingFace)".to_string())
    }
}
