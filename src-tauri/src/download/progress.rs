use tauri::Emitter;
use crate::download::types::*;

#[derive(Clone)]
pub struct ProgressTracker {
    app: tauri::AppHandle,
}

impl ProgressTracker {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }

    pub fn emit_started(&self, event: DownloadStarted) {
        let _ = self.app.emit("download-started", &event);
    }

    pub fn emit_progress(&self, event: DownloadProgress) {
        let _ = self.app.emit("download-progress", &event);
    }

    pub fn emit_completed(&self, event: DownloadCompleted) {
        let _ = self.app.emit("download-completed", &event);
    }

    pub fn emit_error(&self, event: DownloadError) {
        let _ = self.app.emit("download-error", &event);
    }

    pub fn should_emit_progress(&self, downloaded: u64, chunk_size: usize) -> bool {
        // 只在进度有显著变化时发送事件，避免过于频繁的更新
        downloaded % (64 * 1024) == 0 || chunk_size < 64 * 1024
    }

    pub fn calculate_progress(&self, downloaded: u64, total_size: u64) -> u32 {
        if total_size > 0 {
            (downloaded as f64 / total_size as f64 * 100.0).round() as u32
        } else {
            0
        }
    }
}
