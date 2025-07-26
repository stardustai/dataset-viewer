/// TAR 格式处理器
use crate::archive::types::*;
use crate::archive::formats::{CompressionHandlerDispatcher, common::*};
use crate::storage::traits::StorageClient;
use std::collections::HashMap;
use std::sync::Arc;
use std::io::{Cursor, Read};
use tar::Archive;
use base64::{Engine as _, engine::general_purpose};

pub struct TarHandler;

#[async_trait::async_trait]
impl CompressionHandlerDispatcher for TarHandler {
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
    ) -> Result<FilePreview, String> {
        Self::extract_preview_with_storage_client(client, file_path, entry_path, max_size).await
    }

    fn compression_type(&self) -> CompressionType {
        CompressionType::Tar
    }

    fn validate_format(&self, data: &[u8]) -> bool {
        data.len() >= 512 && {
            // TAR文件以512字节为块，检查文件头
            let header = &data[..512];
            // 简单验证：检查magic字段
            header[257..262] == [0x75, 0x73, 0x74, 0x61, 0x72] // "ustar"
        }
    }
}

impl TarHandler {
    /// 使用存储客户端分析TAR文件（流式分析）
    async fn analyze_with_storage_client(
        client: Arc<dyn StorageClient>,
        file_path: &str,
    ) -> Result<ArchiveInfo, String> {
        println!("TAR流式分析开始: {}", file_path);

        // 获取文件大小
        let file_size = client.get_file_size(file_path).await
            .map_err(|e| format!("Failed to get file size: {}", e))?;

        println!("TAR文件大小: {} 字节", file_size);

        // 对于TAR文件，我们可以通过读取文件头来流式分析
        // 但为了简化，这里先使用完整读取，后续可以优化为真正的流式
        let data = client.read_full_file(file_path).await
            .map_err(|e| format!("Failed to read TAR file: {}", e))?;

        Self::analyze_tar_complete(&data)
    }

    /// 使用存储客户端提取TAR文件预览（流式提取）
    async fn extract_preview_with_storage_client(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        // TAR文件需要读取完整内容来提取特定文件
        let data = client.read_full_file(file_path).await
            .map_err(|e| format!("Failed to read TAR file: {}", e))?;

        Self::extract_tar_preview_from_data(&data, entry_path, max_size)
    }

    /// 完整TAR文件分析
    fn analyze_tar_complete(data: &[u8]) -> Result<ArchiveInfo, String> {
        println!("开始分析TAR文件，数据长度: {} 字节", data.len());

        if !Self::validate_tar_header(data) {
            return Err("Invalid TAR header".to_string());
        }

        let cursor = Cursor::new(data);
        let mut archive = Archive::new(cursor);
        let mut entries = Vec::new();
        let mut total_uncompressed_size = 0;

        for (index, entry_result) in archive.entries().map_err(|e| e.to_string())?.enumerate() {
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
                        compressed_size: None, // TAR没有压缩
                        is_dir,
                        modified_time: header.mtime().ok().map(|timestamp| {
                            // 将Unix时间戳转换为ISO格式的日期字符串
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
                    println!("Warning: Failed to read TAR entry {}: {}", index, e);
                    continue;
                }
            }
        }

        Ok(ArchiveInfoBuilder::new(CompressionType::Tar)
            .entries(entries)
            .total_uncompressed_size(total_uncompressed_size)
            .total_compressed_size(data.len() as u64)
            .supports_streaming(true)
            .supports_random_access(false)
            .analysis_status(AnalysisStatus::Complete)
            .build())
    }

    /// 验证TAR文件头
    fn validate_tar_header(data: &[u8]) -> bool {
        if data.len() < 512 {
            return false;
        }

        // 检查TAR文件的magic bytes
        let magic_ustar = &data[257..262];
        let magic_gnu = &data[257..265];

        magic_ustar == b"ustar" || magic_gnu == b"ustar  \0"
    }

    /// 从TAR数据中提取文件预览
    fn extract_tar_preview_from_data(data: &[u8], entry_path: &str, max_size: usize) -> Result<FilePreview, String> {
        let cursor = Cursor::new(data);
        let mut archive = Archive::new(cursor);

        for entry_result in archive.entries().map_err(|e| e.to_string())? {
            match entry_result {
                Ok(mut entry) => {
                    let path = entry.path().map_err(|e| e.to_string())?;
                    if path.to_string_lossy() == entry_path {
                        let total_size = entry.header().size().map_err(|e| e.to_string())?;
                        let preview_size = max_size.min(total_size as usize);
                        let mut buffer = vec![0u8; preview_size];
                        let bytes_read = entry.read(&mut buffer).map_err(|e| e.to_string())?;
                        buffer.truncate(bytes_read);

                        let _mime_type = detect_mime_type(&buffer);
                        let is_text = is_text_content(&buffer);

                        let content = if is_text {
                            String::from_utf8_lossy(&buffer).into_owned()
                        } else {
                            general_purpose::STANDARD.encode(&buffer)
                        };

                        return Ok(PreviewBuilder::new()
                            .content(content)
                            .total_size(total_size)
                            .file_type(if is_text { FileType::Text } else { FileType::Binary })
                            .encoding(if is_text { "utf-8".to_string() } else { "base64".to_string() })
                            .with_truncated(bytes_read >= max_size || (bytes_read as u64) < total_size)
                            .build());
                    }
                }
                Err(_) => continue,
            }
        }

        Err("File not found in archive".to_string())
    }
}
