use crate::archive::formats::common::ArchiveInfoBuilder;
use crate::archive::formats::CompressionHandlerDispatcher;
use crate::archive::types::{
    AnalysisStatus, ArchiveEntry, ArchiveInfo, CompressionType, FilePreview,
};
use crate::storage::traits::StorageClient;
use flate2::read::GzDecoder;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::sync::Arc;

pub struct TarGzHandler;

#[async_trait::async_trait]
impl CompressionHandlerDispatcher for TarGzHandler {
    async fn analyze_with_client(
        &self,
        client: Arc<dyn StorageClient>,
        file_path: &str,
        _filename: &str,
        _max_size: Option<u32>,
    ) -> Result<ArchiveInfo, String> {
        Self::analyze_tar_gz_streaming(client, file_path).await
    }

    async fn extract_preview_with_client(
        &self,
        client: Arc<dyn StorageClient>,
        file_path: &str,
        entry_path: &str,
        max_size: usize,
        _offset: Option<u64>,
        progress_callback: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
        _cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<FilePreview, String> {
        Self::extract_tar_gz_preview_with_progress(
            client,
            file_path,
            entry_path,
            max_size,
            progress_callback,
        )
        .await
    }

    fn compression_type(&self) -> CompressionType {
        CompressionType::TarGz
    }

    fn validate_format(&self, data: &[u8]) -> bool {
        Self::validate_tar_gz_header(data)
    }
}

impl TarGzHandler {
    /// 高效流式分析TAR.GZ文件，采用增量解压缩策略
    async fn analyze_tar_gz_streaming(
        client: Arc<dyn StorageClient>,
        file_path: &str,
    ) -> Result<ArchiveInfo, String> {
        log::debug!("开始高效流式分析TAR.GZ文件: {}", file_path);

        let file_size = client
            .get_file_size(file_path)
            .await
            .map_err(|e| format!("Failed to get file size: {}", e))?;

        log::info!(
            "TAR.GZ文件大小: {:.2} MB",
            file_size as f64 / (1024.0 * 1024.0)
        );

        // 采用极小的初始读取策略，类似TAR格式的高效处理
        let mut entries = Vec::new();
        let mut total_uncompressed_size = 0u64;
        let mut compressed_offset = 0u64;
        let mut decompressed_buffer = Vec::new();

        // 初始读取量很小，类似于TAR只读头部的策略
        let initial_read_size = 32 * 1024; // 32KB 开始
        let max_read_size = 2 * 1024 * 1024; // 最多读取2MB用于分析
        let target_entries = 100; // 目标获取100个条目就足够了

        let mut current_read_size = initial_read_size;

        while compressed_offset < file_size
            && compressed_offset < max_read_size
            && entries.len() < target_entries
        {
            let remaining = std::cmp::min(file_size - compressed_offset, current_read_size);

            log::debug!(
                "读取压缩数据块: offset={}, size={}",
                compressed_offset,
                remaining
            );

            let chunk = client
                .read_file_range(file_path, compressed_offset, remaining)
                .await
                .map_err(|e| format!("Failed to read chunk: {}", e))?;

            compressed_offset += chunk.len() as u64;

            // 尝试增量解压缩这个chunk
            match Self::incremental_decompress_chunk(&chunk, &mut decompressed_buffer) {
                Ok(newly_decompressed) => {
                    log::debug!("成功解压缩 {} 字节", newly_decompressed);

                    // 解析新的TAR条目
                    let new_entries =
                        Self::parse_new_tar_entries(&decompressed_buffer, entries.len())?;
                    for entry in new_entries {
                        if let Ok(size) = entry.size.parse::<u64>() {
                            total_uncompressed_size += size;
                        }
                        entries.push(entry);
                    }

                    log::debug!("当前已解析 {} 个条目", entries.len());

                    // 如果获得了足够的条目，提前停止
                    if entries.len() >= target_entries {
                        log::debug!("已获得足够的文件条目 ({}), 停止分析", entries.len());
                        break;
                    }
                }
                Err(e) if e.contains("need more data") => {
                    // 需要更多数据，增加读取量
                    current_read_size = std::cmp::min(current_read_size * 2, 256 * 1024);
                    log::debug!("需要更多数据，增加读取量到 {}", current_read_size);
                    continue;
                }
                Err(e) => {
                    log::warn!("解压缩失败: {}, 尝试用现有数据", e);
                    // 即使失败也尝试解析已有数据
                    let new_entries =
                        Self::parse_new_tar_entries(&decompressed_buffer, entries.len())?;
                    entries.extend(new_entries);
                    break;
                }
            }

            // 适度增加读取大小，但保持较小以维持性能
            current_read_size = std::cmp::min(current_read_size + 16384, 128 * 1024);
        }

        log::info!(
            "高效分析完成：读取 {:.2} MB 压缩数据，找到 {} 个条目",
            compressed_offset as f64 / (1024.0 * 1024.0),
            entries.len()
        );

        // 确定分析状态
        let analysis_status = if compressed_offset < file_size || entries.len() >= target_entries {
            AnalysisStatus::Partial {
                analyzed_entries: entries.len() as u32,
            }
        } else {
            AnalysisStatus::Complete
        };

        Ok(ArchiveInfoBuilder::new(CompressionType::TarGz)
            .entries(entries.clone())
            .total_entries(entries.len() as u32)
            .total_uncompressed_size(total_uncompressed_size)
            .total_compressed_size(file_size)
            .supports_streaming(true)
            .supports_random_access(false)
            .analysis_status(analysis_status)
            .build())
    }

