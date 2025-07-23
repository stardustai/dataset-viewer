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

## Auto-Update Feature

The application includes built-in auto-update checking functionality that uses GitHub Releases API:

- **GitHub API Integration**: Automatically fetches the latest release information from GitHub
- **Intelligent Platform Detection**: Automatically detects the user's platform (macOS ARM64/x64, Windows, Linux) and selects the appropriate download file
- **Startup Check**: Automatically checks for new versions on app startup (with 24-hour caching)
- **Manual Check**: Users can manually check for updates in settings panel
- **Notification System**: Shows update notifications when new versions are found with download information
- **Direct Download**: Clicking the update button redirects to the GitHub Release page
- **File Format Support**: Supports multiple installation formats (.dmg, .exe, .AppImage, .deb, .rpm, .tar.gz)
- **Smart Caching**: Caches update check results for 24 hours to reduce API calls

## Troubleshooting

### Build Failures
- Check GitHub Actions logs
- Ensure all dependencies are properly installed
- Verify that `tauri.conf.json` configuration is correct

### Update Check Failures
- Check network connectivity
- Verify GitHub API availability (api.github.com)
- Ensure GitHub repository is public and accessible
- Check if rate limiting is affecting API calls
- Verify release assets include supported file formats

### Version Number Mismatch
- Ensure version numbers in `package.json` and `src-tauri/tauri.conf.json` are consistent
- Check that git tag format is correct (should be `v` + version number)

## Development Notes

- Version numbers should follow [Semantic Versioning](https://semver.org/)
- Ensure all tests pass before creating a new version
- Update CHANGELOG.md file to record changes
- Consider creating pre-release versions for testing before official release
