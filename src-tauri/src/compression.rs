use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read};
use tar::Archive;
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntry {
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified_time: Option<String>,
    pub compressed_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveInfo {
    pub entries: Vec<ArchiveEntry>,
    pub total_entries: usize,
    pub compression_type: String,
    pub total_uncompressed_size: u64,
    pub total_compressed_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePreview {
    pub content: String,
    pub is_truncated: bool,
    pub total_size: u64,
    pub encoding: String,
}

pub enum CompressionType {
    Zip,
    Gzip,
    Tar,
    TarGz,
    Brotli,
    Lz4,
    Zstd,
    Unknown,
}

impl CompressionType {
    pub fn from_filename(filename: &str) -> Self {
        let lower = filename.to_lowercase();
        if lower.ends_with(".zip") {
            CompressionType::Zip
        } else if lower.ends_with(".gz") && !lower.ends_with(".tar.gz") {
            CompressionType::Gzip
        } else if lower.ends_with(".tar") {
            CompressionType::Tar
        } else if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
            CompressionType::TarGz
        } else if lower.ends_with(".br") {
            CompressionType::Brotli
        } else if lower.ends_with(".lz4") {
            CompressionType::Lz4
        } else if lower.ends_with(".zst") || lower.ends_with(".zstd") {
            CompressionType::Zstd
        } else {
            CompressionType::Unknown
        }
    }

    /// 通过文件内容检测压缩格式
    pub fn from_content(data: &[u8]) -> Self {
        if data.len() < 4 {
            return CompressionType::Unknown;
        }

        // ZIP文件签名检测
        let signature = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
        if signature == 0x04034b50 || signature == 0x02014b50 {
            return CompressionType::Zip;
        }

        // GZIP文件签名 (1f 8b)
        if data[0] == 0x1f && data[1] == 0x8b {
            return CompressionType::Gzip;
        }

        // TAR文件检测（检查TAR文件头）
        if data.len() >= 262 {
            // TAR文件在偏移257处有"ustar"标识
            if &data[257..262] == b"ustar" {
                return CompressionType::Tar;
            }
        }

        // Brotli文件检测
        if data.len() >= 3 && data[0] == 0xce && data[1] == 0xb2 && data[2] == 0xcf {
            return CompressionType::Brotli;
        }

        // LZ4文件检测
        if data.len() >= 4 {
            let lz4_magic = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
            if lz4_magic == 0x184D2204 {
                return CompressionType::Lz4;
            }
        }

        // Zstandard文件检测
        if data.len() >= 4 {
            let zstd_magic = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
            if zstd_magic & 0xFFFFFFF0 == 0xFD2FB520 {
                return CompressionType::Zstd;
            }
        }

        CompressionType::Unknown
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            CompressionType::Zip => "zip",
            CompressionType::Gzip => "gzip",
            CompressionType::Tar => "tar",
            CompressionType::TarGz => "tar.gz",
            CompressionType::Brotli => "brotli",
            CompressionType::Lz4 => "lz4",
            CompressionType::Zstd => "zstd",
            CompressionType::Unknown => "unknown",
        }
    }
}

pub struct ArchiveAnalyzer;

impl ArchiveAnalyzer {
    /// 为大文件优化的流式分析入口点
    pub fn analyze_archive_streaming(
        header_data: &[u8],
        tail_data: &[u8],
        file_size: u64,
        filename: &str
    ) -> Result<ArchiveInfo, String> {
        println!("Using streaming analysis for large archive: {} ({:.2} MB)",
                 filename, file_size as f64 / 1024.0 / 1024.0);

        // 从头部数据检测压缩类型
        let compression_type = CompressionType::from_content(header_data);
        println!("Detected compression type from header: {}", compression_type.as_str());

        match compression_type {
            CompressionType::Zip => {
                Self::analyze_zip_streaming(header_data, tail_data, file_size, filename)
            },
            _ => Err(format!("Streaming analysis not supported for compression type: {}", compression_type.as_str()))
        }
    }

    /// 流式ZIP文件分析 - 仅使用头部和尾部数据
    fn analyze_zip_streaming(
        header_data: &[u8],
        tail_data: &[u8],
        file_size: u64,
        filename: &str
    ) -> Result<ArchiveInfo, String> {
        println!("Analyzing ZIP file in streaming mode");

        // 验证头部签名
        if header_data.len() < 4 {
            return Err("Header data too small".to_string());
        }

        let signature = u32::from_le_bytes([header_data[0], header_data[1], header_data[2], header_data[3]]);
        if signature != 0x04034b50 && signature != 0x02014b50 {
            return Err("Invalid ZIP file signature".to_string());
        }

        // 搜索EOCD记录
        Self::find_eocd_in_tail(tail_data, file_size, filename)
    }

    /// 在尾部数据中查找EOCD记录
    fn find_eocd_in_tail(
        tail_data: &[u8],
        file_size: u64,
        filename: &str
    ) -> Result<ArchiveInfo, String> {
        println!("Searching for EOCD in {} bytes of tail data", tail_data.len());

        // 标准EOCD签名 - 注意字节序
        let eocd_signature = [0x50, 0x4b, 0x05, 0x06];
        let mut eocd_found = false;

        // 从后向前搜索EOCD
        println!("Main search: Looking for EOCD signature [50, 4b, 05, 06] in {} bytes", tail_data.len());

        // EOCD记录必须在文件的最后，所以我们从数据块末尾开始搜索
        // 标准EOCD记录固定为22字节，但可能有可变长度的注释
        let search_start = tail_data.len().saturating_sub(65557); // 最大注释长度65535 + 22字节EOCD
        let search_end = tail_data.len();

        println!("Main search: Will check range from {} to {}", search_start, search_end);

        // 修复：确保我们搜索到能容纳完整EOCD记录的最后位置
        // 我们需要至少22字节来读取EOCD，所以最后有效位置是 len - 22
        let last_valid_position = tail_data.len().saturating_sub(22);
        for i in (search_start..=last_valid_position).rev() {
            if tail_data.len() >= i + 4 && &tail_data[i..i+4] == eocd_signature {
                println!("Found standard EOCD signature at tail offset {}", i);
                eocd_found = true;

                if tail_data.len() >= i + 22 {
                    return Self::parse_eocd_from_tail(&tail_data[i..], file_size, filename, tail_data);
                } else {
                    println!("EOCD signature found but insufficient data for parsing");
                }
            }
        }

        if !eocd_found {
            println!("No standard EOCD signature found, checking for ZIP64...");
        }

        // 检查ZIP64格式
        let zip64_locator_sig = [0x50, 0x4b, 0x06, 0x07];
        let zip64_eocd_sig = [0x50, 0x4b, 0x06, 0x06];

        for i in (0..tail_data.len().saturating_sub(20)).rev() {
            if tail_data.len() >= i + 4 {
                if &tail_data[i..i+4] == zip64_locator_sig {
                    println!("Found ZIP64 EOCD locator at offset {} - this is a ZIP64 file", i);
                    return Ok(Self::create_zip64_info(file_size));
                }

                if &tail_data[i..i+4] == zip64_eocd_sig {
                    println!("Found ZIP64 EOCD record at offset {}", i);
                    return Ok(Self::create_zip64_info(file_size));
                }
            }
        }

        // 如果没有找到任何EOCD，进行详细诊断
        if !eocd_found {
            Self::diagnose_tail_data(tail_data, filename);
        }

        Err(format!(
            "No EOCD record found in {} bytes of tail data for file '{}'. \
            File may be corrupted, truncated, or use an unsupported ZIP variant.",
            tail_data.len(), filename
        ))
    }

