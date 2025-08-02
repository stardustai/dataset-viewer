/// TAR.GZ 格式处理器（组合GZIP和TAR）
use crate::archive::types::*;
use crate::archive::formats::{CompressionHandlerDispatcher, common::*};
use crate::storage::traits::{StorageClient, ProgressCallback};
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::sync::Arc;
use flate2::read::GzDecoder;
use tar::Archive;


pub struct TarGzHandler;

#[async_trait::async_trait]
impl CompressionHandlerDispatcher for TarGzHandler {
    async fn analyze_with_client(
        &self,
        client: Arc<dyn StorageClient>,
        file_path: &str,
        _filename: &str,
        _max_size: Option<usize>,
    ) -> Result<ArchiveInfo, String> {
        Self::analyze_with_storage_client(client, file_path).await
    }

    async fn extract_preview_with_client(
        &self,
        client: Arc<dyn StorageClient>,
        file_path: &str,
        entry_path: &str,
        max_size: usize,
        progress_callback: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<FilePreview, String> {
        Self::extract_tar_gz_preview_with_progress(client, file_path, entry_path, max_size, progress_callback, cancel_rx).await
    }

    fn compression_type(&self) -> CompressionType {
        CompressionType::TarGz
    }

    fn validate_format(&self, data: &[u8]) -> bool {
        Self::validate_tar_gz_header(data)
    }
}

impl TarGzHandler {
    /// 使用storage client分析TAR.GZ文件（流式）
    async fn analyze_with_storage_client(
        client: Arc<dyn StorageClient>,
        file_path: &str,
    ) -> Result<ArchiveInfo, String> {
        log::debug!("使用storage client流式分析TAR.GZ文件: {}", file_path);

        Self::analyze_tar_gz_streaming(client, file_path).await
    }



    /// 流式分析TAR.GZ文件
    async fn analyze_tar_gz_streaming(
        client: Arc<dyn StorageClient>,
        file_path: &str,
    ) -> Result<ArchiveInfo, String> {
        log::debug!("开始流式分析TAR.GZ文件: {}", file_path);

        // 统一使用流式处理，限制内存使用
        const MAX_MEMORY_USAGE: usize = 100 * 1024 * 1024; // 100MB 内存限制

        let file_size = client.get_file_size(file_path).await
            .map_err(|e| format!("Failed to get file size: {}", e))?;

        // 对于超大文件给出警告，但仍然尝试处理
        if file_size > MAX_MEMORY_USAGE as u64 {
            log::warn!("TAR.GZ文件较大 ({:.2} GB)，流式处理中...", file_size as f64 / 1_073_741_824.0);
        }

        // 一次性读取并解压缩分析（对于TAR.GZ格式，流式解压缩比较复杂）
        // 我们设置内存限制来保护系统
        if file_size > MAX_MEMORY_USAGE as u64 {
            return Err(format!(
                "TAR.GZ文件过大 ({:.2} GB)，超过内存限制 ({} MB)。请使用专用工具处理大型压缩文件。",
                file_size as f64 / 1_073_741_824.0,
                MAX_MEMORY_USAGE / 1024 / 1024
            ));
        }

        let data = client.read_full_file(file_path).await
            .map_err(|e| format!("Failed to read file: {}", e))?;

        Self::analyze_tar_gz_complete(&data)
    }



