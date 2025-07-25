use crate::archive::{types::*, formats};
use std::collections::HashMap;

/// 压缩包处理器的统一入口
pub struct ArchiveHandler;

impl ArchiveHandler {
    pub fn new() -> Self {
        Self
    }

    /// 分析压缩包结构
    pub async fn analyze_archive(
        &self,
        url: String,
        headers: HashMap<String, String>,
        filename: String,
        max_size: Option<usize>,
    ) -> Result<ArchiveInfo, String> {
        let compression_type = CompressionType::from_filename(&filename);

        // 如果压缩类型未知，尝试通过文件头部检测
        let handler = if matches!(compression_type, CompressionType::Unknown) {
            // 下载一小部分文件头来检测格式
            let header_data = self.download_header(&url, &headers).await?;
            formats::detect_format_and_get_handler(&header_data)
                .ok_or_else(|| "Unsupported archive format".to_string())?
        } else {
            // 检查是否支持该格式
            match compression_type {
                CompressionType::SevenZip => {
                    return Err("archive.format.7z.not.supported".to_string());
                }
                CompressionType::Rar => {
                    return Err("archive.format.rar.not.supported".to_string());
                }
                CompressionType::Brotli => {
                    return Err("archive.format.brotli.not.supported".to_string());
                }
                CompressionType::Lz4 => {
                    return Err("archive.format.lz4.not.supported".to_string());
                }
                CompressionType::Zstd => {
                    return Err("archive.format.zstd.not.supported".to_string());
                }
                _ => {}
            }

            formats::get_handler(&compression_type)
                .ok_or_else(|| "Unsupported archive format".to_string())?
        };

        // 总是优先使用流式分析，只有在特殊情况下才下载完整文件
        // 尝试获取文件大小
        match self.get_file_size(&url, &headers).await {
            Ok(file_size) => {
                // 如果有大小限制且文件较小，可以下载完整文件进行更准确的分析
                if let Some(size_limit) = max_size {
                    if file_size <= size_limit as u64 {
                        let data = self.download_file(&url, &headers, Some(size_limit)).await?;
                        return handler.analyze_complete(&data).await;
                    }
                }
                // 文件较大或无大小限制，使用流式分析
                handler.analyze_streaming(&url, &headers, &filename, file_size).await
            }
            Err(_) => {
                // 无法获取文件大小，使用无大小流式分析
                handler.analyze_streaming_without_size(&url, &headers, &filename).await
            }
        }
    }

    /// 获取文件预览
    pub async fn get_file_preview(
        &self,
        url: String,
        headers: HashMap<String, String>,
        filename: String,
        entry_path: String,
        max_preview_size: Option<usize>,
    ) -> Result<FilePreview, String> {
        let compression_type = CompressionType::from_filename(&filename);

        let handler = if matches!(compression_type, CompressionType::Unknown) {
            let header_data = self.download_header(&url, &headers).await?;
            formats::detect_format_and_get_handler(&header_data)
                .ok_or_else(|| "Unsupported archive format".to_string())?
        } else {
            // 检查是否支持该格式
            match compression_type {
                CompressionType::SevenZip => {
                    return Err("archive.format.7z.not.supported".to_string());
                }
                CompressionType::Rar => {
                    return Err("archive.format.rar.not.supported".to_string());
                }
                CompressionType::Brotli => {
                    return Err("archive.format.brotli.not.supported".to_string());
                }
                CompressionType::Lz4 => {
                    return Err("archive.format.lz4.not.supported".to_string());
                }
                CompressionType::Zstd => {
                    return Err("archive.format.zstd.not.supported".to_string());
                }
                _ => {}
            }

            formats::get_handler(&compression_type)
                .ok_or_else(|| "Unsupported archive format".to_string())?
        };

        let max_size = max_preview_size.unwrap_or(64 * 1024); // 默认64KB
        handler.extract_preview(&url, &headers, &entry_path, max_size).await
    }

    /// 检查文件是否支持压缩包操作
    pub fn is_supported_archive(&self, filename: &str) -> bool {
        let compression_type = CompressionType::from_filename(filename);
        !matches!(compression_type, CompressionType::Unknown)
    }

    /// 检查文件是否支持流式读取
    pub fn supports_streaming(&self, filename: &str) -> bool {
        let compression_type = CompressionType::from_filename(filename);
        compression_type.supports_streaming()
    }

    /// 检查文件是否支持随机访问
    #[allow(dead_code)]
    pub fn supports_random_access(&self, filename: &str) -> bool {
        let compression_type = CompressionType::from_filename(filename);
        compression_type.supports_random_access()
    }

    /// 获取压缩格式信息
    pub fn get_compression_info(&self, filename: &str) -> CompressionType {
        CompressionType::from_filename(filename)
    }

    // 辅助方法

    /// 下载文件头部用于格式检测
    async fn download_header(&self, url: &str, headers: &HashMap<String, String>) -> Result<Vec<u8>, String> {
        self.download_range(url, headers, 0, 1024).await
    }

