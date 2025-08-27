// 压缩包处理命令
// 提供压缩包分析、预览和格式支持功能

use crate::archive::{handlers::ArchiveHandler, types::*};
use crate::storage::get_storage_manager;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

// 全局压缩包处理器
static ARCHIVE_HANDLER: LazyLock<Arc<ArchiveHandler>> =
    LazyLock::new(|| Arc::new(ArchiveHandler::new()));

/// 分析压缩包结构（统一接口）
/// 支持多种压缩格式的流式分析
#[tauri::command]
pub async fn archive_analyze(
    url: String,
    _headers: HashMap<String, String>,
    filename: String,
    max_size: Option<usize>,
) -> Result<ArchiveInfo, String> {
    // 统一使用StorageClient接口进行流式分析
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    if let Some(client) = manager.get_current_client() {
        let protocol = client.protocol();
        println!("使用{}存储客户端进行流式分析: {}", protocol, url);
        drop(manager);

        ARCHIVE_HANDLER.analyze_archive_with_client(
            client,
            url,
            filename,
            max_size
        ).await
    } else {
        Err("No storage client available. Please connect to a storage first (Local, WebDAV, OSS, or HuggingFace)".to_string())
    }
}

/// 获取文件预览（统一接口）
/// 支持压缩包内文件的流式预览
#[tauri::command(rename_all = "camelCase")]
pub async fn archive_preview(
    url: String,
    _headers: HashMap<String, String>,
    filename: String,
    entry_path: String,
    max_preview_size: Option<usize>,
    offset: Option<u64>
) -> Result<FilePreview, String> {
    // 统一使用StorageClient接口进行流式预览
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    if let Some(client) = manager.get_current_client() {
        let protocol = client.protocol();
        println!("使用{}存储客户端进行流式预览: {} -> {}", protocol, url, entry_path);
        drop(manager);

        ARCHIVE_HANDLER.get_file_preview_with_client(
            client,
            url,
            filename,
            entry_path,
            max_preview_size,
            offset, // 使用传入的 offset 参数
            None::<fn(u64, u64)>, // 不使用进度回调
            None, // 不使用取消信号
        ).await
    } else {
        Err("No storage client available. Please connect to a storage first (Local, WebDAV, OSS, or HuggingFace)".to_string())
    }
}

/// 通过存储客户端分析压缩包结构
/// 直接使用指定的存储客户端进行分析
#[tauri::command]
pub async fn archive_scan(
    _protocol: String,
    file_path: String,
    filename: String,
    max_size: Option<usize>,
) -> Result<ArchiveInfo, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    // 获取对应的存储客户端
    let client_lock = manager.get_current_client()
        .ok_or_else(|| "No storage client connected".to_string())?;

    // 释放读锁后进行分析
    drop(manager);

    // 直接使用客户端，无需包装
    let client = client_lock;

    // 使用压缩包处理器分析文件
    ARCHIVE_HANDLER.analyze_archive_with_client(
        client,
        file_path,
        filename,
        max_size,
    ).await
}

/// 通过存储客户端获取压缩包预览
/// 直接使用指定的存储客户端进行预览
#[tauri::command]
pub async fn archive_read(
    _protocol: String,
    file_path: String,
    filename: String,
    entry_path: String,
    max_preview_size: Option<usize>,
    offset: Option<u64>,
) -> Result<FilePreview, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    // 获取对应的存储客户端
    let client_lock = manager.get_current_client()
        .ok_or_else(|| "No storage client connected".to_string())?;

    // 释放读锁后进行预览
    drop(manager);

    // 直接使用客户端，无需包装
    let client = client_lock;

    // 使用压缩包处理器获取文件预览
    ARCHIVE_HANDLER.get_file_preview_with_client(
        client,
        file_path,
        filename,
        entry_path,
        max_preview_size,
        offset,
        None::<fn(u64, u64)>, // 不使用进度回调
        None, // 不使用取消信号
    ).await
}