    /// 增量解压缩单个数据块
    fn incremental_decompress_chunk(
        chunk: &[u8],
        decompressed_buffer: &mut Vec<u8>,
    ) -> Result<usize, String> {
        let mut decoder = GzDecoder::new(chunk);
        let mut temp_buffer = vec![0u8; 64 * 1024]; // 64KB临时缓冲区
        let initial_len = decompressed_buffer.len();

        loop {
            match decoder.read(&mut temp_buffer) {
                Ok(0) => {
                    // 读取完成
                    break;
                }
                Ok(bytes_read) => {
                    decompressed_buffer.extend_from_slice(&temp_buffer[..bytes_read]);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                    // 需要更多压缩数据
                    if decompressed_buffer.len() == initial_len {
                        return Err("need more data".to_string());
                    } else {
                        // 已经解压了一些数据，返回成功
                        break;
                    }
                }
                Err(e) => {
                    return Err(format!("Decompression error: {}", e));
                }
            }
        }

        let newly_decompressed = decompressed_buffer.len() - initial_len;
        Ok(newly_decompressed)
    }

    /// 解析新的TAR条目（从指定位置开始）
    fn parse_new_tar_entries(
        decompressed_buffer: &[u8],
        existing_entries_count: usize,
    ) -> Result<Vec<ArchiveEntry>, String> {
        let mut entries = Vec::new();
        let mut tar_offset = 0;
        let mut current_entry_index = 0;

        // 跳过已经解析的条目
        while tar_offset + 512 <= decompressed_buffer.len()
            && current_entry_index < existing_entries_count
        {
            let header = &decompressed_buffer[tar_offset..tar_offset + 512];

            if header.iter().all(|&b| b == 0) {
                tar_offset += 512;
                continue;
            }

            // 解析文件大小来跳过
            if let Ok(file_size) = Self::parse_tar_file_size(header) {
                let aligned_size = (file_size + 511) & !511;
                tar_offset += 512 + aligned_size as usize;
                current_entry_index += 1;
            } else {
                tar_offset += 512;
            }
        }

        // 解析新的条目
        while tar_offset + 512 <= decompressed_buffer.len() && entries.len() < 50 {
            let header = &decompressed_buffer[tar_offset..tar_offset + 512];

            if header.iter().all(|&b| b == 0) {
                // TAR结束标记
                break;
            }

            match Self::parse_tar_header_from_bytes(
                header,
                (existing_entries_count + entries.len()) as u32,
            ) {
                Ok(entry) => {
                    let file_size = entry.size.parse::<u64>().unwrap_or(0);
                    entries.push(entry);

                    // 跳过文件内容
                    let aligned_size = (file_size + 511) & !511;
                    tar_offset += 512 + aligned_size as usize;
                }
                Err(_) => {
                    // 跳过无效头部
                    tar_offset += 512;
                }
            }
        }

        Ok(entries)
    }