    /// 诊断尾部数据，查找可能的问题
    fn diagnose_tail_data(tail_data: &[u8], filename: &str) {
        println!("=== Diagnostic Analysis for '{}' ===", filename);

        // 打印最后64字节的十六进制
        let debug_size = 64.min(tail_data.len());
        let tail_hex = tail_data[tail_data.len()-debug_size..].iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<_>>()
            .join(" ");
        println!("Last {} bytes (hex): {}", debug_size, tail_hex);

        // 直接检查最后几个字节中是否包含EOCD签名
        let eocd_pattern = [0x50, 0x4b, 0x05, 0x06];
        let mut eocd_positions = Vec::new();

        for i in 0..tail_data.len().saturating_sub(4) {
            if &tail_data[i..i+4] == eocd_pattern {
                eocd_positions.push(i);
                println!("*** DIRECT EOCD CHECK: Found EOCD signature at offset {} ***", i);
            }
        }

        if !eocd_positions.is_empty() {
            println!("*** CRITICAL: EOCD signatures found at positions: {:?} ***", eocd_positions);
            println!("*** This means our main search algorithm has a bug! ***");
        }

        // 搜索所有ZIP相关签名
        let signatures = [
            (0x04034b50, "Local file header"),        // PK\x03\x04
            (0x02014b50, "Central directory header"),  // PK\x01\x02
            (0x06054b50, "Standard EOCD"),            // PK\x05\x06
            (0x07064b50, "ZIP64 EOCD locator"),       // PK\x06\x07
            (0x06064b50, "ZIP64 EOCD record"),        // PK\x06\x06
            (0x08074b50, "Data descriptor"),          // PK\x07\x08
        ];

        println!("Searching for ZIP signatures in tail data:");
        let mut signatures_found = 0;

        for i in 0..tail_data.len().saturating_sub(4) {
            let sig = u32::from_le_bytes([tail_data[i], tail_data[i+1], tail_data[i+2], tail_data[i+3]]);

            for (expected_sig, name) in signatures.iter() {
                if sig == *expected_sig {
                    println!("  Found {} (0x{:08x}) at offset {}", name, sig, i);
                    signatures_found += 1;

                    // 如果找到EOCD，显示详细信息
                    if sig == 0x06054b50 {
                        println!("    EOCD signature found at offset {}!", i);
                        if i + 22 <= tail_data.len() {
                            let entries = u16::from_le_bytes([tail_data[i+10], tail_data[i+11]]);
                            let cd_size = u32::from_le_bytes([tail_data[i+12], tail_data[i+13], tail_data[i+14], tail_data[i+15]]);
                            let cd_offset = u32::from_le_bytes([tail_data[i+16], tail_data[i+17], tail_data[i+18], tail_data[i+19]]);
                            println!("    EOCD details: entries={}, cd_size={}, cd_offset={}", entries, cd_size, cd_offset);
                        }
                    }
                }
            }
        }

        if signatures_found == 0 {
            println!("  No ZIP signatures found in tail data");

            // 检查是否看起来像压缩数据
            let mut entropy = 0.0;
            let mut byte_counts = [0; 256];
            for &byte in tail_data.iter().take(1024) {
                byte_counts[byte as usize] += 1;
            }

            let sample_size = 1024.min(tail_data.len()) as f64;
            for &count in byte_counts.iter() {
                if count > 0 {
                    let p = count as f64 / sample_size;
                    entropy -= p * p.log2();
                }
            }

            println!("  Data entropy (first 1KB): {:.2} bits", entropy);

            if entropy > 6.0 {
                println!("  High entropy suggests compressed data");
            } else {
                println!("  Low entropy suggests uncompressed or corrupted data");
            }
        } else {
            println!("  Found {} ZIP-related signatures", signatures_found);
        }

        println!("=== End Diagnostic Analysis ===");
    }    /// 解析EOCD记录
    fn parse_eocd_from_tail(
        eocd_data: &[u8],
        file_size: u64,
        _filename: &str,
        full_tail_data: &[u8],
    ) -> Result<ArchiveInfo, String> {
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

        println!("EOCD parsed - entries: {}, central_dir_size: {}, central_dir_offset: {}",
                 total_entries, central_dir_size, central_dir_offset);

        // 尝试从中央目录读取第一个文件的真实名称（适用于小的中央目录）
        let first_file_name = if total_entries <= 10 && central_dir_size <= 2048 {
            println!("Attempting to extract filename for single file ZIP. CD size: {}, offset: {}", central_dir_size, central_dir_offset);
            // 对于小的中央目录，尝试提取真实文件名
            Self::try_extract_first_filename_from_tail(eocd_data, central_dir_offset, file_size, full_tail_data.len())
                .or_else(|| {
                    println!("First method failed, trying complete tail extraction");
                    // 如果从尾部数据提取失败，尝试通过完整的tail_data提取
                    Self::try_extract_filename_from_complete_tail(full_tail_data, central_dir_offset, file_size)
                })
        } else {
            println!("Skipping filename extraction: entries={}, cd_size={}", total_entries, central_dir_size);
            None
        };

        // 对于大量文件，创建摘要信息
        let entries = if total_entries > 500 {
            vec![ArchiveEntry {
                path: format!("ZIP Archive - {} files (streaming mode)", total_entries),
                size: 0,
                is_dir: true,
                modified_time: None,
                compressed_size: Some(central_dir_size),
            }]
        } else if total_entries == 1 {
            // 对于单文件ZIP，尝试提供更有意义的信息
            let display_name = match first_file_name {
                Some(ref name) => {
                    // 如果成功提取了文件名，显示真实文件名
                    format!("{} ({:.1} MB)", name, file_size as f64 / 1024.0 / 1024.0)
                },
                None => {
                    // 如果无法提取文件名，显示通用信息
                    format!("Single file ZIP archive ({:.1} MB)", file_size as f64 / 1024.0 / 1024.0)
                }
            };

            vec![ArchiveEntry {
                path: display_name,
                size: 0, // 无法在流式模式下获取解压缩大小
                is_dir: false,
                modified_time: None,
                compressed_size: Some(file_size - central_dir_size - 22), // 估算的压缩数据大小
            }]
        } else {
            // 创建占位符条目
            (0..total_entries.min(100)).map(|i| {
                ArchiveEntry {
                    path: format!("entry_{:04}.dat", i + 1),
                    size: 0,
                    is_dir: false,
                    modified_time: None,
                    compressed_size: None,
                }
            }).collect()
        };

        Ok(ArchiveInfo {
            entries,
            total_entries,
            compression_type: "zip (streaming)".to_string(),
            total_uncompressed_size: 0,
            total_compressed_size: file_size,
        })
    }

