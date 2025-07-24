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
    /// 分析压缩文件的结构，返回文件列表
    pub fn analyze_archive(data: &[u8], filename: &str) -> Result<ArchiveInfo, String> {
        let compression_type = CompressionType::from_filename(filename);

        match compression_type {
            CompressionType::Zip => Self::analyze_zip(data),
            CompressionType::TarGz => Self::analyze_tar_gz(data),
            CompressionType::Tar => Self::analyze_tar(data),
            CompressionType::Gzip => Self::analyze_gzip(data),
            _ => Err(format!("Unsupported compression type: {}", compression_type.as_str())),
        }
    }

    fn analyze_zip(data: &[u8]) -> Result<ArchiveInfo, String> {
        let cursor = Cursor::new(data);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| format!("Failed to open ZIP archive: {}", e))?;

        let mut entries = Vec::new();
        let mut total_uncompressed_size = 0;
        let mut total_compressed_size = 0;

        for i in 0..archive.len() {
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
        }

        Ok(ArchiveInfo {
            total_entries: entries.len(),
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
        let cursor = Cursor::new(data);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| format!("Failed to open ZIP archive: {}", e))?;

        let mut file = archive.by_name(entry_path)
            .map_err(|e| format!("Failed to find file '{}' in ZIP: {}", entry_path, e))?;

        let total_size = file.size();
        let mut buffer = vec![0; max_preview_size];

        let bytes_read = file.read(&mut buffer)
            .map_err(|e| format!("Failed to read file content: {}", e))?;

        buffer.truncate(bytes_read);

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
        let cursor = Cursor::new(data);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| format!("Failed to open ZIP archive: {}", e))?;

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
