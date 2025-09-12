<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Dataset Viewer Project Instructions

🤖 **This project is 100% AI-generated** using GitHub Copilot and Claude AI

Cross-platform Tauri application for unified dataset browsing with massive file streaming capabilities.

## Commit Message Generation Instructions

- When generating commit messages, always use English.
- Follow the Conventional Commits specification (e.g., feat:, fix:, docs:, refactor:, etc.).
- Summarize the main change clearly and concisely, focusing on user impact.
- Do not include unrelated or trivial details.
- Example: `feat(file-browser): add virtual scrolling for large directories`


## Tech Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Backend**: Tauri 2.0 (Rust) + HTTP/FS plugins
- **UI**: @tanstack/react-virtual + Lucide icons
- **I18n**: i18next (Chinese/English)
- **Build**: Vite 6 + PNPM

## Key Features
- **Multi-Protocol Support**: WebDAV, SSH/SFTP, SMB/CIFS, S3, Local Files, HuggingFace Hub
- **Large File Support**: Stream 100GB+ files with chunked loading
- **Archive Preview**: Stream ZIP/TAR files without extraction
- **Virtual Scrolling**: Handle millions of lines efficiently
- **Real-time Search**: Regex search with highlighting
- **Connection Management**: Secure credential storage with unified interface

## Storage Architecture
- **BaseStorageClient**: Abstract base class with unified `toProtocolUrl()` method
- **Protocol-specific clients**: WebDAV, S3, Local, HuggingFace implementations
- **Protocol URL Standards**:
  - OSS: `oss://bucket/path`
  - WebDAV: `webdav://host/path`
  - HuggingFace: `huggingface://owner:dataset/path`
  - Local: `file:///absolute/path`
- **Unified Backend Parsing**: All storage clients parse protocol URLs in file operations

## Development Guidelines
- **TypeScript**: Use strict typing for all code
- **Storage Clients**: Inherit from BaseStorageClient, implement abstract methods
- **Path Processing**: Keep path handling logic within respective clients
- **Components**: Organize by feature, use composition
- **Styling**: Tailwind CSS utility classes
- **Performance**: Virtual scrolling for >100 items, chunked loading for >1MB files
- **I18n**: Wrap all UI text in translation functions
- **State**: React hooks + localStorage persistence
- **Tauri**: Use async commands, official plugins, follow security practices

## Recent Architecture Improvements
- **Protocol URL Standardization**: Unified all storage clients to use consistent protocol URL formats
- **Single URL Method**: Replaced dual `toStoragePath`/`toRequestUrl` with unified `toProtocolUrl()` method
- **Complete Backend Protocol Support**: All file operations (get_file_size, read_file_range, read_full_file) parse protocol URLs
- **Eliminated Legacy Code**: Removed all historical compatibility logic from backend storage clients
- **Cross-Client Consistency**: Verified uniform protocol URL handling across OSS, WebDAV, HuggingFace, and Local storage
- **Compression File Analysis**: Fixed duplicate protocol URL conversion issues across all storage types
