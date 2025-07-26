/// ZIP 格式处理器
use crate::archive::types::*;
use crate::archive::formats::{CompressionHandlerDispatcher, common::*};
use crate::storage::traits::StorageClient;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::sync::Arc;
use zip::ZipArchive;

pub struct ZipHandler;

#[async_trait::async_trait]
impl CompressionHandlerDispatcher for ZipHandler {
    async fn analyze_complete(&self, data: &[u8]) -> Result<ArchiveInfo, String> {
        Self::analyze_zip_complete(data)
    }

    async fn analyze_streaming(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        Self::analyze_zip_streaming(url, headers, filename, file_size).await
    }

    async fn analyze_streaming_without_size(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        Self::analyze_zip_streaming_without_size(url, headers, filename).await
    }

    async fn extract_preview(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        Self::extract_zip_preview(url, headers, entry_path, max_size).await
    }

    async fn analyze_with_client(
        &self,
        client: Arc<dyn StorageClient>,
        file_path: &str,
        _filename: &str,
        max_size: Option<usize>,
    ) -> Result<ArchiveInfo, String> {
        // 尝试获取文件大小
        let file_size = client.get_file_size(file_path).await
            .map_err(|e| format!("Failed to get file size: {}", e))?;

        // 如果有大小限制且文件较小，读取完整文件
        if let Some(limit) = max_size {
            if file_size <= limit as u64 {
                let data = client.read_full_file(file_path).await
                    .map_err(|e| format!("Failed to read file: {}", e))?;
                return Self::analyze_zip_complete(&data);
            }
        }

        // 对于大文件，使用分块读取来模拟流式处理
        Self::analyze_zip_with_client(client, file_path, file_size).await
    }

    async fn extract_preview_with_client(
        &self,
        client: Arc<dyn StorageClient>,
        file_path: &str,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        Self::extract_zip_preview_with_client(client, file_path, entry_path, max_size).await
    }

    fn compression_type(&self) -> CompressionType {
        CompressionType::Zip
    }

    fn validate_format(&self, data: &[u8]) -> bool {
        data.len() >= 4 && {
            let signature = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
            signature == 0x04034b50 || signature == 0x02014b50
        }
    }
}

impl ZipHandler {
    /// 完整ZIP文件分析
    fn analyze_zip_complete(data: &[u8]) -> Result<ArchiveInfo, String> {
        let cursor = Cursor::new(data);
        let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

        let mut entries = Vec::new();
        let mut total_uncompressed_size = 0;

        for i in 0..archive.len() {
            match archive.by_index(i) {
                Ok(file) => {
                    total_uncompressed_size += file.size();

                    entries.push(ArchiveEntry {
                        path: file.name().to_string(),
                        size: file.size(),
                        compressed_size: Some(file.compressed_size()),
                        is_dir: file.is_dir(),
                        modified_time: None,
                        crc32: Some(file.crc32()),
                        index: i,
                        metadata: HashMap::new(),
                    });
                }
                Err(e) => {
                    println!("Warning: Failed to read entry {}: {}", i, e);
                    continue;
                }
            }
        }

        Ok(ArchiveInfoBuilder::new(CompressionType::Zip)
            .entries(entries)
            .total_uncompressed_size(total_uncompressed_size)
            .total_compressed_size(data.len() as u64)
            .supports_streaming(true)
            .supports_random_access(true)
            .analysis_status(AnalysisStatus::Complete)
            .build())
    }

