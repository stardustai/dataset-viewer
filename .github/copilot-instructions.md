<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# WebDAV Browser Project Instructions

🤖 **This project is 100% AI-generated** using GitHub Copilot and Claude AI

Cross-platform Tauri application for WebDAV browsing with massive file streaming capabilities.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Backend**: Tauri 2.0 (Rust) + HTTP/FS plugins
- **UI**: @tanstack/react-virtual + Lucide icons
- **I18n**: i18next (Chinese/English)
- **Build**: Vite 6 + PNPM

## Key Features
- **Large File Support**: Stream 100GB+ files with chunked loading
- **Archive Preview**: Stream ZIP/TAR files without extraction
- **Virtual Scrolling**: Handle millions of lines efficiently
- **Real-time Search**: Regex search with highlighting
- **Connection Management**: Secure credential storage

## Project Structure
```
src/
├── App.tsx                 # Main app with state management
├── types.ts               # TypeScript definitions
├── components/            # React components by feature
├── services/              # Business logic
│   └── storage/          # Storage abstraction layer
├── hooks/                 # Custom React hooks
├── i18n/                 # Internationalization
└── utils/                # Utility functions

src-tauri/src/
├── lib.rs                # Tauri commands
├── storage/              # Storage implementations
├── archive/              # Archive streaming
└── download/             # Download management
```

## Development Guidelines
- **TypeScript**: Use strict typing for all code
- **Components**: Organize by feature, use composition
- **Styling**: Tailwind CSS utility classes
- **Performance**: Virtual scrolling for >100 items, chunked loading for >10MB files
- **I18n**: Wrap all UI text in translation functions
- **State**: React hooks + localStorage persistence
- **Tauri**: Use async commands, official plugins, follow security practices
