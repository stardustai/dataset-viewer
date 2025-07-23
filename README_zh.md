# WebDAV 浏览器

> 🤖 **本项目 100% 由 AI 生成** 使用 GitHub Copilot 和 Claude AI

一个基于 Tauri、React 和 TypeScript 构建的现代化、高性能 WebDAV 浏览器。专为处理大型文本文件（数百 GB）而设计，具有高效的流式处理和快速文件内搜索功能。

📥 **[下载最新版本](https://github.com/stardustai/webdav-viewer/releases/latest)**

## ✨ 亮点特性

- 🤖 **100% AI 生成**：整个代码库通过 AI 辅助创建
- 🚀 **高性能**：原生 Tauri 后端配合 React 前端
- 📦 **跨平台**：单一代码库支持 Windows、macOS 和 Linux
- 🔧 **现代技术栈**：TypeScript + Tailwind CSS + Rust

## 🚀 功能特性

- 🌐 **WebDAV 服务器连接**：安全连接任意 WebDAV 服务器，支持凭据存储
- 📁 **智能文件浏览器**：直观的导航界面，支持缩略图预览和排序
- 📄 **大文件支持**：使用分块加载高效查看超大文本文件（100GB+）
- 🔍 **闪电搜索**：实时文件内搜索，支持正则表达式和导航
- 🎨 **现代化界面**：简洁响应式界面，支持深色/浅色主题
- 🌍 **多语言支持**：内置国际化支持
- 📱 **跨平台**：在 Windows、macOS 和 Linux 上的原生性能
- ⚡ **虚拟化渲染**：百万行文件的流畅滚动
- 🎥 **媒体预览**：内置图像和视频预览功能

## 📸 界面截图

### 文件浏览器界面
![文件浏览器](screenshots/home.png)
*现代化文件浏览器，具有直观导航和主题支持*

### 文本文件查看器
![文本查看器](screenshots/text.png)
*高级文本查看器，具有搜索功能和虚拟化渲染*

## 📚 支持的文件类型

### 文本文件
- 纯文本（`.txt`、`.log`）
- Markdown（`.md`、`.markdown`）
- JSON（`.json`）
- YAML（`.yaml`、`.yml`）
- XML（`.xml`）
- 配置文件（`.ini`、`.conf`、`.cfg`）

### 代码文件
- JavaScript/TypeScript（`.js`、`.ts`、`.jsx`、`.tsx`）
- Python（`.py`、`.pyx`）
- Java（`.java`）
- C/C++（`.c`、`.cpp`、`.h`、`.hpp`）
- Rust（`.rs`）
- Go（`.go`）
- PHP（`.php`）
- 以及更多...

### 文档文件
- PDF（`.pdf`）- 文档查看器
- Excel（`.xlsx`、`.xls`）- 电子表格查看器

### 媒体文件（预览）
- 图像（`.jpg`、`.png`、`.gif`、`.svg`、`.webp`）
- 视频（`.mp4`、`.webm`、`.mov`）

## 🛠 开始使用

### 环境要求

- [Node.js](https://nodejs.org/)（v18 或更高版本）
- [Rust](https://rustup.rs/)（最新稳定版）
- [pnpm](https://pnpm.io/)（推荐的包管理器）

### 快速开始

1. **克隆仓库：**
```bash
git clone https://github.com/stardustai/webdav-viewer.git
cd webdav-viewer
```

2. **安装依赖：**
```bash
pnpm install
```

3. **启动开发：**
```bash
pnpm tauri dev
```

应用程序将自动在开发模式下打开。

### 📦 生产构建

创建优化的构建版本和安装包：

```bash
# 一键构建和打包
pnpm package

# 或分步构建
pnpm build              # 构建前端
pnpm tauri:build        # 创建平台安装包

# 快速调试构建（编译更快）
pnpm package:debug
```

### 🎯 可用命令

| 命令 | 描述 |
|---------|-------------|
| `pnpm tauri:dev` | 启动开发模式（热重载） |
| `pnpm tauri:build` | 构建优化的发布版本 |
| `pnpm tauri:build:debug` | 构建调试版本（更快） |
| `pnpm build:all` | 构建前端并创建安装包 |
| `pnpm package` | 一键构建和打包 |
| `pnpm package:debug` | 快速调试打包 |
| `pnpm clean` | 清理所有构建产物和缓存 |
| `pnpm clean:build` | 仅清理 Tauri 构建产物 |
| `pnpm lint` | 运行 TypeScript 类型检查 |

### 🚀 快速构建脚本

为了方便使用，提供了构建脚本：

**Unix/Linux/macOS：**
```bash
# 发布构建（优化）
./build.sh

# 调试构建（更快编译）
./build.sh --debug
```

**Windows：**
```cmd
# 发布构建（优化）
build.bat

# 调试构建（更快编译）
build.bat --debug
```

### 📦 平台特定输出

构建后，安装包将在 `src-tauri/target/release/bundle/` 中：

| 平台 | 输出格式 |
|----------|----------------|
| **macOS** | `.dmg` 安装包、`.app` 应用包 |
| **Windows** | `.msi` 安装包、`.exe` 可执行文件 |
| **Linux** | `.deb`、`.rpm`、`.AppImage` 包 |

## 📖 使用指南

1. **🔐 连接 WebDAV 服务器**：
   - 输入服务器 URL、用户名和密码
   - 保存连接以便快速访问
   - 保存前测试连接

2. **📁 浏览文件**：
   - 使用直观的文件浏览器导航目录
   - 按名称、大小或修改日期排序文件
   - 预览支持格式的文件缩略图

3. **📄 查看文本文件**：
   - 点击任意支持的文本文件在查看器中打开
   - 享受代码文件的语法高亮
   - 使用虚拟化滚动导航大文件

4. **🔍 搜索内容**：
   - 使用搜索栏在文件中查找内容
   - 支持正则表达式和大小写敏感搜索
   - 使用热键在搜索结果间导航

5. **📥 下载文件**：
   - 下载单个文件或整个目录
   - 使用内置进度指示器监控下载进度
   - 恢复中断的下载

## 🏗 架构设计

本应用遵循现代化、可扩展的架构：

- **🎨 前端**：React 18 配合 TypeScript 提供类型安全和现代开发体验
- **💅 样式**：Tailwind CSS 实用优先的响应式设计
- **⚡ 后端**：Tauri 框架结合 Rust 性能与 Web 技术
- **🌐 WebDAV 客户端**：为大文件优化的自定义 WebDAV 实现
- **🗄 状态管理**：React Context 和自定义 hooks 实现高效状态处理
- **🎯 构建系统**：Vite 提供快速开发和优化的生产构建

## ⚡ 性能优化

- **📊 分块加载**：大文件以可管理的 10MB 块加载
- **🖥 虚拟滚动**：高效渲染百万行而不影响性能
- **🔍 防抖搜索**：智能搜索优化防止过多 API 调用
- **🧠 内存管理**：智能内容加载和释放优化资源使用
- **⚡ 懒加载**：组件和内容按需加载
- **📱 响应式设计**：从移动设备到桌面的全屏幕尺寸优化

## 💻 开发指南

### 📁 项目结构

```
src/
├── components/              # React 组件
│   ├── ConnectionPanel.tsx  # WebDAV 连接管理
│   ├── FileBrowser.tsx     # 文件系统导航
│   ├── FileViewer.tsx      # 文本文件查看器（语法高亮）
│   ├── MediaViewer.tsx     # 图像和视频预览
│   ├── VirtualizedTextViewer.tsx  # 高性能文本渲染
│   └── common/             # 共享 UI 组件
├── services/               # 业务逻辑和 API 层
│   ├── webdav/            # WebDAV 客户端实现
│   ├── connectionStorage.ts  # 连接持久化
│   └── navigationHistory.ts  # 浏览器历史管理
├── hooks/                  # 自定义 React hooks
│   └── useTheme.ts        # 主题管理
├── i18n/                  # 国际化
├── utils/                 # 工具函数
├── types.ts              # TypeScript 类型定义
├── App.tsx               # 主应用组件
└── main.tsx              # 应用入口点
```

### 🛠 推荐 IDE 设置

- **[VS Code](https://code.visualstudio.com/)** - 主要编辑器
- **[Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)** - Tauri 开发支持
- **[rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)** - Rust 语言服务器
- **[Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)** - CSS 类建议
- **[ES7+ React/Redux/React-Native snippets](https://marketplace.visualstudio.com/items?itemName=dsznajder.es7-react-js-snippets)** - React 代码片段

### 🧪 测试

```bash
# 运行前端测试
pnpm test

# 带覆盖率运行
pnpm test:coverage

# 运行 Rust 测试
cd src-tauri
cargo test
```

## 🤝 贡献

我们欢迎社区贡献！以下是您可以帮助的方式：

1. **🍴 Fork 仓库**
2. **🌿 创建功能分支**（`git checkout -b feature/amazing-feature`）
3. **✨ 进行更改**，使用清晰的描述性提交
4. **🧪 添加测试**（如适用）并确保现有测试通过
5. **📝 更新文档**（如需要）
6. **🚀 提交 Pull Request**，包含详细描述

### 🐛 错误报告

发现了错误？请提交 issue 包含：
- 问题的清晰描述
- 重现步骤
- 预期与实际行为
- 系统信息（操作系统、浏览器等）

### 💡 功能请求

有想法？我们很乐意听到！提交 issue 描述：
- 您希望看到的功能
- 为什么它会有用
- 任何实现想法

## 📄 许可证

本项目基于 **MIT 许可证** - 详情请参阅 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- **🤖 AI 开发**：本项目展示了 AI 辅助开发的强大能力
- **🛠 Tauri 团队**：创造了出色的框架
- **⚛️ React 社区**：提供了优秀的生态系统
- **🦀 Rust 社区**：提供了强大的语言和工具

---

<div align="center">

**用 ❤️ 和 🤖 AI 制作**

[English](README.md) · [报告错误](https://github.com/stardustai/webdav-viewer/issues) · [功能请求](https://github.com/stardustai/webdav-viewer/issues) · [文档](https://github.com/stardustai/webdav-viewer/wiki)

</div>
