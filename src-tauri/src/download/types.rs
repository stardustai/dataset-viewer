use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct DownloadRequest {
    pub url: String,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub filename: String,
    pub downloaded: u64,
    pub total_size: u64,
    pub progress: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadStarted {
    pub filename: String,
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadCompleted {
    pub filename: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadError {
    pub filename: String,
    pub error: String,
}

pub type DownloadResult = Result<String, String>;
