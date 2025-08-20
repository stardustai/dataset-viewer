# OSS Pagination Implementation

This implementation adds support for loading more than 1000 files from Alibaba Cloud OSS (Object Storage Service) by implementing pagination with a "Load More" button.

## Problem Statement

阿里云 OSS 似乎一次只能获取最多 1000 个元素，需要增加下自动加载更多的机制，整体合理设计下，前端交互应该和文本的自动加载比较像，不过初始化时不需要额外加载，rust 的返回值是 has_more，应该和入参一样用 serde 自动转为 hasMore

Translation: Alibaba Cloud OSS can only retrieve a maximum of 1000 elements at a time. Need to add an auto-loading mechanism for more elements. The overall design should be reasonable, and the frontend interaction should be similar to text auto-loading, but no additional loading is needed during initialization. The Rust return value is has_more, which should be automatically converted to hasMore using serde like the input parameters.

## Implementation Details

### Backend (Rust)
- The OSS client already supports `has_more` and `next_marker` fields in `DirectoryResult`
- These are automatically converted from Rust `has_more` to TypeScript `hasMore` via serde
- The listing API supports `marker` parameter for pagination
- Maximum of 1000 items returned per request

### Frontend (TypeScript/React)
- Added pagination state management to `FileBrowser` component:
  - `hasMore: boolean` - Whether more files are available
  - `nextMarker: string` - Marker for next page request
  - `loadingMore: boolean` - Loading state for pagination requests

- Created `LoadMoreButton` component with:
  - Loading spinner during requests
  - File count display
  - Internationalization support (EN/ZH)

- Updated `StorageManager.listDirectory()` to:
  - Accept optional `ListOptions` parameter
  - Return full `DirectoryResult` instead of just file array
  - Preserve pagination metadata

### User Interface
- "Load More Files" button appears at bottom of file list when `hasMore = true`
- Button shows loading spinner when pagination request is in progress
- File count indicator shows total loaded files
- New files are appended to existing list (not replaced)
- Pagination state resets when changing directories

### Translations Added
- English:
  - `directory.load.more`: "Load More Files"
  - `directory.loading.more`: "Loading more files..."
  - `directory.loaded.files`: "{{count}} files loaded"
  - `directory.has.more`: "More files available"

- Chinese:
  - `directory.load.more`: "加载更多文件"
  - `directory.loading.more`: "正在加载更多文件..."
  - `directory.loaded.files`: "已加载 {{count}} 个文件"
  - `directory.has.more`: "还有更多文件"

## Affected Files

### New Files
- `src/components/FileBrowser/LoadMoreButton.tsx` - Pagination UI component

### Modified Files
- `src/components/FileBrowser/index.tsx` - Added pagination state and logic
- `src/services/storage/StorageManager.ts` - Updated listDirectory method
- `src/services/folderDownloadService.ts` - Updated to handle DirectoryResult
- `src/i18n/locales/en/fileViewer.ts` - Added English translations
- `src/i18n/locales/zh/fileViewer.ts` - Added Chinese translations
- `.gitignore` - Added package-lock.json exclusion

## Usage

1. When browsing an OSS bucket with more than 1000 files:
   - Initial load shows first 1000 files
   - "Load More Files" button appears at bottom
   - Click button to load next 1000 files
   - Files are appended to existing list
   - Process continues until all files loaded

2. The implementation is compatible with existing functionality:
   - Search still works on loaded files
   - Sorting works on loaded files  
   - Directory navigation resets pagination
   - No changes to other storage clients (WebDAV, Local, HuggingFace)

## Technical Notes

- Uses OSS List Objects v2 API with continuation tokens
- Respects OSS rate limits and pagination best practices
- Maintains scroll position during pagination
- Error handling for failed pagination requests
- Backward compatible with existing codebase

This implementation follows the same pattern as the file viewer's chunked loading, providing a consistent user experience across the application.