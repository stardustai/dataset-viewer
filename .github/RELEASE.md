# Release Process

This project uses GitHub Actions to automatically build and release the application. Here's how to create a new version.

## Creating a New Release

### Method 1: Automated Release (Recommended)

1. Manually trigger the version update workflow:
   - Go to the "Actions" tab on the GitHub project page
   - Select the "Update Package JSON Version" workflow
   - Click "Run workflow"
   - Enter the new version number (e.g., `0.1.1`)
   - Click run

2. The workflow will automatically:
   - Update version numbers in `package.json` and `src-tauri/tauri.conf.json`
   - Create and push a git tag (e.g., `v0.1.1`)
   - Trigger the build and release process

### Method 2: Manual Tagging

```bash
# Update version number
npm version 0.1.1 --no-git-tag-version

# Manually update version number in src-tauri/tauri.conf.json

# Commit changes
git add .
git commit -m "Bump version to 0.1.1"

# Create tag
git tag v0.1.1
git push origin main
git push origin v0.1.1
```

## Build Process

When a new version tag is pushed, GitHub Actions will automatically:

1. **Create Release**: Create a new release on GitHub
2. **Multi-platform Build**: Build the application for the following platforms:
   - macOS (ARM64) - Apple Silicon Macs
   - macOS (x64) - Intel Macs
   - Windows (x64)
   - Linux (x64) - AppImage format
3. **Upload Assets**: Upload built installation packages to GitHub Release
4. **Update Configuration**: Automatically update the `docs/config.json` file, including:
   - New version number
   - Download links for each platform
   - File size information

## Auto-Update Feature

The application includes built-in auto-update checking functionality:

- **Startup Check**: Automatically checks for new versions on app startup
- **Manual Check**: Users can manually check for updates in settings
- **Notification System**: Shows update notifications when new versions are found
- **Download Guide**: Clicking the update button redirects to the GitHub Release page

### Configuration File

Update checking uses the `docs/config.json` file, which is automatically updated with each release. The format is as follows:

```json
{
  "version": "0.1.0",
  "releases": {
    "macos-arm64": {
      "downloadUrl": "https://github.com/stardustai/webdav-viewer/releases/download/v0.1.0/webdav-viewer-macos-arm64.dmg",
      "filename": "webdav-viewer-macos-arm64.dmg",
      "fileSize": "10.2 MB"
    },
    "macos-x64": { /* ... */ },
    "windows": { /* ... */ },
    "linux": { /* ... */ }
  },
  "github": {
    "repoUrl": "https://github.com/stardustai/webdav-viewer"
  }
}
```

## Troubleshooting

### Build Failures
- Check GitHub Actions logs
- Ensure all dependencies are properly installed
- Verify that `tauri.conf.json` configuration is correct

### Update Check Failures
- Ensure `docs/config.json` file is accessible
- Check network connectivity
- Verify GitHub API availability

### Version Number Mismatch
- Ensure version numbers in `package.json` and `src-tauri/tauri.conf.json` are consistent
- Check that git tag format is correct (should be `v` + version number)

## Development Notes

- Version numbers should follow [Semantic Versioning](https://semver.org/)
- Ensure all tests pass before creating a new version
- Update CHANGELOG.md file to record changes
- Consider creating pre-release versions for testing before official release
