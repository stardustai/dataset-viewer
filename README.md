# WebDAV Browser

> 🤖 **This project is 100% AI-generated** using GitHub Copilot and Claude AI

📥 **[Download Latest Release](https://github.com/stardustai/webdav-viewer/releases/latest)**

A modern, high-performance WebDAV browser built with Tauri, React, and TypeScript. Designed to handle large text files (hundreds of GB) with efficient streaming and fast in-file search capabilities.

## ✨ Highlights

- 🤖 **100% AI-Generated**: Entire codebase created through AI assistance
- 🚀 **High Performance**: Native Tauri backend with React frontend
- 📦 **Cross-Platform**: Single codebase for Windows, macOS, and Linux
- 🔧 **Modern Stack**: TypeScript + Tailwind CSS + Rust

## 🚀 Features

- 🌐 **WebDAV Server Connection**: Secure connection to any WebDAV server with credential storage
- 📁 **Intelligent File Browser**: Intuitive navigation with thumbnail previews and sorting
- 📄 **Large File Support**: Efficiently view massive text files (100GB+) using chunked loading
- 🔍 **Lightning-Fast Search**: Real-time in-file search with regex support and navigation
- 🎨 **Modern UI**: Clean, responsive interface with dark/light theme support
- 🌍 **Multi-Language**: Built-in internationalization support
- 📱 **Cross-Platform**: Native performance on Windows, macOS, and Linux
- ⚡ **Virtualized Rendering**: Smooth scrolling for files with millions of lines
- 🎥 **Media Preview**: Built-in image and video preview capabilities

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

Create optimized builds and installers for distribution:

```bash
# One-command build and package
pnpm package

# Or build step by step
pnpm build              # Build frontend
pnpm tauri:build        # Create platform installer

# Quick debug build (faster compilation)
pnpm package:debug
```

### 🎯 Available Commands

| Command | Description |
|---------|-------------|
| `pnpm tauri:dev` | Start development mode with hot reload |
| `pnpm tauri:build` | Build optimized release version |
| `pnpm tauri:build:debug` | Build debug version (faster) |
| `pnpm build:all` | Build frontend and create installer |
| `pnpm package` | One-command build and package |
| `pnpm package:debug` | Quick debug package |
| `pnpm clean` | Clean all build artifacts and cache |
| `pnpm clean:build` | Clean only Tauri build artifacts |
| `pnpm lint` | Run TypeScript type checking |

### 🚀 Quick Build Scripts

For convenience, use the provided build scripts:

**Unix/Linux/macOS:**
```bash
# Release build with optimizations
./build.sh

# Debug build (faster compilation)
./build.sh --debug
```

**Windows:**
```cmd
# Release build with optimizations
build.bat

# Debug build (faster compilation)
build.bat --debug
```

### 📦 Platform-Specific Outputs

After building, installers will be available in `src-tauri/target/release/bundle/`:

| Platform | Output Formats |
|----------|----------------|
| **macOS** | `.dmg` installer, `.app` bundle |
| **Windows** | `.msi` installer, `.exe` executable |
| **Linux** | `.deb`, `.rpm`, `.AppImage` packages |

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

## 🏗 Architecture

This application follows a modern, scalable architecture:

- **🎨 Frontend**: React 18 with TypeScript for type safety and modern development
- **💅 Styling**: Tailwind CSS for utility-first, responsive design
- **⚡ Backend**: Tauri framework combining Rust performance with web technologies
- **🌐 WebDAV Client**: Custom WebDAV implementation optimized for large files
- **🗄 State Management**: React Context and custom hooks for efficient state handling
- **🎯 Build System**: Vite for fast development and optimized production builds

## ⚡ Performance Optimizations

- **📊 Chunked Loading**: Large files loaded in manageable 10MB chunks
- **🖥 Virtual Scrolling**: Efficient rendering of millions of lines without performance impact
- **🔍 Debounced Search**: Intelligent search optimization to prevent excessive API calls
- **🧠 Memory Management**: Smart content loading and disposal for optimal resource usage
- **⚡ Lazy Loading**: Components and content loaded on-demand
- **📱 Responsive Design**: Optimized for all screen sizes from mobile to desktop

## 💻 Development

### 📁 Project Structure

```
src/
├── components/              # React components
│   ├── ConnectionPanel.tsx  # WebDAV connection management
│   ├── FileBrowser.tsx     # File system navigation
│   ├── FileViewer.tsx      # Text file viewer with syntax highlighting
│   ├── MediaViewer.tsx     # Image and video preview
│   ├── VirtualizedTextViewer.tsx  # High-performance text rendering
│   └── common/             # Shared UI components
├── services/               # Business logic and API layer
│   ├── webdav/            # WebDAV client implementation
│   ├── connectionStorage.ts  # Connection persistence
│   └── navigationHistory.ts  # Browser history management
├── hooks/                  # Custom React hooks
│   └── useTheme.ts        # Theme management
├── i18n/                  # Internationalization
├── utils/                 # Utility functions
├── types.ts              # TypeScript type definitions
├── App.tsx               # Main application component
└── main.tsx              # Application entry point
```

### 🛠 Recommended IDE Setup

- **[VS Code](https://code.visualstudio.com/)** - Primary editor
- **[Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)** - Tauri development support
- **[rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)** - Rust language server
- **[Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)** - CSS class suggestions
- **[ES7+ React/Redux/React-Native snippets](https://marketplace.visualstudio.com/items?itemName=dsznajder.es7-react-js-snippets)** - React snippets

### 🧪 Testing

```bash
# Run frontend tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run Rust tests
cd src-tauri
cargo test
```

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

1. **🍴 Fork the repository**
2. **🌿 Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **✨ Make your changes** with clear, descriptive commits
4. **🧪 Add tests** if applicable and ensure existing tests pass
5. **📝 Update documentation** if needed
6. **🚀 Submit a pull request** with a detailed description

### 🐛 Bug Reports

Found a bug? Please open an issue with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- System information (OS, browser, etc.)

### 💡 Feature Requests

Have an idea? We'd love to hear it! Open an issue describing:
- The feature you'd like to see
- Why it would be useful
- Any implementation ideas

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

[中文](README_zh.md) · [Report Bug](https://github.com/stardustai/webdav-viewer/issues) · [Request Feature](https://github.com/stardustai/webdav-viewer/issues) · [Documentation](https://github.com/stardustai/webdav-viewer/wiki)

</div>
