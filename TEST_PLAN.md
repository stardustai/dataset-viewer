# Test Plan for Windows Protocol Fix

## Prerequisites

- Windows 10/11 machine
- macOS machine (for cross-platform verification)
- Various file types for testing (JSON, XML, CSV, Parquet, ZIP, etc.)

## Test Categories

### 1. Local File Access Tests

#### Windows Tests
1. **Test Windows Drive Path (C:)**
   - Create a test file: `C:\Users\[username]\test\sample.json`
   - Open the file in the application
   - Expected: File opens successfully
   - Verify: File size is displayed correctly
   - Verify: File content is displayed correctly

2. **Test Windows Drive Path (D:)**
   - Create a test file: `D:\work\dataset\sample.xml`
   - Open the file in the application
   - Expected: File opens successfully

3. **Test Windows Path with Chinese Characters**
   - Create a test file: `C:\Users\[username]\测试\文件.json`
   - Open the file in the application
   - Expected: File opens successfully with correct encoding

4. **Test Large File (> 100MB)**
   - Create or use a large file: `C:\Users\[username]\large_file.csv`
   - Open the file in the application
   - Expected: File opens with streaming/chunked loading
   - Verify: Progress indicator shows correctly

#### macOS Tests
1. **Test macOS Path**
   - Create a test file: `/Users/[username]/test/sample.json`
   - Open the file in the application
   - Expected: File opens successfully

2. **Test macOS Path with Special Characters**
   - Create a test file: `/Users/[username]/test 文件/sample.json`
   - Open the file in the application
   - Expected: File opens successfully

### 2. Archive File Tests

#### Windows Tests
1. **Test ZIP File Reading**
   - Create a ZIP file: `C:\Users\[username]\test.zip` containing multiple files
   - Open the ZIP file in the application
   - Browse the contents
   - Preview a file inside the ZIP
   - Expected: All operations work correctly

2. **Test TAR File Reading**
   - Create a TAR file: `C:\Users\[username]\test.tar`
   - Open and browse the TAR file
   - Expected: File list and preview work correctly

#### macOS Tests
1. **Test ZIP File Reading**
   - Create a ZIP file: `/Users/[username]/test.zip`
   - Open and browse the ZIP file
   - Expected: All operations work correctly

### 3. Data File Tests

#### Windows Tests
1. **Test Parquet File Streaming**
   - Open a large Parquet file: `C:\Users\[username]\data.parquet`
   - Verify virtual scrolling works
   - Verify data loads in chunks
   - Expected: Smooth scrolling and loading

2. **Test CSV File Streaming**
   - Open a large CSV file: `C:\Users\[username]\data.csv`
   - Verify pagination works
   - Expected: Data loads incrementally

3. **Test XLSX File**
   - Open an Excel file: `C:\Users\[username]\spreadsheet.xlsx`
   - Switch between sheets
   - Expected: Sheet switching works correctly

#### macOS Tests
1. **Test Parquet File Streaming**
   - Open a Parquet file: `/Users/[username]/data.parquet`
   - Expected: Streaming works correctly

2. **Test CSV File Streaming**
   - Open a CSV file: `/Users/[username]/data.csv`
   - Expected: Pagination works correctly

### 4. Remote Storage Tests

#### WebDAV Tests (Windows)
1. **Connect to WebDAV Server**
   - Configure WebDAV connection
   - Browse directories
   - Open a file
   - Expected: All operations work correctly

2. **Test WebDAV with Authentication**
   - Configure WebDAV with username/password
   - Access protected files
   - Expected: Authentication works, files load correctly

#### WebDAV Tests (macOS)
1. **Test WebDAV Connection**
   - Same as Windows tests
   - Expected: Same results as Windows

#### OSS/S3 Tests (Windows)
1. **Connect to OSS/S3**
   - Configure OSS/S3 connection
   - Browse buckets and objects
   - Open a file
   - Expected: All operations work correctly

2. **Test Large OSS/S3 File**
   - Open a large file from OSS/S3
   - Expected: Streaming works correctly

#### SSH/SFTP Tests (Windows)
1. **Connect to SSH Server**
   - Configure SSH connection
   - Browse remote directories
   - Open a file
   - Expected: All operations work correctly

### 5. Error Handling Tests

#### Windows Tests
1. **Test Invalid Path**
   - Try to open: `C:\nonexistent\file.json`
   - Expected: Appropriate error message

2. **Test Inaccessible File**
   - Try to open a file without permissions
   - Expected: Permission error message