    /// 尝试从尾部数据中提取第一个文件的真实名称
    fn try_extract_first_filename_from_tail(
        eocd_data: &[u8],
        central_dir_offset: u64,
        file_size: u64,
        tail_data_len: usize,
    ) -> Option<String> {
        // 计算中央目录在整个尾部数据中的偏移量
        let tail_start_offset = file_size - tail_data_len as u64;

        if central_dir_offset < tail_start_offset {
            return None;
        }

        // 中央目录相对于EOCD数据开始位置的偏移量
        let eocd_start_in_file = file_size - eocd_data.len() as u64;
        if central_dir_offset < eocd_start_in_file {
            return None;
        }

        let cd_offset_in_eocd_data = (central_dir_offset - eocd_start_in_file) as usize;

        Self::extract_filename_from_data(eocd_data, cd_offset_in_eocd_data)
    }

    /// 尝试从完整的尾部数据中提取文件名
    fn try_extract_filename_from_complete_tail(
        tail_data: &[u8],
        central_dir_offset: u64,
        file_size: u64,
    ) -> Option<String> {
        let tail_start_offset = file_size - tail_data.len() as u64;

        if central_dir_offset < tail_start_offset {
            return None;
        }

        let cd_offset_in_tail = (central_dir_offset - tail_start_offset) as usize;

        Self::extract_filename_from_data(tail_data, cd_offset_in_tail)
    }

    /// 通用的文件名提取函数
    fn extract_filename_from_data(data: &[u8], cd_offset: usize) -> Option<String> {
        if cd_offset + 46 > data.len() {
            return None;
        }

        // 检查中央目录文件头签名 (0x02014b50)
        let cd_signature = u32::from_le_bytes([
            data[cd_offset],
            data[cd_offset + 1],
            data[cd_offset + 2],
            data[cd_offset + 3],
        ]);

        if cd_signature != 0x02014b50 {
            return None;
        }

        // 读取文件名长度（偏移28-29）
        let filename_len = u16::from_le_bytes([
            data[cd_offset + 28],
            data[cd_offset + 29],
        ]) as usize;

        if filename_len == 0 || cd_offset + 46 + filename_len > data.len() {
            return None;
        }

        // 提取文件名
        let filename_bytes = &data[cd_offset + 46..cd_offset + 46 + filename_len];

        String::from_utf8(filename_bytes.to_vec()).ok()
    }

    /// 创建ZIP64文件信息
    fn create_zip64_info(file_size: u64) -> ArchiveInfo {
        ArchiveInfo {
            entries: vec![ArchiveEntry {
                path: format!("ZIP64 Archive ({:.1} MB) - Large format", file_size as f64 / 1024.0 / 1024.0),
                size: 0,
                is_dir: true,
                modified_time: None,
                compressed_size: None,
            }],
            total_entries: 1,
            compression_type: "zip64 (streaming)".to_string(),
            total_uncompressed_size: 0,
            total_compressed_size: file_size,
        }
    }

    /// 验证是否为有效的ZIP文件
    fn is_valid_zip(data: &[u8]) -> bool {
        // 检查文件大小（至少需要22字节用于EOCD记录）
        if data.len() < 22 {
            println!("File too small for ZIP format: {} bytes", data.len());
            return false;
        }

        let file_size_mb = data.len() as f64 / 1024.0 / 1024.0;
        println!("Validating ZIP file of {:.2} MB", file_size_mb);

        // 对于大文件，采用更宽松的检查策略
        let is_large_file = file_size_mb > 100.0;

        // 检查ZIP文件签名
        // 本地文件头签名 (0x04034b50) 或中央目录文件头签名 (0x02014b50)
        if data.len() >= 4 {
            let signature = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
            println!("File starts with signature: 0x{:08x}", signature);

            if signature == 0x04034b50 {
                println!("Found local file header signature at start");
                // 如果文件开头有正确的ZIP签名，对于大文件可以更宽松
                if is_large_file {
                    println!("Large file with valid header, accepting as valid ZIP");
                    return true; // 对大文件，有正确开头签名就认为有效
                }
            } else if signature == 0x02014b50 {
                println!("Found central directory header signature at start");
                if is_large_file {
                    return true;
                }
            } else {
                println!("No ZIP signature at start, checking for self-extracting archive");
                // 如果开头不是ZIP签名，检查是否是自解压文件
                if Self::find_zip_signature(data) {
                    println!("Found ZIP signature in self-extracting archive");
                    return true;
                }
            }
        }

        // 打印文件开头的十六进制数据用于调试
        let head_size = 32.min(data.len());
        println!("First {} bytes (hex): {}", head_size,
                  data[..head_size].iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(" "));

        // 检查EOCD签名是否存在
        let has_eocd = Self::has_eocd_signature(data);
        println!("EOCD signature check result: {}", has_eocd);
        has_eocd
    }