    /// 流式分析ZIP文件
    async fn analyze_zip_streaming(
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        println!("开始分析ZIP文件: {} (大小: {} 字节)", filename, file_size);

        // 读取文件头部和尾部
        let header_size = (1024 * 1024).min(file_size / 2);
        let tail_size = (5 * 1024 * 1024).min(file_size / 2);

        let header_data = HttpClient::download_range(url, headers, 0, header_size).await?;
        let tail_start = file_size.saturating_sub(tail_size);
        let tail_data = HttpClient::download_range(url, headers, tail_start, tail_size).await?;

        // 验证ZIP签名
        if !Self::validate_zip_signature(&header_data) {
            return Err("Invalid ZIP signature".to_string());
        }

        // 查找并解析EOCD记录
        if let Some(eocd_info) = Self::find_eocd_in_tail(&tail_data)? {
            let mut entries = Vec::new();

            // 尝试读取中央目录
            if eocd_info.total_entries <= 1000 {
                if let Ok(cd_entries) = Self::read_central_directory(url, headers, &eocd_info).await {
                    entries = cd_entries;
                }
            }

            // 如果没有读取到具体条目，创建占位符
            if entries.is_empty() {
                entries.push(Self::create_placeholder_entry(filename, file_size));
            }

            let is_streaming = entries.len() == 1;

            Ok(ArchiveInfoBuilder::new(CompressionType::Zip)
                .entries(entries)
                .total_entries(eocd_info.total_entries)
                .total_uncompressed_size(eocd_info.uncompressed_size)
                .total_compressed_size(file_size)
                .supports_streaming(true)
                .supports_random_access(true)
                .analysis_status(if is_streaming {
                    AnalysisStatus::Streaming { estimated_entries: Some(eocd_info.total_entries) }
                } else {
                    AnalysisStatus::Complete
                })
                .build())
        } else {
            Err("Could not find EOCD record in ZIP file".to_string())
        }
    }

    /// 流式分析ZIP文件（无文件大小）
    async fn analyze_zip_streaming_without_size(
        url: &str,
        headers: &HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        println!("开始分析ZIP文件（无文件大小信息）: {}", filename);

        let header_data = HttpClient::download_range(url, headers, 0, 1024).await?;

        if !Self::validate_zip_signature(&header_data) {
            return Err("Invalid ZIP signature".to_string());
        }

        let entry = Self::create_placeholder_entry(filename, 0);

        Ok(ArchiveInfoBuilder::new(CompressionType::Zip)
            .entries(vec![entry])
            .total_entries(1)
            .supports_streaming(true)
            .supports_random_access(true)
            .analysis_status(AnalysisStatus::Streaming { estimated_entries: None })
            .build())
    }

    /// 从ZIP文件中提取预览
    async fn extract_zip_preview(
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        // 首先尝试流式预览
        if let Ok(preview) = Self::extract_zip_preview_streaming(url, headers, entry_path, max_size).await {
            return Ok(preview);
        }

        println!("ZIP流式预览失败，回退到完整下载模式");

        // 回退到完整下载模式
        let zip_data = HttpClient::download_file(url, headers).await?;
        let cursor = Cursor::new(&zip_data);
        let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

        let mut file = archive.by_name(entry_path).map_err(|e| e.to_string())?;
        let total_size = file.size();
        let file_type = FileType::from_path(entry_path);

        let preview_size = max_size.min(total_size as usize);
        let mut buffer = vec![0; preview_size];
        let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
        buffer.truncate(bytes_read);

        let content = if file_type.is_text() {
            match String::from_utf8(buffer.clone()) {
                Ok(text) => text,
                Err(_) => TextDecoder::try_decode_text(buffer)?,
            }
        } else {
            TextDecoder::format_binary_preview(buffer)
        };

        Ok(PreviewBuilder::new()
            .content(content)
            .with_truncated(bytes_read < total_size as usize)
            .total_size(total_size)
            .file_type(file_type)
            .build())
    }

    // 辅助方法
    fn validate_zip_signature(data: &[u8]) -> bool {
        if data.len() < 4 {
            return false;
        }
        let signature = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
        signature == 0x04034b50
    }

    fn create_placeholder_entry(filename: &str, file_size: u64) -> ArchiveEntry {
        ArchiveEntry {
            path: filename.to_string(),
            size: 0,
            compressed_size: if file_size > 0 { Some(file_size) } else { None },
            is_dir: true,
            modified_time: None,
            crc32: None,
            index: 0,
            metadata: HashMap::new(),
        }
    }

    // 这些方法从之前工作的代码迁移过来

    /// 在数据中查找EOCD记录位置
    fn find_eocd(data: &[u8]) -> Option<usize> {
        let eocd_signature = [0x50, 0x4b, 0x05, 0x06];

        if data.len() >= 22 {
            for i in (0..=data.len()-4).rev() {
                if data[i..i+4] == eocd_signature {
                    // 检查剩余数据是否足够解析EOCD（至少22字节）
                    if data.len() >= i + 22 {
                        return Some(i);
                    }
                }
            }
        }
        None
    }