    /// 快速解析TAR文件大小（不完整解析，只获取大小）
    fn parse_tar_file_size(header: &[u8]) -> Result<u64, String> {
        if header.len() < 136 {
            return Err("Header too short".to_string());
        }

        let size_bytes = &header[124..136];
        let size_binding = String::from_utf8_lossy(size_bytes);
        let size_str = size_binding.trim_end_matches('\0');

        u64::from_str_radix(size_str.trim(), 8)
            .map_err(|_| format!("Invalid size field: {}", size_str))
    }

    /// 从字节解析TAR头部
    fn parse_tar_header_from_bytes(header: &[u8], index: u32) -> Result<ArchiveEntry, String> {
        if header.len() < 512 {
            return Err("Header too short".to_string());
        }

        // 解析文件名 (0-99)
        let name_bytes = &header[0..100];
        let name_end = name_bytes.iter().position(|&b| b == 0).unwrap_or(100);
        let file_name = String::from_utf8_lossy(&name_bytes[..name_end]).to_string();

        if file_name.is_empty() {
            return Err("Empty filename".to_string());
        }

        // 解析文件大小 (124-135)
        let size_bytes = &header[124..136];
        let size_binding = String::from_utf8_lossy(size_bytes);
        let size_str = size_binding.trim_end_matches('\0');
        let file_size = u64::from_str_radix(size_str.trim(), 8)
            .map_err(|_| format!("Invalid file size: {}", size_str))?;

        // 解析文件类型 (156)
        let type_flag = header[156];
        let is_dir = type_flag == b'5' || file_name.ends_with('/');

        Ok(ArchiveEntry {
            path: file_name,
            size: file_size.to_string(),
            compressed_size: None,
            is_dir,
            modified_time: None,
            crc32: None,
            index,
            metadata: HashMap::new(),
        })
    }