    /// 查找ZIP文件签名（适用于自解压文件）
    fn find_zip_signature(data: &[u8]) -> bool {
        if data.len() < 4 {
            return false;
        }

        for i in 0..=data.len().saturating_sub(4) {
            let signature = u32::from_le_bytes([data[i], data[i+1], data[i+2], data[i+3]]);
            if signature == 0x04034b50 || signature == 0x02014b50 {
                return true;
            }
        }
        false
    }

    /// 检查EOCD（End of Central Directory）签名，返回详细的诊断信息
    fn has_eocd_signature(data: &[u8]) -> bool {
        if data.len() < 22 {
            println!("File too small for EOCD record: {} bytes", data.len());
            return false;
        }

        let file_size = data.len();
        println!("Searching for EOCD signature in file of {} bytes ({:.2} MB)",
                  file_size, file_size as f64 / 1024.0 / 1024.0);

        // 首先检查ZIP64 EOCD定位器 (0x07064b50)
        if Self::has_zip64_eocd_locator(data) {
            println!("Found ZIP64 EOCD locator");
            return true;
        }

        // 然后检查标准EOCD签名 (0x06054b50)
        let search_start = data.len().saturating_sub(65557);
        let search_end = data.len().saturating_sub(3);

        println!("Searching for standard EOCD from byte {} to {}", search_start, search_end);

        let mut signatures_found = Vec::new();

        for i in (search_start..search_end).rev() {
            if i + 3 < data.len() {
                let signature = u32::from_le_bytes([data[i], data[i+1], data[i+2], data[i+3]]);
                if signature == 0x06054b50 {
                    println!("Found standard EOCD signature at offset {}", i);
                    return true;
                }

                // 收集找到的其他签名
                if (search_end - i) % 10000 == 0 {
                    signatures_found.push((i, signature));
                }
            }
        }

        // 打印诊断信息
        println!("No EOCD signature found in {} bytes of search", search_end - search_start);
        println!("Sample signatures found during search:");
        for (offset, sig) in signatures_found.iter().take(5) {
            println!("  Offset {}: 0x{:08x}", offset, sig);
        }

        // 打印文件末尾的字节进行分析
        let tail_sizes = [50, 100, 200, 500].iter()
            .find(|&&size| size <= data.len())
            .unwrap_or(&50);
        let tail_start = data.len() - tail_sizes;

        println!("Last {} bytes (hex): {}", tail_sizes,
                  data[tail_start..].iter()
                      .map(|b| format!("{:02x}", b))
                      .collect::<Vec<_>>()
                      .join(" "));

        // 检查文件是否可能被截断
        let expected_patterns = [
            (0x504b0506, "Standard EOCD signature"),
            (0x504b0708, "Data descriptor signature"),
            (0x504b0304, "Local file header"),
            (0x504b0102, "Central directory header"),
        ];

        println!("Looking for known ZIP patterns in file tail:");
        for (pattern, name) in expected_patterns.iter() {
            let mut found_count = 0;
            for i in tail_start..data.len().saturating_sub(3) {
                let sig = u32::from_le_bytes([data[i], data[i+1], data[i+2], data[i+3]]);
                if sig == *pattern {
                    found_count += 1;
                }
            }
            if found_count > 0 {
                println!("  Found {} instances of {} (0x{:08x})", found_count, name, pattern);
            }
        }

        false
    }

    /// 检查ZIP64 EOCD定位器
    fn has_zip64_eocd_locator(data: &[u8]) -> bool {
        if data.len() < 20 {  // ZIP64 EOCD定位器至少20字节
            println!("File too small for ZIP64 EOCD locator: {} bytes", data.len());
            return false;
        }

        println!("Checking for ZIP64 EOCD locator in {} byte file", data.len());

        // ZIP64 EOCD定位器签名 (0x07064b50)
        // 搜索范围：从文件末尾向前搜索
        let search_start = data.len().saturating_sub(65557);
        let mut signatures_checked = 0;

        for i in (search_start..data.len().saturating_sub(3)).rev() {
            if i + 3 < data.len() {
                let signature = u32::from_le_bytes([data[i], data[i+1], data[i+2], data[i+3]]);
                signatures_checked += 1;

                if signature == 0x07064b50 {
                    println!("Found ZIP64 EOCD locator signature at offset {} (after checking {} signatures)", i, signatures_checked);

                    // 验证定位器结构
                    if i + 19 < data.len() {
                        let disk_num = u32::from_le_bytes([data[i+4], data[i+5], data[i+6], data[i+7]]);
                        let eocd64_offset = u64::from_le_bytes([data[i+8], data[i+9], data[i+10], data[i+11],
                                                               data[i+12], data[i+13], data[i+14], data[i+15]]);
                        let total_disks = u32::from_le_bytes([data[i+16], data[i+17], data[i+18], data[i+19]]);

                        println!("ZIP64 EOCD locator details: disk={}, offset={}, total_disks={}",
                                disk_num, eocd64_offset, total_disks);
                    }

                    return true;
                }

                // 每5000个签名输出进度
                if signatures_checked % 5000 == 0 {
                    println!("ZIP64 locator search: checked {} signatures, current offset {}", signatures_checked, i);
                }
            }
        }

        // 也检查ZIP64 EOCD记录签名 (0x06064b50)
        println!("ZIP64 locator not found, checking for ZIP64 EOCD record signature");
        signatures_checked = 0;

        for i in (search_start..data.len().saturating_sub(3)).rev() {
            if i + 3 < data.len() {
                let signature = u32::from_le_bytes([data[i], data[i+1], data[i+2], data[i+3]]);
                signatures_checked += 1;

                if signature == 0x06064b50 {
                    println!("Found ZIP64 EOCD record signature at offset {} (after checking {} signatures)", i, signatures_checked);
                    return true;
                }

                // 每5000个签名输出进度
                if signatures_checked % 5000 == 0 {
                    println!("ZIP64 EOCD search: checked {} signatures, current offset {}", signatures_checked, i);
                }
            }
        }

        println!("No ZIP64 EOCD signatures found after checking {} + {} signatures",
                signatures_checked, signatures_checked);
        false
    }

