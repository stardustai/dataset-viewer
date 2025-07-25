use crate::archive::types::*;
use std::io::{Cursor, Read};
use flate2::read::GzDecoder;
use tar::Archive;
use zip::ZipArchive;

/// 流式压缩包分析器
pub struct StreamingAnalyzer;

impl StreamingAnalyzer {
    /// 主入口：分析压缩包结构
    pub async fn analyze_archive(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        filename: &str,
        max_size: Option<usize>,
    ) -> Result<ArchiveInfo, String> {
        let compression_type = CompressionType::from_filename(filename);

        // 尝试获取文件大小，如果失败则使用流式分析
        match Self::get_file_size(url, headers).await {
            Ok(file_size) => {
                println!("Analyzing archive '{}' of size {} bytes", filename, file_size);

                // 如果文件很小，直接完整下载分析
                if file_size <= max_size.unwrap_or(10 * 1024 * 1024) as u64 {
                    return Self::analyze_complete_file(url, headers, compression_type).await;
                }

                // 对于大文件，使用流式分析
                Self::analyze_streaming(url, headers, filename, compression_type, file_size).await
            }
            Err(e) => {
                println!("Failed to get file size for '{}': {}. Using streaming analysis without size.", filename, e);
                // 如果无法获取文件大小，直接使用流式分析
                Self::analyze_streaming_without_size(url, headers, filename, compression_type).await
            }
        }
    }

    /// 获取文件大小
    async fn get_file_size(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
    ) -> Result<u64, String> {
        let client = reqwest::Client::new();
        let mut request = client.head(url);

        for (key, value) in headers {
            request = request.header(key, value);
        }

        let response = request.send().await
            .map_err(|e| format!("Failed to get file info: {}", e))?;

        if let Some(content_length) = response.headers().get("content-length") {
            content_length.to_str()
                .map_err(|_| "Invalid content-length header".to_string())?
                .parse::<u64>()
                .map_err(|_| "Failed to parse content-length".to_string())
        } else {
            Err("No content-length header found".to_string())
        }
    }

    /// 完整文件分析（适用于小文件）
    async fn analyze_complete_file(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        compression_type: CompressionType,
    ) -> Result<ArchiveInfo, String> {
        let data = Self::download_complete_file(url, headers).await?;

        match compression_type {
            CompressionType::Zip => Self::analyze_zip_complete(&data),
            CompressionType::TarGz => Self::analyze_tar_gz_complete(&data),
            CompressionType::Tar => Self::analyze_tar_complete(&data),
            CompressionType::Gzip => Self::analyze_gzip_complete(&data),
            _ => Err(format!("Unsupported compression type: {}", compression_type.as_str())),
        }
    }

    /// 下载完整文件
    async fn download_complete_file(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
    ) -> Result<Vec<u8>, String> {
        let client = reqwest::Client::new();
        let mut request = client.get(url);

        for (key, value) in headers {
            request = request.header(key, value);
        }

        let response = request.send().await
            .map_err(|e| format!("Failed to download file: {}", e))?;

        response.bytes().await
            .map_err(|e| format!("Failed to read response: {}", e))
            .map(|bytes| bytes.to_vec())
    }

