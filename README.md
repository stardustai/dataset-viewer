<div align="center">

# Dataset Viewer

**⚡ Open massive files in seconds · 🔍 Millisecond search · 📦 Direct archive preview**

[![GitHub release](https://img.shields.io/github/release/stardustai/dataset-viewer.svg)](https://github.com/stardustai/dataset-viewer/releases/latest) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/stardustai/dataset-viewer/releases) [![AI Generated](https://img.shields.io/badge/100%25-AI%20Generated-blue)](https://github.com/stardustai/dataset-viewer) [![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/stardustai/dataset-viewer)

A modern, high-performance dataset viewer built with Tauri, React, and TypeScript. Designed to handle massive datasets from multiple sources with efficient streaming for large files (100GB+) and lightning-fast search capabilities.

[中文文档](README_zh.md) · [Download](https://github.com/stardustai/dataset-viewer/releases/latest) · [Report Bug](https://github.com/stardustai/dataset-viewer/issues) · [Request Feature](https://github.com/stardustai/dataset-viewer/issues)

</div>



## 🚀 Key Features

- ⚡ **Instant Large File Opening**: Handle 100GB+ files with virtualized rendering
- 🔍 **Real-time Search**: Millisecond search with highlighting across massive files
- 📦 **Direct Archive Preview**: Browse ZIP/TAR files without extraction
- 🌐 **Multi-Protocol Support**: WebDAV, SSH/SFTP, SMB/CIFS, S3, Local Files, HuggingFace Hub
- 🗂️ **Multi-Format Support**: Parquet, Excel, CSV, JSON, code files with syntax highlighting
- 🎨 **Modern Interface**: Dark/light themes, responsive design, multi-language support

## 📚 Supported File Types

- **📄 Text & Code**: JSON, YAML, XML, JavaScript, Python, Java, C/C++, Rust, Go, PHP, etc.
- **📝 Documents**: Markdown (preview), Word (.docx/.rtf), PowerPoint (.pptx), PDF (searchable)
- **📊 Data Files**: Parquet (optimized), Excel, CSV, ODS with virtual scrolling
- **📦 Archives**: ZIP, TAR (streaming preview without extraction)
- **📱 Media**: Images, Videos, Audio files

## 📸 Screenshots

<div align="center">
<table width="100%">
  <tr>
    <td align="center" width="50%">
      <b>🔗 Connection Setup</b><br>
      <img src="screenshots/connect.png" alt="Connection Setup" style="max-width:100%;">
      <br><em>Easy connection management with multiple storage types</em>
    </td>
    <td align="center" width="50%">
      <b>📊 JSON Viewer</b><br>
      <img src="screenshots/json.png" alt="JSON Viewer" style="max-width:100%;">
      <br><em>Structured JSON display with syntax highlighting and collapsible nodes</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <b>💻 Code Viewer</b><br>
      <img src="screenshots/code.png" alt="Code Viewer" style="max-width:100%;">
      <br><em>Multi-language syntax highlighting with large file support</em>
    </td>
    <td align="center" width="50%">
      <b>📋 Data Sheets</b><br>
      <img src="screenshots/sheet.png" alt="Data Sheets" style="max-width:100%;">
      <br><em>CSV/Excel visualization with filtering and sorting capabilities</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <b>🌐 Point Cloud Viewer</b><br>
      <img src="screenshots/pointcloud.png" alt="Point Cloud Viewer" style="max-width:100%;">
      <br><em>Interactive 3D point cloud data visualization</em>
    </td>
    <td align="center" width="50%">
      <b>📦 Archive Browser</b><br>
      <img src="screenshots/archive.png" alt="Archive Browser" style="max-width:100%;">
      <br><em>Browse ZIP/TAR archives without extraction</em>
    </td>
  </tr>
</table>
</div>

## ✨ Technical Highlights

- 🤖 **100% AI-Generated**: Entire codebase created through AI assistance
- 🚀 **Native Performance**: Tauri (Rust) + React, cross-platform desktop app
- 🧠 **Smart Memory**: Chunked loading, virtual scrolling for millions of rows
- 📊 **Streaming Architecture**: Large file chunked transmission, no full extraction needed

## 🎯 Perfect For

- **Data Scientists**: Explore large datasets, Parquet files, and CSV data
- **Log Analysis**: Search massive log files without memory constraints
- **Archive Management**: Browse compressed files without extraction
- **Remote Access**: Connect to WebDAV, SSH/SFTP, SMB, cloud storage, HuggingFace
- **Performance-Critical**: Instant file access and lightning-fast search

## 🔌 Plugin Development

Extend Dataset Viewer's capabilities by creating custom plugins! Our plugin system allows you to add support for new file formats and viewers.

- 📖 **[Plugin Development Guide (Wiki)](https://github.com/stardustai/dataset-viewer/wiki/Plugin-Development-Guide)** - Complete guide to building plugins
- 📦 **[@dataset-viewer/sdk](https://www.npmjs.com/package/@dataset-viewer/sdk)** - Official SDK for plugin development
- 🎨 **[Example Plugins](https://github.com/stardustai/dataset-viewer/tree/main/packages)** - CAD Viewer, Sketch Viewer, and more

Get started with our SDK and create plugins for:
- Custom file format viewers
- Data converters and analyzers
- Integration with external tools
- Enhanced visualization components

## 🤝 Contributing

We welcome contributions! You can help by:

- 🐛 [Reporting bugs](https://github.com/stardustai/dataset-viewer/issues) with clear reproduction steps
- 💡 [Suggesting features](https://github.com/stardustai/dataset-viewer/issues) and explaining their usefulness
- 🔧 Submitting code: Fork → Branch → Changes → PR
- 🔌 Creating plugins to extend functionality
- 📖 Improving documentation and examples
- ⭐ Starring the repository to show support

## 🙏 Acknowledgments

Thanks to the **Tauri**, **React**, and **Rust** communities for their excellent tools and frameworks. This project showcases the power of AI-assisted development.

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Made with ❤️ and 🤖 AI**

</div>
