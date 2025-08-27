/// ZIP 格式处理器
use crate::archive::types::*;
use crate::archive::formats::{CompressionHandlerDispatcher, common::*};
use crate::storage::traits::StorageClient;
use std::collections::HashMap;
use std::sync::Arc;

pub struct ZipHandler;

#[async_trait::async_trait]
impl CompressionHandlerDispatcher for ZipHandler {
    async fn analyze_with_client(
        &self,
        client: Arc<dyn StorageClient>,
        file_path: &str,
        _filename: &str,
        _max_size: Option<u32>,
    ) -> Result<ArchiveInfo, String> {
        Self::analyze_with_storage_client(client, file_path).await
    }

    async fn extract_preview_with_client(
        &self,
        client: Arc<dyn StorageClient>,
        file_path: &str,
        entry_path: &str,
        max_size: usize,
        offset: Option<u64>,
        progress_callback: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<FilePreview, String> {
        Self::extract_zip_preview_with_progress(client, file_path, entry_path, max_size, offset, progress_callback, cancel_rx).await
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
    /// 使用存储客户端分析ZIP文件（流式分析）
    async fn analyze_with_storage_client(
        client: Arc<dyn StorageClient>,
        file_path: &str,
    ) -> Result<ArchiveInfo, String> {
        // 获取文件大小
        let file_size = client.get_file_size(file_path).await
            .map_err(|e| format!("Failed to get file size: {}", e))?;

        // 调用现有的分析方法
        Self::analyze_zip_with_client(client, file_path, file_size).await
    }

    /// 使用存储客户端提取ZIP文件预览（流式提取）
    // 这些方法从之前工作的代码迁移过来

    /// 在数据中查找EOCD记录位置
    fn find_eocd(data: &[u8]) -> Option<usize> {
        const EOCD_SIGNATURE: [u8; 4] = [0x50, 0x4b, 0x05, 0x06];
        const MIN_EOCD_SIZE: usize = 22;

        if data.len() < MIN_EOCD_SIZE {
            return None;
        }

        // 从后往前搜索EOCD签名，优化搜索性能
        for i in (0..=data.len() - MIN_EOCD_SIZE).rev() {
            if data[i..i + 4] == EOCD_SIGNATURE {
                // 验证这是一个有效的EOCD记录
                let comment_len = u16::from_le_bytes([data[i + 20], data[i + 21]]) as usize;
                if i + MIN_EOCD_SIZE + comment_len == data.len() {
                    return Some(i);
                }
            }
        }

        None
    }

    /// 查找ZIP64 End of Central Directory记录
    fn find_zip64_eocd(data: &[u8], eocd_pos: usize) -> Option<usize> {
        const ZIP64_LOCATOR_SIGNATURE: [u8; 4] = [0x50, 0x4b, 0x06, 0x07];
        const ZIP64_LOCATOR_SIZE: usize = 20;

        if eocd_pos < ZIP64_LOCATOR_SIZE {
            return None;
        }

        // ZIP64 EOCD定位器应该在EOCD记录之前
        let search_start = eocd_pos.saturating_sub(ZIP64_LOCATOR_SIZE);
        for i in (search_start..eocd_pos).rev() {
            if i + 4 <= data.len() && data[i..i+4] == ZIP64_LOCATOR_SIGNATURE {


                // 验证这是一个有效的ZIP64 EOCD定位器
                if i + ZIP64_LOCATOR_SIZE <= data.len() {
                    // 检查磁盘号是否为0（单文件ZIP）
                    let disk_number = u32::from_le_bytes([
                        data[i + 4], data[i + 5], data[i + 6], data[i + 7]
                    ]);
                    let total_disks = u32::from_le_bytes([
                        data[i + 16], data[i + 17], data[i + 18], data[i + 19]
                    ]);

                    if disk_number == 0 && total_disks == 1 {
                        return Some(i);
                    }
                }
            }
        }

        None
    }

    /// 解析ZIP64 EOCD记录
    async fn parse_zip64_eocd(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        footer_data: &[u8],
        zip64_locator_pos: usize,
        _file_size: u64,
        start_pos: u64,
    ) -> Result<(u64, u64, u64), String> {
        // 从ZIP64 EOCD定位器中读取ZIP64 EOCD记录的偏移量
        if zip64_locator_pos + 16 > footer_data.len() {
            return Err("ZIP64 EOCD locator data insufficient".to_string());
        }

        let zip64_eocd_offset = u64::from_le_bytes([
            footer_data[zip64_locator_pos + 8], footer_data[zip64_locator_pos + 9],
            footer_data[zip64_locator_pos + 10], footer_data[zip64_locator_pos + 11],
            footer_data[zip64_locator_pos + 12], footer_data[zip64_locator_pos + 13],
            footer_data[zip64_locator_pos + 14], footer_data[zip64_locator_pos + 15]
        ]);



        // 检查ZIP64 EOCD记录是否在我们已读取的数据范围内
        let zip64_eocd_data = if zip64_eocd_offset >= start_pos {
            // ZIP64 EOCD在我们已读取的footer_data中
            let relative_offset = (zip64_eocd_offset - start_pos) as usize;
            if relative_offset + 56 <= footer_data.len() {
                &footer_data[relative_offset..relative_offset + 56]
            } else {
                // 需要重新读取ZIP64 EOCD记录
                let zip64_data = client.read_file_range(file_path, zip64_eocd_offset, 56)
                    .await
                    .map_err(|e| format!("Failed to read ZIP64 EOCD record: {}", e))?;
                return Self::parse_zip64_eocd_data(&zip64_data);
            }
        } else {
            // 需要重新读取ZIP64 EOCD记录
            let zip64_data = client.read_file_range(file_path, zip64_eocd_offset, 56)
                .await
                .map_err(|e| format!("Failed to read ZIP64 EOCD record: {}", e))?;
            return Self::parse_zip64_eocd_data(&zip64_data);
        };

        Self::parse_zip64_eocd_data(zip64_eocd_data)
    }

    /// 解析ZIP64 EOCD记录数据
    fn parse_zip64_eocd_data(data: &[u8]) -> Result<(u64, u64, u64), String> {
        if data.len() < 56 {
            return Err(format!("ZIP64 EOCD record too short: {} bytes, need 56", data.len()));
        }

        // 检查ZIP64 EOCD签名
        let zip64_eocd_signature = [0x50, 0x4b, 0x06, 0x06];
        if data[0..4] != zip64_eocd_signature {
            return Err("Invalid ZIP64 EOCD signature".to_string());
        }

        // 解析ZIP64 EOCD记录字段
        let total_entries = u64::from_le_bytes([
            data[32], data[33], data[34], data[35],
            data[36], data[37], data[38], data[39]
        ]);

        let cd_size = u64::from_le_bytes([
            data[40], data[41], data[42], data[43],
            data[44], data[45], data[46], data[47]
        ]);

        let cd_offset = u64::from_le_bytes([
            data[48], data[49], data[50], data[51],
            data[52], data[53], data[54], data[55]
        ]);



        Ok((cd_offset, cd_size, total_entries))
    }

    /// 解析ZIP64扩展字段
    fn parse_zip64_extra_field(
        extra_data: &[u8],
        compressed_size_32: u32,
        uncompressed_size_32: u32,
    ) -> (u64, u64) {
        const ZIP64_EXTRA_FIELD_ID: u16 = 0x0001;
        const FIELD_HEADER_SIZE: usize = 4;
        const U64_SIZE: usize = 8;
        const MAX_U32: u32 = 0xFFFFFFFF;

        let mut offset = 0;

        // 查找ZIP64扩展字段（标识符：0x0001）
        while offset + FIELD_HEADER_SIZE <= extra_data.len() {
            let header_id = u16::from_le_bytes([extra_data[offset], extra_data[offset + 1]]);
            let data_size = u16::from_le_bytes([extra_data[offset + 2], extra_data[offset + 3]]) as usize;

            // 验证数据大小的合理性
            if offset + FIELD_HEADER_SIZE + data_size > extra_data.len() {
                break;
            }

            if header_id == ZIP64_EXTRA_FIELD_ID {
                // 找到ZIP64扩展字段
                let zip64_data = &extra_data[offset + FIELD_HEADER_SIZE..offset + FIELD_HEADER_SIZE + data_size];
                let mut zip64_offset = 0;

                let mut compressed_size = compressed_size_32 as u64;
                let mut uncompressed_size = uncompressed_size_32 as u64;

                // 按照ZIP64规范的顺序读取字段
                // 1. 未压缩大小（如果原始值为0xFFFFFFFF）
                if uncompressed_size_32 == MAX_U32 {
                    if zip64_offset + U64_SIZE <= zip64_data.len() {
                        uncompressed_size = u64::from_le_bytes([
                            zip64_data[zip64_offset], zip64_data[zip64_offset + 1],
                            zip64_data[zip64_offset + 2], zip64_data[zip64_offset + 3],
                            zip64_data[zip64_offset + 4], zip64_data[zip64_offset + 5],
                            zip64_data[zip64_offset + 6], zip64_data[zip64_offset + 7]
                        ]);
                        zip64_offset += U64_SIZE;
                    } else {
                        // 数据不足，无法读取64位未压缩大小
                        break;
                    }
                }

                // 2. 压缩大小（如果原始值为0xFFFFFFFF）
                if compressed_size_32 == MAX_U32 {
                    if zip64_offset + U64_SIZE <= zip64_data.len() {
                        compressed_size = u64::from_le_bytes([
                            zip64_data[zip64_offset], zip64_data[zip64_offset + 1],
                            zip64_data[zip64_offset + 2], zip64_data[zip64_offset + 3],
                            zip64_data[zip64_offset + 4], zip64_data[zip64_offset + 5],
                            zip64_data[zip64_offset + 6], zip64_data[zip64_offset + 7]
                        ]);
                    } else {
                        // 数据不足，无法读取64位压缩大小
                        break;
                    }
                }

                return (compressed_size, uncompressed_size);
            }

            offset += FIELD_HEADER_SIZE + data_size;
        }

        // 如果没有找到ZIP64扩展字段，返回原始值
        (compressed_size_32 as u64, uncompressed_size_32 as u64)
    }

    /// 解析包含本地文件头偏移量的ZIP64扩展字段
    fn parse_zip64_extra_field_with_offset(
        extra_data: &[u8],
        compressed_size_32: u32,
        uncompressed_size_32: u32,
        local_header_offset_32: u32,
    ) -> (u64, u64) {
        let mut offset = 0;

        // 查找ZIP64扩展字段（标识符：0x0001）
        while offset + 4 <= extra_data.len() {
            let header_id = u16::from_le_bytes([extra_data[offset], extra_data[offset + 1]]);
            let data_size = u16::from_le_bytes([extra_data[offset + 2], extra_data[offset + 3]]) as usize;

            if header_id == 0x0001 && offset + 4 + data_size <= extra_data.len() {
                // 找到ZIP64扩展字段
                let zip64_data = &extra_data[offset + 4..offset + 4 + data_size];
                let mut zip64_offset = 0;

                let mut compressed_size = compressed_size_32 as u64;
                let mut local_header_offset = local_header_offset_32 as u64;

                // 按照ZIP64规范的顺序读取字段
                // 1. 未压缩大小（如果原始值为0xFFFFFFFF）
                if uncompressed_size_32 == 0xFFFFFFFF && zip64_offset + 8 <= zip64_data.len() {
                    // 跳过未压缩大小，我们在这里不需要它
                    zip64_offset += 8;
                }

                // 2. 压缩大小（如果原始值为0xFFFFFFFF）
                if compressed_size_32 == 0xFFFFFFFF && zip64_offset + 8 <= zip64_data.len() {
                    compressed_size = u64::from_le_bytes([
                        zip64_data[zip64_offset], zip64_data[zip64_offset + 1],
                        zip64_data[zip64_offset + 2], zip64_data[zip64_offset + 3],
                        zip64_data[zip64_offset + 4], zip64_data[zip64_offset + 5],
                        zip64_data[zip64_offset + 6], zip64_data[zip64_offset + 7]
                    ]);
                    zip64_offset += 8;
                }

                // 3. 本地文件头偏移量（如果原始值为0xFFFFFFFF）
                if local_header_offset_32 == 0xFFFFFFFF && zip64_offset + 8 <= zip64_data.len() {
                    local_header_offset = u64::from_le_bytes([
                        zip64_data[zip64_offset], zip64_data[zip64_offset + 1],
                        zip64_data[zip64_offset + 2], zip64_data[zip64_offset + 3],
                        zip64_data[zip64_offset + 4], zip64_data[zip64_offset + 5],
                        zip64_data[zip64_offset + 6], zip64_data[zip64_offset + 7]
                    ]);
                }

                return (compressed_size, local_header_offset);
            }

            offset += 4 + data_size;
        }

        // 如果没有找到ZIP64扩展字段，返回原始值
        (compressed_size_32 as u64, local_header_offset_32 as u64)
    }




    /// 解析中央目录数据（优化版本）
    fn parse_central_directory_optimized(cd_data: &[u8], total_entries: u64) -> Result<Vec<ArchiveEntry>, String> {
        // 使用优化的解析逻辑
        Self::parse_central_directory(cd_data, total_entries)
    }

    /// 解析中央目录数据
    fn parse_central_directory(cd_data: &[u8], total_entries: u64) -> Result<Vec<ArchiveEntry>, String> {
        const CD_HEADER_SIGNATURE: u32 = 0x02014b50;
        const MIN_CD_HEADER_SIZE: usize = 46;
        const MAX_FIELD_SIZE: usize = 65535;
        const MAX_ENTRIES_LIMIT: u64 = 10000;

        // 预分配容量以提高性能
        let capacity = std::cmp::min(total_entries as usize, MAX_ENTRIES_LIMIT as usize);
        let mut entries = Vec::with_capacity(capacity);
        let mut offset = 0;
        let mut parsed_entries = 0;

        // 限制处理的条目数量，避免无限循环
        let max_entries = total_entries.min(MAX_ENTRIES_LIMIT);

        while offset + MIN_CD_HEADER_SIZE <= cd_data.len() && parsed_entries < max_entries {
            // 检查中央目录文件头签名
            let signature = u32::from_le_bytes([
                cd_data[offset], cd_data[offset + 1],
                cd_data[offset + 2], cd_data[offset + 3]
            ]);

            if signature != CD_HEADER_SIGNATURE {
                return Err(format!("Invalid central directory file header signature: 0x{:08x}, expected: 0x{:08x}", signature, CD_HEADER_SIGNATURE));
            }

            let compressed_size_32 = u32::from_le_bytes([
                cd_data[offset + 20], cd_data[offset + 21],
                cd_data[offset + 22], cd_data[offset + 23]
            ]);

            let uncompressed_size_32 = u32::from_le_bytes([
                cd_data[offset + 24], cd_data[offset + 25],
                cd_data[offset + 26], cd_data[offset + 27]
            ]);

            let filename_len = u16::from_le_bytes([
                cd_data[offset + 28], cd_data[offset + 29]
            ]) as usize;

            let extra_len = u16::from_le_bytes([
                cd_data[offset + 30], cd_data[offset + 31]
            ]) as usize;

            let comment_len = u16::from_le_bytes([
                cd_data[offset + 32], cd_data[offset + 33]
            ]) as usize;

            // 验证字段长度的合理性
            if filename_len > MAX_FIELD_SIZE || extra_len > MAX_FIELD_SIZE || comment_len > MAX_FIELD_SIZE {
                return Err(format!("Abnormal central directory entry field length: filename={}, extra={}, comment={}", filename_len, extra_len, comment_len));
            }

            // 检查总的记录大小是否合理
            let total_record_size = MIN_CD_HEADER_SIZE + filename_len + extra_len + comment_len;
            if offset + total_record_size > cd_data.len() {
                return Err(format!("Central directory entry exceeds data range: offset={}, size={}, data_len={}", offset, total_record_size, cd_data.len()));
            }



            if filename_len == 0 {
                // 跳过没有文件名的条目
                offset += total_record_size;
                parsed_entries += 1;
                continue;
            }

            // 安全地解析文件名
            let filename_bytes = &cd_data[offset + MIN_CD_HEADER_SIZE..offset + MIN_CD_HEADER_SIZE + filename_len];
            let filename = String::from_utf8_lossy(filename_bytes).to_string();

            // 处理ZIP64扩展字段
            let (compressed_size, uncompressed_size) = if compressed_size_32 == 0xFFFFFFFF || uncompressed_size_32 == 0xFFFFFFFF {
                // 需要从扩展字段中读取64位值
                if extra_len > 0 {
                    let extra_data = &cd_data[offset + MIN_CD_HEADER_SIZE + filename_len..offset + MIN_CD_HEADER_SIZE + filename_len + extra_len];
                    Self::parse_zip64_extra_field(extra_data, compressed_size_32, uncompressed_size_32)
                } else {
                    (compressed_size_32 as u64, uncompressed_size_32 as u64)
                }
            } else {
                (compressed_size_32 as u64, uncompressed_size_32 as u64)
            };

            // 检查是否为目录
            let is_dir = filename.ends_with('/') || uncompressed_size == 0 && compressed_size == 0;

            entries.push(ArchiveEntry {
                path: filename,
                size: uncompressed_size.to_string(),
                compressed_size: Some(compressed_size.to_string()),
                is_dir,
                modified_time: None, // 可以从DOS时间字段解析
                crc32: Some(u32::from_le_bytes([
                    cd_data[offset + 16], cd_data[offset + 17],
                    cd_data[offset + 18], cd_data[offset + 19]
                ])),
                index: parsed_entries as u32,
                metadata: HashMap::new(),
            });

            offset += total_record_size;
            parsed_entries += 1;
        }

        if parsed_entries != total_entries && parsed_entries < max_entries {
            return Err(format!("Parsed entry count ({}) does not match expected count ({})", parsed_entries, total_entries));
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

            let compressed_size_32 = u32::from_le_bytes([
                cd_data[offset + 20], cd_data[offset + 21],
                cd_data[offset + 22], cd_data[offset + 23]
            ]);

            let uncompressed_size_32 = u32::from_le_bytes([
                cd_data[offset + 24], cd_data[offset + 25],
                cd_data[offset + 26], cd_data[offset + 27]
            ]);

            let filename_len = u16::from_le_bytes([
                cd_data[offset + 28], cd_data[offset + 29]
            ]) as usize;

            let extra_len = u16::from_le_bytes([
                cd_data[offset + 30], cd_data[offset + 31]
            ]) as usize;

            let comment_len = u16::from_le_bytes([
                cd_data[offset + 32], cd_data[offset + 33]
            ]) as usize;

            let local_header_offset_32 = u32::from_le_bytes([
                cd_data[offset + 42], cd_data[offset + 43],
                cd_data[offset + 44], cd_data[offset + 45]
            ]);

            if offset + 46 + filename_len > cd_data.len() {
                break;
            }

            let filename = String::from_utf8_lossy(
                &cd_data[offset + 46..offset + 46 + filename_len]
            ).to_string();

            if filename == target_path {
                // 处理ZIP64扩展字段
                let (compressed_size, local_header_offset) = if compressed_size_32 == 0xFFFFFFFF || local_header_offset_32 == 0xFFFFFFFF {
                    // 需要从扩展字段中读取64位值
                    if offset + 46 + filename_len + extra_len <= cd_data.len() {
                        let extra_data = &cd_data[offset + 46 + filename_len..offset + 46 + filename_len + extra_len];
                        Self::parse_zip64_extra_field_with_offset(extra_data, compressed_size_32, uncompressed_size_32, local_header_offset_32)
                    } else {
                        (compressed_size_32 as u64, local_header_offset_32 as u64)
                    }
                } else {
                    (compressed_size_32 as u64, local_header_offset_32 as u64)
                };

                return Ok(Some(ZipFileInfo {
                    compression_method,
                    compressed_size,
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
        const MIN_ZIP_SIZE: u64 = 22; // 最小ZIP文件大小（EOCD记录）
        const MAX_FOOTER_SIZE: u64 = 65536; // 最多读取64KB的文件尾部
        const MAX_ZIP_SIZE: u64 = 500 * 1024 * 1024 * 1024; // 500GB文件大小限制
        const MAX_CD_SIZE: u64 = 500 * 1024 * 1024; // 500MB中央目录大小限制
        const MAX_ENTRIES: u64 = 1_000_000; // 100万个文件数量限制

        // 检查文件大小是否足够
        if file_size < MIN_ZIP_SIZE {
            return Err(format!("File too small to be a valid ZIP file ({} bytes < {} bytes)", file_size, MIN_ZIP_SIZE));
        }

        // 检查最大文件大小限制（防止处理过大的文件）
        if file_size > MAX_ZIP_SIZE {
            return Err(format!("ZIP file too large: {} bytes, exceeds 10GB limit", file_size));
        }

        // 读取文件末尾来查找中央目录
        let footer_size = std::cmp::min(MAX_FOOTER_SIZE, file_size);
        let start_pos = file_size.saturating_sub(footer_size);

        let footer_data = client.read_file_range(file_path, start_pos, footer_size)
            .await
            .map_err(|e| format!("Failed to read file footer: {}", e))?;

        if footer_data.len() != footer_size as usize {
            return Err(format!("Read data length mismatch: expected {}, actual {}", footer_size, footer_data.len()));
        }

        // 查找EOCD记录
        let eocd_pos = Self::find_eocd(&footer_data)
            .ok_or_else(|| "Could not find EOCD record in ZIP file, file may be corrupted or not a valid ZIP file".to_string())?;

        let eocd_data = &footer_data[eocd_pos..];
        if eocd_data.len() < 22 {
            return Err(format!("Insufficient EOCD record length: only {} bytes, need 22 bytes", eocd_data.len()));
        }

        // 解析EOCD记录
        let total_entries = u16::from_le_bytes([eocd_data[10], eocd_data[11]]) as u64;
        let cd_size = u32::from_le_bytes([
            eocd_data[12], eocd_data[13], eocd_data[14], eocd_data[15]
        ]) as u64;
        let cd_offset_32 = u32::from_le_bytes([
            eocd_data[16], eocd_data[17], eocd_data[18], eocd_data[19]
        ]);

        // 验证条目数量的合理性
        if total_entries > MAX_ENTRIES {
            return Err(format!("Too many entries in ZIP file: {}, exceeds {} limit", total_entries, MAX_ENTRIES));
        }

        if cd_size > file_size {
            return Err(format!("Central directory size ({}) exceeds file size ({})", cd_size, file_size));
        }

        // 验证中央目录大小的合理性
        if cd_size > MAX_CD_SIZE {
            return Err(format!("Central directory too large: {} bytes, exceeds 500MB limit", cd_size));
        }

        // 检查是否需要处理ZIP64格式
        let (cd_offset, cd_size, total_entries) = if cd_offset_32 == 0xFFFFFFFF || cd_size == 0xFFFFFFFF as u64 || total_entries == 0xFFFF {
            // 查找ZIP64 EOCD定位器
            if let Some(zip64_locator_pos) = Self::find_zip64_eocd(&footer_data, eocd_pos) {
                let zip64_result = Self::parse_zip64_eocd(client.clone(), file_path, &footer_data, zip64_locator_pos, file_size, start_pos).await?;

                // 验证ZIP64解析结果的合理性
                if zip64_result.1 > MAX_CD_SIZE {
                    return Err(format!("ZIP64 central directory too large: {} bytes, exceeds 500MB limit", zip64_result.1));
                }
                if zip64_result.2 > MAX_ENTRIES {
                    return Err(format!("Too many files in ZIP64: {} files, exceeds {} limit", zip64_result.2, MAX_ENTRIES));
                }

                zip64_result
            } else {
                return Err("ZIP64 format detected but ZIP64 EOCD locator not found, file may be corrupted".to_string());
            }
        } else {
            (cd_offset_32 as u64, cd_size, total_entries)
        };

        // 验证中央目录偏移量的合理性
        if cd_offset >= file_size {
            return Err(format!("Central directory offset ({}) exceeds file range ({})", cd_offset, file_size));
        }

        if cd_offset + cd_size > file_size {
            return Err(format!("Central directory end position ({}) exceeds file range ({})", cd_offset + cd_size, file_size));
        }

        // 读取中央目录
        let cd_data = client.read_file_range(file_path, cd_offset, cd_size)
            .await
            .map_err(|e| format!("Failed to read central directory: {}", e))?;

        if cd_data.len() != cd_size as usize {
            return Err(format!("Central directory data length mismatch: expected {}, actual {}", cd_size, cd_data.len()));
        }

        // 使用优化的解析方法
        let entries = Self::parse_central_directory_optimized(&cd_data, total_entries)?;
        let total_uncompressed_size: u64 = entries.iter()
            .map(|e| e.size.parse::<u64>().unwrap_or(0))
            .sum();

        Ok(ArchiveInfoBuilder::new(CompressionType::Zip)
            .entries(entries)
            .total_uncompressed_size(total_uncompressed_size)
            .total_compressed_size(file_size)
            .supports_streaming(true)
            .supports_random_access(true)
            .analysis_status(AnalysisStatus::Complete)
            .build())
    }



    /// 通过存储客户端提取ZIP文件预览（支持进度回调和取消信号）
    async fn extract_zip_preview_with_progress(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        entry_path: &str,
        max_size: usize,
        offset: Option<u64>,
        progress_callback: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<FilePreview, String> {
        // 先找到文件信息
        let file_size = client.get_file_size(file_path).await
            .map_err(|e| format!("Failed to get file size: {}", e))?;

        let file_info = Self::find_file_in_zip_with_client(client.clone(), file_path, file_size, entry_path)
            .await?
            .ok_or_else(|| "File not found in archive".to_string())?;

        // 空文件直接返回
        if file_info.compressed_size == 0 {
            return Ok(PreviewBuilder::new()
                .content(Vec::new())
                .with_truncated(false)
                .total_size(0)
                .build());
        }

        // 根据压缩方法选择合适的读取策略
        Self::read_zip_content_with_strategy(
            client, file_path, &file_info, max_size, offset, progress_callback, cancel_rx
        ).await
    }

    /// 根据压缩方法选择读取策略
    async fn read_zip_content_with_strategy(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        file_info: &ZipFileInfo,
        max_size: usize,
        offset: Option<u64>,
        progress_callback: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<FilePreview, String> {
        let offset_val = offset.unwrap_or(0);

        // 获取数据偏移量（跳过本地文件头）
        let local_header_size = Self::get_local_header_size(client.clone(), file_path, file_info.local_header_offset).await?;
        let data_offset = file_info.local_header_offset + local_header_size;

        match file_info.compression_method {
            0 => {
                // Uncompressed: direct range read
                Self::read_uncompressed_content(
                    client, file_path, data_offset, file_info.compressed_size,
                    offset_val, max_size, progress_callback, cancel_rx
                ).await
            }
            8 => {
                // Deflate compression: streaming decompression
                Self::read_deflate_content(
                    client, file_path, data_offset, file_info.compressed_size,
                    offset_val, max_size, progress_callback, cancel_rx
                ).await
            }
            _ => {
                Err(format!("Unsupported compression method: {}", file_info.compression_method))
            }
        }
    }

    /// Read uncompressed content (true chunked loading)
    async fn read_uncompressed_content(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        data_offset: u64,
        total_size: u64,
        offset_val: u64,
        max_size: usize,
        progress_callback: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
        mut cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<FilePreview, String> {
        let actual_offset = offset_val.min(total_size);
        let remaining = total_size - actual_offset;
        let read_size = (max_size as u64).min(remaining);

        if read_size == 0 {
            return Ok(PreviewBuilder::new()
                .content(Vec::new())
                .with_truncated(false)
                .total_size(total_size)
                .build());
        }

        let progress_cb = progress_callback.map(|cb| {
            Arc::new(move |current: u64, total: u64| cb(current, total)) as crate::storage::traits::ProgressCallback
        });

        // Read the required data chunk directly
        let data = client.read_file_range_with_progress(
            file_path,
            data_offset + actual_offset,
            read_size,
            progress_cb,
            cancel_rx.take(),
        ).await.map_err(|e| format!("Failed to read uncompressed data: {}", e))?;

        let is_truncated = actual_offset + (data.len() as u64) < total_size;

        Ok(PreviewBuilder::new()
            .content(data)
            .with_truncated(is_truncated)
            .total_size(total_size)
            .build())
    }

    /// Read Deflate compressed content (smart chunked approach)
    async fn read_deflate_content(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        data_offset: u64,
        compressed_size: u64,
        offset_val: u64,
        max_size: usize,
        progress_callback: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
        mut cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<FilePreview, String> {
        let progress_cb = progress_callback.map(|cb| {
            Arc::new(move |current: u64, total: u64| cb(current, total)) as crate::storage::traits::ProgressCallback
        });

        use flate2::read::DeflateDecoder;
        use std::io::{Read, Cursor};

        // For large files or later chunks, use smart size limit
        let chunk_limit = if offset_val > 0 && compressed_size > 5 * 1024 * 1024 {
            // For offset requests on large files, limit compressed data read
            (compressed_size / 4).min(2 * 1024 * 1024) // Max 2MB or 1/4 of file
        } else {
            compressed_size // Read all for small files or first chunk
        };

        // Read limited compressed data
        let compressed_data = client.read_file_range_with_progress(
            file_path,
            data_offset,
            chunk_limit,
            progress_cb,
            cancel_rx.take(),
        ).await.map_err(|e| format!("Failed to read compressed data: {}", e))?;

        // Decompress with size limit
        let mut decoder = DeflateDecoder::new(Cursor::new(compressed_data));
        let mut decompressed = Vec::new();

        // Read in chunks to avoid excessive memory usage
        let mut buffer = [0u8; 8192];
        let mut total_decompressed = 0;
        let decompression_limit = (max_size * 3).max(1024 * 1024); // Allow some overshoot

        loop {
            match decoder.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    decompressed.extend_from_slice(&buffer[..n]);
                    total_decompressed += n;

                    // Stop if we have enough data
                    if total_decompressed >= decompression_limit {
                        break;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                    // Partial decompression is ok for chunked reading
                    break;
                }
                Err(e) => return Err(format!("Deflate decompression failed: {}", e)),
            }
        }

        if decompressed.is_empty() {
            return Err("No data could be decompressed".to_string());
        }

        // Apply offset and size limit
        let start_pos = offset_val as usize;
        let result_data = if start_pos >= decompressed.len() {
            Vec::new()
        } else {
            let end_pos = (start_pos + max_size).min(decompressed.len());
            decompressed[start_pos..end_pos].to_vec()
        };

        let is_truncated = chunk_limit < compressed_size ||
                          total_decompressed >= decompression_limit ||
                          result_data.len() == max_size;

        Ok(PreviewBuilder::new()
            .content(result_data)
            .with_truncated(is_truncated)
            .total_size(total_decompressed as u64)
            .build())
    }

    /// Get local file header size
    async fn get_local_header_size(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        local_header_offset: u64,
    ) -> Result<u64, String> {
        // Read local file header fixed part (30 bytes)
        let local_header = client.read_file_range(file_path, local_header_offset, 30)
            .await
            .map_err(|e| format!("Failed to read local header: {}", e))?;

        if local_header.len() < 30 {
            return Err("Invalid local header".to_string());
        }

        // Extract filename and extra field lengths
        let filename_len = u16::from_le_bytes([local_header[26], local_header[27]]) as u64;
        let extra_len = u16::from_le_bytes([local_header[28], local_header[29]]) as u64;

        // Local file header size = fixed header(30) + filename length + extra field length
        Ok(30 + filename_len + extra_len)
    }

    /// Find file in ZIP via storage client
    async fn find_file_in_zip_with_client(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        file_size: u64,
        target_path: &str,
    ) -> Result<Option<ZipFileInfo>, String> {
        // Read file footer to find central directory
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

        // Check if ZIP64 format
        let (final_cd_offset, final_cd_size) = if cd_offset == 0xFFFFFFFF {
            // Find ZIP64 EOCD locator
            if let Some(zip64_locator_pos) = Self::find_zip64_eocd(&footer_data, eocd_pos) {
                // Parse ZIP64 EOCD record
                let (zip64_cd_offset, zip64_cd_size, _zip64_total_entries) = Self::parse_zip64_eocd(
                    client.clone(),
                    file_path,
                    &footer_data,
                    zip64_locator_pos,
                    file_size,
                    start_pos,
                ).await?;

                (zip64_cd_offset, zip64_cd_size)
            } else {
                return Err("ZIP64 format detected but ZIP64 EOCD locator not found".to_string());
            }
        } else {
            // Check if offset is reasonable
            if (cd_offset as u64) >= file_size {
                return Err(format!("Invalid central directory offset: {} >= file size {}", cd_offset, file_size));
            }
            (cd_offset as u64, cd_size as u64)
        };

        // Read central directory
        let cd_data = client.read_file_range(file_path, final_cd_offset, final_cd_size)
            .await
            .map_err(|e| format!("Failed to read central directory: {}", e))?;

        Self::find_file_in_central_directory(&cd_data, target_path)
    }
}



#[derive(Debug, Clone)]
struct ZipFileInfo {
    compression_method: u16,
    compressed_size: u64,
    local_header_offset: u64,
}
