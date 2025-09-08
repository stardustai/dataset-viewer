export const connection = {
  // 连接页面应用描述
  'connect.storage': '连接到数据源或本地文件系统',
  'app.tagline': '轻松查看和搜索您的数据集',
  'app.description':
    '跨平台数据集查看工具，支持 WebDAV、对象存储和本地文件系统，提供流式传输和虚拟滚动等强大功能，专为大数据集设计。',

  // 功能特性
  'features.title': '核心功能',
  'features.large_files': '超大数据集支持',
  'features.large_files.desc': '流式传输 100GB+ 数据文件，分块加载',
  'features.archive_preview': '压缩包流式预览',
  'features.archive_preview.desc': '无需解压直接流式预览 ZIP/TAR 数据包',
  'features.virtual_scrolling': '虚拟滚动',
  'features.virtual_scrolling.desc': '高效处理数百万行数据记录',
  'features.multi_storage': '多数据源支持',
  'features.multi_storage.desc': '支持 WebDAV、S3 和本地文件系统等多种数据源',
  'tech.stack': '技术栈',

  // 存储类型
  'storage.type.select': '选择数据源类型',
  'storage.type.webdav': 'WebDAV',
  'storage.type.webdav.description': 'WebDAV 服务器',
  'storage.type.ssh': 'SSH',
  'storage.type.ssh.description': 'SSH 远程服务器',
  'storage.type.smb': 'SMB',
  'storage.type.smb.description': 'SMB/CIFS 网络共享',
  'storage.type.local': '本机文件',
  'storage.type.local.description': '浏览本机文件系统',
  'storage.type.s3': 'S3',
  'storage.type.s3.description': '连接到 S3 兼容的对象存储服务',
  'storage.type.huggingface': 'HuggingFace',
  'storage.type.huggingface.description': 'AI 数据集',

  // 连接名称格式
  'connection.name.webdav': 'WebDAV({{host}})',
  'connection.name.ssh': 'SSH({{host}})',
  'connection.name.smb': 'SMB({{host}}/{{share}})',
  'connection.name.local': '本机文件({{path}})',
  'connection.name.s3': 'S3({{host}}-{{bucket}})',
  'connection.name.oss': 'OSS({{host}}-{{bucket}})',
  'connection.name.huggingface': 'Hugging Face({{org}})',

  // 表单字段
  'server.url': '服务器地址',
  'server.url.placeholder': 'https://your-webdav-server.com',
  username: '用户名',
  'username.placeholder': '您的用户名',
  password: '密码',
  'password.placeholder': '请输入密码',
  'password.saved': '使用已保存的密码',
  'password.click.to.edit': '点击修改密码',

  // OSS 特定字段
  'oss.platform.select': '选择平台',
  'oss.region.select': '选择区域',
  'oss.endpoint': '端点地址',
  'oss.endpoint.placeholder': 'https://oss-cn-hangzhou.aliyuncs.com 或 https://s3.amazonaws.com',
  'oss.endpoint.description': '支持阿里云 OSS、AWS S3、MinIO 等兼容 S3 API 的对象存储服务',
  'oss.endpoint.custom': '自定义端点',
  'oss.endpoint.custom.description': '输入兼容 S3 API 的对象存储服务端点',
  'oss.endpoint.current': '当前端点：',
  'oss.platforms.aliyun': '阿里云 OSS',
  'oss.platforms.aws': 'AWS S3',
  'oss.platforms.tencent': '腾讯云 COS',
  'oss.platforms.huawei': '华为云 OBS',
  'oss.platforms.minio': 'MinIO',
  'oss.platforms.custom': '自定义',
  'oss.access.key': 'Access Key',
  'oss.access.key.placeholder': '访问密钥 ID',
  'oss.secret.key': 'Secret Key',
  'oss.secret.key.placeholder': '访问密钥密码',
  'oss.bucket': 'Bucket 名称及路径',
  'oss.bucket.placeholder': '存储桶名称或路径，如：my-bucket 或 my-bucket/path/prefix',
  'oss.region': '区域',
  'oss.region.placeholder': '例如：cn-hangzhou、us-east-1',
  'oss.region.optional': '区域 (可选)',

  // SSH 特定字段
  'ssh.server': '服务器地址',
  'ssh.server.placeholder': 'server.domain.com',
  'ssh.port': '端口',
  'ssh.port.placeholder': '22',
  'ssh.username': '用户名',
  'ssh.username.placeholder': '用户名',
  'ssh.authentication': '认证方式',
  'ssh.password': '密码',
  'ssh.password.placeholder': '密码',
  'ssh.private.key': '私钥文件',
  'ssh.private.key.placeholder': '私钥文件路径',
  'ssh.select.private.key': '选择私钥文件',
  'ssh.path': '远程路径',
  'ssh.path.placeholder': '/home/username',

  // SMB 连接
  'smb.server': '服务器地址',
  'smb.server.placeholder': 'server.example.com',
  'smb.share': '共享名称',
  'smb.share.placeholder': 'shared',
  'smb.domain': '域',
  'smb.domain.placeholder': 'WORKGROUP 或 DOMAIN',
  'smb.domain.description': 'Windows 域或工作组（可选）',

  // 表单验证错误
  'error.endpoint.required': '请输入 OSS 端点地址',
  'error.endpoint.invalid': '请输入有效的端点地址',
  'error.access.key.required': '请输入 Access Key',
  'error.secret.key.required': '请输入 Secret Key',
  'error.bucket.required': '请输入 Bucket 名称',
  'error.ssh.server.required': '请输入 SSH 服务器地址',
  'error.ssh.username.required': '请输入 SSH 用户名',
  'error.ssh.password.required': '请输入 SSH 密码或私钥文件',
  'error.ssh.path.required': '请输入远程路径',
  'error.smb.server.required': '请输入 SMB 服务器地址',
  'error.smb.share.required': '请输入共享名称',
  'error.smb.username.required': '请输入用户名',
  'error.smb.password.required': '请输入密码',

  // 连接管理
  'no.saved.connections': '暂无已保存的连接',
  'save.connection.hint': '连接成功后可自动保存连接信息',
  'connection.select.saved': '选择已保存的连接',
  'or.new.connection': '或新建连接',
  'save.connection': '保存连接',
  'save.password': '保存密码',
  'save.password.warning': '密码将以明文形式保存在本地存储中，请谨慎使用',
  'connection.name.placeholder': '连接名称（可选）',
  'connection.name.hint': '留空将自动生成名称',
  'set.default': '设为默认',
  'unset.default': '取消默认',
  'confirm.delete.connection': '确定要删除这个连接吗？',

  // 本地文件系统
  'local.error.access': '无法访问指定路径，请检查路径是否存在且有权限访问',
  'local.error.connection': '连接本机文件系统失败',

  // OSS 错误
  'error.oss.connection.failed': 'OSS 连接失败',

  // SSH 错误
  'error.ssh.connection.failed': 'SSH 连接失败',
  'error.ssh.authentication.failed': 'SSH 身份验证失败，请检查用户名和密码或私钥',
  'error.ssh.key.not.found': '私钥文件不存在或无法读取',
  'error.ssh.permission.denied': 'SSH 权限被拒绝，请检查用户权限',

  // SMB 错误
  'error.smb.connection.failed': 'SMB 连接失败',
  'error.smb.authentication.failed': 'SMB 身份验证失败，请检查用户名和密码',
  'error.smb.share.not.found': '找不到指定的共享目录',
  'error.smb.permission.denied': 'SMB 访问被拒绝，请检查用户权限',

  // OSS 帮助信息
  'oss.help.credentials.title': 'Access Key 获取方式：',
  'oss.help.step1': '登录对象存储服务控制台（阿里云、AWS、MinIO 等）',
  'oss.help.step2': '在访问控制或安全凭证页面创建 Access Key',
  'oss.help.step3': '记录生成的 Access Key ID 和 Secret Access Key',
  'oss.help.step4': '确保该密钥有访问目标存储桶的权限',

  // Hugging Face 字段
  'huggingface.apiToken': 'API Token',
  'huggingface.apiToken.placeholder': 'hf_xxxxxxxx',
  'huggingface.apiToken.help': '仅在访问私有数据集时需要',
  'huggingface.organization': '组织',
  'huggingface.organization.placeholder': 'microsoft, openai, etc.',
  'huggingface.organization.help': '可选，指定特定组织的数据集',
  'huggingface.help.token.title': 'API Token 获取方式：',
  'huggingface.help.token.step1': '访问',
  'huggingface.help.token.step2': '创建新的访问令牌',
  'huggingface.help.token.step3': '选择 "Read" 权限即可',
  'error.huggingface.connection.failed': '连接 Hugging Face 失败',

  // 连接切换
  'connection.switch.failed': '切换连接失败',
  'connection.switch.error': '切换连接时发生错误：{{error}}',
  'connection.switch.type_mismatch':
    '连接类型不匹配：无法使用 {{connectionType}} 客户端连接到 "{{connectionName}}"',
  'connection.switch.missing_credentials': '连接 "{{connectionName}}" 缺少必要的认证信息',
};
