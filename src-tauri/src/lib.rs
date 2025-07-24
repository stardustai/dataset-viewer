use tauri_plugin_http;
use base64::{Engine as _, engine::general_purpose};
use tauri_plugin_dialog::DialogExt;
use tokio::io::AsyncWriteExt;
use futures_util::StreamExt;
use tauri::Emitter;
use reqwest;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::sync::broadcast;
use std::sync::LazyLock;

mod compression;
use compression::{ArchiveAnalyzer, ArchiveInfo, FilePreview};

// 全局下载管理器
static DOWNLOAD_MANAGER: LazyLock<Arc<Mutex<HashMap<String, broadcast::Sender<()>>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn webdav_request(
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = tauri_plugin_http::reqwest::Client::new();

    let mut request = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "HEAD" => client.head(&url),
        "PROPFIND" => client.request(tauri_plugin_http::reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    // 添加headers
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    // 添加body
    if let Some(body_content) = body {
        request = request.body(body_content);
    }

    // 发送请求
    let response = request.send().await.map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status().as_u16();
    let headers_map: std::collections::HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let text = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

    Ok(serde_json::json!({
        "status": status,
        "headers": headers_map,
        "body": text
    }))
}

#[tauri::command]
async fn webdav_request_binary(
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = tauri_plugin_http::reqwest::Client::new();

    let mut request = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "HEAD" => client.head(&url),
        "PROPFIND" => client.request(tauri_plugin_http::reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    // 添加headers
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    // 添加body
    if let Some(body_content) = body {
        request = request.body(body_content);
    }

    // 发送请求
    let response = request.send().await.map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status().as_u16();
    let headers_map: std::collections::HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    // 获取二进制数据并转换为base64
    let bytes = response.bytes().await.map_err(|e| format!("Failed to read response: {}", e))?;
    let body_base64 = general_purpose::STANDARD.encode(&bytes);

    Ok(serde_json::json!({
        "status": status,
        "headers": headers_map,
        "body": body_base64
    }))
}

#[tauri::command]
async fn download_file_with_progress(
    app: tauri::AppHandle,
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
) -> Result<String, String> {
    // 显示保存文件对话框
    let file_path = app.dialog()
        .file()
        .set_file_name(&filename)
        .blocking_save_file();

    let save_path = match file_path {
        Some(path) => path.into_path().map_err(|e| format!("Failed to get path: {}", e))?,
        None => return Err("User cancelled file save".to_string()),
    };

    let client = reqwest::Client::new();

    let mut request_builder = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "HEAD" => client.head(&url),
        "PROPFIND" => client.request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    // 添加headers
    for (key, value) in headers {
        request_builder = request_builder.header(&key, &value);
    }

    // 发送请求并获取响应
    let response = request_builder.send().await.map_err(|e| {
        format!("Request failed: {}", e)
    })?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {} - {}",
            response.status().as_u16(),
            response.status().canonical_reason().unwrap_or("Unknown error")));
    }

    // 获取文件总大小
    let total_size = response.content_length().unwrap_or(0);

    // 创建取消信号
    let (cancel_tx, mut cancel_rx) = broadcast::channel::<()>(1);

    // 将取消发送器存储到全局管理器
    {
        let mut manager = DOWNLOAD_MANAGER.lock().unwrap();
        manager.insert(filename.clone(), cancel_tx);
    }

    // 发送开始下载事件
    let _ = app.emit("download-started", serde_json::json!({
        "filename": filename,
        "total_size": total_size
    }));

    // 创建文件
    let mut file = tokio::fs::File::create(&save_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    // 真正的流式下载 - 逐块读取和写入
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        // 检查是否收到取消信号
        if cancel_rx.try_recv().is_ok() {
            // 删除部分下载的文件
            let _ = tokio::fs::remove_file(&save_path).await;

            // 从管理器中移除
            {
                let mut manager = DOWNLOAD_MANAGER.lock().unwrap();
                manager.remove(&filename);
            }

            // 发送取消事件
            let _ = app.emit("download-error", serde_json::json!({
                "filename": filename,
                "error": "Download cancelled by user"
            }));

            return Err("Download cancelled by user".to_string());
        }

        let chunk = chunk_result.map_err(|e| format!("Failed to read chunk: {}", e))?;

        // 写入文件
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;

        // 发送进度更新事件（每64KB或每块更新一次）
        let progress = if total_size > 0 {
            (downloaded as f64 / total_size as f64 * 100.0).round() as u32
        } else {
            0
        };

        // 只在进度有显著变化时发送事件，避免过于频繁的更新
        if downloaded % (64 * 1024) == 0 || chunk.len() < 64 * 1024 {
            let _ = app.emit("download-progress", serde_json::json!({
                "filename": filename,
                "downloaded": downloaded,
                "total_size": total_size,
                "progress": progress
            }));
        }
    }

    // 下载完成，从管理器中移除
    {
        let mut manager = DOWNLOAD_MANAGER.lock().unwrap();
        manager.remove(&filename);
    }

    file.flush().await.map_err(|e| format!("Failed to flush file: {}", e))?;

    // 发送完成事件
    let _ = app.emit("download-completed", serde_json::json!({
        "filename": filename,
        "file_path": save_path.display().to_string()
    }));

    Ok(format!("File downloaded successfully to: {}", save_path.display()))
}

