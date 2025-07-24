import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  zh: {
    translation: {
      // 连接页面
      'webdav.browser': 'WebDAV 浏览器',
      'connect.server': '连接到您的 WebDAV 服务器来浏览文件',
      'server.url': '服务器地址',
      'server.url.placeholder': 'https://your-webdav-server.com',
      'username': '用户名',
      'username.placeholder': '您的用户名',
      'password': '密码',
      'password.placeholder': '您的密码',
      'connect': '连接',
      'connecting': '连接中...',
      'disconnect': '断开连接',
      'connected.to': '已连接到',

      // 主题切换
      'theme.light': '浅色',
      'theme.dark': '深色',
      'theme.system': '系统',

      // 连接管理
      'saved.connections': '已保存的连接',
      'no.saved.connections': '暂无已保存的连接',
      'save.connection.hint': '连接成功后可自动保存连接信息',
      'connection.select.saved': '选择已保存的连接',
      'or.new.connection': '或新建连接',
      'save.connection': '保存连接',
      'save.password': '保存密码',
      'save.password.warning': '密码将以明文形式保存在本地存储中，请谨慎使用',
      'connection.name.placeholder': '连接名称（可选）',
      'connection.name.hint': '留空将自动生成名称',
      'last.connected': '最后连接',
      'set.default': '设为默认',
      'unset.default': '取消默认',
      'rename': '重命名',
      'delete': '删除',
      'save': '保存',
      'cancel': '取消',
      'time.today': '今天',
      'time.yesterday': '昨天',
      'time.days.ago': '{{count}} 天前',
      'confirm.delete.connection': '确定要删除这个连接吗？',

      // 错误信息
      'error.connection.failed': '连接失败，请检查服务器地址和凭据。',
      'error.credentials': '连接失败，请验证服务器地址和凭据。',
      'error.load.directory': '加载目录内容失败',
      'error.failed.path': '失败路径',
      'error.load.file': '加载文件内容失败',
      'errors.download.failed': '文件下载失败：{{error}}',

      // 文件浏览器
      'file.browser': '文件浏览器',
      'go.back': '返回',
      'go.home': '主页',
      'name': '名称',
      'size': '大小',
      'modified': '修改时间',
      'directory.empty': '此目录为空',
      'all.files.hidden': '所有文件都是隐藏文件',
      'show.hidden': '显示隐藏文件',
      'hide.hidden': '隐藏文件',
      'show.hidden.files': '显示以 . 开头的隐藏文件',
      'hide.hidden.files': '隐藏以 . 开头的隐藏文件',
      'search.files': '搜索文件名...',
      'no.search.results': '没有找到匹配的文件',
      'try.different.search': '尝试其他搜索词或清除搜索',
      'clear.search': '清除搜索',
      'search.results.count': '找到 {{count}} 个文件',

      // 设置和更新
      'settings': '设置',
      'settings.theme': '主题设置',
      'settings.update': '更新设置',
      'auto.check.updates': '自动检查更新',
      'check.updates': '检查更新',
      'checking.updates': '检查中...',
      'update.available': '发现新版本',
      'no.updates': '已是最新版本',
      'current.version': '当前版本',
      'latest.version': '最新版本',
      'download.update': '下载更新',
      'file.size': '文件大小',
      'update.check.failed': '检查更新失败',
      'update.download.failed': '打开下载页面失败',
      'about': '关于',
      'app.description': '现代化的 WebDAV 文件浏览器',
      'app.features': '支持大文件查看和快速搜索',
      'ok': '确定',

      // 文件查看器
      'file.viewer': '文件查看器',
      'download': '下载',
      'search.in.file': '在文件中搜索...',
      'search.results': '搜索结果',
      'previous.result': '上一个结果',
      'next.result': '下一个结果',
      'load.more': '加载更多内容',
      'loaded': '已加载',

      // File viewer
      'viewer.go.back': '返回',
      'viewer.download': '下载',
      'viewer.percent.loaded': '{{percent}}% 已加载',
      'viewer.search.placeholder': '在文件中搜索...',
      'viewer.search.results': '{{current}} / {{total}}',
      'viewer.previous.result': '上一个结果',
      'viewer.next.result': '下一个结果',

      // 文件内容搜索
      'search.entire.file': '全文件搜索',
      'search.entire.file.large': '在整个文件中搜索（至少2个字符）...',
      'search.loaded.content': '在已加载内容中搜索（至少2个字符）...',
      'search.results.limited.500': '（已显示前500个）',
      'search.results.limited.5000': '（已显示前5000个）',
      'search.sampling.description': '采样结果过多，仅显示前500个匹配项',
      'search.too.many.results': '结果过多，仅显示前5000个匹配项',
      'search.sampling': '（采样）',
      'line.number': '行 {{line}}',
      'line.content': '第 {{line}} 行内容',
      'viewer.load.more': '加载更多内容',
      'viewer.load.all': '加载全部内容',
      'viewer.fully.loaded': '文件已完全加载',
      'viewer.position.info': '已查看 {{current}} / {{total}} ({{percent}}%)',
      'viewer.toggle.wrap': '切换自动换行',
      'viewer.jump.percent': '跳转到百分比位置',
      'viewer.jump.percent.large': '跳转到文件的百分比位置（大文件模式）',
      'viewer.jump': '跳转',
      'viewer.line.numbers.estimated': '显示行号为估算值（从约第 {{startLine}} 行开始）',
      'viewer.load.error': '加载文件失败',
      'viewer.unsupported.format': '不支持的文件格式',
      'viewer.download.to.view': '请下载文件以查看内容',
      'viewer.video.not.supported': '您的浏览器不支持该视频格式',
      'viewer.audio.not.supported': '您的浏览器不支持该音频格式',
      'viewer.pdf.not.supported': '您的浏览器不支持PDF预览',
      'viewer.video.playback.error': '视频播放出错',
      'viewer.spreadsheet.preview.not.available': '电子表格预览不可用',
      'viewer.zoom.in': '放大',
      'viewer.zoom.out': '缩小',
      'viewer.rotate': '旋转',
      'viewer.reset': '重置视图',

      // 复制路径功能
      'copy.full.path': '复制完整路径',
      'copy.line.content': '复制行内容',
      'copied.to.clipboard': '已复制到剪贴板',
      'copy.failed': '复制失败',
      'characters': '字符数',

      // 快速开始
      'quick.start': '快速开始',
      'quick.start.desc': '要测试 WebDAV 浏览器，您可以使用本地 WebDAV 服务器或连接到您自己的服务器。',
      'local.test.server': '本地测试服务器',
      'local.test.desc': '用于与本地 WebDAV 服务器测试',
      'custom.server': '自定义服务器',
      'custom.server.desc': '输入您自己的 WebDAV 服务器详细信息',
      'use.demo': '使用演示',
      'setup.local.server': '设置本地 WebDAV 服务器：',
      'setup.desc': '您可以使用工具如 caddy、nginx 或 apache 来设置本地 WebDAV 服务器进行测试。',

      // 性能指示器
      'performance.virtualized.mode': '虚拟化模式',
      'performance.file.count': '{{count}} 个文件',
      'performance.rendering.files': '渲染 {{count}} 个文件',

      // 语言切换
      'language': '语言',
      'language.chinese': '中文',
      'language.english': 'English',

      // 状态显示组件
      'status.loading': '正在加载...',
      'status.retry': '重试',
      'status.unsupported.format': '不支持的文件格式',
      'status.unsupported.download': '请尝试下载文件以查看内容',
      'status.all.files.hidden': '所有文件都是隐藏文件',
      'status.show.hidden.files': '显示隐藏文件',
      'status.no.matching.files': '未找到匹配的文件',
      'status.try.different.keywords': '请尝试不同的搜索关键词 "{{searchTerm}}"',
      'status.clear.search': '清除搜索',

      // 文件加载状态
      'loading.directory': '正在加载 {{path}} 目录...',
      'loading.directory.root': '正在加载根目录...',
      'loading.file': '正在加载文件 "{{filename}}"...',
      'loading.analyzing.archive': '正在分析压缩文件...',
      'loading.preview': '加载预览...',
      'loading.more.content': '正在加载更多内容...',
      'loading.status': '正在加载...',
      // 文件信息
      'file.size.label': '大小',
      'file.modified.time': '修改时间',
      'search.files.placeholder': '搜索文件...',

      // 流状态
      'stream.paused': '已暂停',
      'stream.completed': '加载完成',
      'stream.error': '错误',
    }
  },
  en: {
    translation: {
      // Connection page
      'webdav.browser': 'WebDAV Browser',
      'connect.server': 'Connect to your WebDAV server to browse files',
      'server.url': 'Server URL',
      'server.url.placeholder': 'https://your-webdav-server.com',
      'username': 'Username',
      'username.placeholder': 'Your username',
      'password': 'Password',
      'password.placeholder': 'Your password',
      'connect': 'Connect',
      'connecting': 'Connecting...',
      'disconnect': 'Disconnect',
      'connected.to': 'Connected to',

      // Theme toggle
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'theme.system': 'System',

      // Connection management
      'saved.connections': 'Saved Connections',
      'no.saved.connections': 'No saved connections yet',
      'save.connection.hint': 'Connection information will be saved automatically after successful connection',
      'connection.select.saved': 'Select a saved connection',
      'or.new.connection': 'or create new connection',
      'save.connection': 'Save connection',
      'save.password': 'Save password',
      'save.password.warning': 'Password will be stored in plain text in local storage, use with caution',
      'connection.name.placeholder': 'Connection name (optional)',
      'connection.name.hint': 'Leave empty to auto-generate name',
      'last.connected': 'Last connected',
      'set.default': 'Set as default',
      'unset.default': 'Remove default',
      'rename': 'Rename',
      'delete': 'Delete',
      'save': 'Save',
      'cancel': 'Cancel',
      'time.today': 'Today',
      'time.yesterday': 'Yesterday',
      'time.days.ago': '{{count}} days ago',
      'confirm.delete.connection': 'Are you sure you want to delete this connection?',

      // Error messages
      'error.connection.failed': 'Failed to connect to WebDAV server. Please check your credentials.',
      'error.credentials': 'Connection failed. Please verify the server URL and credentials.',
      'error.load.directory': 'Failed to load directory contents',
      'error.failed.path': 'Failed path',
      'error.load.file': 'Failed to load file content',
      'errors.download.failed': 'Download failed: {{error}}',

      // File browser
      'file.browser': 'File Browser',
      'go.back': 'Go back',
      'go.home': 'Home',
      'name': 'Name',
      'size': 'Size',
      'modified': 'Modified',
      'directory.empty': 'This directory is empty',
      'all.files.hidden': 'All files are hidden files',
      'show.hidden': 'Show Hidden',
      'hide.hidden': 'Hide Hidden',
      'show.hidden.files': 'Show hidden files starting with .',
      'hide.hidden.files': 'Hide hidden files starting with .',
      'search.files': 'Search file names...',
      'no.search.results': 'No matching files found',
      'try.different.search': 'Try different keywords or clear search',
      'clear.search': 'Clear search',
      'search.results.count': 'Found {{count}} files',

      // Settings and Updates
      'settings': 'Settings',
      'settings.theme': 'Theme Settings',
      'settings.update': 'Update Settings',
      'auto.check.updates': 'Auto check updates',
      'check.updates': 'Check for updates',
      'checking.updates': 'Checking...',
      'update.available': 'Update available',
      'no.updates': 'Up to date',
      'current.version': 'Current version',
      'latest.version': 'Latest version',
      'download.update': 'Download update',
      'file.size': 'File size',
      'update.check.failed': 'Update check failed',
      'update.download.failed': 'Failed to open download page',
      'about': 'About',
      'app.description': 'Modern WebDAV file browser',
      'app.features': 'Supports large file viewing and fast search',
      'ok': 'OK',

      // File viewer
      'file.viewer': 'File Viewer',
      'download': 'Download',
      'search.in.file': 'Search in file...',
      'search.results': 'search results',
      'previous.result': 'Previous result',
      'next.result': 'Next result',
      'load.more': 'Load More Content',
      'loaded': 'loaded',

      // File viewer (new format)
      'viewer.go.back': 'Go back',
      'viewer.download': 'Download',
      'viewer.percent.loaded': '{{percent}}% loaded',
      'viewer.search.placeholder': 'Search in file...',
      'viewer.search.results': '{{current}} of {{total}}',
      'viewer.previous.result': 'Previous result',
      'viewer.next.result': 'Next result',

      // File content search
      'search.entire.file': 'Full file search',
      'search.entire.file.large': 'Search in entire file (at least 2 characters)...',
      'search.loaded.content': 'Search in loaded content (at least 2 characters)...',
      'search.results.limited.500': '(Showing first 500)',
      'search.results.limited.5000': '(Showing first 5000)',
      'search.sampling.description': 'Too many sampling results, showing only first 500 matches',
      'search.too.many.results': 'Too many results, showing only first 5000 matches',
      'search.sampling': '(Sampling)',
      'line.number': 'Line {{line}}',
      'line.content': 'Line {{line}} content',
      'viewer.load.more': 'Load More Content',
      'viewer.load.all': 'Load All Content',
      'viewer.fully.loaded': 'File fully loaded',
      'viewer.position.info': 'Viewed {{current}} / {{total}} ({{percent}}%)',
      'viewer.toggle.wrap': 'Toggle word wrap',
      'viewer.jump.percent': 'Jump to percentage',
      'viewer.jump.percent.large': 'Jump to file position by percentage (large file mode)',
      'viewer.jump': 'Jump',
      'viewer.line.numbers.estimated': 'Line numbers are estimated (starting from approx. line {{startLine}})',
      'viewer.load.error': 'Failed to load file',
      'viewer.unsupported.format': 'Unsupported file format',
      'viewer.download.to.view': 'Please download the file to view its content',
      'viewer.video.not.supported': 'Your browser does not support this video format',
      'viewer.audio.not.supported': 'Your browser does not support this audio format',
      'viewer.pdf.not.supported': 'Your browser does not support PDF preview',
      'viewer.video.playback.error': 'Video playback error',
      'viewer.spreadsheet.preview.not.available': 'Spreadsheet preview not available',
      'viewer.zoom.in': 'Zoom in',
      'viewer.zoom.out': 'Zoom out',
      'viewer.rotate': 'Rotate',
      'viewer.reset': 'Reset view',

      // Copy path functionality
      'copy.full.path': 'Copy full path',
      'copy.line.content': 'Copy line content',
      'copied.to.clipboard': 'Copied to clipboard',
      'copy.failed': 'Copy failed',
      'characters': 'Characters',

      // Quick start
      'quick.start': 'Quick Start',
      'quick.start.desc': 'To test the WebDAV browser, you can use a local WebDAV server or connect to your own server.',
      'local.test.server': 'Local Test Server',
      'local.test.desc': 'For testing with a local WebDAV server',
      'custom.server': 'Custom Server',
      'custom.server.desc': 'Enter your own WebDAV server details',
      'use.demo': 'Use Demo',
      'setup.local.server': 'Setting up a local WebDAV server:',
      'setup.desc': 'You can use tools like caddy, nginx, or apache to set up a local WebDAV server for testing.',

      // Performance indicator
      'performance.virtualized.mode': 'Virtualized Mode',
      'performance.file.count': '{{count}} files',
      'performance.rendering.files': 'Rendering {{count}} files',

      // Language switch
      'language': 'Language',
      'language.chinese': '中文',
      'language.english': 'English',

      // Status display components
      'status.loading': 'Loading...',
      'status.retry': 'Retry',
      'status.unsupported.format': 'Unsupported file format',
      'status.unsupported.download': 'Please try downloading the file to view its content',
      'status.all.files.hidden': 'All files are hidden files',
      'status.show.hidden.files': 'Show hidden files',
      'status.no.matching.files': 'No matching files found',
      'status.try.different.keywords': 'Try different search keywords "{{searchTerm}}"',
      'status.clear.search': 'Clear search',

      // File loading status
      'loading.directory': 'Loading{{path}} directory...',
      'loading.directory.root': 'Loading root directory...',
      'loading.file': 'Loading file "{{filename}}"...',
      'loading.analyzing.archive': 'Analyzing archive...',
      'loading.preview': 'Loading preview...',
      'loading.more.content': 'Loading more content...',
      'loading.status': 'Loading...',

      // File information
      'file.size.label': 'Size',
      'file.modified.time': 'Modified time',
      'search.files.placeholder': 'Search files...',

      // Stream status
      'stream.paused': 'Paused',
      'stream.completed': 'Loading completed',
      'stream.error': 'Error',
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'zh', // 默认中文
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
