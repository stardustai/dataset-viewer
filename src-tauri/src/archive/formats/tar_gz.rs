/// TAR.GZ 格式处理器（组合GZIP和TAR）
use crate::archive::types::*;
use crate::archive::formats::{CompressionHandlerDispatcher, common::*};
use crate::storage::traits::StorageClient;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::sync::Arc;
use flate2::read::GzDecoder;
use tar::Archive;
use base64::{Engine as _, engine::general_purpose};

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
    ) -> Result<FilePreview, String> {
        Self::extract_preview_with_storage_client(client, file_path, entry_path, max_size).await
    }

    fn compression_type(&self) -> CompressionType {
        CompressionType::TarGz
    }

    fn validate_format(&self, data: &[u8]) -> bool {
        Self::validate_tar_gz_header(data)
    }
}

impl TarGzHandler {
    /// 使用storage client分析TAR.GZ文件
    async fn analyze_with_storage_client(
        client: Arc<dyn StorageClient>,
        file_path: &str,
    ) -> Result<ArchiveInfo, String> {
        println!("使用storage client分析TAR.GZ文件: {}", file_path);

        // TAR.GZ文件需要读取完整内容来分析结构
        let data = client.read_full_file(file_path).await
            .map_err(|e| format!("Failed to read file: {}", e))?;

        Self::analyze_tar_gz_complete(&data)
    }

    /// 使用storage client提取预览
    async fn extract_preview_with_storage_client(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        println!("使用storage client从TAR.GZ文件提取预览: {} -> {}", file_path, entry_path);

        // TAR.GZ文件需要读取完整内容来提取特定文件
        let data = client.read_full_file(file_path).await
            .map_err(|e| format!("Failed to read file: {}", e))?;

        Self::extract_tar_gz_preview_from_data(&data, entry_path, max_size)
    }

    /// 完整TAR.GZ文件分析
    fn analyze_tar_gz_complete(data: &[u8]) -> Result<ArchiveInfo, String> {
        println!("开始分析TAR.GZ文件，数据长度: {} 字节", data.len());

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
                        compressed_size: None, // 无法确定单个文件的压缩大小
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
                    println!("Warning: Failed to read TAR.GZ entry {}: {}", index, e);
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



    /// 从TAR.GZ数据中提取文件预览
    fn extract_tar_gz_preview_from_data(data: &[u8], entry_path: &str, max_size: usize) -> Result<FilePreview, String> {
        let gz_decoder = GzDecoder::new(Cursor::new(data));
        let mut tar_archive = Archive::new(gz_decoder);

        for entry_result in tar_archive.entries().map_err(|e| e.to_string())? {
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