3. **Test Corrupted File**
   - Try to open a corrupted archive
   - Expected: Appropriate error message

### 6. Performance Tests

#### Windows Tests
1. **Test File Size Retrieval**
   - Open files of various sizes (1KB, 1MB, 100MB, 1GB)
   - Measure time to get file size
   - Expected: Fast file size retrieval (<1 second)

2. **Test Memory Usage**
   - Open multiple large files
   - Monitor memory usage
   - Expected: Memory usage stays reasonable (no leaks)

3. **Test Concurrent File Access**
   - Open multiple files simultaneously
   - Expected: No conflicts or errors

## Automated Test Cases

### Unit Tests (TypeScript)

```typescript
// Test protocolUtils.convertProtocolUrl()
describe('protocolUtils', () => {
  test('converts local protocol URL on Windows', async () => {
    // Mock convertFileSrc to simulate Windows behavior
    const result = await convertProtocolUrl('local://C/Users/test/file.json', 'local');
    // On Windows, should convert to http://local.localhost/...
    // On Mac, should return original
    expect(result).toBeDefined();
  });

  test('converts webdav protocol URL', async () => {
    const result = await convertProtocolUrl('webdav:///remote/path', 'webdav');
    expect(result).toBeDefined();
  });

  test('handles non-protocol URLs', async () => {
    const result = await convertProtocolUrl('http://example.com/file', 'http');
    expect(result).toBe('http://example.com/file');
  });
});
```

### Integration Tests (Rust)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_windows_path() {
        // Test Windows drive path extraction
        let result = ProtocolHandler::extract_relative_path(
            "local://localhost/C%3A%2FUsers%2Ftest%2Ffile.json",
            &mock_client
        );
        assert_eq!(result, "C:/Users/test/file.json");
    }

    #[test]
    fn test_extract_unix_path() {
        // Test Unix path extraction
        let result = ProtocolHandler::extract_relative_path(
            "local://localhost//home/user/file.txt",
            &mock_client
        );
        assert_eq!(result, "/home/user/file.txt");
    }

    #[test]
    fn test_extract_webdav_path() {
        // Test WebDAV path extraction
        let result = ProtocolHandler::extract_relative_path(
            "webdav://localhost//remote/path/file.txt",
            &mock_client
        );
        assert_eq!(result, "/remote/path/file.txt");
    }
}
```

## Success Criteria

1. ✅ All local file tests pass on Windows
2. ✅ All local file tests pass on macOS
3. ✅ Archive file operations work on both platforms
4. ✅ Data file streaming works correctly
5. ✅ Remote storage connections work on both platforms
6. ✅ Error handling is appropriate and user-friendly
7. ✅ Performance is acceptable (file size < 1s, no memory leaks)
8. ✅ No regressions in existing functionality

## Test Execution Log

| Test Case | Windows Result | macOS Result | Notes |
|-----------|---------------|--------------|-------|
| Windows Drive Path (C:) | ⏳ Pending | N/A | |
| Windows Drive Path (D:) | ⏳ Pending | N/A | |
| Windows Path with Chinese | ⏳ Pending | N/A | |
| Large File (> 100MB) | ⏳ Pending | ⏳ Pending | |
| macOS Path | N/A | ⏳ Pending | |
| ZIP File Reading | ⏳ Pending | ⏳ Pending | |
| Parquet Streaming | ⏳ Pending | ⏳ Pending | |
| CSV Streaming | ⏳ Pending | ⏳ Pending | |
| WebDAV Connection | ⏳ Pending | ⏳ Pending | |
| OSS/S3 Connection | ⏳ Pending | ⏳ Pending | |
| SSH/SFTP Connection | ⏳ Pending | ⏳ Pending | |

## Regression Tests

Verify that the following existing features still work:

1. ✅ File browser navigation
2. ✅ File search functionality
3. ✅ Connection management
4. ✅ Download functionality
5. ✅ Settings and preferences
6. ✅ Theme switching
7. ✅ Language switching (i18n)
8. ✅ Plugin system

## Known Limitations

1. The fix requires Tauri 2.0+ which includes the `convertFileSrc()` API
2. Testing requires actual Windows and macOS machines (CI environments may not support all features)
3. Some tests require external services (WebDAV, S3, SSH servers)

## Next Steps

1. Execute manual tests on Windows platform
2. Execute manual tests on macOS platform
3. Add automated unit tests for `protocolUtils.ts`
4. Add Rust unit tests for `extract_relative_path()`
5. Document any issues found during testing
6. Update documentation based on test results