    fn find_eocd_in_tail(tail_data: &[u8]) -> Result<Option<EOCDInfo>, String> {
        let eocd_signature = [0x50, 0x4b, 0x05, 0x06];
        let zip64_eocd_signature = [0x50, 0x4b, 0x06, 0x06];

        println!("在 {} 字节的尾部数据中查找EOCD签名: {:02x} {:02x} {:02x} {:02x}",
            tail_data.len(), eocd_signature[0], eocd_signature[1], eocd_signature[2], eocd_signature[3]);

        // 首先查找ZIP64 EOCD记录
        println!("查找ZIP64 EOCD签名: {:02x} {:02x} {:02x} {:02x}",
            zip64_eocd_signature[0], zip64_eocd_signature[1], zip64_eocd_signature[2], zip64_eocd_signature[3]);

        for i in (0..tail_data.len().saturating_sub(56)).rev() {
            if tail_data.len() >= i + 4 && tail_data[i..i+4] == zip64_eocd_signature {
                println!("在位置 {} 找到ZIP64 EOCD签名", i);
                if let Ok(eocd) = Self::parse_zip64_eocd(&tail_data[i..]) {
                    println!("ZIP64 EOCD解析成功");
                    return Ok(Some(eocd));
                } else {
                    println!("ZIP64 EOCD解析失败");
                }
            }
        }

        // 然后查找普通EOCD记录
        println!("查找普通EOCD签名...");

        if tail_data.len() >= 22 {
            for i in (0..=tail_data.len()-4).rev() {
                if tail_data[i..i+4] == eocd_signature {
                    println!("在位置 {} 找到EOCD签名", i);

                    // 检查剩余数据是否足够解析EOCD（至少22字节）
                    if tail_data.len() >= i + 22 {
                        if let Ok(eocd) = Self::parse_eocd(&tail_data[i..]) {
                            println!("EOCD解析成功");
                            return Ok(Some(eocd));
                        } else {
                            println!("EOCD解析失败");
                        }
                    } else {
                        println!("EOCD数据不足，需要22字节，只有{}字节", tail_data.len() - i);
                    }
                }
            }
        }

        // 调试：显示尾部数据的最后几个字节
        let end_bytes = if tail_data.len() >= 32 {
            &tail_data[tail_data.len()-32..]
        } else {
            tail_data
        };

        println!("尾部最后32字节: {:02x?}", end_bytes);
        println!("未找到EOCD签名");
        Ok(None)
    }

    /// 解析EOCD记录
    fn parse_eocd(eocd_data: &[u8]) -> Result<EOCDInfo, String> {
        if eocd_data.len() < 22 {
            return Err("EOCD data too small".to_string());
        }

        let total_entries = u16::from_le_bytes([eocd_data[10], eocd_data[11]]) as usize;
        let central_dir_size = u32::from_le_bytes([
            eocd_data[12], eocd_data[13], eocd_data[14], eocd_data[15]
        ]) as u64;
        let central_dir_offset = u32::from_le_bytes([
            eocd_data[16], eocd_data[17], eocd_data[18], eocd_data[19]
        ]) as u64;

        println!("解析EOCD: 条目数={}, 中央目录大小={}, 偏移={}",
            total_entries, central_dir_size, central_dir_offset);

        Ok(EOCDInfo {
            total_entries,
            central_dir_size,
            central_dir_offset,
            uncompressed_size: 0, // 需要从中央目录读取
        })
    }

    /// 解析ZIP64 EOCD记录
    fn parse_zip64_eocd(eocd_data: &[u8]) -> Result<EOCDInfo, String> {
        if eocd_data.len() < 56 {
            return Err("ZIP64 EOCD data too small".to_string());
        }

        let total_entries = u64::from_le_bytes([
            eocd_data[32], eocd_data[33], eocd_data[34], eocd_data[35],
            eocd_data[36], eocd_data[37], eocd_data[38], eocd_data[39]
        ]) as usize;

        let central_dir_size = u64::from_le_bytes([
            eocd_data[40], eocd_data[41], eocd_data[42], eocd_data[43],
            eocd_data[44], eocd_data[45], eocd_data[46], eocd_data[47]
        ]);

        let central_dir_offset = u64::from_le_bytes([
            eocd_data[48], eocd_data[49], eocd_data[50], eocd_data[51],
            eocd_data[52], eocd_data[53], eocd_data[54], eocd_data[55]
        ]);

        println!("解析ZIP64 EOCD: 条目数={}, 中央目录大小={}, 偏移={}",
            total_entries, central_dir_size, central_dir_offset);

        Ok(EOCDInfo {
            total_entries,
            central_dir_size,
            central_dir_offset,
            uncompressed_size: 0, // 需要从中央目录读取
        })
    }

