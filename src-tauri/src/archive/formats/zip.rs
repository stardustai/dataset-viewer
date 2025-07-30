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
        println!("ZIP流式分析开始: {}", file_path);

        // 获取文件大小
        let file_size = client.get_file_size(file_path).await
            .map_err(|e| format!("Failed to get file size: {}", e))?;

        println!("ZIP文件大小: {} 字节", file_size);

        // 调用现有的分析方法
        Self::analyze_zip_with_client(client, file_path, file_size).await
    }

    /// 使用存储客户端提取ZIP文件预览（流式提取）
    async fn extract_preview_with_storage_client(
        client: Arc<dyn StorageClient>,
        file_path: &str,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        Self::extract_zip_preview_with_client(client, file_path, entry_path, max_size).await
    }

    // 这些方法从之前工作的代码迁移过来

    /// 在数据中查找EOCD记录位置
    fn find_eocd(data: &[u8]) -> Option<usize> {
        let eocd_signature = [0x50, 0x4b, 0x05, 0x06];

        println!("查找EOCD记录，数据长度: {} 字节", data.len());

        if data.len() < 22 {
            println!("数据太短，无法包含EOCD记录（需要至少22字节）");
            return None;
        }

        // 从尾部开始查找EOCD签名
        for i in (0..=data.len().saturating_sub(4)).rev() {
            if data[i..i+4] == eocd_signature {
                // 检查剩余数据是否足够解析EOCD（至少22字节）
                if data.len() >= i + 22 {
                    println!("在位置 {} 找到EOCD签名", i);
                    return Some(i);
                } else {
                    println!("在位置 {} 找到EOCD签名，但数据不足（需要22字节，只有{}字节）", i, data.len() - i);
                }
            }
        }

        // 如果没找到，显示一些调试信息
        let debug_bytes = if data.len() >= 32 {
            &data[data.len()-32..]
        } else {
            data
        };
        println!("未找到EOCD签名，尾部{}字节: {:02x?}", debug_bytes.len(), debug_bytes);

        None
    }

    /// 查找ZIP64 End of Central Directory记录
    fn find_zip64_eocd(data: &[u8], eocd_pos: usize) -> Option<usize> {
        let zip64_eocd_locator_signature = [0x50, 0x4b, 0x06, 0x07];
        
        // ZIP64 EOCD定位器应该在EOCD记录之前
        if eocd_pos < 20 {
            return None;
        }
        
        // 查找ZIP64 EOCD定位器（在EOCD之前20字节的位置）
        let search_start = eocd_pos.saturating_sub(20);
        for i in (0..=search_start).rev() {
            if i + 4 <= data.len() && data[i..i+4] == zip64_eocd_locator_signature {
                println!("[DEBUG] 找到ZIP64 EOCD定位器在位置: {}", i);
                
                // 读取ZIP64 EOCD记录的偏移量（8字节，小端序）
                if i + 16 <= data.len() {
                    let zip64_eocd_offset = u64::from_le_bytes([
                        data[i + 8], data[i + 9], data[i + 10], data[i + 11],
                        data[i + 12], data[i + 13], data[i + 14], data[i + 15]
                    ]);
                    println!("[DEBUG] ZIP64 EOCD偏移量: {}", zip64_eocd_offset);
                    
                    // 计算在当前数据中的相对位置
                    // 注意：这里假设我们读取的是文件末尾的数据
                    // 实际实现中可能需要重新读取ZIP64 EOCD记录
                    return Some(i);
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
        
        println!("[DEBUG] ZIP64 EOCD记录偏移量: {}", zip64_eocd_offset);
        
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
        
        println!("[DEBUG] ZIP64 EOCD解析结果:");
        println!("[DEBUG] - total_entries: {}", total_entries);
        println!("[DEBUG] - cd_size: {}", cd_size);
        println!("[DEBUG] - cd_offset: {}", cd_offset);
        
        Ok((cd_offset, cd_size, total_entries))
    }
    
    /// 解析ZIP64扩展字段
    fn parse_zip64_extra_field(
        extra_data: &[u8],
        compressed_size_32: u32,
        uncompressed_size_32: u32,
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
                let mut uncompressed_size = uncompressed_size_32 as u64;
                
                // 按照ZIP64规范的顺序读取字段
                // 1. 未压缩大小（如果原始值为0xFFFFFFFF）
                if uncompressed_size_32 == 0xFFFFFFFF && zip64_offset + 8 <= zip64_data.len() {
                    uncompressed_size = u64::from_le_bytes([
                        zip64_data[zip64_offset], zip64_data[zip64_offset + 1],
                        zip64_data[zip64_offset + 2], zip64_data[zip64_offset + 3],
                        zip64_data[zip64_offset + 4], zip64_data[zip64_offset + 5],
                        zip64_data[zip64_offset + 6], zip64_data[zip64_offset + 7]
                    ]);
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
                }
                
                return (compressed_size, uncompressed_size);
            }
            
            offset += 4 + data_size;
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




    /// 解析中央目录数据
    fn parse_central_directory(cd_data: &[u8], total_entries: u64) -> Result<Vec<ArchiveEntry>, String> {
        let mut entries = Vec::new();
        let mut offset = 0;
        
        // 限制处理的条目数量，避免无限循环
        let max_entries = total_entries.min(10000); // 最多处理10000个条目

        for i in 0..max_entries {
            // 添加偏移量合理性检查
            if offset >= cd_data.len() || offset + 46 > cd_data.len() {
                break;
            }

            // 检查中央目录文件头签名
            let signature = u32::from_le_bytes([
                cd_data[offset], cd_data[offset + 1],
                cd_data[offset + 2], cd_data[offset + 3]
            ]);

            if signature != 0x02014b50 {
                break;
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
            
            // 添加合理性检查，避免异常大的字段长度
            if filename_len > 65535 || extra_len > 65535 || comment_len > 65535 {
                break;
            }
            
            // 检查总的记录大小是否合理
            let total_record_size = 46 + filename_len + extra_len + comment_len;
            if offset + total_record_size > cd_data.len() {
                break;
            }
            
            // 每处理1000个条目输出一次进度
            if i % 1000 == 0 && i > 0 {
                println!("已处理 {} / {} 个条目", i, max_entries);
            }

            let filename = String::from_utf8_lossy(
                &cd_data[offset + 46..offset + 46 + filename_len]
            ).to_string();
            
            // 处理ZIP64扩展字段
            let (compressed_size, uncompressed_size) = if compressed_size_32 == 0xFFFFFFFF || uncompressed_size_32 == 0xFFFFFFFF {
                // 需要从扩展字段中读取64位值
                if extra_len > 0 {
                    let extra_data = &cd_data[offset + 46 + filename_len..offset + 46 + filename_len + extra_len];
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

            offset += total_record_size;
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
        println!("分析ZIP文件: {} (大小: {} 字节)", file_path, file_size);

        // 检查文件大小是否足够
        if file_size < 22 {
            return Err(format!("文件太小，无法是有效的ZIP文件（{}字节 < 22字节）", file_size));
        }

        // 读取文件末尾来查找中央目录
        // 为了确保能找到EOCD，读取足够的数据，但对于大文件限制在合理范围内
        let footer_size = std::cmp::min(65536, file_size); // 最多读取64KB
        let start_pos = file_size.saturating_sub(footer_size);

        println!("读取文件末尾: 位置 {} 长度 {}", start_pos, footer_size);

        let footer_data = client.read_file_range(file_path, start_pos, footer_size)
            .await
            .map_err(|e| format!("Failed to read file footer: {}", e))?;

        println!("成功读取 {} 字节的文件尾部数据", footer_data.len());

        // 验证实际读取的数据长度
        if footer_data.len() == 0 {
            return Err("读取到的文件数据为空".to_string());
        }

        if footer_data.len() != footer_size as usize {
            println!("警告：请求读取 {} 字节，但只接收到 {} 字节", footer_size, footer_data.len());
        }

        // 显示最后几个字节用于调试
        if footer_data.len() >= 16 {
            let last_bytes = &footer_data[footer_data.len()-16..];
            println!("文件最后16字节: {:02x?}", last_bytes);
        } else {
            println!("文件数据: {:02x?}", footer_data);
        }

        // 查找EOCD记录
        let eocd_pos = Self::find_eocd(&footer_data)
            .ok_or_else(|| {
                // 如果找不到EOCD，提供更详细的错误信息
                let debug_info = if footer_data.len() >= 16 {
                    format!("最后16字节: {:02x?}", &footer_data[footer_data.len()-16..])
                } else {
                    format!("文件数据: {:02x?}", &footer_data[..])
                };

                format!("invalid Zip archive: Could not find central directory end. 文件: {}, 大小: {} 字节, 读取范围: {}-{}, 实际读取: {} 字节, {}",
                    file_path,
                    file_size,
                    start_pos,
                    start_pos + footer_size,
                    footer_data.len(),
                    debug_info
                )
            })?;

        println!("找到EOCD记录位置: {}", eocd_pos);

        let _eocd_offset = start_pos + eocd_pos as u64;
        let eocd_data = &footer_data[eocd_pos..];

        if eocd_data.len() < 22 {
            return Err(format!("Invalid EOCD record: only {} bytes available, need 22", eocd_data.len()));
        }

        let total_entries = u16::from_le_bytes([eocd_data[10], eocd_data[11]]) as u64;
        let cd_size = u32::from_le_bytes([
            eocd_data[12], eocd_data[13], eocd_data[14], eocd_data[15]
        ]);
        let cd_offset = u32::from_le_bytes([
            eocd_data[16], eocd_data[17], eocd_data[18], eocd_data[19]
        ]);
        
        // 调试信息：显示EOCD记录的原始字节
        println!("[DEBUG] EOCD记录解析:");
        println!("[DEBUG] - total_entries: {}", total_entries);
        println!("[DEBUG] - cd_size: {}", cd_size);
        println!("[DEBUG] - cd_offset: {} (原始字节: {:02x?})", cd_offset, &eocd_data[16..20]);
        println!("[DEBUG] - file_size: {}", file_size);
        
        // 检查是否为ZIP64格式（偏移量为0xFFFFFFFF表示需要使用ZIP64）
        let (final_cd_offset, final_cd_size, final_total_entries) = if cd_offset == 0xFFFFFFFF {
            println!("[DEBUG] 检测到ZIP64格式，查找ZIP64 EOCD记录");
            
            // 查找ZIP64 EOCD定位器
            if let Some(zip64_locator_pos) = Self::find_zip64_eocd(&footer_data, eocd_pos) {
                // 解析ZIP64 EOCD记录
                let (zip64_cd_offset, zip64_cd_size, zip64_total_entries) = Self::parse_zip64_eocd(
                    client.clone(),
                    file_path,
                    &footer_data,
                    zip64_locator_pos,
                    file_size,
                    start_pos,
                ).await?;
                
                (zip64_cd_offset, zip64_cd_size, zip64_total_entries)
            } else {
                return Err("ZIP64 format detected but ZIP64 EOCD locator not found".to_string());
            }
        } else {
            // 检查偏移量是否合理
            if (cd_offset as u64) >= file_size {
                return Err(format!("Invalid central directory offset: {} >= file size {}", cd_offset, file_size));
            }
            (cd_offset as u64, cd_size as u64, total_entries)
        };
        
        println!("[DEBUG] 使用最终偏移量: {}", final_cd_offset);

        // 读取中央目录
        let cd_data = client.read_file_range(file_path, final_cd_offset, final_cd_size)
            .await
            .map_err(|e| format!("Failed to read central directory: {}", e))?;

        let entries = Self::parse_central_directory(&cd_data, final_total_entries)?;
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
        // 当max_size足够大时，读取完整的压缩数据以避免"Bad compressed size"错误
        let read_size = if max_size >= file_info.compressed_size as usize {
            file_info.compressed_size
        } else {
            std::cmp::min(max_size as u64, file_info.compressed_size)
        };
        

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
        let start_pos;
        // 读取文件末尾来查找中央目录
        let footer_size = std::cmp::min(65536, file_size);
        start_pos = file_size.saturating_sub(footer_size);

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
        
        // 调试信息：显示EOCD记录的原始字节（在find_file_in_zip_with_client中）
        println!("[DEBUG] find_file_in_zip_with_client EOCD解析:");
        println!("[DEBUG] - cd_size: {}", cd_size);
        println!("[DEBUG] - cd_offset: {} (原始字节: {:02x?})", cd_offset, &eocd_data[16..20]);
        println!("[DEBUG] - file_size: {}", file_size);
        
        // 检查是否为ZIP64格式
        let (final_cd_offset, final_cd_size) = if cd_offset == 0xFFFFFFFF {
            // 查找ZIP64 EOCD定位器
            if let Some(zip64_locator_pos) = Self::find_zip64_eocd(&footer_data, eocd_pos) {
                // 解析ZIP64 EOCD记录
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
            // 检查偏移量是否合理
            if (cd_offset as u64) >= file_size {
                return Err(format!("Invalid central directory offset: {} >= file size {}", cd_offset, file_size));
            }
            (cd_offset as u64, cd_size as u64)
        };

        // 读取中央目录
        let cd_data = client.read_file_range(file_path, final_cd_offset, final_cd_size)
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

        // 默认为二进制，调用者需要根据文件路径确定
        let preview_data = if decompressed_data.len() > max_size {
            decompressed_data[..max_size].to_vec()
        } else {
            decompressed_data.clone()
        };

        let preview_data_len = preview_data.len();
        let total_size = decompressed_data.len() as u64;



        Ok(PreviewBuilder::new()
            .content(preview_data)
            .with_truncated(preview_data_len < total_size as usize)
            .total_size(total_size)
            .build())
    }
}



#[derive(Debug, Clone)]
struct ZipFileInfo {
    compression_method: u16,
    compressed_size: u64,
    local_header_offset: u64,
}
