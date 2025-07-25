use crate::archive::types::*;
use std::io::{Cursor, Read};
use flate2::read::GzDecoder;
use tar::Archive;
use zip::ZipArchive;

/// 压缩包文件预览器
pub struct ArchivePreview;

impl ArchivePreview {
    /// 从压缩包中提取文件预览
    pub async fn extract_file_preview(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        filename: &str,
        entry_path: &str,
        max_preview_size: Option<usize>,
    ) -> Result<FilePreview, String> {
        let compression_type = CompressionType::from_filename(filename);
        let max_size = max_preview_size.unwrap_or(256 * 1024); // 默认256KB

        match compression_type {
            CompressionType::Zip => {
                Self::extract_zip_preview(url, headers, entry_path, max_size).await
            }
            CompressionType::TarGz => {
                Self::extract_tar_gz_preview(url, headers, entry_path, max_size).await
            }
            CompressionType::Tar => {
                Self::extract_tar_preview(url, headers, entry_path, max_size).await
            }
            CompressionType::Gzip => {
                Self::extract_gzip_preview(url, headers, max_size).await
            }
            _ => Err(format!("Preview not supported for {}", compression_type.as_str())),
        }
    }

    /// 从ZIP文件中提取预览
    async fn extract_zip_preview(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        // 首先尝试流式预览（适用于大文件）
        if let Ok(preview) = Self::extract_zip_preview_streaming(url, headers, entry_path, max_size).await {
            return Ok(preview);
        }

        println!("流式预览失败，回退到完整下载模式");

        // 回退到完整下载模式
        let zip_data = Self::download_file(url, headers).await?;

        let cursor = Cursor::new(&zip_data);
        let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

        let mut file = archive.by_name(entry_path).map_err(|e| e.to_string())?;
        let total_size = file.size();
        let file_type = FileType::from_path(entry_path);

        // 读取预览数据
        let preview_size = max_size.min(total_size as usize);
        let mut buffer = vec![0; preview_size];
        let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
        buffer.truncate(bytes_read);

        let content = if file_type.is_text() {
            match String::from_utf8(buffer.clone()) {
                Ok(text) => text,
                Err(_) => Self::try_decode_text(buffer)?,
            }
        } else {
            Self::format_binary_preview(buffer)
        };

        Ok(FilePreview {
            content,
            is_truncated: bytes_read < total_size as usize,
            total_size,
            preview_size: bytes_read,
            encoding: "utf-8".to_string(),
            file_type,
        })
    }

    /// 流式ZIP预览（仅下载需要的文件部分）
    async fn extract_zip_preview_streaming(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        println!("尝试流式ZIP预览: {}", entry_path);

        // 获取文件大小
        let file_size = Self::get_file_size(url, headers).await?;
        println!("ZIP文件总大小: {} 字节", file_size);

        // 下载尾部来查找中央目录
        let tail_size = (5 * 1024 * 1024).min(file_size / 2);
        let tail_start = file_size.saturating_sub(tail_size);
        let tail_data = Self::download_range(url, headers, tail_start, tail_size).await?;

        // 查找EOCD记录
        let eocd_info = Self::find_eocd_in_tail(&tail_data)?
            .ok_or("Could not find EOCD record")?;

        // 下载中央目录
        let cd_data = Self::download_range(
            url, headers, eocd_info.central_dir_offset, eocd_info.central_dir_size
        ).await?;

        // 在中央目录中查找目标文件
        let file_info = Self::find_file_in_central_directory(&cd_data, entry_path)?
            .ok_or_else(|| format!("File '{}' not found in ZIP archive", entry_path))?;

        println!("找到文件: {} (本地头偏移: {}, 压缩大小: {})",
            entry_path, file_info.local_header_offset, file_info.compressed_size);

        // 下载本地文件头和文件数据
        let local_header_data = Self::download_range(url, headers, file_info.local_header_offset, 30).await?;

        // 解析本地文件头获取完整的偏移信息
        let filename_len = u16::from_le_bytes([local_header_data[26], local_header_data[27]]) as u64;
        let extra_len = u16::from_le_bytes([local_header_data[28], local_header_data[29]]) as u64;

        let data_offset = file_info.local_header_offset + 30 + filename_len + extra_len;
        let download_size = max_size.min(file_info.compressed_size as usize);

        println!("下载文件数据: 偏移 {}, 大小 {}", data_offset, download_size);

        // 下载文件数据
        let compressed_data = Self::download_range(url, headers, data_offset, download_size as u64).await?;

        // 解压缩数据（简化版本，假设使用deflate压缩）
        let decompressed_data = if file_info.compression_method == 0 {
            // 无压缩
            compressed_data
        } else if file_info.compression_method == 8 {
            // Deflate压缩
            use flate2::read::DeflateDecoder;
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
                Err(_) => Self::try_decode_text(preview_data)?,
            }
        } else {
            Self::format_binary_preview(preview_data)
        };