    async fn read_central_directory(
        url: &str,
        headers: &HashMap<String, String>,
        eocd: &EOCDInfo,
    ) -> Result<Vec<ArchiveEntry>, String> {
        println!("读取中央目录: 偏移={}, 大小={}", eocd.central_dir_offset, eocd.central_dir_size);

        let cd_data = HttpClient::download_range(
            url, headers, eocd.central_dir_offset, eocd.central_dir_size
        ).await?;

        println!("中央目录数据下载完成: {} 字节", cd_data.len());

        let mut entries = Vec::new();
        let mut offset = 0;

        for i in 0..eocd.total_entries {
            if offset + 46 > cd_data.len() {
                println!("在条目 {} 处数据不足 (偏移: {}, 剩余: {})", i, offset, cd_data.len() - offset);
                break;
            }

            // 检查中央目录文件头签名
            let signature = u32::from_le_bytes([
                cd_data[offset], cd_data[offset + 1],
                cd_data[offset + 2], cd_data[offset + 3]
            ]);

            if signature != 0x02014b50 {
                println!("条目 {} 签名无效: 0x{:08x} (期望: 0x02014b50)", i, signature);
                break;
            }

            // 读取文件信息
            let compressed_size = u32::from_le_bytes([
                cd_data[offset + 20], cd_data[offset + 21],
                cd_data[offset + 22], cd_data[offset + 23]
            ]) as u64;

            let uncompressed_size = u32::from_le_bytes([
                cd_data[offset + 24], cd_data[offset + 25],
                cd_data[offset + 26], cd_data[offset + 27]
            ]) as u64;

            let filename_len = u16::from_le_bytes([
                cd_data[offset + 28], cd_data[offset + 29]
            ]) as usize;

            let extra_len = u16::from_le_bytes([
                cd_data[offset + 30], cd_data[offset + 31]
            ]) as usize;

            let comment_len = u16::from_le_bytes([
                cd_data[offset + 32], cd_data[offset + 33]
            ]) as usize;

            if offset + 46 + filename_len > cd_data.len() {
                println!("条目 {} 文件名数据不足 (需要: {}, 剩余: {})", i, 46 + filename_len, cd_data.len() - offset);
                break;
            }

            let filename = String::from_utf8_lossy(
                &cd_data[offset + 46..offset + 46 + filename_len]
            ).to_string();

            println!("条目 {}: {} (压缩: {}, 未压缩: {})", i, filename, compressed_size, uncompressed_size);

            entries.push(ArchiveEntry {
                path: filename.clone(),
                size: uncompressed_size,
                compressed_size: Some(compressed_size),
                is_dir: filename.ends_with('/'),
                modified_time: None,
                crc32: None,
                index: i,
                metadata: HashMap::new(),
            });

            offset += 46 + filename_len + extra_len + comment_len;
        }

        println!("中央目录解析完成: {} 个条目", entries.len());
        Ok(entries)
    }