    /// 获取文件大小
    async fn get_file_size(&self, url: &str, headers: &HashMap<String, String>) -> Result<u64, String> {
        let client = reqwest::Client::new();
        let mut request = client.head(url);

        for (key, value) in headers {
            request = request.header(key, value);
        }

        let response = request.send().await.map_err(|e| e.to_string())?;

        if let Some(content_length) = response.headers().get("content-length") {
            content_length.to_str()
                .map_err(|e| e.to_string())?
                .parse::<u64>()
                .map_err(|e| e.to_string())
        } else {
            Err("No content-length header".to_string())
        }
    }

    /// 下载文件范围
    async fn download_range(&self, url: &str, headers: &HashMap<String, String>, start: u64, length: u64) -> Result<Vec<u8>, String> {
        let client = reqwest::Client::new();
        let mut request = client.get(url);

        for (key, value) in headers {
            request = request.header(key, value);
        }

        let end = start + length - 1;
        request = request.header("Range", format!("bytes={}-{}", start, end));

        let response = request.send().await.map_err(|e| e.to_string())?;
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        Ok(bytes.to_vec())
    }

    /// 下载完整文件（可选大小限制）
    async fn download_file(&self, url: &str, headers: &HashMap<String, String>, max_size: Option<usize>) -> Result<Vec<u8>, String> {
        let client = reqwest::Client::new();
        let mut request = client.get(url);

        for (key, value) in headers {
            request = request.header(key, value);
        }

        let response = request.send().await.map_err(|e| e.to_string())?;

        // 检查文件大小
        if let Some(max_size) = max_size {
            if let Some(content_length) = response.headers().get("content-length") {
                if let Ok(size) = content_length.to_str().unwrap_or("0").parse::<usize>() {
                    if size > max_size {
                        return Err(format!("File too large: {} bytes (max: {} bytes)", size, max_size));
                    }
                }
            }
        }

        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        Ok(bytes.to_vec())
    }

    /// 获取支持的压缩格式列表
    pub fn get_supported_formats(&self) -> Vec<&'static str> {
        vec!["zip", "tar", "tar.gz", "tgz", "gz", "gzip"]
    }

    /// 格式化文件大小
    pub fn format_file_size(&self, bytes: u64) -> String {
        if bytes == 0 {
            return "0 B".to_string();
        }

        let units = ["B", "KB", "MB", "GB", "TB"];
        let mut size = bytes as f64;
        let mut unit_index = 0;

        while size >= 1024.0 && unit_index < units.len() - 1 {
            size /= 1024.0;
            unit_index += 1;
        }

        if unit_index == 0 {
            format!("{} {}", bytes, units[unit_index])
        } else {
            format!("{:.2} {}", size, units[unit_index])
        }
    }

    /// 获取压缩率
    pub fn get_compression_ratio(&self, uncompressed: u64, compressed: u64) -> String {
        if compressed == 0 {
            return "0%".to_string();
        }
        let ratio = ((uncompressed.saturating_sub(compressed)) as f64 / uncompressed as f64) * 100.0;
        format!("{:.1}%", ratio)
    }

    /// 验证压缩包完整性（基础检查）
    pub async fn validate_archive(
        &self,
        url: String,
        headers: HashMap<String, String>,
        filename: String,
    ) -> Result<bool, String> {
        // 尝试分析压缩包结构，如果成功则认为文件有效
        match self.analyze_archive(url, headers, filename, Some(1024 * 1024)).await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    /// 智能预览文件
    pub async fn smart_preview(
        &self,
        url: String,
        headers: HashMap<String, String>,
        filename: String,
        entry_path: String,
    ) -> Result<FilePreview, String> {
        self.get_file_preview(url, headers, filename, entry_path, None).await
    }

    /// 批量预览文件
    pub async fn batch_preview(
        &self,
        url: String,
        headers: HashMap<String, String>,
        filename: String,
        entry_paths: Vec<String>,
        max_preview_size: Option<usize>,
    ) -> Result<Vec<(String, Result<FilePreview, String>)>, String> {
        let mut results = Vec::new();

        for entry_path in entry_paths {
            let result = self.get_file_preview(
                url.clone(),
                headers.clone(),
                filename.clone(),
                entry_path.clone(),
                max_preview_size,
            ).await;
            results.push((entry_path, result));
        }

        Ok(results)
    }

    /// 获取推荐的分块大小
    pub fn get_recommended_chunk_size(&self, filename: &str, file_size: u64) -> usize {
        let compression_type = CompressionType::from_filename(filename);
        let base_size = match compression_type {
            CompressionType::Zip => 8192,    // 8KB for ZIP (random access)
            CompressionType::TarGz => 32768, // 32KB for TAR.GZ (sequential)
            CompressionType::Tar => 16384,   // 16KB for TAR
            CompressionType::Gzip => 16384,  // 16KB for GZIP
            _ => 8192,
        };

        // 根据文件大小调整
        if file_size > 100 * 1024 * 1024 { // >100MB
            base_size * 4
        } else if file_size > 10 * 1024 * 1024 { // >10MB
            base_size * 2
        } else {
            base_size
        }
    }
}
