use crate::archive::{analyzer::StreamingAnalyzer, preview::ArchivePreview, types::*};

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
        headers: std::collections::HashMap<String, String>,
        filename: String,
        max_size: Option<usize>,
    ) -> Result<ArchiveInfo, String> {
        StreamingAnalyzer::analyze_archive(&url, &headers, &filename, max_size).await
    }

    /// 获取文件预览
    pub async fn get_file_preview(
        &self,
        url: String,
        headers: std::collections::HashMap<String, String>,
        filename: String,
        entry_path: String,
        max_preview_size: Option<usize>,
    ) -> Result<FilePreview, String> {
        ArchivePreview::extract_file_preview(
            &url, &headers, &filename, &entry_path, max_preview_size
        ).await
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

    /// 智能预览文件
    pub async fn smart_preview(
        &self,
        url: String,
        headers: std::collections::HashMap<String, String>,
        filename: String,
        entry_path: String,
    ) -> Result<FilePreview, String> {
        ArchivePreview::smart_preview(&url, &headers, &filename, &entry_path, None).await
    }

    /// 批量预览文件
    pub async fn batch_preview(
        &self,
        url: String,
        headers: std::collections::HashMap<String, String>,
        filename: String,
        entry_paths: Vec<String>,
        max_preview_size: Option<usize>,
    ) -> Result<Vec<(String, Result<FilePreview, String>)>, String> {
        ArchivePreview::batch_preview(&url, &headers, &filename, &entry_paths, max_preview_size).await
    }

    /// 获取支持的压缩格式列表
    pub fn get_supported_formats(&self) -> Vec<&'static str> {
        vec!["zip", "tar", "tar.gz", "tgz", "gz", "gzip"]
    }

    /// 获取文件类型信息
    #[allow(dead_code)]
    pub fn get_file_type(&self, path: &str) -> FileType {
        FileType::from_path(path)
    }

    /// 检查文件是否可能包含敏感信息
    #[allow(dead_code)]
    pub fn is_potentially_sensitive(&self, path: &str) -> bool {
        ArchivePreview::is_potentially_sensitive(path)
    }

    /// 估算预览时间
    #[allow(dead_code)]
    pub fn estimate_preview_time(&self, filename: &str, file_size: u64) -> u64 {
        let compression_type = CompressionType::from_filename(filename);
        ArchivePreview::estimate_preview_time(file_size, &compression_type)
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
        headers: std::collections::HashMap<String, String>,
        filename: String,
    ) -> Result<bool, String> {
        // 尝试分析压缩包结构，如果成功则认为文件有效
        match self.analyze_archive(url, headers, filename, Some(1024 * 1024)).await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
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