    async fn extract_zip_preview_streaming(
        url: &str,
        headers: &HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        println!("尝试流式ZIP预览: {}", entry_path);

        // 获取文件大小
        let file_size = match HttpClient::get_file_size(url, headers).await {
            Ok(size) => size,
            Err(_) => return Err("Cannot get file size for streaming preview".to_string()),
        };

        println!("ZIP文件总大小: {} 字节", file_size);

        // 下载尾部来查找中央目录
        let tail_size = (5 * 1024 * 1024).min(file_size / 2);
        let tail_start = file_size.saturating_sub(tail_size);
        let tail_data = HttpClient::download_range(url, headers, tail_start, tail_size).await?;

        // 查找EOCD记录
        let eocd_info = Self::find_eocd_in_tail(&tail_data)?
            .ok_or("Could not find EOCD record")?;

        // 下载中央目录
        let cd_data = HttpClient::download_range(
            url, headers, eocd_info.central_dir_offset, eocd_info.central_dir_size
        ).await?;

        // 在中央目录中查找目标文件
        let file_info = Self::find_file_in_central_directory(&cd_data, entry_path)?
            .ok_or_else(|| format!("File '{}' not found in ZIP archive", entry_path))?;

        println!("找到文件: {} (本地头偏移: {}, 压缩大小: {})",
            entry_path, file_info.local_header_offset, file_info.compressed_size);

        // 下载本地文件头和文件数据
        let local_header_data = HttpClient::download_range(url, headers, file_info.local_header_offset, 30).await?;

        // 解析本地文件头获取完整的偏移信息
        let filename_len = u16::from_le_bytes([local_header_data[26], local_header_data[27]]) as u64;
        let extra_len = u16::from_le_bytes([local_header_data[28], local_header_data[29]]) as u64;

        let data_offset = file_info.local_header_offset + 30 + filename_len + extra_len;
        let download_size = max_size.min(file_info.compressed_size as usize);

        println!("下载文件数据: 偏移 {}, 大小 {}", data_offset, download_size);

        // 下载文件数据
        let compressed_data = HttpClient::download_range(url, headers, data_offset, download_size as u64).await?;

        // 解压缩数据
        let decompressed_data = if file_info.compression_method == 0 {
            // 无压缩
            compressed_data
        } else if file_info.compression_method == 8 {
            // Deflate压缩
            use flate2::read::DeflateDecoder;
            use std::io::Read;
            let mut decoder = DeflateDecoder::new(&compressed_data[..]);
            let mut decompressed = Vec::new();
            decoder.read_to_end(&mut decompressed).map_err(|e| e.to_string())?;
            decompressed
        } else {
            return Err(format!("Unsupported compression method: {}", file_info.compression_method));
        };

        let file_type = FileType::from_path(entry_path);
        let preview_data = if decompressed_data.len() > max_size {
            decompressed_data[..max_size].to_vec()
        } else {
            decompressed_data
        };

        let preview_data_len = preview_data.len();

        let content = if file_type.is_text() {
            match String::from_utf8(preview_data.clone()) {
                Ok(text) => text,
                Err(_) => TextDecoder::try_decode_text(preview_data)?,
            }
        } else {
            TextDecoder::format_binary_preview(preview_data)
        };

        Ok(PreviewBuilder::new()
            .content(content)
            .with_truncated(preview_data_len < file_info.uncompressed_size as usize)
            .total_size(file_info.uncompressed_size)
            .file_type(file_type)
            .build())
    }

    /// 解析中央目录数据
    fn parse_central_directory(cd_data: &[u8], total_entries: u64) -> Result<Vec<ArchiveEntry>, String> {
        let mut entries = Vec::new();
        let mut offset = 0;

        for i in 0..total_entries {
            if offset + 46 > cd_data.len() {
                println!("在条目 {} 处数据不足 (偏移: {}, 剩余: {})", i, offset, cd_data.len() - offset);
                break;
            }

            // 检查中央目录文件头签名
            let signature = u32::from_le_bytes([
                cd_data[offset], cd_data[offset + 1],
                cd_data[offset + 2], cd_data[offset + 3]
            ]);

            if signature != 0x02014b50 {
                println!("条目 {} 签名无效: 0x{:08x} (期望: 0x02014b50)", i, signature);
                break;
            }

            let compressed_size = u32::from_le_bytes([
                cd_data[offset + 20], cd_data[offset + 21],
                cd_data[offset + 22], cd_data[offset + 23]
            ]) as u64;

            let uncompressed_size = u32::from_le_bytes([
                cd_data[offset + 24], cd_data[offset + 25],
                cd_data[offset + 26], cd_data[offset + 27]
            ]) as u64;

            let filename_len = u16::from_le_bytes([
                cd_data[offset + 28], cd_data[offset + 29]
            ]) as usize;

            let extra_len = u16::from_le_bytes([
                cd_data[offset + 30], cd_data[offset + 31]
            ]) as usize;

            let comment_len = u16::from_le_bytes([
                cd_data[offset + 32], cd_data[offset + 33]
            ]) as usize;

            if offset + 46 + filename_len > cd_data.len() {
                break;
            }

            let filename = String::from_utf8_lossy(
                &cd_data[offset + 46..offset + 46 + filename_len]
            ).to_string();

            // 检查是否为目录
            let is_dir = filename.ends_with('/') || uncompressed_size == 0 && compressed_size == 0;

            entries.push(ArchiveEntry {
                path: filename,
                size: uncompressed_size,
                compressed_size: Some(compressed_size),
                is_dir,
                modified_time: None, // 可以从DOS时间字段解析
                crc32: Some(u32::from_le_bytes([
                    cd_data[offset + 16], cd_data[offset + 17],
                    cd_data[offset + 18], cd_data[offset + 19]
                ])),
                index: i as usize,
                metadata: HashMap::new(),
            });

            offset += 46 + filename_len + extra_len + comment_len;
        }

        Ok(entries)
    }

