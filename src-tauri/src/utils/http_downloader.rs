use futures_util::StreamExt;
use reqwest::Client;
use std::collections::HashMap;
use tokio::io::AsyncWriteExt;

use crate::storage::traits::{ProgressCallback, StorageError};

/// HTTP下载配置
#[derive(Debug, Clone)]
pub struct HttpDownloadConfig {
    /// 请求URL
    pub url: String,
    /// HTTP头
    pub headers: HashMap<String, String>,
    /// 超时设置（秒）
    pub timeout_seconds: Option<u64>,
}

impl HttpDownloadConfig {
    /// 创建新的HTTP下载配置
    pub fn new(url: String) -> Self {
        Self {
            url,
            headers: HashMap::new(),
            timeout_seconds: None,
        }
    }

    /// 添加Authorization头
    pub fn with_auth(mut self, auth: String) -> Self {
        self.headers.insert("Authorization".to_string(), auth);
        self
    }
}

/// 通用HTTP流式下载工具
pub struct HttpDownloader;

impl HttpDownloader {
    /// 执行HTTP流式下载
    ///
    /// # 参数
    /// - client: HTTP客户端
    /// - config: 下载配置
    /// - save_path: 保存路径
    /// - progress_callback: 进度回调函数
    /// - cancel_rx: 取消信号接收器
    ///
    /// # 返回
    /// - Ok(()): 下载成功
    /// - Err(StorageError): 下载失败的具体错误
    pub async fn download_stream(
        client: &Client,
        config: HttpDownloadConfig,
        save_path: &std::path::Path,
        progress_callback: Option<ProgressCallback>,
        mut cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<(), StorageError> {
        let mut request_builder = client.get(&config.url);

        // 添加自定义头
        for (key, value) in &config.headers {
            request_builder = request_builder.header(key, value);
        }

        // 设置超时
        if let Some(timeout) = config.timeout_seconds {
            request_builder = request_builder.timeout(std::time::Duration::from_secs(timeout));
        }

        // 发送请求
        let response = request_builder
            .send()
            .await
            .map_err(|e| StorageError::NetworkError(format!("HTTP request failed: {}", e)))?;

        // 检查响应状态
        if !response.status().is_success() {
            return Err(StorageError::RequestFailed(format!(
                "HTTP download failed with status: {}",
                response.status()
            )));
        }

        // 获取文件大小
        let total_size = response.content_length().unwrap_or(0);

        // 创建本地文件
        let mut file = tokio::fs::File::create(save_path)
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to create file: {}", e)))?;

        // 开始流式下载
        let mut stream = response.bytes_stream();
        let mut downloaded = 0u64;

        while let Some(chunk_result) = stream.next().await {
            // 检查取消信号
            if let Some(ref mut cancel_rx) = cancel_rx {
                if cancel_rx.try_recv().is_ok() {
                    // 删除部分下载的文件
                    let _ = tokio::fs::remove_file(save_path).await;
                    return Err(StorageError::RequestFailed(
                        "download.cancelled".to_string(),
                    ));
                }
            }

            // 处理chunk
            let bytes = chunk_result
                .map_err(|e| StorageError::NetworkError(format!("Stream error: {}", e)))?;

            // 写入文件
            file.write_all(&bytes)
                .await
                .map_err(|e| StorageError::IoError(format!("Failed to write data: {}", e)))?;

            downloaded += bytes.len() as u64;

            // 调用进度回调
            if let Some(ref callback) = progress_callback {
                callback(downloaded, total_size);
            }
        }

        // 确保数据写入磁盘
        file.flush()
            .await
            .map_err(|e| StorageError::IoError(format!("Failed to flush file: {}", e)))?;

        Ok(())
    }

    /// 简化的HTTP下载方法，用于只需要URL和认证的场景
    pub async fn download_with_auth(
        client: &Client,
        url: &str,
        auth_header: Option<&str>,
        save_path: &std::path::Path,
        progress_callback: Option<ProgressCallback>,
        cancel_rx: Option<&mut tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<(), StorageError> {
        let mut config = HttpDownloadConfig::new(url.to_string());

        if let Some(auth) = auth_header {
            config = config.with_auth(auth.to_string());
        }

        Self::download_stream(client, config, save_path, progress_callback, cancel_rx).await
    }
}
