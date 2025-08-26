export const errors = {
  // 连接错误
  'error.connection.failed': '连接失败，请检查服务器地址和凭据。',
  'error.credentials': '连接失败，请验证服务器地址和凭据。',
  'error.oss.connection.failed': 'OSS 连接失败，请检查配置信息。',
  'error.unknown': '未知错误',

  // 文件操作错误
  'error.load.directory': '加载目录内容失败',
  'error.failed.path': '失败路径',
  'error.load.file': '加载文件内容失败',
  'error.load.more.content': '加载更多内容失败',
  'error.load.archive': '加载压缩文件失败',
  'error.load.details': '加载详细信息失败',
  'error.preview.file': '预览文件失败',

  // 权限和认证错误
  'error.access.denied': '访问被拒绝：请检查您的凭据和权限设置',
  'error.directory.not.found': '目录不存在',
  'error.authentication.failed': '身份验证失败：请检查您的凭据',
  'error.network.failed': '网络连接失败：请检查您的网络连接',

  // 下载错误
  'download.failed': '下载失败',
  'errors.download.failed': '文件下载失败：{{error}}',
  'error.failedToLoadDataFile': '加载数据文件失败',
  'error.failedToSwitchSheet': '切换工作表失败',

  // 查看器错误
  'viewer.load.error': '加载文件失败',
  'viewer.unsupported.format': '不支持的文件格式',
  'viewer.download.to.view': '请下载文件以查看内容',
  'viewer.video.not.supported': '您的浏览器不支持该视频格式',
  'viewer.audio.not.supported': '您的浏览器不支持该音频格式',
  'viewer.pdf.not.supported': '您的浏览器不支持PDF预览',
  'viewer.video.playback.error': '视频播放出错',
  'viewer.spreadsheet.preview.not.available': '电子表格预览不可用',

  // 预览错误
  'preview.failed': '预览失败',
  'retry.preview': '重试预览',
  'preview.no.content': '文件内容为空',
  'preview.render.error': '预览渲染失败',

  // 压缩文件格式错误
  'archive.format.7z.not.supported': '7Z 格式不支持在线预览。7Z 的文件结构信息位于文件末尾，无法实现流式处理，需要下载完整文件才能分析。建议使用专门的解压工具。',
  'archive.format.rar.not.supported': 'RAR 格式不支持在线预览。RAR 是专有格式，其文件头位于末尾且使用复杂的压缩算法，无法实现流式处理。建议使用 WinRAR 等专门工具。',
  'archive.format.brotli.not.supported': '暂不支持 Brotli 格式。支持的格式：ZIP、TAR、TAR.GZ、GZIP',
  'archive.format.lz4.not.supported': '暂不支持 LZ4 格式。支持的格式：ZIP、TAR、TAR.GZ、GZIP',
  'archive.format.zstd.not.supported': '暂不支持 Zstd 格式。支持的格式：ZIP、TAR、TAR.GZ、GZIP',
  'archive.format.unsupported': '不支持的压缩文件格式',

  // 错误边界
  'error.boundary.title': '应用出现错误',
  'error.boundary.description': '很抱歉，应用遇到了一个意外错误。您可以尝试刷新页面或返回首页。',
  'error.boundary.details': '错误详情',
  'error.boundary.retry': '重试',
  'error.boundary.home': '返回首页',
};