    fn find_file_in_central_directory(
        cd_data: &[u8],
        target_path: &str,
    ) -> Result<Option<ZipFileInfo>, String> {
        let mut offset = 0;

        while offset + 46 <= cd_data.len() {
            // 检查中央目录文件头签名
            let signature = u32::from_le_bytes([
                cd_data[offset], cd_data[offset + 1],
                cd_data[offset + 2], cd_data[offset + 3]
            ]);

            if signature != 0x02014b50 {
                break;
            }

            let compression_method = u16::from_le_bytes([
                cd_data[offset + 10], cd_data[offset + 11]
            ]);

            let compressed_size = u32::from_le_bytes([
                cd_data[offset + 20], cd_data[offset + 21],
                cd_data[offset + 22], cd_data[offset + 23]
            ]) as u64;

            let uncompressed_size = u32::from_le_bytes([
                cd_data[offset + 24], cd_data[offset + 25],
                cd_data[offset + 26], cd_data[offset + 27]
            ]) as u64;

            let filename_len = u16::from_le_bytes([
                cd_data[offset + 28], cd_data[offset + 29]
            ]) as usize;

            let extra_len = u16::from_le_bytes([
                cd_data[offset + 30], cd_data[offset + 31]
            ]) as usize;

            let comment_len = u16::from_le_bytes([
                cd_data[offset + 32], cd_data[offset + 33]
            ]) as usize;

            let local_header_offset = u32::from_le_bytes([
                cd_data[offset + 42], cd_data[offset + 43],
                cd_data[offset + 44], cd_data[offset + 45]
            ]) as u64;

            if offset + 46 + filename_len > cd_data.len() {
                break;
            }

            let filename = String::from_utf8_lossy(
                &cd_data[offset + 46..offset + 46 + filename_len]
            ).to_string();

            if filename == target_path {
                return Ok(Some(ZipFileInfo {
                    compression_method,
                    compressed_size,
                    uncompressed_size,
                    local_header_offset,
                }));
            }

            offset += 46 + filename_len + extra_len + comment_len;
        }

        Ok(None)
    }

    /// 通过存储客户端分析ZIP文件
    async fn analyze_zip_with_client(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        // 读取文件末尾来查找中央目录
        let footer_size = std::cmp::min(65536, file_size); // 最多读取64KB
        let start_pos = file_size.saturating_sub(footer_size);

        let footer_data = client.read_file_range(file_path, start_pos, footer_size)
            .await
            .map_err(|e| format!("Failed to read file footer: {}", e))?;

        // 查找EOCD记录
        let eocd_pos = Self::find_eocd(&footer_data)
            .ok_or("Could not find End of Central Directory record")?;

        let _eocd_offset = start_pos + eocd_pos as u64;
        let eocd_data = &footer_data[eocd_pos..];

        if eocd_data.len() < 22 {
            return Err("Invalid EOCD record".to_string());
        }

        let total_entries = u16::from_le_bytes([eocd_data[10], eocd_data[11]]) as u64;
        let cd_size = u32::from_le_bytes([
            eocd_data[12], eocd_data[13], eocd_data[14], eocd_data[15]
        ]) as u64;
        let cd_offset = u32::from_le_bytes([
            eocd_data[16], eocd_data[17], eocd_data[18], eocd_data[19]
        ]) as u64;

        // 读取中央目录
        let cd_data = client.read_file_range(file_path, cd_offset, cd_size)
            .await
            .map_err(|e| format!("Failed to read central directory: {}", e))?;

        let entries = Self::parse_central_directory(&cd_data, total_entries)?;
        let total_uncompressed_size = entries.iter().map(|e| e.size).sum();

        Ok(ArchiveInfoBuilder::new(CompressionType::Zip)
            .entries(entries)
            .total_uncompressed_size(total_uncompressed_size)
            .total_compressed_size(file_size)
            .supports_streaming(true)
            .supports_random_access(true)
            .analysis_status(AnalysisStatus::Complete)
            .build())
    }