        Ok(FilePreview {
            content,
            is_truncated: preview_data_len < file_info.uncompressed_size as usize,
            total_size: file_info.uncompressed_size,
            preview_size: preview_data_len,
            encoding: "utf-8".to_string(),
            file_type,
        })
    }

    /// 从TAR.GZ文件中提取预览
    async fn extract_tar_gz_preview(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        let tar_gz_data = Self::download_file(url, headers).await?;

        let cursor = Cursor::new(&tar_gz_data);
        let decoder = GzDecoder::new(cursor);
        let mut archive = Archive::new(decoder);

        for entry_result in archive.entries().map_err(|e| e.to_string())? {
            match entry_result {
                Ok(entry) => {
                    if let Ok(path) = entry.path() {
                        if path.to_string_lossy() == entry_path {
                            return Self::extract_tar_entry_preview(entry, entry_path, max_size);
                        }
                    }
                }
                Err(e) => {
                    println!("Error reading TAR entry: {}", e);
                    continue;
                }
            }
        }

        Err(format!("File '{}' not found in TAR.GZ archive", entry_path))
    }

    /// 从TAR文件中提取预览
    async fn extract_tar_preview(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        let tar_data = Self::download_file(url, headers).await?;

        let cursor = Cursor::new(&tar_data);
        let mut archive = Archive::new(cursor);

        for entry_result in archive.entries().map_err(|e| e.to_string())? {
            match entry_result {
                Ok(entry) => {
                    if let Ok(path) = entry.path() {
                        if path.to_string_lossy() == entry_path {
                            return Self::extract_tar_entry_preview(entry, entry_path, max_size);
                        }
                    }
                }
                Err(e) => {
                    println!("Error reading TAR entry: {}", e);
                    continue;
                }
            }
        }

        Err(format!("File '{}' not found in TAR archive", entry_path))
    }

    /// 从TAR条目中提取预览
    fn extract_tar_entry_preview<R: Read>(
        mut entry: tar::Entry<'_, R>,
        entry_path: &str,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        let total_size = entry.size();
        let file_type = FileType::from_path(entry_path);

        // 读取预览数据
        let preview_size = max_size.min(total_size as usize);
        let mut buffer = vec![0; preview_size];
        let bytes_read = entry.read(&mut buffer).map_err(|e| e.to_string())?;
        buffer.truncate(bytes_read);

        let content = if file_type.is_text() {
            match String::from_utf8(buffer.clone()) {
                Ok(text) => text,
                Err(_) => Self::try_decode_text(buffer)?,
            }
        } else {
            Self::format_binary_preview(buffer)
        };

        Ok(FilePreview {
            content,
            is_truncated: bytes_read < total_size as usize,
            total_size,
            preview_size: bytes_read,
            encoding: "utf-8".to_string(),
            file_type,
        })
    }

    /// 从GZIP文件中提取预览
    async fn extract_gzip_preview(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        // 首先尝试流式预览（适用于大文件）
        if let Ok(preview) = Self::extract_gzip_preview_streaming(url, headers, max_size).await {
            return Ok(preview);
        }

        println!("GZIP流式预览失败，回退到完整下载模式");

        // 回退到完整下载模式（仅适用于小文件）
        let gzip_data = Self::download_file(url, headers).await?;

        let cursor = Cursor::new(&gzip_data);
        let mut decoder = GzDecoder::new(cursor);

        // 读取预览数据
        let mut buffer = vec![0; max_size];
        let bytes_read = decoder.read(&mut buffer).map_err(|e| e.to_string())?;
        buffer.truncate(bytes_read);

        let content = match String::from_utf8(buffer.clone()) {
            Ok(text) => text,
            Err(_) => Self::try_decode_text(buffer)?,
        };

        Ok(FilePreview {
            content,
            is_truncated: bytes_read == max_size,
            total_size: bytes_read as u64,
            preview_size: bytes_read,
            encoding: "utf-8".to_string(),
            file_type: FileType::Text,
        })
    }

    /// 流式GZIP预览（分块下载和解压）
    async fn extract_gzip_preview_streaming(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        max_size: usize,
    ) -> Result<FilePreview, String> {
        println!("尝试GZIP流式预览，最大预览大小: {} 字节", max_size);

        // 下载前面的数据块进行流式解压
        let chunk_size = 32 * 1024; // 32KB 块
        let max_chunks = 10; // 最多尝试10个块
        
        let mut compressed_buffer = Vec::new();
        let mut offset = 0u64;
        
        // 首先下载足够的数据用于解压
        for i in 0..max_chunks {
            println!("下载GZIP块 {}: 偏移 {}, 大小 {}", i, offset, chunk_size);
            
            match Self::download_range(url, headers, offset, chunk_size as u64).await {
                Ok(chunk_data) => {
                    if chunk_data.is_empty() {
                        break;
                    }
                    compressed_buffer.extend_from_slice(&chunk_data);
                    offset += chunk_data.len() as u64;
                }
                Err(e) => {
                    println!("下载GZIP块失败: {}", e);
                    if i == 0 {
                        return Err(e);
                    }
                    break;
                }
            }
            
            // 尝试解压当前已下载的数据
            if compressed_buffer.len() >= 1024 { // 至少有1KB数据才尝试解压
                match Self::try_decompress_gzip(&compressed_buffer, max_size) {
                    Ok(decompressed) => {
                        if !decompressed.is_empty() {
                            // 尝试将解压后的数据转换为文本
                            let content = match String::from_utf8(decompressed.clone()) {
                                Ok(text) => text,
                                Err(_) => Self::try_decode_text(decompressed.clone())?,
                            };

                            println!("GZIP流式预览成功，解压了 {} 字节", decompressed.len());

                            return Ok(FilePreview {
                                content,
                                is_truncated: decompressed.len() >= max_size,
                                total_size: 0, // 实际大小未知
                                preview_size: decompressed.len(),
                                encoding: "utf-8".to_string(),
                                file_type: FileType::Text,
                            });
                        }
                    }
                    Err(e) => {
                        println!("GZIP解压尝试失败: {}", e);
                        // 继续下载更多数据
                    }
                }
            }
        }

        Err("Failed to decompress GZIP data after multiple attempts".to_string())
    }

    /// 尝试解压GZIP数据
    fn try_decompress_gzip(compressed_data: &[u8], max_size: usize) -> Result<Vec<u8>, String> {
        // 验证GZIP头部
        if compressed_data.len() < 3 || compressed_data[0] != 0x1f || compressed_data[1] != 0x8b {
            return Err("Invalid GZIP signature".to_string());
        }

        let cursor = std::io::Cursor::new(compressed_data);
        let mut decoder = flate2::read::GzDecoder::new(cursor);
        
        let mut decompressed = Vec::new();
        
        // 分块读取，避免内存问题
        let mut buffer = vec![0; 8192]; // 8KB 缓冲区
        
        loop {
            match decoder.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(bytes_read) => {
                    decompressed.extend_from_slice(&buffer[..bytes_read]);
                    if decompressed.len() >= max_size {
                        decompressed.truncate(max_size);
                        break;
                    }
                }
                Err(e) => {
                    if decompressed.is_empty() {
                        return Err(format!("GZIP decompression error: {}", e));
                    } else {
                        // 如果已经解压了一些数据，返回已有数据
                        println!("GZIP解压遇到错误但已有部分数据: {}", e);
                        break;
                    }
                }
            }
        }

        if decompressed.is_empty() {
            Err("No data decompressed".to_string())
        } else {
            Ok(decompressed)
        }
    }

    /// 下载文件
    async fn download_file(
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

        let data = response.bytes().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        Ok(data.to_vec())
    }

    /// 尝试解码文本（处理非UTF-8编码）
    fn try_decode_text(buffer: Vec<u8>) -> Result<String, String> {
        // 尝试UTF-8
        if let Ok(text) = String::from_utf8(buffer.clone()) {
            return Ok(text);
        }

        // 尝试Latin-1（ISO-8859-1）
        let latin1_text: String = buffer.iter().map(|&b| b as char).collect();
        if latin1_text.chars().all(|c| !c.is_control() || c.is_whitespace()) {
            return Ok(format!("[Latin-1编码]\n{}", latin1_text));
        }

        // 如果都不行，返回十六进制表示
        Ok(Self::format_binary_preview(buffer))
    }

    /// 格式化二进制预览
    fn format_binary_preview(buffer: Vec<u8>) -> String {
        let mut result = String::new();
        result.push_str("[二进制文件预览]\n");

        for (i, chunk) in buffer.chunks(16).enumerate() {
            // 地址
            result.push_str(&format!("{:08x}: ", i * 16));

            // 十六进制
            for (j, &byte) in chunk.iter().enumerate() {
                result.push_str(&format!("{:02x} ", byte));
                if j == 7 {
                    result.push(' ');
                }
            }

            // 填充空格
            for _ in chunk.len()..16 {
                result.push_str("   ");
                if chunk.len() <= 8 {
                    result.push(' ');
                }
            }

            // ASCII表示
            result.push_str(" |");
            for &byte in chunk {
                if byte >= 32 && byte <= 126 {
                    result.push(byte as char);
                } else {
                    result.push('.');
                }
            }
            result.push_str("|\n");

            // 限制预览长度
            if i >= 32 {
                result.push_str("...\n");
                break;
            }
        }

        result
    }

    /// 智能预览文件
    pub async fn smart_preview(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        filename: &str,
        entry_path: &str,
        max_preview_size: Option<usize>,
    ) -> Result<FilePreview, String> {
        let file_type = FileType::from_path(entry_path);
        let max_size = match file_type {
            FileType::Text => max_preview_size.unwrap_or(512 * 1024),
            FileType::Binary => max_preview_size.unwrap_or(64 * 1024),
            FileType::Image => max_preview_size.unwrap_or(256 * 1024),
            _ => max_preview_size.unwrap_or(128 * 1024),
        };

        Self::extract_file_preview(url, headers, filename, entry_path, Some(max_size)).await
    }

    /// 批量预览多个文件
    pub async fn batch_preview(
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        filename: &str,
        entry_paths: &[String],
        max_preview_size: Option<usize>,
    ) -> Result<Vec<(String, Result<FilePreview, String>)>, String> {
        let mut results = Vec::new();

        for entry_path in entry_paths {
            let preview_result = Self::smart_preview(
                url, headers, filename, entry_path, max_preview_size
            ).await;
            results.push((entry_path.clone(), preview_result));
        }

        Ok(results)
    }

    /// 检查文件是否可能包含敏感信息
    #[allow(dead_code)]
    pub fn is_potentially_sensitive(entry_path: &str) -> bool {
        let lower_path = entry_path.to_lowercase();
        let sensitive_patterns = [
            "password", "secret", "key", "token", "credential",
            ".env", "config", "cert", "pem", "p12", "keystore",
            "id_rsa", "id_dsa", "private", "wallet", "seed",
        ];

        sensitive_patterns.iter().any(|pattern| lower_path.contains(pattern))
    }

    /// 估算文件预览时间
    #[allow(dead_code)]
    pub fn estimate_preview_time(file_size: u64, compression_type: &CompressionType) -> u64 {
        let base_time = match compression_type {
            CompressionType::Zip => 100,
            CompressionType::TarGz => 500,
            CompressionType::Tar => 200,
            CompressionType::Gzip => 300,
            _ => 1000,
        };

        // 根据文件大小调整时间（毫秒）
        base_time + (file_size / (1024 * 1024)) * 50
    }

    /// 获取文件大小（改进版本，支持更多错误处理）
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
            // 如果没有 content-length，尝试使用 GET 请求的前几个字节来估算
            println!("No content-length header found, trying alternative method");
            
            // 尝试部分下载来估算文件大小
            if let Ok(range_response) = Self::download_range(url, headers, 0, 1).await {
                if !range_response.is_empty() {
                    // 如果支持范围请求，说明是大文件，返回一个估算值
                    return Ok(u64::MAX); // 表示未知大小但是大文件
                }
            }
            
            Err("No content-length header found and cannot determine file size".to_string())
        }
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

        let data = response.bytes().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        Ok(data.to_vec())
    }

    /// 查找EOCD记录
    fn find_eocd_in_tail(tail_data: &[u8]) -> Result<Option<EOCDInfo>, String> {
        let eocd_signature = [0x50, 0x4b, 0x05, 0x06];

        if tail_data.len() >= 22 {
            for i in (0..=tail_data.len()-4).rev() {
                if &tail_data[i..i+4] == eocd_signature {
                    if tail_data.len() >= i + 22 {
                        if let Ok(eocd) = Self::parse_eocd(&tail_data[i..]) {
                            return Ok(Some(eocd));
                        }
                    }
                }
            }
        }

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

        Ok(EOCDInfo {
            total_entries,
            central_dir_size,
            central_dir_offset,
            uncompressed_size: 0,
        })
    }

    /// 在中央目录中查找文件
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
}

/// EOCD记录信息
#[derive(Debug, Clone)]
#[allow(dead_code)]
struct EOCDInfo {
    total_entries: usize,
    central_dir_size: u64,
    central_dir_offset: u64,
    uncompressed_size: u64,
}

/// ZIP文件信息
#[derive(Debug, Clone)]
struct ZipFileInfo {
    compression_method: u16,
    compressed_size: u64,
    uncompressed_size: u64,
    local_header_offset: u64,
}