    /// 分析压缩文件的结构，返回文件列表
    pub fn analyze_archive(data: &[u8], filename: &str) -> Result<ArchiveInfo, String> {
        // 首先验证文件不为空
        if data.is_empty() {
            return Err("File is empty".to_string());
        }

        let file_size_mb = data.len() as f64 / 1024.0 / 1024.0;
        println!("Analyzing archive '{}' of size {:.2} MB", filename, file_size_mb);

        // 根据文件名确定预期的压缩类型
        let compression_type_from_filename = CompressionType::from_filename(filename);
        println!("Expected type from filename: {}", compression_type_from_filename.as_str());

        // 根据文件内容检测实际的压缩类型
        let compression_type_from_content = CompressionType::from_content(data);
        println!("Detected type from content: {}", compression_type_from_content.as_str());

        // 优先使用内容检测的结果，如果检测不出来则使用文件名
        let compression_type = match compression_type_from_content {
            CompressionType::Unknown => compression_type_from_filename,
            detected => {
                // 如果内容检测和文件名不匹配，给出警告但仍然使用内容检测的结果
                if !matches!(compression_type_from_filename, CompressionType::Unknown)
                    && !Self::types_match(&compression_type_from_filename, &detected) {
                    println!(
                        "Warning: File '{}' has extension suggesting {} but content appears to be {}",
                        filename,
                        compression_type_from_filename.as_str(),
                        detected.as_str()
                    );
                }
                detected
            }
        };

        println!("Final compression type: {}", compression_type.as_str());

        // 对于ZIP文件，添加额外的验证和特殊处理
        if matches!(compression_type, CompressionType::Zip) {
            return Self::handle_zip_file(data, filename, file_size_mb);
        }

        match compression_type {
            CompressionType::Zip => Self::analyze_zip(data),
            CompressionType::TarGz => Self::analyze_tar_gz(data),
            CompressionType::Tar => Self::analyze_tar(data),
            CompressionType::Gzip => Self::analyze_gzip(data),
            _ => Err(format!("Unsupported compression type: {}", compression_type.as_str())),
        }
    }

    /// 专门处理ZIP文件的方法，包含多种策略
    fn handle_zip_file(data: &[u8], filename: &str, file_size_mb: f64) -> Result<ArchiveInfo, String> {
        println!("Handling ZIP file with specialized logic");

        // 策略1: 对于超大文件（>500MB），直接尝试zip库处理，不进行预验证
        if file_size_mb > 500.0 {
            println!("Large file detected, attempting direct processing");
            match Self::analyze_zip_direct(data) {
                Ok(info) => {
                    println!("Direct processing succeeded");
                    return Ok(info);
                },
                Err(direct_error) => {
                    println!("Direct processing failed: {}", direct_error);
                    // 继续尝试其他策略
                }
            }
        }

        // 策略2: 尝试部分文件分析（仅分析文件头和尾部）
        if file_size_mb > 100.0 {
            println!("Attempting partial file analysis");
            match Self::analyze_zip_partial(data) {
                Ok(info) => {
                    println!("Partial analysis succeeded");
                    return Ok(info);
                },
                Err(partial_error) => {
                    println!("Partial analysis failed: {}", partial_error);
                }
            }
        }

        // 策略3: 标准验证和处理
        println!("Attempting standard ZIP validation");
        if !Self::is_valid_zip(data) {
            return Err(format!(
                "File '{}' does not appear to be a valid ZIP archive (size: {:.1} MB). \
                This may be a corrupted file, unsupported ZIP64 format, or the file was truncated during download. \
                Common causes: 1) Incomplete download 2) ZIP64 format limitations 3) File corruption 4) Network issues during transfer",
                filename, file_size_mb
            ));
        }

        // 策略4: 如果验证通过，尝试标准分析
        Self::analyze_zip(data)
    }    /// 检查两个压缩类型是否匹配（考虑一些特殊情况）
    fn types_match(type1: &CompressionType, type2: &CompressionType) -> bool {
        match (type1, type2) {
            (a, b) if std::mem::discriminant(a) == std::mem::discriminant(b) => true,
            // TAR.GZ 和 GZIP 在某些情况下可能被误识别
            (CompressionType::TarGz, CompressionType::Gzip) => true,
            (CompressionType::Gzip, CompressionType::TarGz) => true,
            _ => false,
        }
    }

    /// 部分ZIP文件分析 - 仅分析基本信息，避免内存问题
    fn analyze_zip_partial(data: &[u8]) -> Result<ArchiveInfo, String> {
        println!("Attempting partial ZIP analysis");

        // 检查文件头是否是有效的ZIP本地文件头
        if data.len() < 30 {
            return Err("File too small for ZIP format".to_string());
        }

        let signature = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
        if signature != 0x04034b50 {
            return Err("Invalid ZIP local file header signature".to_string());
        }

        println!("Valid ZIP local file header found");

        // 尝试读取第一个文件的信息
        let version = u16::from_le_bytes([data[4], data[5]]);
        let flags = u16::from_le_bytes([data[6], data[7]]);
        let method = u16::from_le_bytes([data[8], data[9]]);
        let filename_len = u16::from_le_bytes([data[26], data[27]]) as usize;
        let extra_len = u16::from_le_bytes([data[28], data[29]]) as usize;

        println!("ZIP header - version: {}, flags: {}, method: {}, filename_len: {}, extra_len: {}",
                  version, flags, method, filename_len, extra_len);

        if 30 + filename_len + extra_len > data.len() {
            return Err("ZIP local file header extends beyond file size".to_string());
        }

        let filename = String::from_utf8_lossy(&data[30..30 + filename_len]).to_string();
        println!("First file in ZIP: '{}'", filename);

        // 创建一个简化的ArchiveInfo
        let entry = ArchiveEntry {
            path: filename,
            size: 0, // 无法在不完全解析的情况下确定
            is_dir: false,
            modified_time: None,
            compressed_size: None,
        };

        Ok(ArchiveInfo {
            total_entries: 1, // 最少有一个文件
            entries: vec![entry],
            compression_type: "zip (partial)".to_string(),
            total_uncompressed_size: 0,
            total_compressed_size: data.len() as u64,
        })
    }

