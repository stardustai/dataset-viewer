<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# WebDAV Browser Project Instructions

This is a Tauri application that provides a modern WebDAV browser with the following key features:

## Architecture
- **Frontend**: React with TypeScript and Tailwind CSS
- **Backend**: Tauri (Rust)
- **WebDAV Client**: JavaScript webdav library
- **UI Framework**: Tailwind CSS for modern, responsive design

## Key Features
1. **WebDAV Connection Management**: Secure connection to WebDAV servers
2. **File Browser**: Navigate through directories and files on WebDAV servers
3. **Large File Support**: Efficient viewing of large text files (hundreds of GB) using chunked loading
4. **Text File Viewer**: Support for various text formats (txt, json, md, code files, etc.)
5. **Fast Search**: In-file search with highlighting and navigation
6. **Responsive Design**: Modern UI with Tailwind CSS

## Development Guidelines
- Use TypeScript for type safety
- Follow React best practices with functional components and hooks
- Use Tailwind CSS classes for styling
- Implement efficient memory management for large files
- Use chunked loading for files larger than 10MB
- Provide responsive and accessible UI components

## File Structure
- `src/types.ts` - TypeScript interfaces and types
- `src/services/webdav.ts` - WebDAV client service
- `src/components/` - React components
- `src/App.tsx` - Main application component

## Performance Considerations
- Implement virtual scrolling for large files
- Use debounced search to avoid excessive API calls
- Load content in chunks to manage memory usage
- Provide loading states and error handling
