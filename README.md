# WebDAV Browser

A modern, high-performance WebDAV browser built with Tauri, React, and TypeScript. Designed to handle large text files (hundreds of GB) with efficient streaming and fast in-file search capabilities.

## Features

- 🌐 **WebDAV Server Connection**: Secure connection to any WebDAV server
- 📁 **File Browser**: Intuitive navigation through directories and files
- 📄 **Large File Support**: Efficient viewing of massive text files using chunked loading
- 🔍 **Fast Search**: Real-time in-file search with highlighting and navigation
- 🎨 **Modern UI**: Clean, responsive interface built with Tailwind CSS
- 📱 **Cross-Platform**: Runs on Windows, macOS, and Linux

## Supported File Types

- Text files (`.txt`)
- Markdown files (`.md`)
- JSON files (`.json`)
- Code files (`.js`, `.ts`, `.py`, `.java`, `.cpp`, etc.)
- Configuration files (`.yaml`, `.xml`, `.ini`, etc.)
- Log files (`.log`)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [Rust](https://rustup.rs/) (latest stable)
- [pnpm](https://pnpm.io/) (recommended package manager)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd webdav-viewer
```

2. Install dependencies:
```bash
pnpm install
```

3. Run the development server:
```bash
pnpm tauri dev
```

### Building for Production

Build the frontend and create platform-specific installers:

```bash
# Build for current platform
pnpm package

# Or step by step
pnpm build              # Build frontend
pnpm tauri:build        # Create installer

# Debug build (faster compilation)
pnpm package:debug
```

### Available Build Commands

- `pnpm tauri:dev` - Start development mode
- `pnpm tauri:build` - Build release version with optimizations
- `pnpm tauri:build:debug` - Build debug version (faster compilation)
- `pnpm build:all` - Build frontend and create installer
- `pnpm package` - One-command build and package
- `pnpm package:debug` - Quick debug package
- `pnpm clean` - Clean build artifacts and cache
- `pnpm clean:build` - Clean only Tauri build artifacts
- `pnpm lint` - Type check the code

### Quick Build Scripts

For convenience, you can also use the provided build scripts:

**Unix/Linux/macOS:**
```bash
# Release build
./build.sh

# Debug build
./build.sh --debug
```

**Windows:**
```cmd
# Release build
build.bat

# Debug build
build.bat --debug
```

### Platform-Specific Outputs

- **macOS**: `.dmg` installer and `.app` bundle
- **Windows**: `.msi` installer and `.exe` executable
- **Linux**: `.deb`, `.rpm`, and `.AppImage` packages

Built packages will be available in `src-tauri/target/release/bundle/`

## Usage

1. **Connect to WebDAV Server**: Enter your server URL, username, and password
2. **Browse Files**: Navigate through directories using the file browser
3. **View Text Files**: Click on supported text files to open them in the viewer
4. **Search**: Use the search bar to find content within files
5. **Download**: Download files to your local machine

## Architecture

- **Frontend**: React with TypeScript for type safety
- **Styling**: Tailwind CSS for modern, responsive design
- **Backend**: Tauri for native performance and security
- **WebDAV Client**: JavaScript webdav library for server communication

## Performance Optimizations

- **Chunked Loading**: Large files are loaded in manageable chunks
- **Virtual Scrolling**: Efficient rendering of large file contents
- **Debounced Search**: Optimized search to prevent excessive API calls
- **Memory Management**: Intelligent content loading and disposal

## Development

### Project Structure

```
src/
├── components/          # React components
│   ├── ConnectionPanel.tsx
│   ├── FileBrowser.tsx
│   └── FileViewer.tsx
├── services/           # Business logic and API calls
│   └── webdav.ts
├── types.ts           # TypeScript type definitions
├── App.tsx            # Main application component
└── App.css            # Global styles (Tailwind)
```

### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/)
- [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
