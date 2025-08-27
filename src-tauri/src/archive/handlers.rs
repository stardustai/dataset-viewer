use crate::archive::{types::*, formats};
use crate::storage::traits::StorageClient;
use std::sync::Arc;

/// 压缩包处理器的统一入口
pub struct ArchiveHandler;

impl ArchiveHandler {
    pub fn new() -> Self {
        Self
    }

    /// 分析压缩包结构（统一StorageClient接口）
    pub async fn analyze_archive_with_client(
        &self,
        client: Arc<dyn StorageClient>,
        file_path: String,
        filename: String,
        max_size: Option<u32>,
    ) -> Result<ArchiveInfo, String> {
        let compression_type = CompressionType::from_filename(&filename);

        // 检查是否支持该格式
        match compression_type {
            CompressionType::SevenZip => {
                return Err("archive.format.7z.not.supported".to_string());
            }
            CompressionType::Rar => {
                return Err("archive.format.rar.not.supported".to_string());
            }
            CompressionType::Brotli => {
                return Err("archive.format.brotli.not.supported".to_string());
            }
            CompressionType::Lz4 => {
                return Err("archive.format.lz4.not.supported".to_string());
            }
            CompressionType::Zstd => {
                return Err("archive.format.zstd.not.supported".to_string());
            }
            _ => {}
        }

        let handler = if matches!(compression_type, CompressionType::Unknown) {
            // 通过 StorageClient 读取文件头部来检测格式
            let header_data = client.read_file_range(&file_path, 0, 512).await
                .map_err(|e| format!("Failed to read file header: {}", e))?;
            formats::detect_format_and_get_handler(&header_data)
                .ok_or_else(|| "Unsupported archive format".to_string())?
        } else {
            formats::get_handler(&compression_type)
                .ok_or_else(|| "Unsupported archive format".to_string())?
        };

        // 通过 StorageClient 进行流式分析
        handler.analyze_with_client(client, &file_path, &filename, max_size).await
    }

    /// 获取文件预览
    pub async fn get_file_preview_with_client<F>(
        &self,
        client: Arc<dyn StorageClient>,
        file_path: String,
        filename: String,
        entry_path: String,
        max_preview_size: Option<u32>,
        offset: Option<u64>,
        progress_callback: Option<F>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<FilePreview, String>
    where
        F: Fn(u64, u64) + Send + Sync + 'static,
    {
        let compression_type = CompressionType::from_filename(&filename);

        // 检查是否支持该格式
        match compression_type {
            CompressionType::SevenZip => {
                return Err("archive.format.7z.not.supported".to_string());
            }
            CompressionType::Rar => {
                return Err("archive.format.rar.not.supported".to_string());
            }
            CompressionType::Brotli => {
                return Err("archive.format.brotli.not.supported".to_string());
            }
            CompressionType::Lz4 => {
                return Err("archive.format.lz4.not.supported".to_string());
            }
            CompressionType::Zstd => {
                return Err("archive.format.zstd.not.supported".to_string());
            }
            _ => {}
        }

        let handler = if matches!(compression_type, CompressionType::Unknown) {
            let header_data = client.read_file_range(&file_path, 0, 512).await
                .map_err(|e| format!("Failed to read file header: {}", e))?;
            formats::detect_format_and_get_handler(&header_data)
                .ok_or_else(|| "Unsupported archive format".to_string())?
        } else {
            formats::get_handler(&compression_type)
                .ok_or_else(|| "Unsupported archive format".to_string())?
        };

        // 如果没有指定大小限制，使用4GB作为最大限制（用于下载完整文件）
        let max_size = max_preview_size.map(|s| s as usize).unwrap_or(4 * 1024 * 1024 * 1024); // 默认4GB

        // 统一使用支持进度回调的方法
        let boxed_callback = progress_callback.map(|callback| {
            let boxed: Box<dyn Fn(u64, u64) + Send + Sync> = Box::new(callback);
            boxed
        });
        handler.extract_preview_with_client(client, &file_path, &entry_path, max_size, offset, boxed_callback, cancel_rx).await
    }

    // 辅助方法
}
