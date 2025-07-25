# WebDAV Browser

> 🤖 **This project is 100% AI-generated** using GitHub Copilot and Claude AI

A modern, high-performance WebDAV browser built with Tauri, React, and TypeScript. Designed to handle large text files (hundreds of GB) with efficient streaming and fast in-file search capabilities.

[中文文档](README_zh.md) · **[Download Latest Release](https://github.com/stardustai/webdav-viewer/releases/latest)**

## ✨ Highlights

- 🤖 **100% AI-Generated**: Entire codebase created through AI assistance
- 🚀 **High Performance**: Native Tauri backend with React frontend
- 📦 **Cross-Platform**: Single codebase for Windows, macOS, and Linux
- 🔧 **Modern Stack**: TypeScript + Tailwind CSS + Rust

## 🚀 Features

- 🌐 **WebDAV Server Connection**: Secure connection to any WebDAV server with credential storage
- 📁 **Intelligent File Browser**: Intuitive navigation with thumbnail previews and sorting
- 📄 **Large File Support**: Efficiently view massive text files (100GB+) using chunked loading
- 📦 **Archive Streaming**: Stream and preview large compressed files (ZIP, TAR, etc.) without full extraction
- 🔍 **Lightning-Fast Search**: Real-time in-file search with regex support and navigation
- 🎨 **Modern UI**: Clean, responsive interface with dark/light theme support
- 🌍 **Multi-Language**: Built-in internationalization support
- 📱 **Cross-Platform**: Native performance on Windows, macOS, and Linux
- ⚡ **Virtualized Rendering**: Smooth scrolling for files with millions of lines
- 🎥 **Media Preview**: Built-in image and video preview capabilities

## 📸 Screenshots

| File Browser | Text Viewer | Archive Viewer |
|:------------:|:----------:|:-------------:|
| ![File Browser](screenshots/home.png) | ![Text Viewer](screenshots/text.png) | ![Archive Viewer](screenshots/archive.png) |
| *Modern file browser with intuitive navigation and theme support* | *Advanced text viewer with search capabilities and virtualized rendering* | *Archive streaming with file preview and efficient content browsing* |

## 📚 Supported File Types

### Text Files
- Plain text (`.txt`, `.log`)
- Markdown (`.md`, `.markdown`)
- JSON (`.json`)
- YAML (`.yaml`, `.yml`)
- XML (`.xml`)
- Configuration files (`.ini`, `.conf`, `.cfg`)

### Code Files
- JavaScript/TypeScript (`.js`, `.ts`, `.jsx`, `.tsx`)
- Python (`.py`, `.pyx`)
- Java (`.java`)
- C/C++ (`.c`, `.cpp`, `.h`, `.hpp`)
- Rust (`.rs`)
- Go (`.go`)
- PHP (`.php`)
- And many more...

### Archive Files (Streaming Preview)
- ZIP archives (`.zip`) - Browse and preview contents without extraction
- TAR archives (`.tar`, `.tar.gz`, `.tar.bz2`) - Streaming file browser
- RAR archives (`.rar`) - Content listing and file preview
- 7-Zip archives (`.7z`) - Efficient streaming access

### Document Files
- PDF (`.pdf`) - Document viewer
- Excel (`.xlsx`, `.xls`) - Spreadsheet viewer

### Media Files (Preview)
- Images (`.jpg`, `.png`, `.gif`, `.svg`, `.webp`)
- Videos (`.mp4`, `.webm`, `.mov`)

## 🛠 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://rustup.rs/) (latest stable)
- [pnpm](https://pnpm.io/) (recommended package manager)

### Quick Start

1. **Clone the repository:**
```bash
git clone https://github.com/stardustai/webdav-viewer.git
cd webdav-viewer
```

2. **Install dependencies:**
```bash
pnpm install
```

3. **Start development:**
```bash
pnpm tauri dev
```

The application will open automatically in development mode.

### 📦 Building for Production

```bash
# Build and package (recommended)
pnpm package

# Development mode
pnpm tauri dev

# Debug build (faster compilation)
pnpm package:debug
```

**Build Scripts:**
- Unix/Linux/macOS: `./build.sh` or `./build.sh --debug`
- Windows: `build.bat` or `build.bat --debug`

**Output Formats:**
- **macOS**: `.dmg` installer, `.app` bundle
- **Windows**: `.msi` installer, `.exe` executable
- **Linux**: `.deb`, `.rpm`, `.AppImage` packages

> **📱 macOS Note**: The app is unsigned. If you get security warnings, run: `sudo xattr -d com.apple.quarantine "/Applications/WebDAV Viewer.app"` or right-click → "Open" → "Open".

## 📖 Usage Guide

1. **🔐 Connect to WebDAV Server**:
   - Enter your server URL, username, and password
   - Save connections for quick access
   - Test connection before saving

2. **📁 Browse Files**:
   - Navigate through directories with the intuitive file browser
   - Sort files by name, size, or modification date
   - Preview file thumbnails for supported formats

3. **📄 View Text Files**:
   - Click on any supported text file to open in the viewer
   - Enjoy syntax highlighting for code files
   - Navigate large files with virtualized scrolling

4. **🔍 Search Content**:
   - Use the search bar to find content within files
   - Support for regex patterns and case-sensitive search
   - Navigate between search results with hotkeys

5. **📥 Download Files**:
   - Download individual files or entire directories
   - Monitor download progress with built-in progress indicator
   - Resume interrupted downloads

6. **📦 Browse Archives**:
   - Stream and preview compressed files without full extraction
   - Navigate through archive contents like regular directories
   - Preview text files inside archives instantly

## 🏗 Architecture & Performance

**Tech Stack:**
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Backend**: Tauri (Rust) + Custom WebDAV client
- **Build**: Vite for fast development and optimized builds

**Key Optimizations:**
- **📊 Chunked Loading**: Large files in 10MB chunks
- **📦 Archive Streaming**: Process compressed files without full extraction
- **🖥 Virtual Scrolling**: Millions of lines without performance impact
- **🧠 Smart Memory Management**: Efficient loading and disposal
- **🔍 Debounced Search**: Optimized search to prevent excessive API calls

## 💻 Development

**Recommended IDE**: VS Code with Tauri, rust-analyzer, and Tailwind CSS extensions

**Testing**: `pnpm test` (frontend) · `cargo test` (Rust)

## 🤝 Contributing

1. Fork → Create feature branch → Make changes → Submit PR
2. **Bug Reports**: [Open an issue](https://github.com/stardustai/webdav-viewer/issues) with clear description and steps to reproduce
3. **Feature Requests**: Describe the feature and why it would be useful

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **🤖 AI Development**: This project showcases the power of AI-assisted development
- **🛠 Tauri Team**: For creating an amazing framework
- **⚛️ React Community**: For the excellent ecosystem
- **🦀 Rust Community**: For the robust language and tools

---

<div align="center">

**Made with ❤️ and 🤖 AI**

[Report Bug](https://github.com/stardustai/webdav-viewer/issues) · [Request Feature](https://github.com/stardustai/webdav-viewer/issues) · [Documentation](https://github.com/stardustai/webdav-viewer/wiki)

</div>
