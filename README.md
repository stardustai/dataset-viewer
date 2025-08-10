<div align="center">

# Dataset Viewer

**⚡ Open massive files in seconds · 🔍 Millisecond search · 📦 Direct archive preview**

[![GitHub release](https://img.shields.io/github/release/stardustai/dataset-viewer.svg)](https://github.com/stardustai/dataset-viewer/releases/latest) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/stardustai/dataset-viewer/releases) [![AI Generated](https://img.shields.io/badge/100%25-AI%20Generated-blue)](https://github.com/stardustai/dataset-viewer)

A modern, high-performance dataset viewer built with Tauri, React, and TypeScript. Designed to handle massive datasets from multiple sources with efficient streaming for large files (100GB+) and lightning-fast search capabilities.

[中文文档](README_zh.md) · [Download](https://github.com/stardustai/dataset-viewer/releases/latest) · [Report Bug](https://github.com/stardustai/dataset-viewer/issues) · [Request Feature](https://github.com/stardustai/dataset-viewer/issues)

</div>



## 🚀 Key Features

- ⚡ **Instant Large File Opening**: Handle 100GB+ files with virtualized rendering, no waiting time
- 🔍 **Millisecond Search**: Real-time search with highlighting, fast positioning in large files
- 📦 **Direct Archive Preview**: Browse ZIP/TAR files without extraction, streaming file browser
- 🗂️ **Native Multi-Format Support**: Optimized rendering for Parquet, Excel, CSV with syntax highlighting for JSON/YAML
- 🌐 **Multi-Source Data Access**: WebDAV servers, local files, cloud storage (OSS), HuggingFace datasets
- 🎨 **Modern Interface**: Dark/light themes, responsive design, multi-language support

## ✨ Technical Highlights

- 🤖 **100% AI-Generated**: Entire codebase created through AI assistance
- 🚀 **Native Performance**: Tauri (Rust) backend + React frontend, cross-platform support
- 🧠 **Smart Memory Management**: Chunked loading, virtual scrolling, handles millions of rows effortlessly
- 📊 **Streaming Processing**: Large file chunked transmission, compressed files without full extraction

## 🎯 Perfect For

- **📊 Data Scientists**: Quickly explore large datasets, Parquet files, and CSV data
- **🔍 Log Analysis**: Search through massive log files without loading everything into memory
- **📦 Archive Management**: Browse ZIP/TAR contents without extraction
- **☁️ Remote Data**: Access files from WebDAV servers, cloud storage, and HuggingFace
- **🚀 Performance Critical**: When you need instant file access and lightning-fast search

## 📸 Screenshots

<div align="center">
<table width="100%">
  <tr>
    <td align="center" width="50%">
      <b>Connection Setup</b><br>
      <img src="screenshots/connect.png" alt="Connection Setup" style="max-width:100%;">
      <br><em>Easy connection management with multiple storage types</em>
    </td>
    <td align="center" width="50%">
      <b>File Browser</b><br>
      <img src="screenshots/home.png" alt="File Browser" style="max-width:100%;">
      <br><em>Modern file browser with intuitive navigation and theme support</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <b>Text Viewer</b><br>
      <img src="screenshots/text.png" alt="Text Viewer" style="max-width:100%;">
      <br><em>Advanced text viewer with search capabilities and virtualized rendering</em>
    </td>
    <td align="center" width="50%">
      <b>Archive Viewer</b><br>
      <img src="screenshots/archive.png" alt="Archive Viewer" style="max-width:100%;">
      <br><em>Archive streaming with file preview and efficient content browsing</em>
    </td>
  </tr>
</table>
</div>

## 📚 Supported File Types

**📄 Text & Code**: Plain text, JSON, YAML, XML, JavaScript, Python, Java, C/C++, Rust, Go, PHP, and more

**📝 Documents**: **Markdown** (rendered preview), **Word Documents** (.doc/.docx/.rtf, text extraction preview)

**📦 Archives**: ZIP, TAR (streaming preview without extraction)

**📊 Data**: **Parquet** (optimized), Excel, CSV, ODS with virtual scrolling for millions of rows

**📱 Media**: Images, Videos, Audio (preview support)

**📋 Documents**: PDF viewer with text search

## 🚀 Quick Start

### 📦 Download (Recommended)

**Latest Release**: [GitHub Releases](https://github.com/stardustai/dataset-viewer/releases)

| Platform | Download |
|----------|----------|
| 🍎 **macOS** | [.dmg installer](https://github.com/stardustai/dataset-viewer/releases/latest) |
| 🪟 **Windows** | [.msi installer](https://github.com/stardustai/dataset-viewer/releases/latest) |
| 🐧 **Linux** | [.AppImage/.deb/.rpm](https://github.com/stardustai/dataset-viewer/releases/latest) |
| 🤖 **Android** | [.apk/.aab](https://github.com/stardustai/dataset-viewer/releases/latest) |

### 🛠️ Build from Source

**Requirements**: Node.js 18+, Rust, pnpm

```bash
git clone https://github.com/stardustai/dataset-viewer.git
cd dataset-viewer
pnpm install
pnpm tauri dev  # Development
pnpm package    # Build
```


> **📱 macOS Note**: The app is unsigned. If you get security warnings, run: `sudo xattr -d com.apple.quarantine "/Applications/Dataset Viewer.app"` or right-click → "Open" → "Open".



## 🤝 Contributing

We welcome contributions! Here's how you can help:

- 🐛 **Bug Reports**: [Open an issue](https://github.com/stardustai/dataset-viewer/issues) with clear description and steps to reproduce
- 💡 **Feature Requests**: [Suggest new features](https://github.com/stardustai/dataset-viewer/issues) and explain why they would be useful
- 🔧 **Code Contributions**: Fork → Create feature branch → Make changes → Submit PR
- 📖 **Documentation**: Help improve our docs and examples
- ⭐ **Star the project**: Show your support by starring the repository



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

</div>
