/// 7z 格式处理器
use crate::archive::types::*;
use crate::archive::formats::{CompressionHandlerDispatcher, common::*};
use std::collections::HashMap;
use std::io::Cursor;

pub struct SevenZipHandler;

#[async_trait::async_trait]
impl CompressionHandlerDispatcher for SevenZipHandler {
    async fn analyze_complete(&self, data: &[u8]) -> Result<ArchiveInfo, String> {
        Self::analyze_7z_complete(data)
    }

    async fn analyze_streaming(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        // 7z 格式不支持流式分析，需要下载完整文件
        Self::analyze_7z_by_download(url, headers, filename, file_size).await
    }

    async fn analyze_streaming_without_size(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        // 7z 格式不支持流式分析，需要下载完整文件
        Self::analyze_7z_by_download_no_size(url, headers, filename).await
    }

    async fn extract_preview(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        Self::extract_7z_preview(url, headers, entry_path, max_size).await
    }

    async fn extract_preview_with_client(
        &self,
        _client: std::sync::Arc<dyn crate::storage::traits::StorageClient>,
        _file_path: &str,
        _entry_path: &str,
        _max_size: usize,
        _offset: Option<u64>,
        _progress_callback: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
        _cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<FilePreview, String> {
        Err("7z format does not support client-based extraction yet".to_string())
    }

    fn compression_type(&self) -> CompressionType {
        CompressionType::SevenZip
    }

    fn validate_format(&self, data: &[u8]) -> bool {
        Self::validate_7z_header(data)
    }
}

impl SevenZipHandler {
    /// 完整7z文件分析
    fn analyze_7z_complete(data: &[u8]) -> Result<ArchiveInfo, String> {
        println!("开始分析7z文件，数据长度: {} 字节", data.len());

        if !Self::validate_7z_header(data) {
            return Err("Invalid 7z header".to_string());
        }

        let cursor = Cursor::new(data);
        let mut archive = SevenZReader::new(cursor, data.len() as u64).map_err(|e| e.to_string())?;
        let mut entries = Vec::new();
        let mut total_uncompressed_size = 0;

        for (index, entry) in archive.entries().iter().enumerate() {
            let path = entry.name().to_string();
            let size = entry.size();
            let is_dir = entry.is_directory();
            let compressed_size = Some(entry.size()); // 7z 没有单独的压缩大小概念

            total_uncompressed_size += size;

            // 处理修改时间
            let modified_time = entry.last_write_time().and_then(|timestamp| {
                use std::time::{UNIX_EPOCH, Duration};
                use chrono::{DateTime, Utc};

                // Windows FILETIME 转换为 Unix 时间戳
                let unix_timestamp = (timestamp - 116444736000000000) / 10000000;
                let duration = Duration::from_secs(unix_timestamp);
                let datetime = UNIX_EPOCH + duration;
                let datetime: DateTime<Utc> = datetime.into();
                Some(datetime.to_rfc3339())
            });

            entries.push(ArchiveEntry {
                path,
                size,
                compressed_size: Some(compressed_size),
                is_dir,
                modified_time,
                crc32: entry.crc32(),
                index,
                metadata: HashMap::new(),
            });
        }

        Ok(ArchiveInfoBuilder::new(CompressionType::SevenZip)
            .entries(entries)
            .total_uncompressed_size(total_uncompressed_size)
            .total_compressed_size(data.len() as u64)
            .supports_streaming(false)
            .supports_random_access(true)
            .analysis_status(AnalysisStatus::Complete)
            .build())
    }

    /// 通过下载完整文件分析7z（有文件大小）
    async fn analyze_7z_by_download(
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        println!("开始下载7z文件进行分析: {} (大小: {} 字节)", filename, file_size);

        let data = HttpClient::download_file(url, headers).await?;
        Self::analyze_7z_complete(&data)
    }

    /// 通过下载完整文件分析7z（无文件大小）
    async fn analyze_7z_by_download_no_size(
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        println!("开始下载7z文件进行分析: {}", filename);

        let data = HttpClient::download_file(url, headers).await?;

        Self::analyze_7z_complete(&data)
    }

    /// 提取7z文件预览
    async fn extract_7z_preview(
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        println!("开始从7z文件提取预览: {}", entry_path);

        // 下载完整文件
        let data = HttpClient::download_file(url, headers).await?;
        let cursor = Cursor::new(data);
        let mut archive = SevenZArchive::read(cursor).map_err(|e| e.to_string())?;

        // 查找目标文件
        for entry in archive.entries() {
            if entry.name() == entry_path && !entry.is_directory() {
                let mut output = Vec::new();
                archive.extract_to_writer(entry, &mut output).map_err(|e| e.to_string())?;


                let total_size = entry.size();
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

        Err(format!("File '{}' not found in 7z archive", entry_path))
    }

    /// 验证7z文件头
    fn validate_7z_header(data: &[u8]) -> bool {
        if data.len() < 6 {
            return false;
        }

        // 7z 文件签名: "7z\xbc\xaf\x27\x1c"
        data[0] == 0x37 && data[1] == 0x7a && data[2] == 0xbc &&
        data[3] == 0xaf && data[4] == 0x27 && data[5] == 0x1c
    }
}
