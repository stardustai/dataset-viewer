# Windows Custom Protocol Fix Summary

## Problem

When opening files on Windows using custom protocols (`local://`, `webdav://`, `ssh://`, etc.), the application was failing with an error:

```
Failed to get file size: Error: Failed to get file size via LOCAL protocol: 
Failed to execute 'fetch' on 'Window': Failed to parse URL from local://D:\work\asset...
```

## Root Cause

Tauri handles custom protocols differently on different platforms:

- **macOS**: Custom protocols like `local://path` work directly as-is
- **Windows**: Custom protocols are converted to `http://protocol.localhost/path`

The frontend code was using protocol URLs directly with `fetch()`, which works on macOS but fails on Windows because the browser cannot parse the custom protocol scheme.

## Solution

Implemented a two-layer fix:

### 1. Frontend: Protocol URL Conversion (`src/utils/protocolUtils.ts`)

Created a utility function that uses Tauri's `convertFileSrc()` API to convert protocol URLs to platform-specific URLs:

```typescript
export async function convertProtocolUrl(protocolUrl: string, protocol: string): Promise<string> {
  const protocolPrefix = `${protocol}://`;
  
  if (protocolUrl.startsWith(protocolPrefix)) {
    const path = protocolUrl.replace(protocolPrefix, '');
    // On Mac: returns original protocol URL
    // On Windows: converts to http://protocol.localhost/path
    return convertFileSrc(path, protocol);
  }
  
  return protocolUrl;
}
```

### 2. Frontend: Updated Fetch Calls

Updated all locations where `fetch()` is called with protocol URLs:

- **`src/services/storage/StorageClient.ts`**:
  - `readProtocolFileBytes()` - for reading file content
  - `getProtocolFileSize()` - for getting file size

- **`src/services/compression.ts`**:
  - `extractFilePreviewViaProtocol()` - for archive file extraction

- **`src/components/FileViewer/data-providers/ParquetDataProvider.ts`**:
  - `StreamingAsyncBuffer.slice()` - for Parquet file streaming

### 3. Backend: Windows localhost Prefix Handling (`src-tauri/src/utils/protocol_handler.rs`)

Updated `extract_relative_path()` to handle Windows-style URLs with `localhost` prefix:

```rust
pub fn extract_relative_path(protocol_url: &str, _client: &dyn StorageClient) -> String {
    // Handle all custom protocols: local, webdav, ssh, oss, huggingface, smb
    let protocols = ["local", "webdav", "webdavs", "ssh", "oss", "huggingface", "smb"];
    
    for protocol in &protocols {
        let prefix = format!("{}://", protocol);
        if protocol_url.starts_with(&prefix) {
            let mut path = protocol_url.strip_prefix(&prefix).unwrap_or("");
            
            // Remove Windows localhost/ prefix
            if path.starts_with("localhost/") {
                path = path.strip_prefix("localhost/").unwrap_or(path);
            } else if path == "localhost" {
                path = "";
            }
            
            let decoded = urlencoding::decode(path)
                .map(|s| s.into_owned())
                .unwrap_or_else(|_| path.to_string());
            
            // Windows drive path detection (C:/, D:/, etc.)
            if decoded.len() >= 2 && decoded.chars().nth(1) == Some(':') {
                return decoded;
            }
            
            // Unix path handling
            if !decoded.starts_with('~') && !decoded.starts_with('/') && !decoded.is_empty() {
                return format!("/{}", decoded);
            }
            
            return decoded;
        }
    }
    
    protocol_url.to_string()
}
```

## Verification Flow

### Windows:
```
Frontend:        local://C/Users/test/file.json
    ↓ convertProtocolUrl()
Fetch URL:       http://local.localhost/C%3A%2FUsers%2Ftest%2Ffile.json
    ↓ Tauri receives
Backend URI:     local://localhost/C%3A%2FUsers%2Ftest%2Ffile.json
    ↓ extract_relative_path()
File Path:       C:/Users/test/file.json ✅
```

### macOS:
```
Frontend:        local:///Users/test/file.json
    ↓ convertProtocolUrl() (no-op)
Fetch URL:       local:///Users/test/file.json
    ↓ Tauri receives
Backend URI:     local:///Users/test/file.json
    ↓ extract_relative_path()
File Path:       /Users/test/file.json ✅
```

## Key Features

1. **Cross-platform Compatibility**: Works on both Windows and macOS
2. **All Protocol Support**: Handles local, webdav, ssh, oss, huggingface, smb protocols
3. **Windows Drive Detection**: Correctly identifies Windows drive paths (C:, D:, etc.)
4. **URL Decoding**: Properly handles URL-encoded characters
5. **Minimal Changes**: Only touched files where `fetch()` is used with protocol URLs

## Files Modified

1. `src/utils/protocolUtils.ts` (new file)
2. `src/services/storage/StorageClient.ts`
3. `src/services/compression.ts`
4. `src/components/FileViewer/data-providers/ParquetDataProvider.ts`
5. `src-tauri/src/utils/protocol_handler.rs`

## Testing Checklist

- [ ] Test local file access on Windows (C:\Users\...)
- [ ] Test local file access on macOS (/Users/...)
- [ ] Test WebDAV file access on Windows
- [ ] Test WebDAV file access on macOS
- [ ] Test OSS/S3 file access on Windows
- [ ] Test OSS/S3 file access on macOS
- [ ] Test SSH/SFTP file access on Windows
- [ ] Test SSH/SFTP file access on macOS
- [ ] Test archive file preview on Windows
- [ ] Test archive file preview on macOS
- [ ] Test Parquet file streaming on Windows
- [ ] Test Parquet file streaming on macOS

## Related Issue

Fixes the issue: 打开文件失败 (File opening failure on Windows)

The issue reported that opening files on Windows resulted in an error:
```
Failed to get file size: Error: Failed to get file size via LOCAL protocol: 
Failed to execute 'fetch' on 'Window': Failed to parse URL from local://D:\work\asset...
```