    /// 通过存储客户端提取文件预览
    async fn extract_zip_preview_with_client(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        // 先找到文件信息
        let file_size = client.get_file_size(file_path).await
            .map_err(|e| format!("Failed to get file size: {}", e))?;

        let file_info = Self::find_file_in_zip_with_client(client.clone(), file_path, file_size, entry_path)
            .await?
            .ok_or_else(|| "File not found in archive".to_string())?;

        // 读取本地文件头
        let local_header = client.read_file_range(file_path, file_info.local_header_offset, 30)
            .await
            .map_err(|e| format!("Failed to read local header: {}", e))?;

        if local_header.len() < 30 {
            return Err("Invalid local header".to_string());
        }

        let filename_len = u16::from_le_bytes([local_header[26], local_header[27]]) as u64;
        let extra_len = u16::from_le_bytes([local_header[28], local_header[29]]) as u64;

        let data_offset = file_info.local_header_offset + 30 + filename_len + extra_len;
        let read_size = std::cmp::min(max_size as u64, file_info.compressed_size);

        let compressed_data = client.read_file_range(file_path, data_offset, read_size)
            .await
            .map_err(|e| format!("Failed to read compressed data: {}", e))?;

        Self::decompress_zip_data(&compressed_data, file_info.compression_method, max_size)
    }

    /// 通过存储客户端在ZIP中查找文件
    async fn find_file_in_zip_with_client(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        file_size: u64,
        target_path: &str,
    ) -> Result<Option<ZipFileInfo>, String> {
        // 读取文件末尾来查找中央目录
        let footer_size = std::cmp::min(65536, file_size);
        let start_pos = file_size.saturating_sub(footer_size);

        let footer_data = client.read_file_range(file_path, start_pos, footer_size)
            .await
            .map_err(|e| format!("Failed to read file footer: {}", e))?;

        let eocd_pos = Self::find_eocd(&footer_data)
            .ok_or("Could not find End of Central Directory record")?;

        let eocd_data = &footer_data[eocd_pos..];
        if eocd_data.len() < 22 {
            return Err("Invalid EOCD record".to_string());
        }

        let cd_size = u32::from_le_bytes([
            eocd_data[12], eocd_data[13], eocd_data[14], eocd_data[15]
        ]) as u64;
        let cd_offset = u32::from_le_bytes([
            eocd_data[16], eocd_data[17], eocd_data[18], eocd_data[19]
        ]) as u64;

        // 读取中央目录
        let cd_data = client.read_file_range(file_path, cd_offset, cd_size)
            .await
            .map_err(|e| format!("Failed to read central directory: {}", e))?;

        Self::find_file_in_central_directory(&cd_data, target_path)
    }

    /// 解压缩ZIP数据
    fn decompress_zip_data(
        compressed_data: &[u8],
        compression_method: u16,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        let decompressed_data = if compression_method == 0 {
            // 无压缩
            compressed_data.to_vec()
        } else if compression_method == 8 {
            // Deflate压缩
            use flate2::read::DeflateDecoder;
            use std::io::Read;
            let mut decoder = DeflateDecoder::new(compressed_data);
            let mut decompressed = Vec::new();
            decoder.read_to_end(&mut decompressed).map_err(|e| e.to_string())?;
            decompressed
        } else {
            return Err(format!("Unsupported compression method: {}", compression_method));
        };

        let file_type = FileType::Binary; // 默认为二进制，调用者需要根据文件路径确定
        let preview_data = if decompressed_data.len() > max_size {
            decompressed_data[..max_size].to_vec()
        } else {
            decompressed_data.clone()
        };

        let preview_data_len = preview_data.len();
        let total_size = decompressed_data.len() as u64;

        let content = if is_text_content(&preview_data) {
            match String::from_utf8(preview_data.clone()) {
                Ok(text) => text,
                Err(_) => TextDecoder::try_decode_text(preview_data)?,
            }
        } else {
            TextDecoder::format_binary_preview(preview_data)
        };

        Ok(PreviewBuilder::new()
            .content(content)
            .with_truncated(preview_data_len < total_size as usize)
            .total_size(total_size)
            .file_type(file_type)
            .build())
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct EOCDInfo {
    total_entries: usize,
    central_dir_size: u64,
    central_dir_offset: u64,
    uncompressed_size: u64,
}

#[derive(Debug, Clone)]
struct ZipFileInfo {
    compression_method: u16,
    compressed_size: u64,
    uncompressed_size: u64,
    local_header_offset: u64,
}