    /// 流式提取TAR.GZ文件预览（支持进度回调和取消信号）
    async fn extract_tar_gz_preview_with_progress(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        entry_path: &str,
        max_size: usize,
        progress_callback: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<FilePreview, String> {
        log::debug!("开始流式提取TAR.GZ预览（带进度）: {} -> {}", file_path, entry_path);

        // 统一使用内存限制
        const MAX_MEMORY_USAGE: usize = 100 * 1024 * 1024; // 100MB

        let file_size = client.get_file_size(file_path).await
            .map_err(|e| format!("Failed to get file size: {}", e))?;

        if file_size > MAX_MEMORY_USAGE as u64 {
            return Err(format!(
                "TAR.GZ文件过大 ({:.2} GB)，超过内存限制 ({} MB)。建议下载后本地处理。",
                file_size as f64 / 1_073_741_824.0,
                MAX_MEMORY_USAGE / 1024 / 1024
            ));
        }

        // 直接读取全部数据，避免人为分块导致的性能问题
        let progress_cb = progress_callback.map(|cb| {
            Arc::new(move |current: u64, total: u64| {
                cb(current, total);
            }) as ProgressCallback
        });
        
        let data = client.read_full_file_with_progress(file_path, progress_cb, cancel_rx).await
            .map_err(|e| format!("Failed to read file: {}", e))?;

        Self::extract_tar_gz_preview_from_data(&data, entry_path, max_size)
    }

    /// 完整分析TAR.GZ文件（用于小文件）
    fn analyze_tar_gz_complete(data: &[u8]) -> Result<ArchiveInfo, String> {
        log::debug!("开始分析TAR.GZ文件，数据长度: {} 字节", data.len());

        if !Self::validate_tar_gz_header(data) {
            return Err("Invalid TAR.GZ header".to_string());
        }

        // 解压缩GZIP数据
        let gz_decoder = GzDecoder::new(Cursor::new(data));
        let mut tar_archive = Archive::new(gz_decoder);

        let mut entries = Vec::new();
        let mut total_uncompressed_size = 0;

        for (index, entry_result) in tar_archive.entries().map_err(|e| e.to_string())?.enumerate() {
            match entry_result {
                Ok(entry) => {
                    let header = entry.header();
                    let path = entry.path().map_err(|e| e.to_string())?;
                    let size = header.size().map_err(|e| e.to_string())?;
                    let is_dir = header.entry_type().is_dir();

                    total_uncompressed_size += size;

                    entries.push(ArchiveEntry {
                        path: path.to_string_lossy().to_string(),
                        size,
                        compressed_size: None,
                        is_dir,
                        modified_time: header.mtime().ok().map(|timestamp| {
                            use std::time::{UNIX_EPOCH, Duration};
                            use chrono::{DateTime, Utc};

                            let duration = Duration::from_secs(timestamp);
                            let datetime = UNIX_EPOCH + duration;
                            let datetime: DateTime<Utc> = datetime.into();
                            datetime.to_rfc3339()
                        }),
                        crc32: None,
                        index,
                        metadata: HashMap::new(),
                    });
                }
                Err(e) => {
                    log::warn!("Failed to read TAR.GZ entry {}: {}", index, e);
                    continue;
                }
            }
        }

        Ok(ArchiveInfoBuilder::new(CompressionType::TarGz)
            .entries(entries)
            .total_uncompressed_size(total_uncompressed_size)
            .total_compressed_size(data.len() as u64)
            .supports_streaming(true)
            .supports_random_access(false)
            .analysis_status(AnalysisStatus::Complete)
            .build())
    }

    /// 从TAR.GZ数据中提取文件预览（用于小文件）
    fn extract_tar_gz_preview_from_data(data: &[u8], entry_path: &str, max_size: usize) -> Result<FilePreview, String> {
        let gz_decoder = GzDecoder::new(Cursor::new(data));
        let mut tar_archive = Archive::new(gz_decoder);

        for entry_result in tar_archive.entries().map_err(|e| e.to_string())? {
            match entry_result {
                Ok(mut entry) => {
                    let path = entry.path().map_err(|e| e.to_string())?;
                    if path.to_string_lossy() == entry_path {
                        let total_size = entry.header().size().map_err(|e| e.to_string())?;
                        
                        // 读取完整文件内容，然后截取预览部分（参考ZIP格式的处理方式）
                        let mut full_content = Vec::new();
                        entry.read_to_end(&mut full_content).map_err(|e| e.to_string())?;
                        
                        // 保存完整内容长度
                        let full_content_len = full_content.len();
                        
                        // 截取预览数据
                        let preview_data = if full_content_len > max_size {
                            full_content[..max_size].to_vec()
                        } else {
                            full_content
                        };
                        
                        let is_truncated = preview_data.len() < full_content_len;

                        return Ok(PreviewBuilder::new()
                            .content(preview_data)
                            .total_size(total_size)
                            .with_truncated(is_truncated)
                            .build());
                    }
                }
                Err(_) => continue,
            }
        }

        Err("File not found in archive".to_string())
    }

    // 辅助方法
    fn validate_tar_gz_header(data: &[u8]) -> bool {
        // 首先检查GZIP头部
        if data.len() < 3 || data[0] != 0x1f || data[1] != 0x8b || data[2] != 0x08 {
            return false;
        }

        // 尝试部分解压缩来验证TAR格式
        let mut gz_decoder = GzDecoder::new(Cursor::new(data));
        let mut tar_header = vec![0u8; 512];

        match gz_decoder.read(&mut tar_header) {
            Ok(bytes_read) if bytes_read >= 512 => {
                // 检查TAR文件的magic bytes
                let magic_ustar = &tar_header[257..262];
                let magic_gnu = &tar_header[257..265];

                magic_ustar == b"ustar" || magic_gnu == b"ustar  \0"
            }
            _ => false,
        }
    }
}
