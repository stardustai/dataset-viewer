use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

/// 压缩格式类型
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub enum CompressionType {
    Zip,
    Gzip,
    Tar,
    TarGz,
    Brotli,
    Lz4,
    Zstd,
    SevenZip,
    Rar,
    Unknown,
}

impl CompressionType {
    pub fn from_filename(filename: &str) -> Self {
        let lower = filename.to_lowercase();
        if lower.ends_with(".zip") {
            CompressionType::Zip
        } else if lower.ends_with(".gz") && !lower.contains(".tar.") {
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
        } else if lower.ends_with(".7z") {
            CompressionType::SevenZip
        } else if lower.ends_with(".rar") {
            CompressionType::Rar
        } else {
            CompressionType::Unknown
        }
    }

    /// 获取压缩类型的字符串表示
    pub fn as_str(&self) -> &'static str {
        match self {
            CompressionType::Zip => "zip",
            CompressionType::Gzip => "gzip",
            CompressionType::Tar => "tar",
            CompressionType::TarGz => "tar.gz",
            CompressionType::Brotli => "brotli",
            CompressionType::Lz4 => "lz4",
            CompressionType::Zstd => "zstd",
            CompressionType::SevenZip => "7z",
            CompressionType::Rar => "rar",
            CompressionType::Unknown => "unknown",
        }
    }

    #[allow(dead_code)] // API 保留方法，可能在未来版本使用
    pub fn supports_random_access(&self) -> bool {
        matches!(self, CompressionType::Zip)
    }
}

impl fmt::Display for CompressionType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// 压缩包条目信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ArchiveEntry {
    pub path: String,
    pub size: String,  // 使用字符串表示大数字
    pub compressed_size: Option<String>,  // 使用字符串表示大数字
    pub is_dir: bool,
    pub modified_time: Option<String>,
    pub crc32: Option<u32>,
    /// 条目在压缩包中的索引
    pub index: u32,
    /// 额外的元数据
    pub metadata: HashMap<String, String>,
}

/// 压缩包整体信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ArchiveInfo {
    pub compression_type: CompressionType,
    pub entries: Vec<ArchiveEntry>,
    pub total_entries: u32,
    pub total_uncompressed_size: String,  // 使用字符串表示大数字
    pub total_compressed_size: String,  // 使用字符串表示大数字
    /// 是否支持流式读取
    pub supports_streaming: bool,
    /// 是否支持随机访问
    pub supports_random_access: bool,
    /// 分析状态
    pub analysis_status: AnalysisStatus,
}

/// 分析状态
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub enum AnalysisStatus {
    /// 完整分析完成
    Complete,
    /// 部分分析（只读取了部分条目）
    Partial { analyzed_entries: u32 },
    /// 流式分析（基于文件头/尾分析）
    Streaming { estimated_entries: Option<u32> },
    /// 分析失败
    Failed { error: String },
}

/// 文件预览结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct FilePreview {
    #[serde(with = "serde_bytes")]
    pub content: Vec<u8>,
    pub is_truncated: bool,
    pub total_size: String,  // 使用字符串表示大数字
    pub preview_size: u32,
}



/// 下载选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadOptions {
    pub save_path: String,
    pub overwrite: bool,
    pub resume: bool,
    pub chunk_size: usize,
}

/// 批量操作选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchOptions {
    pub max_concurrent: usize,
    pub continue_on_error: bool,
    pub progress_callback: bool,
}
