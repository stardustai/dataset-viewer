/// TAR.GZ 格式处理器（组合GZIP和TAR）
use crate::archive::types::*;
use crate::archive::formats::{CompressionHandlerDispatcher, common::*};
use std::collections::HashMap;
use std::io::{Cursor, Read};
use flate2::read::GzDecoder;
use tar::Archive;

pub struct TarGzHandler;

#[async_trait::async_trait]
impl CompressionHandlerDispatcher for TarGzHandler {
    async fn analyze_complete(&self, data: &[u8]) -> Result<ArchiveInfo, String> {
        Self::analyze_tar_gz_complete(data)
    }

    async fn analyze_streaming(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        Self::analyze_tar_gz_streaming(url, headers, filename, file_size).await
    }

    async fn analyze_streaming_without_size(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        Self::analyze_tar_gz_streaming_without_size(url, headers, filename).await
    }

    async fn extract_preview(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        Self::extract_tar_gz_preview(url, headers, entry_path, max_size).await
    }

    fn compression_type(&self) -> CompressionType {
        CompressionType::TarGz
    }

    fn validate_format(&self, data: &[u8]) -> bool {
        Self::validate_tar_gz_header(data)
    }
}

impl TarGzHandler {
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
                        modified_time: header.mtime().ok().map(|t| t.to_string()),
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

    /// 流式分析TAR.GZ文件
    async fn analyze_tar_gz_streaming(
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        println!("开始流式分析TAR.GZ文件: {} (大小: {} 字节)", filename, file_size);

        // 下载头部数据用于验证和部分解析
        let sample_size = (2 * 1024 * 1024).min(file_size); // 2MB sample
        let sample_data = HttpClient::download_range(url, headers, 0, sample_size).await?;

        if !Self::validate_tar_gz_header(&sample_data) {
            return Err("Invalid TAR.GZ header".to_string());
        }

        // 尝试部分解压缩和解析TAR条目
        let entries = Self::parse_partial_tar_gz_entries(&sample_data, 100)?;

        let analysis_status = if entries.len() >= 100 {
            AnalysisStatus::Streaming { estimated_entries: None }
        } else {
            AnalysisStatus::Complete
        };

        let total_uncompressed_size = entries.iter().map(|e| e.size).sum();

        Ok(ArchiveInfoBuilder::new(CompressionType::TarGz)
            .entries(entries)
            .total_uncompressed_size(total_uncompressed_size)
            .total_compressed_size(file_size)
            .supports_streaming(true)
            .supports_random_access(false)
            .analysis_status(analysis_status)
            .build())
    }

    /// 流式分析TAR.GZ文件（无文件大小）
    async fn analyze_tar_gz_streaming_without_size(
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        println!("开始流式分析TAR.GZ文件（无文件大小信息）: {}", filename);

        // 下载头部数据
        let sample_data = HttpClient::download_range(url, headers, 0, 1024 * 1024).await?;

        if !Self::validate_tar_gz_header(&sample_data) {
            return Err("Invalid TAR.GZ header".to_string());
        }

        // 解析可用的条目
        let entries = Self::parse_partial_tar_gz_entries(&sample_data, 50)?;
        let total_uncompressed_size = entries.iter().map(|e| e.size).sum();

        Ok(ArchiveInfoBuilder::new(CompressionType::TarGz)
            .entries(entries)
            .total_uncompressed_size(total_uncompressed_size)
            .supports_streaming(true)
            .supports_random_access(false)
            .analysis_status(AnalysisStatus::Streaming { estimated_entries: None })
            .build())
    }

    /// 从TAR.GZ文件提取预览
    async fn extract_tar_gz_preview(
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        println!("开始从TAR.GZ文件提取预览: {}", entry_path);

        // 首先尝试流式预览
        if let Ok(preview) = Self::extract_tar_gz_preview_streaming(url, headers, entry_path, max_size).await {
            return Ok(preview);
        }

        println!("TAR.GZ流式预览失败，回退到完整下载模式");

        // 回退到完整下载模式
        let compressed_data = HttpClient::download_file(url, headers).await?;

        if !Self::validate_tar_gz_header(&compressed_data) {
            return Err("Invalid TAR.GZ header".to_string());
        }

        let gz_decoder = GzDecoder::new(Cursor::new(&compressed_data));
        let mut tar_archive = Archive::new(gz_decoder);

        for entry_result in tar_archive.entries().map_err(|e| e.to_string())? {
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
                    println!("Warning: Failed to read TAR.GZ entry: {}", e);
                    continue;
                }
            }
        }

        Err(format!("File '{}' not found in TAR.GZ archive", entry_path))
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

    fn parse_partial_tar_gz_entries(data: &[u8], max_entries: usize) -> Result<Vec<ArchiveEntry>, String> {
        let gz_decoder = GzDecoder::new(Cursor::new(data));
        let mut tar_archive = Archive::new(gz_decoder);
        let mut entries = Vec::new();

        for (index, entry_result) in tar_archive.entries()
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
                        modified_time: header.mtime().ok().map(|t| t.to_string()),
                        crc32: None,
                        index,
                        metadata: HashMap::new(),
                    });
                }
                Err(e) => {
                    println!("Warning: Failed to read TAR.GZ entry {}: {}", index, e);
                    break; // 遇到错误时停止解析
                }
            }
        }

        Ok(entries)
    }

    async fn extract_tar_gz_preview_streaming(
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        // 为了在TAR.GZ中找到特定文件，需要解压缩更多数据
        // 这里使用递增的chunk大小策略
        let chunk_sizes = [2 * 1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024]; // 2MB, 5MB, 10MB

        for &chunk_size in &chunk_sizes {
            match HttpClient::download_range(url, headers, 0, chunk_size).await {
                Ok(chunk_data) => {
                    if let Ok(preview) = Self::scan_tar_gz_chunk_for_file(&chunk_data, entry_path, max_size) {
                        return Ok(preview);
                    }
                }
                Err(_) => {
                    // 如果范围请求失败，尝试下载整个文件
                    break;
                }
            }
        }

        Err(format!("File '{}' not found in available TAR.GZ data", entry_path))
    }

    fn scan_tar_gz_chunk_for_file(
        chunk_data: &[u8],
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        if !Self::validate_tar_gz_header(chunk_data) {
            return Err("Invalid TAR.GZ header".to_string());
        }

        let gz_decoder = GzDecoder::new(Cursor::new(chunk_data));
        let mut tar_archive = Archive::new(gz_decoder);

        for entry_result in tar_archive.entries().map_err(|e| e.to_string())? {
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
