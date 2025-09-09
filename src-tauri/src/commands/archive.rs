// 压缩包处理命令
// 提供压缩包分析、预览和格式支持功能

use crate::archive::{handlers::ArchiveHandler, types::*};
use crate::storage::get_storage_manager;
use serde::{Deserialize, Serialize};
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
        Err("No storage client available. Please connect to a storage first (Local, WebDAV, S3, or HuggingFace)".to_string())
    }
}

/// ORC文件元数据结构
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OrcMetadata {
    pub num_rows: String,
    pub num_columns: u32,
    pub columns: Vec<OrcColumn>,
    pub file_size: String,
    pub compression: Option<String>,
    pub stripe_count: u32,
}

/// ORC列信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OrcColumn {
    pub name: String,
    pub type_name: String,
    pub logical_type: Option<String>,
}

/// ORC数据行
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OrcDataRow {
    pub values: std::collections::HashMap<String, String>,
}

/// 获取ORC文件元数据
#[tauri::command]
#[specta::specta]
pub async fn orc_get_metadata(url: String, filename: String) -> Result<OrcMetadata, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    if let Some(client) = manager.get_current_client() {
        // 获取文件内容
        let file_content = client
            .read_full_file(&url)
            .await
            .map_err(|e| format!("Failed to read file: {}", e))?;

        // 解析ORC文件
        let cursor = std::io::Cursor::new(&file_content);

        // 注意：Arrow目前对ORC的支持有限，这里提供基础实现
        // 实际项目中可能需要使用专门的ORC库如orc-rs

        // 模拟ORC元数据（实际需要使用ORC库解析）
        let metadata = OrcMetadata {
            num_rows: "1000".to_string(), // 需要从实际ORC文件读取
            num_columns: 3,
            columns: vec![
                OrcColumn {
                    name: "id".to_string(),
                    type_name: "bigint".to_string(),
                    logical_type: None,
                },
                OrcColumn {
                    name: "name".to_string(),
                    type_name: "string".to_string(),
                    logical_type: None,
                },
                OrcColumn {
                    name: "value".to_string(),
                    type_name: "double".to_string(),
                    logical_type: None,
                },
            ],
            file_size: file_content.len().to_string(),
            compression: Some("ZLIB".to_string()),
            stripe_count: 1,
        };

        Ok(metadata)
    } else {
        Err("No storage client available".to_string())
    }
}

/// 获取ORC文件数据
#[tauri::command]
#[specta::specta]
pub async fn orc_get_data(
    url: String,
    filename: String,
    offset: String,
    limit: String,
) -> Result<Vec<OrcDataRow>, String> {
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    if let Some(client) = manager.get_current_client() {
        // 获取文件内容
        let file_content = client
            .read_full_file(&url)
            .await
            .map_err(|e| format!("Failed to read file: {}", e))?;

        // 注意：这里提供模拟数据，实际需要使用ORC库解析
        let mut rows = Vec::new();

        let offset_num = offset.parse::<u64>().unwrap_or(0);
        let limit_num = limit.parse::<u64>().unwrap_or(10);

        for i in offset_num..(offset_num + limit_num) {
            let mut values = std::collections::HashMap::new();
            values.insert("id".to_string(), i.to_string());
            values.insert("name".to_string(), format!("name_{}", i));
            values.insert("value".to_string(), (i as f64 * 1.5).to_string());

            rows.push(OrcDataRow { values });
        }

        Ok(rows)
    } else {
        Err("No storage client available".to_string())
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
        Err("No storage client available. Please connect to a storage first (Local, WebDAV, S3, or HuggingFace)".to_string())
    }
}
