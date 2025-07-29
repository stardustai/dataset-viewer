/// RAR 格式处理器
use crate::archive::types::*;
use crate::archive::formats::{CompressionHandlerDispatcher, common::*};
use std::collections::HashMap;
use unrar::Archive as RarArchive;

pub struct RarHandler;

#[async_trait::async_trait]
impl CompressionHandlerDispatcher for RarHandler {
    async fn analyze_complete(&self, data: &[u8]) -> Result<ArchiveInfo, String> {
        Self::analyze_rar_complete(data)
    }

    async fn analyze_streaming(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        // RAR 格式不支持流式分析，需要下载完整文件
        Self::analyze_rar_by_download(url, headers, filename, file_size).await
    }

    async fn analyze_streaming_without_size(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        // RAR 格式不支持流式分析，需要下载完整文件
        Self::analyze_rar_by_download_no_size(url, headers, filename).await
    }

    async fn extract_preview(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        Self::extract_rar_preview(url, headers, entry_path, max_size).await
    }

    fn compression_type(&self) -> CompressionType {
        CompressionType::Rar
    }

    fn validate_format(&self, data: &[u8]) -> bool {
        Self::validate_rar_header(data)
    }
}

impl RarHandler {
    /// 完整RAR文件分析
    fn analyze_rar_complete(data: &[u8]) -> Result<ArchiveInfo, String> {
        println!("开始分析RAR文件，数据长度: {} 字节", data.len());

        if !Self::validate_rar_header(data) {
            return Err("Invalid RAR header".to_string());
        }

        // 创建临时文件，因为unrar库需要文件路径
        let temp_path = format!("/tmp/temp_rar_{}.rar", uuid::Uuid::new_v4());
        std::fs::write(&temp_path, data).map_err(|e| e.to_string())?;

        let result = Self::analyze_rar_file(&temp_path);

        // 清理临时文件
        let _ = std::fs::remove_file(&temp_path);

        result
    }

    /// 分析RAR文件
    fn analyze_rar_file(file_path: &str) -> Result<ArchiveInfo, String> {
        let archive = RarArchive::new(file_path.to_string());
        let mut entries = Vec::new();
        let mut total_uncompressed_size = 0;
        let mut total_compressed_size = 0;

        for (index, entry_result) in archive.iter().enumerate() {
            match entry_result {
                Ok(entry) => {
                    let path = entry.filename.clone();
                    let size = entry.unpacked_size;
                    let compressed_size = entry.packed_size;
                    let is_dir = entry.is_directory();

                    total_uncompressed_size += size;
                    total_compressed_size += compressed_size;

                    // 处理修改时间
                    let modified_time = entry.file_time.and_then(|_ft| {
                        // DOS时间转换为Unix时间戳（简化处理）
                        // 这里需要具体的时间转换逻辑
                        None // 暂时返回None，可以后续完善
                    });

                    entries.push(ArchiveEntry {
                        path,
                        size,
                        compressed_size: Some(compressed_size),
                        is_dir,
                        modified_time,
                        crc32: Some(entry.crc),
                        index,
                        metadata: HashMap::new(),
                    });
                }
                Err(e) => {
                    println!("Warning: Failed to read RAR entry {}: {}", index, e);
                    continue;
                }
            }
        }

        Ok(ArchiveInfoBuilder::new(CompressionType::Rar)
            .entries(entries)
            .total_uncompressed_size(total_uncompressed_size)
            .total_compressed_size(total_compressed_size)
            .supports_streaming(false)
            .supports_random_access(true)
            .analysis_status(AnalysisStatus::Complete)
            .build())
    }

    /// 通过下载完整文件分析RAR（有文件大小）
    async fn analyze_rar_by_download(
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        println!("开始下载RAR文件进行分析: {} (大小: {} 字节)", filename, file_size);

        // 限制最大下载大小（比如100MB）
        const MAX_DOWNLOAD_SIZE: u64 = 100 * 1024 * 1024;
        if file_size > MAX_DOWNLOAD_SIZE {
            return Err(format!("RAR file is too large for analysis: {} bytes (max: {} bytes)",
                             file_size, MAX_DOWNLOAD_SIZE));
        }

        let data = HttpClient::download_file(url, headers).await?;
        Self::analyze_rar_complete(&data)
    }

    /// 通过下载完整文件分析RAR（无文件大小）
    async fn analyze_rar_by_download_no_size(
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        println!("开始下载RAR文件进行分析: {}", filename);

        let data = HttpClient::download_file(url, headers).await?;

        // 检查下载的文件大小
        const MAX_DOWNLOAD_SIZE: usize = 100 * 1024 * 1024;
        if data.len() > MAX_DOWNLOAD_SIZE {
            return Err(format!("RAR file is too large for analysis: {} bytes (max: {} bytes)",
                             data.len(), MAX_DOWNLOAD_SIZE));
        }

        Self::analyze_rar_complete(&data)
    }

    /// 提取RAR文件预览
    async fn extract_rar_preview(
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        println!("开始从RAR文件提取预览: {}", entry_path);

        // 下载完整文件
        let data = HttpClient::download_file(url, headers).await?;

        // 创建临时文件
        let temp_path = format!("/tmp/temp_rar_{}.rar", uuid::Uuid::new_v4());
        std::fs::write(&temp_path, data).map_err(|e| e.to_string())?;

        let result = Self::extract_from_rar_file(&temp_path, entry_path, max_size);

        // 清理临时文件
        let _ = std::fs::remove_file(&temp_path);

        result
    }

    /// 从RAR文件提取内容
    fn extract_from_rar_file(
        file_path: &str,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        let archive = RarArchive::new(file_path.to_string());

        for entry_result in archive.iter() {
            match entry_result {
                Ok(entry) => {
                    if entry.filename == entry_path && !entry.is_directory() {
                        // 提取文件到内存
                        let mut output = Vec::new();
                        entry.extract_to_writer(&mut output).map_err(|e| e.to_string())?;


                        let total_size = entry.unpacked_size;
                        let preview_size = max_size.min(output.len());

                        // 限制预览大小
                        if output.len() > preview_size {
                            output.truncate(preview_size);
                        }

                        let content = if file_type.is_text() {
                            match String::from_utf8(output.clone()) {
                                Ok(text) => text,
                                Err(_) => TextDecoder::try_decode_text(output)?,
                            }
                        } else {
                            TextDecoder::format_binary_preview(output)
                        };

                        return Ok(PreviewBuilder::new()
                            .content(content)
                            .with_truncated(preview_size < total_size as usize)
                            .total_size(total_size)
                
                            .build());
                    }
                }
                Err(e) => {
                    println!("Warning: Failed to read RAR entry: {}", e);
                    continue;
                }
            }
        }

        Err(format!("File '{}' not found in RAR archive", entry_path))
    }

    /// 验证RAR文件头
    fn validate_rar_header(data: &[u8]) -> bool {
        if data.len() < 7 {
            return false;
        }

        // RAR 4.x 签名: "Rar!\x1a\x07\x00"
        if data[0] == 0x52 && data[1] == 0x61 && data[2] == 0x72 &&
           data[3] == 0x21 && data[4] == 0x1a && data[5] == 0x07 && data[6] == 0x00 {
            return true;
        }

        // RAR 5.x 签名: "Rar!\x1a\x07\x01"
        if data[0] == 0x52 && data[1] == 0x61 && data[2] == 0x72 &&
           data[3] == 0x21 && data[4] == 0x1a && data[5] == 0x07 && data[6] == 0x01 {
            return true;
        }

        false
    }
}
