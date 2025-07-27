export const connection = {
  // 应用标题和描述
  'webdav.browser': 'WebDAV 浏览器',
  'connect.storage': '连接到存储服务或本地文件系统',
  'app.tagline': '轻松管理您的云端文件',
  'app.description': '跨平台文件浏览器，支持 WebDAV、对象存储和本地文件系统，提供流式传输和虚拟滚动等强大功能。',

  // 功能特性
  'features.title': '核心功能',
  'features.large_files': '大文件支持',
  'features.large_files.desc': '流式传输 100GB+ 文件，分块加载',
  'features.archive_preview': '压缩包预览',
  'features.archive_preview.desc': '无需解压直接流式预览 ZIP/TAR 文件',
  'features.virtual_scrolling': '虚拟滚动',
  'features.virtual_scrolling.desc': '高效处理数百万行数据',
  'features.multi_storage': '多存储支持',
  'features.multi_storage.desc': '支持 WebDAV、OSS 和本地文件系统',
  'tech.stack': '技术栈',

  // 存储类型
  'storage.type.select': '选择存储类型',
  'storage.type.webdav': 'WebDAV',
  'storage.type.webdav.description': '连接到 WebDAV 服务器',
  'storage.type.local': '本机文件',
  'storage.type.local.description': '浏览本机文件系统',
  'storage.type.oss': 'OSS',
  'storage.type.oss.description': '连接到对象存储服务',

  // 连接名称格式
  'connection.name.webdav': 'WebDAV({{host}})',
  'connection.name.local': '本机文件({{path}})',
  'connection.name.oss': 'OSS({{host}}-{{bucket}})',

  // 表单字段
  'server.url': '服务器地址',
  'server.url.placeholder': 'https://your-webdav-server.com',
  'username': '用户名',
  'username.placeholder': '您的用户名',
  'password': '密码',
  'password.placeholder': '您的密码',
  'password.saved': '使用已保存的密码',
  'password.click.new': '点击输入新密码',
  'connecting': '连接中...',
  'connected.to': '已连接到',
  'connect': '连接',

  // OSS 特定字段
  'oss.endpoint': '端点地址',
  'oss.endpoint.placeholder': 'https://oss-cn-hangzhou.aliyuncs.com 或 https://s3.amazonaws.com',
  'oss.endpoint.description': '支持阿里云 OSS、AWS S3、MinIO 等兼容 S3 API 的对象存储服务',
  'oss.access.key': 'Access Key',
  'oss.access.key.placeholder': '访问密钥 ID',
  'oss.secret.key': 'Secret Key',
  'oss.secret.key.placeholder': '访问密钥密码',
  'oss.bucket': 'Bucket 名称',
  'oss.bucket.placeholder': '存储桶名称',
  'oss.region': '区域',
  'oss.region.placeholder': '例如：cn-hangzhou、us-east-1',
  'oss.region.optional': '区域 (可选)',

  // 表单验证错误
  'error.endpoint.required': '请输入 OSS 端点地址',
  'error.endpoint.invalid': '请输入有效的端点地址',
  'error.access.key.required': '请输入 Access Key',
  'error.secret.key.required': '请输入 Secret Key',
  'error.bucket.required': '请输入 Bucket 名称',

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
  'confirm.delete.connection': '确定要删除这个连接吗？',

  // 本地文件系统
  'local.root.path': '根目录路径',
  'local.path.placeholder': '例如: /Users/username/Documents',
  'local.select.directory': '选择目录',
  'local.quick.select': '快速选择',
  'local.path.documents': '文档',
  'local.path.downloads': '下载',
  'local.path.desktop': '桌面',
  'local.path.home': '用户目录',
  'local.permission.notice': '权限说明',
  'local.permission.description': '应用只能访问您明确选择的目录及其子目录。建议选择文档、下载等常用目录。',
  'local.connect': '连接到本机文件',
  'local.error.access': '无法访问指定路径，请检查路径是否存在且有权限访问',
  'local.error.connection': '连接本机文件系统失败',

  // OSS 错误
  'error.oss.connection.failed': 'OSS 连接失败',
};
