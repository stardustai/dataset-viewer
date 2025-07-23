# 发布流程

本项目使用 GitHub Actions 自动构建和发布应用程序。以下是如何创建新版本的说明。

## 创建新版本

### 方法 1: 自动发布（推荐）

1. 手动触发版本更新工作流程：
   - 在 GitHub 项目页面，转到 "Actions" 标签
   - 选择 "Update Package JSON Version" 工作流程
   - 点击 "Run workflow"
   - 输入新版本号（例如：`0.2.1`）
   - 点击运行

2. 工作流程将自动：
   - 更新 `package.json` 和 `src-tauri/tauri.conf.json` 中的版本号
   - 创建并推送 git tag（例如：`v0.2.1`）
   - 触发构建和发布流程

### 方法 2: 手动标签

```bash
# 更新版本号
npm version 0.2.1 --no-git-tag-version

# 手动更新 src-tauri/tauri.conf.json 中的版本号

# 提交更改
git add .
git commit -m "Bump version to 0.2.1"

# 创建标签
git tag v0.2.1
git push origin main
git push origin v0.2.1
```

## 构建流程

当推送新的版本标签时，GitHub Actions 将自动：

1. **创建 Release**: 在 GitHub 上创建新的 release
2. **多平台构建**: 为以下平台构建应用程序：
   - macOS (ARM64) - Apple Silicon Macs
   - macOS (x64) - Intel Macs
   - Windows (x64)
   - Linux (x64) - AppImage 格式
3. **上传资源**: 将构建好的安装包上传到 GitHub Release
4. **更新配置**: 自动更新 `docs/config.json` 文件，包含：
   - 新版本号
   - 各平台的下载链接
   - 文件大小信息

## 自动更新功能

应用程序包含内置的自动更新检查功能：

- **启动检查**: 应用启动时自动检查新版本
- **手动检查**: 用户可以在设置中手动检查更新
- **通知系统**: 发现新版本时显示更新通知
- **下载引导**: 点击更新按钮跳转到 GitHub Release 页面

### 配置文件

更新检查使用 `docs/config.json` 文件，该文件在每次发布时自动更新。格式如下：

```json
{
  "version": "0.2.0",
  "releases": {
    "macos-arm64": {
      "downloadUrl": "https://github.com/stardustai/webdav-viewer/releases/download/v0.2.0/webdav-viewer-macos-arm64.dmg",
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

## 故障排除

### 构建失败
- 检查 GitHub Actions 日志
- 确保所有依赖项都已正确安装
- 验证 `tauri.conf.json` 配置是否正确

### 更新检查失败
- 确保 `docs/config.json` 文件可访问
- 检查网络连接
- 验证 GitHub API 是否可用

### 版本号不匹配
- 确保 `package.json` 和 `src-tauri/tauri.conf.json` 中的版本号一致
- 检查 git tag 格式是否正确（应该是 `v` + 版本号）

## 开发注意事项

- 版本号应遵循 [语义化版本控制](https://semver.org/lang/zh-CN/)
- 在创建新版本前，确保所有测试都通过
- 更新 CHANGELOG.md 文件记录变更
- 考虑在发布前创建预发布版本进行测试