    /// 直接尝试分析ZIP文件，不进行预先验证（用于大文件）
    fn analyze_zip_direct(data: &[u8]) -> Result<ArchiveInfo, String> {
        println!("Starting direct ZIP analysis");

        let cursor = Cursor::new(data);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| {
                let error_str = e.to_string();
                println!("ZipArchive::new failed with: {}", error_str);

                // 分析具体的错误类型
                if error_str.contains("EOCD") || error_str.contains("central directory") {
                    format!("ZIP central directory parsing failed. This is likely a ZIP64 archive or the file is corrupted/incomplete. Original error: {}", error_str)
                } else if error_str.contains("Invalid") {
                    format!("Invalid ZIP format detected. The file may not be a proper ZIP archive. Original error: {}", error_str)
                } else {
                    format!("Direct ZIP processing failed: {}", error_str)
                }
            })?;

        println!("Successfully created ZipArchive, found {} entries", archive.len());

        let file_size_mb = data.len() as f64 / 1024.0 / 1024.0;
        let archive_len = archive.len();
        let mut entries = Vec::with_capacity(archive_len.min(10000));
        let mut total_uncompressed_size = 0;
        let mut total_compressed_size = 0;

        // 对于超大文件，限制处理条目数以避免性能问题
        let max_entries = if file_size_mb > 1000.0 {
            1000
        } else if file_size_mb > 500.0 {
            5000
        } else {
            archive_len
        };
        let actual_entries = archive_len.min(max_entries);

        println!("Processing {} out of {} entries", actual_entries, archive_len);

        for i in 0..actual_entries {
            match archive.by_index(i) {
                Ok(file) => {
                    let path = file.name().to_string();
                    let size = file.size();
                    let compressed_size = file.compressed_size();
                    let is_dir = file.is_dir();

                    total_uncompressed_size += size;
                    total_compressed_size += compressed_size;

                    let modified_time = file.last_modified().to_time()
                        .map(|t| format!("{:?}", t))
                        .ok();

                    entries.push(ArchiveEntry {
                        path,
                        size,
                        is_dir,
                        modified_time,
                        compressed_size: Some(compressed_size),
                    });

                    // 每1000个条目输出一次进度
                    if i > 0 && i % 1000 == 0 {
                        println!("Processed {} entries", i);
                    }
                },
                Err(e) => {
                    println!("Failed to read entry {}: {}", i, e);
                    // 对于损坏的条目，我们继续处理其他条目
                    continue;
                }
            }
        }

        if actual_entries < archive_len {
            println!(
                "Showing {} out of {} entries for performance reasons (file size: {:.1} MB)",
                actual_entries, archive_len, file_size_mb
            );
        }

        println!("Successfully processed {} entries", entries.len());