    /// 提取TAR.GZ文件预览，支持进度回调
    async fn extract_tar_gz_preview_with_progress(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        entry_path: &str,
        max_size: usize,
        progress_callback: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
    ) -> Result<FilePreview, String> {
        log::debug!("开始提取TAR.GZ文件预览: {}", entry_path);

        let file_size = client
            .get_file_size(file_path)
            .await
            .map_err(|e| format!("Failed to get file size: {}", e))?;

        // 使用渐进式读取策略
        let initial_size = 1024 * 1024; // 1MB
        let max_read = (file_size / 4).max(initial_size).min(50 * 1024 * 1024); // 最多50MB

        let compressed_data = client
            .read_file_range(file_path, 0, max_read)
            .await
            .map_err(|e| format!("Failed to read compressed data: {}", e))?;

        if let Some(callback) = progress_callback.as_ref() {
            callback(max_read, file_size);
        }

        // 解压缩数据
        let mut decoder = GzDecoder::new(Cursor::new(&compressed_data));
        let mut decompressed_data = Vec::new();

        match decoder.read_to_end(&mut decompressed_data) {
            Ok(_) => {
                log::debug!("解压缩成功，开始搜索文件");
            }
            Err(e) => {
                log::warn!("解压缩部分失败: {}", e);
                // 即使失败也尝试处理部分数据
            }
        }

        // 在TAR数据中查找目标文件
        match Self::extract_file_from_tar_buffer(&decompressed_data, entry_path, max_size) {
            Ok(content) => {
                log::debug!("成功找到目标文件: {}", entry_path);
                return Ok(FilePreview {
                    content: content.clone(),
                    is_truncated: content.len() >= max_size,
                    total_size: content.len().to_string(),
                    preview_size: content.len() as u32,
                });
            }
            Err(e) => {
                log::warn!("在初始数据中未找到文件: {}", e);
            }
        }

        // 如果初始读取未找到，尝试读取更多数据
        if max_read < file_size {
            log::debug!(
                "扩展搜索范围到 {:.2} MB",
                file_size as f64 / (1024.0 * 1024.0)
            );

            let extended_size = file_size.min(100 * 1024 * 1024); // 最多100MB
            let extended_data = client
                .read_file_range(file_path, 0, extended_size)
                .await
                .map_err(|e| format!("Failed to read extended data: {}", e))?;

            if let Some(callback) = progress_callback.as_ref() {
                callback(extended_size, file_size);
            }

            let mut decoder = GzDecoder::new(Cursor::new(&extended_data));
            let mut extended_tar_data = Vec::new();

            match decoder.read_to_end(&mut extended_tar_data) {
                Ok(_) => {
                    match Self::extract_file_from_tar_buffer(
                        &extended_tar_data,
                        entry_path,
                        max_size,
                    ) {
                        Ok(content) => {
                            log::debug!("在扩展数据中找到目标文件: {}", entry_path);
                            return Ok(FilePreview {
                                content: content.clone(),
                                is_truncated: content.len() >= max_size,
                                total_size: content.len().to_string(),
                                preview_size: content.len() as u32,
                            });
                        }
                        Err(e) => {
                            log::warn!("扩展搜索也未找到文件: {}", e);
                        }
                    }
                }
                Err(e) => {
                    log::warn!("扩展数据解压缩失败: {}", e);
                }
            }
        }

        Err(format!("File not found in TAR.GZ archive: {}", entry_path))
    }

    /// 从TAR缓冲区提取指定文件
    fn extract_file_from_tar_buffer(
        buffer: &[u8],
        target_path: &str,
        max_size: usize,
    ) -> Result<Vec<u8>, String> {
        let mut offset = 0;

        while offset + 512 <= buffer.len() {
            let header = &buffer[offset..offset + 512];

            // 检查是否为空块
            if header.iter().all(|&b| b == 0) {
                offset += 512;
                continue;
            }

            // 解析文件名
            let name_bytes = &header[0..100];
            let name_end = name_bytes.iter().position(|&b| b == 0).unwrap_or(100);
            let file_name = String::from_utf8_lossy(&name_bytes[..name_end]);

            // 解析文件大小
            let size_bytes = &header[124..136];
            let size_binding = String::from_utf8_lossy(size_bytes);
            let size_str = size_binding.trim_end_matches('\0');
            let file_size = u64::from_str_radix(size_str.trim(), 8)
                .map_err(|_| format!("Invalid file size in TAR header: {}", size_str))?;

            offset += 512; // 跳过头部

            // 检查是否为目标文件
            if file_name == target_path {
                let content_size = (file_size as usize).min(max_size);
                if offset + content_size <= buffer.len() {
                    return Ok(buffer[offset..offset + content_size].to_vec());
                } else {
                    return Err("File content not fully available in buffer".to_string());
                }
            }

            // 跳过文件内容（512字节对齐）
            let aligned_size = (file_size + 511) & !511;
            offset += aligned_size as usize;
        }

        Err(format!("File '{}' not found in TAR buffer", target_path))
    }

    /// 验证TAR.GZ头部
    fn validate_tar_gz_header(data: &[u8]) -> bool {
        // 首先检查GZIP头部
        if data.len() < 3 || data[0] != 0x1f || data[1] != 0x8b || data[2] != 0x08 {
            return false;
        }

        // 简单验证：如果是GZIP格式，假设内容是TAR
        // 更严格的验证需要部分解压缩，但为了性能先简化
        true
    }
}