    /// 下载文件范围
    async fn download_range(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        start: u64,
        length: u64,
    ) -> Result<Vec<u8>, String> {
        let client = reqwest::Client::new();
        let mut request = client.get(url)
            .header("Range", format!("bytes={}-{}", start, start + length - 1));

        for (key, value) in headers {
            request = request.header(key, value);
        }

        let response = request.send().await
            .map_err(|e| format!("Failed to download range: {}", e))?;

        response.bytes().await
            .map_err(|e| format!("Failed to read range response: {}", e))
            .map(|bytes| bytes.to_vec())
    }

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
                        modified_time: None, // 简化处理，暂时不处理时间戳
                        crc32: Some(file.crc32()),
                        index: i,
                        metadata: std::collections::HashMap::new(),
                    });
                }
                Err(e) => {
                    println!("Warning: Failed to read entry {}: {}", i, e);
                    continue;
                }
            }
        }

        Ok(ArchiveInfo {
            compression_type: CompressionType::Zip,
            entries,
            total_entries: archive.len(),
            total_uncompressed_size,
            total_compressed_size: data.len() as u64,
            supports_streaming: true,
            supports_random_access: true,
            analysis_status: AnalysisStatus::Complete,
        })
    }

    /// 完整TAR.GZ文件分析
    fn analyze_tar_gz_complete(data: &[u8]) -> Result<ArchiveInfo, String> {
        let cursor = Cursor::new(data);
        let decoder = GzDecoder::new(cursor);
        let mut archive = Archive::new(decoder);

        let mut entries = Vec::new();
        let mut total_uncompressed_size = 0;
        let mut index = 0;

        for entry_result in archive.entries().map_err(|e| e.to_string())? {
            match entry_result {
                Ok(entry) => {
                    let size = entry.size();
                    total_uncompressed_size += size;

                    if let Ok(path) = entry.path() {
                        entries.push(ArchiveEntry {
                            path: path.to_string_lossy().to_string(),
                            size,
                            compressed_size: None,
                            is_dir: entry.header().entry_type().is_dir(),
                            modified_time: entry.header().mtime().ok().map(|t| {
                                chrono::DateTime::from_timestamp(t as i64, 0)
                                    .unwrap_or_default()
                                    .to_rfc3339()
                            }),
                            crc32: None,
                            index,
                            metadata: std::collections::HashMap::new(),
                        });
                    }

                    index += 1;
                }
                Err(e) => {
                    println!("Warning: Failed to read TAR entry: {}", e);
                    break;
                }
            }
        }

        Ok(ArchiveInfo {
            compression_type: CompressionType::TarGz,
            entries,
            total_entries: index,
            total_uncompressed_size,
            total_compressed_size: data.len() as u64,
            supports_streaming: true,
            supports_random_access: false,
            analysis_status: AnalysisStatus::Complete,
        })
    }

    /// 完整TAR文件分析
    fn analyze_tar_complete(data: &[u8]) -> Result<ArchiveInfo, String> {
        let cursor = Cursor::new(data);
        let mut archive = Archive::new(cursor);

        let mut entries = Vec::new();
        let mut total_uncompressed_size = 0;
        let mut index = 0;

        for entry_result in archive.entries().map_err(|e| e.to_string())? {
            match entry_result {
                Ok(entry) => {
                    let size = entry.size();
                    total_uncompressed_size += size;

                    if let Ok(path) = entry.path() {
                        entries.push(ArchiveEntry {
                            path: path.to_string_lossy().to_string(),
                            size,
                            compressed_size: None,
                            is_dir: entry.header().entry_type().is_dir(),
                            modified_time: entry.header().mtime().ok().map(|t| {
                                chrono::DateTime::from_timestamp(t as i64, 0)
                                    .unwrap_or_default()
                                    .to_rfc3339()
                            }),
                            crc32: None,
                            index,
                            metadata: std::collections::HashMap::new(),
                        });
                    }

                    index += 1;
                }
                Err(e) => {
                    println!("Warning: Failed to read TAR entry: {}", e);
                    break;
                }
            }
        }

        Ok(ArchiveInfo {
            compression_type: CompressionType::Tar,
            entries,
            total_entries: index,
            total_uncompressed_size,
            total_compressed_size: data.len() as u64,
            supports_streaming: true,
            supports_random_access: false,
            analysis_status: AnalysisStatus::Complete,
        })
    }

    /// 完整GZIP文件分析
    fn analyze_gzip_complete(data: &[u8]) -> Result<ArchiveInfo, String> {
        let cursor = Cursor::new(data);
        let mut decoder = GzDecoder::new(cursor);
        let mut decompressed = Vec::new();

        decoder.read_to_end(&mut decompressed).map_err(|e| e.to_string())?;

        // GZIP通常只包含一个文件
        let entry = ArchiveEntry {
            path: "decompressed_file".to_string(),
            size: decompressed.len() as u64,
            compressed_size: Some(data.len() as u64),
            is_dir: false,
            modified_time: None,
            crc32: None,
            index: 0,
            metadata: std::collections::HashMap::new(),
        };

        Ok(ArchiveInfo {
            compression_type: CompressionType::Gzip,
            entries: vec![entry],
            total_entries: 1,
            total_uncompressed_size: decompressed.len() as u64,
            total_compressed_size: data.len() as u64,
            supports_streaming: true,
            supports_random_access: false,
            analysis_status: AnalysisStatus::Complete,
        })
    }

    /// 流式分析（适用于大文件）
    async fn analyze_streaming(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        filename: &str,
        compression_type: CompressionType,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        match compression_type {
            CompressionType::Zip => Self::analyze_zip_streaming(url, headers, filename, file_size).await,
            CompressionType::TarGz => Self::analyze_tar_gz_streaming(url, headers, filename, file_size).await,
            CompressionType::Gzip => Self::analyze_gzip_streaming(url, headers, filename, file_size).await,
            _ => Err(format!("Streaming analysis not supported for {}", compression_type.as_str())),
        }
    }

    /// 流式分析（无文件大小信息）
    async fn analyze_streaming_without_size(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        filename: &str,
        compression_type: CompressionType,
    ) -> Result<ArchiveInfo, String> {
        match compression_type {
            CompressionType::Zip => Self::analyze_zip_streaming_without_size(url, headers, filename).await,
            CompressionType::TarGz => Self::analyze_tar_gz_streaming_without_size(url, headers, filename).await,
            CompressionType::Gzip => Self::analyze_gzip_streaming_without_size(url, headers, filename).await,
            _ => Err(format!("Streaming analysis not supported for {}", compression_type.as_str())),
        }
    }

    /// 流式分析ZIP文件
    async fn analyze_zip_streaming(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        println!("开始分析ZIP文件: {} (大小: {} 字节)", filename, file_size);

        // 读取文件头部（前1MB）和尾部（更大范围）
        let header_size = (1024 * 1024).min(file_size / 2);
        // 增加尾部搜索范围到5MB，以处理有注释的ZIP文件
        let tail_size = (5 * 1024 * 1024).min(file_size / 2);

        println!("下载头部数据: {} 字节", header_size);
        let header_data = Self::download_range(url, headers, 0, header_size).await?;
        println!("头部数据下载完成: {} 字节", header_data.len());

        let tail_start = file_size.saturating_sub(tail_size);
        println!("下载尾部数据: 从位置 {} 开始，{} 字节", tail_start, tail_size);
        let tail_data = Self::download_range(url, headers, tail_start, tail_size).await?;
        println!("尾部数据下载完成: {} 字节", tail_data.len());

        // 验证ZIP签名
        if header_data.len() < 4 {
            return Err("File too small to be a valid ZIP".to_string());
        }
        let signature = u32::from_le_bytes([header_data[0], header_data[1], header_data[2], header_data[3]]);
        println!("ZIP签名: 0x{:08x} (期望: 0x04034b50)", signature);
        if signature != 0x04034b50 {
            return Err("Invalid ZIP signature".to_string());
        }

        // 查找EOCD（End of Central Directory）记录
        println!("开始查找EOCD记录...");
        if let Some(eocd_info) = Self::find_eocd_in_tail(&tail_data)? {
            println!("找到EOCD记录: 总条目数={}, 中央目录大小={}, 偏移={}",
                eocd_info.total_entries, eocd_info.central_dir_size, eocd_info.central_dir_offset);

            let mut entries = Vec::new();

            // 如果条目数量不多，尝试读取中央目录
            if eocd_info.total_entries <= 1000 {
                println!("尝试读取中央目录...");
                if let Ok(cd_entries) = Self::read_central_directory(
                    url, headers, &eocd_info
                ).await {
                    println!("成功读取到 {} 个条目", cd_entries.len());
                    entries = cd_entries;
                } else {
                    println!("读取中央目录失败");
                }
            } else {
                println!("条目数量过多 ({}), 跳过读取中央目录", eocd_info.total_entries);
            }

            // 如果没有读取到具体条目，创建占位符
            if entries.is_empty() {
                println!("创建占位符条目");
                entries.push(ArchiveEntry {
                    path: filename.to_string(),
                    size: 0,
                    compressed_size: Some(file_size),
                    is_dir: true,
                    modified_time: None,
                    crc32: None,
                    index: 0,
                    metadata: std::collections::HashMap::new(),
                });
            }

            let is_streaming = entries.len() == 1;
            println!("分析完成: {} 个条目, 流式模式: {}", entries.len(), is_streaming);

            Ok(ArchiveInfo {
                compression_type: CompressionType::Zip,
                entries,
                total_entries: eocd_info.total_entries,
                total_uncompressed_size: eocd_info.uncompressed_size,
                total_compressed_size: file_size,
                supports_streaming: true,
                supports_random_access: true,
                analysis_status: if is_streaming {
                    AnalysisStatus::Streaming { estimated_entries: Some(eocd_info.total_entries) }
                } else {
                    AnalysisStatus::Complete
                },
            })
        } else {
            println!("未找到EOCD记录");
            Err("Could not find EOCD record in ZIP file".to_string())
        }
    }

    /// 流式分析TAR.GZ文件（简化版本）
    async fn analyze_tar_gz_streaming(
        _url: &str,
        _headers: &std::collections::HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        // 创建占位符条目
        let entry = ArchiveEntry {
            path: filename.to_string(),
            size: 0,
            compressed_size: Some(file_size),
            is_dir: true,
            modified_time: None,
            crc32: None,
            index: 0,
            metadata: std::collections::HashMap::new(),
        };

        Ok(ArchiveInfo {
            compression_type: CompressionType::TarGz,
            entries: vec![entry],
            total_entries: 1,
            total_uncompressed_size: 0,
            total_compressed_size: file_size,
            supports_streaming: true,
            supports_random_access: false,
            analysis_status: AnalysisStatus::Streaming { estimated_entries: None },
        })
    }

    /// 流式分析GZIP文件
    async fn analyze_gzip_streaming(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        filename: &str,
        file_size: u64,
    ) -> Result<ArchiveInfo, String> {
        println!("开始分析GZIP文件: {} (大小: {} 字节)", filename, file_size);

        // 读取GZIP文件头部来获取更多信息
        let header_size = (1024).min(file_size);
        let header_data = Self::download_range(url, headers, 0, header_size).await?;

        // 验证GZIP签名
        if header_data.len() < 3 || header_data[0] != 0x1f || header_data[1] != 0x8b {
            return Err("Invalid GZIP signature".to_string());
        }

        // 读取文件尾部获取原始大小
        let mut original_size = None;
        if file_size >= 8 {
            let tail_data = Self::download_range(url, headers, file_size - 8, 8).await?;
            if tail_data.len() >= 4 {
                original_size = Some(u32::from_le_bytes([
                    tail_data[tail_data.len() - 4],
                    tail_data[tail_data.len() - 3],
                    tail_data[tail_data.len() - 2],
                    tail_data[tail_data.len() - 1],
                ]) as u64);
            }
        }

        // 尝试从文件名推断原始文件名
        let original_filename = if filename.ends_with(".gz") {
            filename.strip_suffix(".gz").unwrap_or(filename).to_string()
        } else {
            "decompressed_file".to_string()
        };

        let entry = ArchiveEntry {
            path: original_filename,
            size: original_size.unwrap_or(0),
            compressed_size: Some(file_size),
            is_dir: false,
            modified_time: None,
            crc32: None,
            index: 0,
            metadata: std::collections::HashMap::new(),
        };

        Ok(ArchiveInfo {
            compression_type: CompressionType::Gzip,
            entries: vec![entry],
            total_entries: 1,
            total_uncompressed_size: original_size.unwrap_or(0),
            total_compressed_size: file_size,
            supports_streaming: true,
            supports_random_access: false,
            analysis_status: AnalysisStatus::Streaming { estimated_entries: Some(1) },
        })
    }

    /// 流式分析TAR.GZ文件（无文件大小）
    async fn analyze_tar_gz_streaming_without_size(
        _url: &str,
        _headers: &std::collections::HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        // 创建占位符条目
        let entry = ArchiveEntry {
            path: filename.to_string(),
            size: 0,
            compressed_size: None,
            is_dir: true,
            modified_time: None,
            crc32: None,
            index: 0,
            metadata: std::collections::HashMap::new(),
        };

        Ok(ArchiveInfo {
            compression_type: CompressionType::TarGz,
            entries: vec![entry],
            total_entries: 1,
            total_uncompressed_size: 0,
            total_compressed_size: 0,
            supports_streaming: true,
            supports_random_access: false,
            analysis_status: AnalysisStatus::Streaming { estimated_entries: None },
        })
    }

    /// 流式分析GZIP文件（无文件大小）
    async fn analyze_gzip_streaming_without_size(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        println!("开始分析GZIP文件（无文件大小信息）: {}", filename);

        // 尝试读取少量头部数据来验证格式
        let header_data = Self::download_range(url, headers, 0, 1024).await?;

        // 验证GZIP签名
        if header_data.len() < 3 || header_data[0] != 0x1f || header_data[1] != 0x8b {
            return Err("Invalid GZIP signature".to_string());
        }

        // 尝试从文件名推断原始文件名
        let original_filename = if filename.ends_with(".gz") {
            filename.strip_suffix(".gz").unwrap_or(filename).to_string()
        } else {
            "decompressed_file".to_string()
        };

        let entry = ArchiveEntry {
            path: original_filename,
            size: 0,
            compressed_size: None,
            is_dir: false,
            modified_time: None,
            crc32: None,
            index: 0,
            metadata: std::collections::HashMap::new(),
        };

        Ok(ArchiveInfo {
            compression_type: CompressionType::Gzip,
            entries: vec![entry],
            total_entries: 1,
            total_uncompressed_size: 0,
            total_compressed_size: 0,
            supports_streaming: true,
            supports_random_access: false,
            analysis_status: AnalysisStatus::Streaming { estimated_entries: Some(1) },
        })
    }

    /// 流式分析ZIP文件（无文件大小）
    async fn analyze_zip_streaming_without_size(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        filename: &str,
    ) -> Result<ArchiveInfo, String> {
        println!("开始分析ZIP文件（无文件大小信息）: {}", filename);

        // 读取文件头部验证格式
        let header_data = Self::download_range(url, headers, 0, 1024).await?;

        // 验证ZIP签名
        if header_data.len() < 4 {
            return Err("File too small to be a valid ZIP".to_string());
        }
        let signature = u32::from_le_bytes([header_data[0], header_data[1], header_data[2], header_data[3]]);
        if signature != 0x04034b50 {
            return Err("Invalid ZIP signature".to_string());
        }

        // 创建占位符条目
        let entry = ArchiveEntry {
            path: filename.to_string(),
            size: 0,
            compressed_size: None,
            is_dir: true,
            modified_time: None,
            crc32: None,
            index: 0,
            metadata: std::collections::HashMap::new(),
        };

        Ok(ArchiveInfo {
            compression_type: CompressionType::Zip,
            entries: vec![entry],
            total_entries: 1,
            total_uncompressed_size: 0,
            total_compressed_size: 0,
            supports_streaming: true,
            supports_random_access: true,
            analysis_status: AnalysisStatus::Streaming { estimated_entries: None },
        })
    }

    /// 在尾部数据中查找EOCD记录
    fn find_eocd_in_tail(tail_data: &[u8]) -> Result<Option<EOCDInfo>, String> {
        let eocd_signature = [0x50, 0x4b, 0x05, 0x06];
        let zip64_eocd_signature = [0x50, 0x4b, 0x06, 0x06];

        println!("在 {} 字节的尾部数据中查找EOCD签名: {:02x} {:02x} {:02x} {:02x}",
            tail_data.len(), eocd_signature[0], eocd_signature[1], eocd_signature[2], eocd_signature[3]);

        // 首先查找ZIP64 EOCD记录
        println!("查找ZIP64 EOCD签名: {:02x} {:02x} {:02x} {:02x}",
            zip64_eocd_signature[0], zip64_eocd_signature[1], zip64_eocd_signature[2], zip64_eocd_signature[3]);

        for i in (0..tail_data.len().saturating_sub(56)).rev() {
            if tail_data.len() >= i + 4 && &tail_data[i..i+4] == zip64_eocd_signature {
                println!("在位置 {} 找到ZIP64 EOCD签名", i);
                if let Ok(eocd) = Self::parse_zip64_eocd(&tail_data[i..]) {
                    println!("ZIP64 EOCD解析成功");
                    return Ok(Some(eocd));
                } else {
                    println!("ZIP64 EOCD解析失败");
                }
            }
        }

        // 然后查找普通EOCD记录 - 修复边界问题
        println!("查找普通EOCD签名...");

        // 搜索范围应该包括整个尾部数据
        if tail_data.len() >= 22 {
            for i in (0..=tail_data.len()-4).rev() {
                if &tail_data[i..i+4] == eocd_signature {
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

    /// 读取中央目录
    async fn read_central_directory(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        eocd: &EOCDInfo,
    ) -> Result<Vec<ArchiveEntry>, String> {
        println!("读取中央目录: 偏移={}, 大小={}", eocd.central_dir_offset, eocd.central_dir_size);

        let cd_data = Self::download_range(
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
                metadata: std::collections::HashMap::new(),
            });

            offset += 46 + filename_len + extra_len + comment_len;
        }

        println!("中央目录解析完成: {} 个条目", entries.len());
        Ok(entries)
    }
}

/// EOCD记录信息
#[derive(Debug, Clone)]
struct EOCDInfo {
    total_entries: usize,
    central_dir_size: u64,
    central_dir_offset: u64,
    uncompressed_size: u64,
}