        Ok(ArchiveInfo {
            total_entries: archive_len,
            entries,
            compression_type: if actual_entries < archive_len {
                "zip (partial)".to_string()
            } else {
                "zip".to_string()
            },
            total_uncompressed_size,
            total_compressed_size,
        })
    }

    fn analyze_zip(data: &[u8]) -> Result<ArchiveInfo, String> {
        // 检查文件大小，对于超大文件给出特殊处理
        let file_size_mb = data.len() as f64 / 1024.0 / 1024.0;
        if file_size_mb > 1000.0 {
            println!("Processing large ZIP file ({:.1} MB). This may take some time.", file_size_mb);
        }

        // 检查是否是有效的ZIP文件
        if !Self::is_valid_zip(data) {
            return Err(format!(
                "Invalid ZIP file format or corrupted data. File size: {:.1} MB. \
                This may be a ZIP64 archive or corrupted file.",
                file_size_mb
            ));
        }

        let cursor = Cursor::new(data);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| {
                let error_msg = e.to_string();
                if error_msg.contains("EOCD") {
                    format!(
                        "Failed to parse ZIP central directory (file size: {:.1} MB). \
                        This could be due to: 1) Corrupted ZIP file, 2) ZIP64 format not fully supported, \
                        3) File truncation during download. Error: {}",
                        file_size_mb, error_msg
                    )
                } else if error_msg.contains("Invalid zip archive") || error_msg.contains("invalid") {
                    format!(
                        "Invalid ZIP archive format (file size: {:.1} MB). \
                        The file may be corrupted or not a valid ZIP file. Error: {}",
                        file_size_mb, error_msg
                    )
                } else {
                    format!(
                        "Failed to open ZIP archive (file size: {:.1} MB): {}",
                        file_size_mb, error_msg
                    )
                }
            })?;

        let archive_len = archive.len();
        let mut entries = Vec::with_capacity(archive_len.min(10000)); // 限制初始容量
        let mut total_uncompressed_size = 0;
        let mut total_compressed_size = 0;

        // 对于大型压缩包，限制处理的条目数量以避免内存问题
        let max_entries = if file_size_mb > 500.0 { 5000 } else { archive_len };
        let actual_entries = archive_len.min(max_entries);

        for i in 0..actual_entries {
            let file = archive.by_index(i)
                .map_err(|e| format!("Failed to read ZIP entry {}: {}", i, e))?;

            let path = file.name().to_string();
            let size = file.size();
            let compressed_size = file.compressed_size();
            let is_dir = file.is_dir();

            total_uncompressed_size += size;
            total_compressed_size += compressed_size;

            let modified_time = file.last_modified().to_time()
                .map(|t| format!("{:?}", t))
                .ok();

            entries.push(ArchiveEntry {
                path,
                size,
                is_dir,
                modified_time,
                compressed_size: Some(compressed_size),
            });

            // 对于大型压缩包，每处理1000个条目就输出进度
            if file_size_mb > 500.0 && i > 0 && i % 1000 == 0 {
                println!("Processing ZIP entries: {}/{}", i, actual_entries);
            }
        }

        // 如果实际条目数少于总条目数，说明被截断了
        if actual_entries < archive_len {
            println!(
                "Only processed {} out of {} entries due to size limitations.",
                actual_entries, archive_len
            );
        }

        Ok(ArchiveInfo {
            total_entries: archive_len, // 使用实际总数
            entries,
            compression_type: "zip".to_string(),
            total_uncompressed_size,
            total_compressed_size,
        })
    }

    fn analyze_tar_gz(data: &[u8]) -> Result<ArchiveInfo, String> {
        let cursor = Cursor::new(data);
        let decoder = GzDecoder::new(cursor);
        let mut archive = Archive::new(decoder);

        Self::analyze_tar_entries(&mut archive, "tar.gz", data)
    }

    fn analyze_tar(data: &[u8]) -> Result<ArchiveInfo, String> {
        let cursor = Cursor::new(data);
        let mut archive = Archive::new(cursor);

        Self::analyze_tar_entries(&mut archive, "tar", data)
    }

    fn analyze_tar_entries<R: Read>(archive: &mut Archive<R>, compression_type: &str, original_data: &[u8]) -> Result<ArchiveInfo, String> {
        let mut entries = Vec::new();
        let mut total_uncompressed_size = 0;

        for entry_result in archive.entries()
            .map_err(|e| format!("Failed to read TAR entries: {}", e))? {

            let entry = entry_result
                .map_err(|e| format!("Failed to read TAR entry: {}", e))?;

            let header = entry.header();
            let path = entry.path()
                .map_err(|e| format!("Failed to get entry path: {}", e))?
                .to_string_lossy()
                .to_string();

            let size = header.size()
                .map_err(|e| format!("Failed to get entry size: {}", e))?;

            let is_dir = header.entry_type().is_dir();

            total_uncompressed_size += size;

            let modified_time = header.mtime()
                .map(|t| {
                    use std::time::{UNIX_EPOCH, Duration};
                    let datetime = UNIX_EPOCH + Duration::from_secs(t);
                    format!("{:?}", datetime)
                })
                .ok();

            entries.push(ArchiveEntry {
                path,
                size,
                is_dir,
                modified_time,
                compressed_size: None,
            });
        }

        Ok(ArchiveInfo {
            total_entries: entries.len(),
            entries,
            compression_type: compression_type.to_string(),
            total_uncompressed_size,
            total_compressed_size: original_data.len() as u64,
        })
    }

    fn analyze_gzip(data: &[u8]) -> Result<ArchiveInfo, String> {
        let cursor = Cursor::new(data);
        let mut decoder = GzDecoder::new(cursor);
        let mut decompressed = Vec::new();

        decoder.read_to_end(&mut decompressed)
            .map_err(|e| format!("Failed to decompress GZIP: {}", e))?;

        // GZIP 通常只包含一个文件
        let entries = vec![ArchiveEntry {
            path: "decompressed".to_string(),
            size: decompressed.len() as u64,
            is_dir: false,
            modified_time: None,
            compressed_size: Some(data.len() as u64),
        }];

        Ok(ArchiveInfo {
            total_entries: 1,
            entries,
            compression_type: "gzip".to_string(),
            total_uncompressed_size: decompressed.len() as u64,
            total_compressed_size: data.len() as u64,
        })
    }

    /// 从压缩文件中提取指定文件的内容预览
    pub fn extract_file_preview(
        data: &[u8],
        filename: &str,
        entry_path: &str,
        max_preview_size: usize,
    ) -> Result<FilePreview, String> {
        let compression_type = CompressionType::from_filename(filename);

        match compression_type {
            CompressionType::Zip => Self::extract_zip_file_preview(data, entry_path, max_preview_size),
            CompressionType::TarGz => Self::extract_tar_gz_file_preview(data, entry_path, max_preview_size),
            CompressionType::Tar => Self::extract_tar_file_preview(data, entry_path, max_preview_size),
            CompressionType::Gzip => Self::extract_gzip_preview(data, max_preview_size),
            _ => Err(format!("Unsupported compression type: {}", compression_type.as_str())),
        }
    }

    fn extract_zip_file_preview(
        data: &[u8],
        entry_path: &str,
        max_preview_size: usize,
    ) -> Result<FilePreview, String> {
        println!("Starting ZIP file preview extraction for: {}", entry_path);
        let file_size_mb = data.len() as f64 / 1024.0 / 1024.0;

        // 对于大文件，跳过完整验证，直接尝试打开
        if file_size_mb > 100.0 {
            println!("Large file detected ({:.1} MB), skipping full validation", file_size_mb);
        } else {
            // 对于小文件，进行验证
            if !Self::is_valid_zip(data) {
                return Err("Invalid ZIP file format or corrupted data".to_string());
            }
        }

        let cursor = Cursor::new(data);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| {
                if e.to_string().contains("EOCD") {
                    format!("ZIP file appears to be corrupted or incomplete: {}", e)
                } else {
                    format!("Failed to open ZIP archive: {}", e)
                }
            })?;

        println!("Successfully opened ZIP archive, looking for file: {}", entry_path);

        let mut file = archive.by_name(entry_path)
            .map_err(|e| format!("Failed to find file '{}' in ZIP: {}", entry_path, e))?;

        let total_size = file.size();
        println!("File found, total size: {} bytes", total_size);

        // 对于超大文件，使用更小的预览大小以加快速度
        let effective_preview_size = if total_size > 100 * 1024 * 1024 { // 100MB
            (max_preview_size / 4).max(8192) // 减少预览大小但至少8KB
        } else {
            max_preview_size
        };

        println!("Using preview size: {} bytes", effective_preview_size);
        let mut buffer = vec![0; effective_preview_size];

        let bytes_read = file.read(&mut buffer)
            .map_err(|e| format!("Failed to read file content: {}", e))?;

        buffer.truncate(bytes_read);
        println!("Successfully read {} bytes for preview", bytes_read);

        // 尝试将字节转换为UTF-8字符串
        let content = match String::from_utf8(buffer) {
            Ok(text) => text,
            Err(_) => {
                // 如果不是有效的UTF-8，尝试其他编码或显示为二进制
                format!("Binary file (first {} bytes)", bytes_read)
            }
        };

        Ok(FilePreview {
            content,
            is_truncated: bytes_read < total_size as usize,
            total_size,
            encoding: "utf-8".to_string(),
        })
    }

    fn extract_tar_gz_file_preview(
        data: &[u8],
        entry_path: &str,
        max_preview_size: usize,
    ) -> Result<FilePreview, String> {
        let cursor = Cursor::new(data);
        let decoder = GzDecoder::new(cursor);
        let mut archive = Archive::new(decoder);

        Self::extract_tar_file_preview_from_archive(&mut archive, entry_path, max_preview_size)
    }

    fn extract_tar_file_preview(
        data: &[u8],
        entry_path: &str,
        max_preview_size: usize,
    ) -> Result<FilePreview, String> {
        let cursor = Cursor::new(data);
        let mut archive = Archive::new(cursor);

        Self::extract_tar_file_preview_from_archive(&mut archive, entry_path, max_preview_size)
    }

    fn extract_tar_file_preview_from_archive<R: Read>(
        archive: &mut Archive<R>,
        entry_path: &str,
        max_preview_size: usize,
    ) -> Result<FilePreview, String> {
        for entry_result in archive.entries()
            .map_err(|e| format!("Failed to read TAR entries: {}", e))? {

            let mut entry = entry_result
                .map_err(|e| format!("Failed to read TAR entry: {}", e))?;

            let path = entry.path()
                .map_err(|e| format!("Failed to get entry path: {}", e))?
                .to_string_lossy()
                .to_string();

            if path == entry_path {
                let total_size = entry.header().size()
                    .map_err(|e| format!("Failed to get entry size: {}", e))?;

                let mut buffer = vec![0; max_preview_size];
                let bytes_read = entry.read(&mut buffer)
                    .map_err(|e| format!("Failed to read entry content: {}", e))?;

                buffer.truncate(bytes_read);

                let content = match String::from_utf8(buffer) {
                    Ok(text) => text,
                    Err(_) => format!("Binary file (first {} bytes)", bytes_read),
                };

                return Ok(FilePreview {
                    content,
                    is_truncated: bytes_read < total_size as usize,
                    total_size,
                    encoding: "utf-8".to_string(),
                });
            }
        }

        Err(format!("File '{}' not found in TAR archive", entry_path))
    }

    fn extract_gzip_preview(data: &[u8], max_preview_size: usize) -> Result<FilePreview, String> {
        let cursor = Cursor::new(data);
        let mut decoder = GzDecoder::new(cursor);
        let mut buffer = vec![0; max_preview_size];

        let bytes_read = decoder.read(&mut buffer)
            .map_err(|e| format!("Failed to decompress GZIP: {}", e))?;

        buffer.truncate(bytes_read);

        // 尝试获取总的解压缩大小（这需要完全解压缩，对于大文件可能不实用）
        let total_size = bytes_read as u64; // 简化处理

        let content = match String::from_utf8(buffer) {
            Ok(text) => text,
            Err(_) => format!("Binary file (first {} bytes)", bytes_read),
        };

        Ok(FilePreview {
            content,
            is_truncated: true, // 由于我们没有完全解压缩，假设被截断
            total_size,
            encoding: "utf-8".to_string(),
        })
    }

    /// 分块读取压缩文件中的文件内容
    pub fn read_compressed_file_chunks(
        data: &[u8],
        filename: &str,
        entry_path: &str,
        offset: usize,
        chunk_size: usize,
    ) -> Result<(String, bool), String> {
        let compression_type = CompressionType::from_filename(filename);

        match compression_type {
            CompressionType::Zip => Self::read_zip_file_chunk(data, entry_path, offset, chunk_size),
            CompressionType::Gzip => Self::read_gzip_chunk(data, offset, chunk_size),
            _ => Err(format!("Chunked reading not supported for compression type: {}", compression_type.as_str())),
        }
    }

    fn read_zip_file_chunk(
        data: &[u8],
        entry_path: &str,
        offset: usize,
        chunk_size: usize,
    ) -> Result<(String, bool), String> {
        // 验证ZIP文件
        if !Self::is_valid_zip(data) {
            return Err("Invalid ZIP file format or corrupted data".to_string());
        }

        let cursor = Cursor::new(data);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| {
                if e.to_string().contains("EOCD") {
                    format!("ZIP file appears to be corrupted or incomplete: {}", e)
                } else {
                    format!("Failed to open ZIP archive: {}", e)
                }
            })?;

        let mut file = archive.by_name(entry_path)
            .map_err(|e| format!("Failed to find file '{}' in ZIP: {}", entry_path, e))?;

        // 跳过到指定偏移量
        if offset > 0 {
            let mut skip_buffer = vec![0; offset];
            let _ = file.read(&mut skip_buffer)
                .map_err(|e| format!("Failed to skip to offset: {}", e))?;
        }

        // 读取指定大小的块
        let mut buffer = vec![0; chunk_size];
        let bytes_read = file.read(&mut buffer)
            .map_err(|e| format!("Failed to read chunk: {}", e))?;

        buffer.truncate(bytes_read);
        let is_eof = bytes_read < chunk_size;

        let content = match String::from_utf8(buffer) {
            Ok(text) => text,
            Err(_) => format!("Binary data (chunk at offset {})", offset),
        };

        Ok((content, is_eof))
    }

    fn read_gzip_chunk(
        data: &[u8],
        offset: usize,
        chunk_size: usize,
    ) -> Result<(String, bool), String> {
        let cursor = Cursor::new(data);
        let mut decoder = GzDecoder::new(cursor);

        // 跳过到指定偏移量
        if offset > 0 {
            let mut skip_buffer = vec![0; offset];
            let _ = decoder.read(&mut skip_buffer)
                .map_err(|e| format!("Failed to skip to offset: {}", e))?;
        }

        // 读取指定大小的块
        let mut buffer = vec![0; chunk_size];
        let bytes_read = decoder.read(&mut buffer)
            .map_err(|e| format!("Failed to read chunk: {}", e))?;

        buffer.truncate(bytes_read);
        let is_eof = bytes_read < chunk_size;

        let content = match String::from_utf8(buffer) {
            Ok(text) => text,
            Err(_) => format!("Binary data (chunk at offset {})", offset),
        };

        Ok((content, is_eof))
    }
}
