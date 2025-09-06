use crate::download::types::*;
use tauri::Emitter;

#[derive(Clone)]
pub struct ProgressTracker {
    app: tauri::AppHandle,
    last_emitted_progress: std::sync::Arc<std::sync::Mutex<u32>>,
}

impl ProgressTracker {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self {
            app,
            last_emitted_progress: std::sync::Arc::new(std::sync::Mutex::new(0)),
        }
    }

    pub fn emit_started(&self, event: DownloadStarted) {
        let _ = self.app.emit("download-started", &event);
        // 重置进度跟踪
        if let Ok(mut last_progress) = self.last_emitted_progress.lock() {
            *last_progress = 0;
        }
    }

    pub fn emit_progress(&self, event: DownloadProgress) {
        let _ = self.app.emit("download-progress", &event);
        // 更新最后发送的进度
        if let Ok(mut last_progress) = self.last_emitted_progress.lock() {
            *last_progress = event.progress;
        }
    }

    pub fn emit_completed(&self, event: DownloadCompleted) {
        let _ = self.app.emit("download-completed", &event);
    }

    pub fn emit_error(&self, event: DownloadError) {
        let _ = self.app.emit("download-error", &event);
    }

    pub fn should_emit_progress(&self, downloaded: u64, total_size: u64) -> bool {
        let current_progress = self.calculate_progress(downloaded, total_size);

        // 检查是否有显著的进度变化（至少1%的变化或每64KB）
        if let Ok(last_progress) = self.last_emitted_progress.lock() {
            // 进度变化至少1%，或者每64KB发送一次，或者是最后的数据块
            current_progress > *last_progress
                || downloaded % (64 * 1024) == 0
                || (total_size > 0 && downloaded == total_size)
        } else {
            true // 如果无法获取锁，就发送进度
        }
    }

    pub fn calculate_progress(&self, downloaded: u64, total_size: u64) -> u32 {
        if total_size > 0 {
            (downloaded as f64 / total_size as f64 * 100.0).round() as u32
        } else {
            0
        }
    }
}
