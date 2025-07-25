/// TAR 格式处理器
use crate::archive::types::*;
use crate::archive::formats::{CompressionHandlerDispatcher, common::*};
use std::collections::HashMap;
use std::io::{Cursor, Read};
use tar::Archive;

pub struct TarHandler;

#[async_trait::async_trait]
impl CompressionHandlerDispatcher for TarHandler {
    async fn analyze_complete(&self, data: &[u8]) -> Result<ArchiveInfo, String> {
        Self::analyze_tar_complete(data)
    }

    async fn analyze_streaming(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        Self::analyze_tar_streaming(url, headers, filename, file_size).await
    }

    async fn analyze_streaming_without_size(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        Self::analyze_tar_streaming_without_size(url, headers, filename).await
    }

    async fn extract_preview(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        Self::extract_tar_preview(url, headers, entry_path, max_size).await
    }

    fn compression_type(&self) -> CompressionType {
        CompressionType::Tar
    }

    fn validate_format(&self, data: &[u8]) -> bool {
        Self::validate_tar_header(data)
    }
}

impl TarHandler {
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
                        modified_time: header.mtime().ok().and_then(|timestamp| {
                            // 将Unix时间戳转换为ISO格式的日期字符串
                            use std::time::{UNIX_EPOCH, Duration};
                            use chrono::{DateTime, Utc};

                            let duration = Duration::from_secs(timestamp);
                            let datetime = UNIX_EPOCH + duration;
                            let datetime: DateTime<Utc> = datetime.into();
                            Some(datetime.to_rfc3339())
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

    /// 流式分析TAR文件
    async fn analyze_tar_streaming(
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        println!("开始流式分析TAR文件: {} (大小: {} 字节)", filename, file_size);

        // 读取头部验证格式
        let header_size = (1024 * 1024).min(file_size);
        let header_data = HttpClient::download_range(url, headers, 0, header_size).await?;

        if !Self::validate_tar_header(&header_data) {
            return Err("Invalid TAR header".to_string());
        }

        // 尝试解析部分条目
        let entries = Self::parse_partial_tar_entries(&header_data, 100)?;

        let analysis_status = if entries.len() >= 100 {
            AnalysisStatus::Streaming { estimated_entries: None }
        } else {
            AnalysisStatus::Complete
        };

        let total_uncompressed_size = entries.iter().map(|e| e.size).sum();

        Ok(ArchiveInfoBuilder::new(CompressionType::Tar)
            .entries(entries)
            .total_uncompressed_size(total_uncompressed_size)
            .total_compressed_size(file_size)
            .supports_streaming(true)
            .supports_random_access(false)
            .analysis_status(analysis_status)
            .build())
    }

    /// 流式分析TAR文件（无文件大小）
    async fn analyze_tar_streaming_without_size(
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        println!("开始流式分析TAR文件（无文件大小信息）: {}", filename);

        // 读取头部验证格式
        let header_data = HttpClient::download_range(url, headers, 0, 64 * 1024).await?;

        if !Self::validate_tar_header(&header_data) {
            return Err("Invalid TAR header".to_string());
        }

        // 解析可用的条目
        let entries = Self::parse_partial_tar_entries(&header_data, 50)?;
        let total_uncompressed_size = entries.iter().map(|e| e.size).sum();

        Ok(ArchiveInfoBuilder::new(CompressionType::Tar)
            .entries(entries)
            .total_uncompressed_size(total_uncompressed_size)
            .supports_streaming(true)
            .supports_random_access(false)
            .analysis_status(AnalysisStatus::Streaming { estimated_entries: None })
            .build())
    }

    /// 从TAR文件提取预览
    async fn extract_tar_preview(
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        println!("开始从TAR文件提取预览: {}", entry_path);

        // 首先尝试流式预览
        if let Ok(preview) = Self::extract_tar_preview_streaming(url, headers, entry_path, max_size).await {
            return Ok(preview);
        }

        println!("TAR流式预览失败，回退到完整下载模式");

        // 回退到完整下载模式
        let tar_data = HttpClient::download_file(url, headers).await?;
        let cursor = Cursor::new(&tar_data);
        let mut archive = Archive::new(cursor);

        for entry_result in archive.entries().map_err(|e| e.to_string())? {
            match entry_result {
                Ok(mut entry) => {
                    let path = entry.path().map_err(|e| e.to_string())?;
                    if path.to_string_lossy() == entry_path {
                        let file_type = FileType::from_path(entry_path);
                        let total_size = entry.header().size().map_err(|e| e.to_string())?;

                        let preview_size = max_size.min(total_size as usize);
                        let mut buffer = vec![0u8; preview_size];
                        let bytes_read = entry.read(&mut buffer).map_err(|e| e.to_string())?;
                        buffer.truncate(bytes_read);

                        let content = if file_type.is_text() {
                            match String::from_utf8(buffer.clone()) {
                                Ok(text) => text,
                                Err(_) => TextDecoder::try_decode_text(buffer)?,
                            }
                        } else {
                            TextDecoder::format_binary_preview(buffer)
                        };

                        return Ok(PreviewBuilder::new()
                            .content(content)
                            .is_truncated(bytes_read < total_size as usize)
                            .total_size(total_size)
                            .file_type(file_type)
                            .build());
                    }
                }
                Err(e) => {
                    println!("Warning: Failed to read TAR entry: {}", e);
                    continue;
                }
            }
        }

        Err(format!("File '{}' not found in TAR archive", entry_path))
    }

    // 辅助方法
    fn validate_tar_header(data: &[u8]) -> bool {
        if data.len() < 512 {
            return false;
        }

        // 检查TAR文件的magic bytes
        let magic_ustar = &data[257..262];
        let magic_gnu = &data[257..265];

        magic_ustar == b"ustar" || magic_gnu == b"ustar  \0"
    }

    fn parse_partial_tar_entries(data: &[u8], max_entries: usize) -> Result<Vec<ArchiveEntry>, String> {
        let cursor = Cursor::new(data);
        let mut archive = Archive::new(cursor);
        let mut entries = Vec::new();

        for (index, entry_result) in archive.entries()
            .map_err(|e| e.to_string())?
            .enumerate()
            .take(max_entries)
        {
            match entry_result {
                Ok(entry) => {
                    let header = entry.header();
                    let path = entry.path().map_err(|e| e.to_string())?;
                    let size = header.size().map_err(|e| e.to_string())?;
                    let is_dir = header.entry_type().is_dir();

                    entries.push(ArchiveEntry {
                        path: path.to_string_lossy().to_string(),
                        size,
                        compressed_size: None,
                        is_dir,
                        modified_time: header.mtime().ok().and_then(|timestamp| {
                            // 将Unix时间戳转换为ISO格式的日期字符串
                            use std::time::{UNIX_EPOCH, Duration};
                            use chrono::{DateTime, Utc};

                            let duration = Duration::from_secs(timestamp);
                            let datetime = UNIX_EPOCH + duration;
                            let datetime: DateTime<Utc> = datetime.into();
                            Some(datetime.to_rfc3339())
                        }),
                        crc32: None,
                        index,
                        metadata: HashMap::new(),
                    });
                }
                Err(e) => {
                    println!("Warning: Failed to read TAR entry {}: {}", index, e);
                    break; // 遇到错误时停止解析，可能是数据不完整
                }
            }
        }

        Ok(entries)
    }

    async fn extract_tar_preview_streaming(
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        // 下载足够的数据来查找目标文件
        let chunk_size = 1024 * 1024; // 1MB chunks
        let mut offset = 0;
        let max_scan_size = 100 * 1024 * 1024; // 最多扫描100MB

        while offset < max_scan_size {
            let chunk_data = match HttpClient::download_range(url, headers, offset, chunk_size).await {
                Ok(data) => data,
                Err(_) => break,
            };

            if chunk_data.is_empty() {
                break;
            }

            // 在当前chunk中查找目标文件
            if let Ok(preview) = Self::scan_tar_chunk_for_file(&chunk_data, entry_path, max_size) {
                return Ok(preview);
            }

            offset += chunk_size;
        }

        Err(format!("File '{}' not found in TAR archive", entry_path))
    }

    fn scan_tar_chunk_for_file(
        chunk_data: &[u8],
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        let cursor = Cursor::new(chunk_data);
        let mut archive = Archive::new(cursor);

        for entry_result in archive.entries().map_err(|e| e.to_string())? {
            match entry_result {
                Ok(mut entry) => {
                    let path = entry.path().map_err(|e| e.to_string())?;
                    if path.to_string_lossy() == entry_path {
                        let file_type = FileType::from_path(entry_path);
                        let total_size = entry.header().size().map_err(|e| e.to_string())?;

                        let preview_size = max_size.min(total_size as usize);
                        let mut buffer = vec![0u8; preview_size];
                        let bytes_read = entry.read(&mut buffer).map_err(|e| e.to_string())?;
                        buffer.truncate(bytes_read);

                        let content = if file_type.is_text() {
                            match String::from_utf8(buffer.clone()) {
                                Ok(text) => text,
                                Err(_) => TextDecoder::try_decode_text(buffer)?,
                            }
                        } else {
                            TextDecoder::format_binary_preview(buffer)
                        };

                        return Ok(PreviewBuilder::new()
                            .content(content)
                            .is_truncated(bytes_read < total_size as usize)
                            .total_size(total_size)
                            .file_type(file_type)
                            .build());
                    }
                }
                Err(_) => {
                    // 忽略错误，继续查找
                    continue;
                }
            }
        }

        Err("File not found in this chunk".to_string())
    }
}