#[tauri::command]
async fn cancel_download(filename: String) -> Result<String, String> {
    let mut manager = DOWNLOAD_MANAGER.lock().unwrap();

    if let Some(cancel_sender) = manager.remove(&filename) {
        // 发送取消信号
        let _ = cancel_sender.send(());
        Ok(format!("Download cancellation signal sent for: {}", filename))
    } else {
        Err(format!("No active download found for: {}", filename))
    }
}

/// 分析压缩文件结构
#[tauri::command]
async fn analyze_compressed_file(
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    max_size: Option<u64>,
) -> Result<ArchiveInfo, String> {
    let client = tauri_plugin_http::reqwest::Client::new();
    let lower_filename = filename.to_lowercase();

    // 对于 ZIP 文件，需要特殊处理
    if lower_filename.ends_with(".zip") {
        return analyze_zip_file_optimized(client, url, headers, filename, max_size).await;
    }

    let mut request = client.get(&url);

    // 添加headers
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    // 对于非ZIP文件，可以使用 Range 请求只下载文件头部
    if let Some(max) = max_size {
        request = request.header("Range", format!("bytes=0-{}", max - 1));
    }

    let response = request.send().await
        .map_err(|e| format!("Failed to fetch compressed file: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let data = response.bytes().await
        .map_err(|e| format!("Failed to read response data: {}", e))?;

    ArchiveAnalyzer::analyze_archive(&data, &filename)
}

/// 优化的ZIP文件分析，支持大文件的智能处理
async fn analyze_zip_file_optimized(
    client: tauri_plugin_http::reqwest::Client,
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    _max_size: Option<u64>,
) -> Result<ArchiveInfo, String> {
    // 首先获取文件大小
    let mut head_request = client.head(&url);
    for (key, value) in &headers {
        head_request = head_request.header(key, value);
    }

    let head_response = head_request.send().await
        .map_err(|e| format!("Failed to get file info: {}", e))?;

    let content_length = head_response.headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());

    let file_size = content_length.ok_or("Cannot get ZIP file size")?;

    // 使用智能的ZIP中央目录读取策略
    parse_zip_central_directory(client, url, headers, filename, file_size).await
}

/// 智能解析ZIP中央目录，只读取必要的文件尾部数据
async fn parse_zip_central_directory(
    client: tauri_plugin_http::reqwest::Client,
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    file_size: u64,
) -> Result<ArchiveInfo, String> {
    // ZIP 文件结构：
    // [Local file headers + file data] ... [Central directory] [End of central directory record]
    //
    // End of central directory record (EOCD) 在文件末尾，最小22字节，最大65557字节（包含注释）
    // 我们先读取较小的尾部，然后根据需要增加读取大小

    let read_attempts = vec![
        1024u64,      // 1KB - 足够读取简单的 EOCD
        8192,         // 8KB - 中等大小的注释
        65557,        // 最大可能的 EOCD 大小
        std::cmp::min(1024 * 1024, file_size), // 1MB 或文件大小
    ];

    for &read_size in &read_attempts {
        if read_size > file_size {
            continue;
        }

        let start_pos = file_size - read_size;

        match try_parse_zip_eocd(
            client.clone(),
            url.clone(),
            headers.clone(),
            start_pos,
            file_size,
            &filename
        ).await {
            Ok(archive_info) => return Ok(archive_info),
            Err(e) => {
                // 如果是最后一次尝试，返回错误
                if read_size == *read_attempts.last().unwrap() {
                    return Err(format!("Failed to parse ZIP central directory: {}", e));
                }
                // 否则继续尝试更大的读取范围
                continue;
            }
        }
    }

    Err("Failed to parse ZIP file after all attempts".to_string())
}

/// 尝试解析ZIP文件的EOCD (End of Central Directory) 记录
async fn try_parse_zip_eocd(
    client: tauri_plugin_http::reqwest::Client,
    url: String,
    headers: std::collections::HashMap<String, String>,
    start_pos: u64,
    file_size: u64,
    filename: &str,
) -> Result<ArchiveInfo, String> {
    // 读取文件尾部数据
    let mut request = client.get(&url);
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    request = request.header("Range", format!("bytes={}-{}", start_pos, file_size - 1));

    let response = request.send().await
        .map_err(|e| format!("Failed to fetch ZIP tail: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let tail_data = response.bytes().await
        .map_err(|e| format!("Failed to read ZIP tail: {}", e))?;

    // 解析 EOCD 记录
    parse_eocd_record(&tail_data, file_size, filename)
}

/// 解析 End of Central Directory Record
fn parse_eocd_record(data: &[u8], file_size: u64, _filename: &str) -> Result<ArchiveInfo, String> {
    // EOCD 签名: 0x06054b50
    let eocd_signature = [0x50, 0x4b, 0x05, 0x06];

    // 从后往前搜索 EOCD 签名
    for i in (0..data.len().saturating_sub(22)).rev() {
        if data.len() < i + 4 {
            continue;
        }

        if &data[i..i+4] == eocd_signature {
            // 找到了 EOCD 记录
            if data.len() < i + 22 {
                continue; // 数据不够完整的 EOCD 记录
            }

            // 解析 EOCD 字段
            let total_entries = u16::from_le_bytes([data[i + 10], data[i + 11]]) as usize;
            let _central_dir_size = u32::from_le_bytes([
                data[i + 12], data[i + 13], data[i + 14], data[i + 15]
            ]) as u64;
            let _central_dir_offset = u32::from_le_bytes([
                data[i + 16], data[i + 17], data[i + 18], data[i + 19]
            ]) as u64;

            // 创建一个简化的 ArchiveInfo，暂时不包含详细的文件列表
            // 实际的文件列表需要读取中央目录
            return Ok(ArchiveInfo {
                entries: create_placeholder_entries(total_entries),
                total_entries,
                compression_type: "zip".to_string(),
                total_uncompressed_size: 0, // 需要读取中央目录才能计算
                total_compressed_size: file_size,
            });
        }
    }

    Err("EOCD record not found in ZIP file tail".to_string())
}

/// 创建占位符条目，实际使用时需要按需加载
fn create_placeholder_entries(count: usize) -> Vec<compression::ArchiveEntry> {
    // 返回一个占位符，表示需要进一步解析
    vec![compression::ArchiveEntry {
        path: format!("📁 ZIP Archive ({} files) - Click to load details", count),
        size: 0,
        is_dir: true,
        modified_time: None,
        compressed_size: None,
    }]
}

/// 按需加载ZIP文件的详细文件列表
#[tauri::command]
async fn load_zip_file_details(
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
) -> Result<ArchiveInfo, String> {
    let client = tauri_plugin_http::reqwest::Client::new();

    // 获取文件大小
    let mut head_request = client.head(&url);
    for (key, value) in &headers {
        head_request = head_request.header(key, value);
    }

    let head_response = head_request.send().await
        .map_err(|e| format!("Failed to get file info: {}", e))?;

    let file_size = head_response.headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or("Cannot get ZIP file size")?;

    // 读取中央目录来获取完整的文件列表
    load_zip_central_directory(client, url, headers, filename, file_size).await
}

/// 加载ZIP文件的完整中央目录
async fn load_zip_central_directory(
    client: tauri_plugin_http::reqwest::Client,
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    file_size: u64,
) -> Result<ArchiveInfo, String> {
    // 首先读取 EOCD 来获取中央目录的位置和大小
    let eocd_data = read_zip_eocd(&client, &url, &headers, file_size).await?;
    let (central_dir_offset, central_dir_size, total_entries) = parse_eocd_details(&eocd_data)?;

    // 读取中央目录
    let mut request = client.get(&url);
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    let end_pos = central_dir_offset + central_dir_size;
    request = request.header("Range", format!("bytes={}-{}", central_dir_offset, end_pos - 1));

    let response = request.send().await
        .map_err(|e| format!("Failed to fetch central directory: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error reading central directory: {}", response.status()));
    }

    let central_dir_data = response.bytes().await
        .map_err(|e| format!("Failed to read central directory data: {}", e))?;

    // 解析中央目录记录
    parse_central_directory_records(&central_dir_data, total_entries, file_size, &filename)
}

/// 读取ZIP文件的EOCD记录
async fn read_zip_eocd(
    client: &tauri_plugin_http::reqwest::Client,
    url: &str,
    headers: &std::collections::HashMap<String, String>,
    file_size: u64,
) -> Result<Vec<u8>, String> {
    // 读取最后1KB来查找EOCD
    let read_size = std::cmp::min(1024, file_size);
    let start_pos = file_size - read_size;

    let mut request = client.get(url);
    for (key, value) in headers {
        request = request.header(key, value);
    }

    request = request.header("Range", format!("bytes={}-{}", start_pos, file_size - 1));

    let response = request.send().await
        .map_err(|e| format!("Failed to fetch EOCD: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error reading EOCD: {}", response.status()));
    }

    let data = response.bytes().await
        .map_err(|e| format!("Failed to read EOCD data: {}", e))?;

    Ok(data.to_vec())
}

/// 解析EOCD记录的详细信息
fn parse_eocd_details(data: &[u8]) -> Result<(u64, u64, usize), String> {
    let eocd_signature = [0x50, 0x4b, 0x05, 0x06];

    for i in (0..data.len().saturating_sub(22)).rev() {
        if data.len() < i + 4 {
            continue;
        }

        if &data[i..i+4] == eocd_signature {
            if data.len() < i + 22 {
                continue;
            }

            let total_entries = u16::from_le_bytes([data[i + 10], data[i + 11]]) as usize;
            let central_dir_size = u32::from_le_bytes([
                data[i + 12], data[i + 13], data[i + 14], data[i + 15]
            ]) as u64;
            let central_dir_offset = u32::from_le_bytes([
                data[i + 16], data[i + 17], data[i + 18], data[i + 19]
            ]) as u64;

            return Ok((central_dir_offset, central_dir_size, total_entries));
        }
    }

    Err("EOCD record not found".to_string())
}

/// 解析中央目录记录，提取文件信息
fn parse_central_directory_records(
    data: &[u8],
    expected_entries: usize,
    file_size: u64,
    _filename: &str
) -> Result<ArchiveInfo, String> {
    let mut entries = Vec::new();
    let mut offset = 0;
    let mut total_uncompressed_size = 0;

    // 中央目录文件头签名: 0x02014b50
    let cd_signature = [0x50, 0x4b, 0x01, 0x02];

    while offset + 46 <= data.len() && entries.len() < expected_entries {
        // 检查签名
        if &data[offset..offset+4] != cd_signature {
            break;
        }

        // 解析中央目录文件头
        let compressed_size = u32::from_le_bytes([
            data[offset + 20], data[offset + 21], data[offset + 22], data[offset + 23]
        ]) as u64;

        let uncompressed_size = u32::from_le_bytes([
            data[offset + 24], data[offset + 25], data[offset + 26], data[offset + 27]
        ]) as u64;

        let filename_len = u16::from_le_bytes([data[offset + 28], data[offset + 29]]) as usize;
        let extra_len = u16::from_le_bytes([data[offset + 30], data[offset + 31]]) as usize;
        let comment_len = u16::from_le_bytes([data[offset + 32], data[offset + 33]]) as usize;

        let external_attrs = u32::from_le_bytes([
            data[offset + 38], data[offset + 39], data[offset + 40], data[offset + 41]
        ]);

        // 读取文件名
        let filename_start = offset + 46;
        let filename_end = filename_start + filename_len;

        if filename_end > data.len() {
            break;
        }

        let entry_name = String::from_utf8_lossy(&data[filename_start..filename_end]).to_string();

        // 判断是否为目录（通过外部属性或路径末尾的'/'）
        let is_dir = (external_attrs & 0x10) != 0 || entry_name.ends_with('/');

        total_uncompressed_size += uncompressed_size;

        entries.push(compression::ArchiveEntry {
            path: entry_name,
            size: uncompressed_size,
            is_dir,
            modified_time: None, // 可以从DOS时间戳解析，暂时省略
            compressed_size: Some(compressed_size),
        });

        // 移动到下一个记录
        offset = filename_end + extra_len + comment_len;
    }

    let total_entries = entries.len();

    Ok(ArchiveInfo {
        entries,
        total_entries,
        compression_type: "zip".to_string(),
        total_uncompressed_size,
        total_compressed_size: file_size,
    })
}

/// 从压缩文件中提取文件预览
#[tauri::command]
async fn extract_file_preview_from_archive(
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    entry_path: String,
    max_preview_size: Option<usize>,
) -> Result<FilePreview, String> {
    let client = tauri_plugin_http::reqwest::Client::new();

    let mut request = client.get(&url);

    // 添加headers
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    let response = request.send().await
        .map_err(|e| format!("Failed to fetch compressed file: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let data = response.bytes().await
        .map_err(|e| format!("Failed to read response data: {}", e))?;

    let preview_size = max_preview_size.unwrap_or(64 * 1024); // 默认64KB预览

    ArchiveAnalyzer::extract_file_preview(&data, &filename, &entry_path, preview_size)
}

/// 流式读取压缩文件中的文件内容
#[tauri::command]
async fn stream_compressed_file(
    app: tauri::AppHandle,
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    entry_path: String,
    chunk_size: Option<usize>,
) -> Result<String, String> {
    let client = tauri_plugin_http::reqwest::Client::new();

    let mut request = client.get(&url);

    // 添加headers
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    let response = request.send().await
        .map_err(|e| format!("Failed to fetch compressed file: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let data = response.bytes().await
        .map_err(|e| format!("Failed to read response data: {}", e))?;

    let chunk_sz = chunk_size.unwrap_or(8192); // 默认8KB块
    let stream_id = format!("{}:{}", filename, entry_path);
    let stream_id_clone = stream_id.clone();

    // 启动异步任务进行分块读取
    tokio::spawn(async move {
        let mut offset = 0;
        let mut chunk_index = 0;

        loop {
            match ArchiveAnalyzer::read_compressed_file_chunks(&data, &filename, &entry_path, offset, chunk_sz) {
                Ok((content, is_eof)) => {
                    // 发送当前块
                    let _ = app.emit("compressed-file-chunk", serde_json::json!({
                        "stream_id": stream_id_clone,
                        "chunk_index": chunk_index,
                        "content": content,
                        "is_complete": is_eof
                    }));

                    chunk_index += 1;

                    if is_eof {
                        // 发送完成信号
                        let _ = app.emit("compressed-file-complete", serde_json::json!({
                            "stream_id": stream_id_clone,
                            "total_chunks": chunk_index
                        }));
                        break;
                    }

                    offset += content.len();

                    // 添加小延迟以避免过于频繁的事件发送
                    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                }
                Err(error) => {
                    let _ = app.emit("compressed-file-error", serde_json::json!({
                        "stream_id": stream_id_clone,
                        "error": error
                    }));
                    break;
                }
            }
        }
    });

    Ok(stream_id)
}

/// 读取压缩文件的指定块
#[tauri::command]
async fn read_compressed_file_chunk(
    url: String,
    headers: std::collections::HashMap<String, String>,
    filename: String,
    entry_path: String,
    offset: usize,
    chunk_size: usize,
) -> Result<serde_json::Value, String> {
    let client = tauri_plugin_http::reqwest::Client::new();

    let mut request = client.get(&url);

    // 添加headers
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    let response = request.send().await
        .map_err(|e| format!("Failed to fetch compressed file: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let data = response.bytes().await
        .map_err(|e| format!("Failed to read response data: {}", e))?;

    match ArchiveAnalyzer::read_compressed_file_chunks(&data, &filename, &entry_path, offset, chunk_size) {
        Ok((content, is_eof)) => {
            Ok(serde_json::json!({
                "content": content,
                "is_eof": is_eof,
                "offset": offset,
                "bytes_read": content.len()
            }))
        }
        Err(error) => Err(error)
    }
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            webdav_request,
            webdav_request_binary,
            download_file_with_progress,
            cancel_download,
            analyze_compressed_file,
            load_zip_file_details,
            extract_file_preview_from_archive,
            stream_compressed_file,
            read_compressed_file_chunk
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
