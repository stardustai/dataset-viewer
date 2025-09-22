export const connection = {
  // Application description for connection page
  'app.tagline': 'Easily view and search your datasets',
  'app.description':
    'Cross-platform dataset viewer supporting WebDAV, object storage, and local file systems with powerful features like streaming and virtual scrolling, designed for large datasets.',

  // Features
  'features.title': 'Core Features',
  'features.large_files': 'Large Dataset Support',
  'features.large_files.desc': 'Stream 100GB+ data files with chunked loading',
  'features.archive_preview': 'Archive Streaming',
  'features.archive_preview.desc': 'Stream ZIP/TAR data packages without extraction',
  'features.virtual_scrolling': 'Virtual Scrolling',
  'features.virtual_scrolling.desc': 'Efficiently handle millions of data records',
  'features.multi_storage': 'Multi Data Source Support',
  'features.multi_storage.desc': 'Support WebDAV, S3 and local file systems as data sources',
  'tech.stack': 'Tech Stack',

  // Storage types
  'storage.type.select': 'Select Data Source Type',
  'storage.type.webdav': 'WebDAV',
  'storage.type.webdav.description': 'WebDAV Server',
  'storage.type.ssh': 'SSH',
  'storage.type.ssh.description': 'SSH Remote Server',
  'storage.type.smb': 'SMB',
  'storage.type.smb.description': 'SMB/CIFS Network Share',
  'storage.type.local': 'Local Files',
  'storage.type.local.description': 'Browse local file system',
  'storage.type.s3': 'S3',
  'storage.type.s3.description': 'Connect to S3-compatible object storage',
  'storage.type.huggingface': 'HuggingFace',
  'storage.type.huggingface.description': 'AI Datasets',

  // Connection name formats
  'connection.name.s3': 'S3({{host}}-{{bucket}})',

  // Form fields
  'server.url': 'Server URL',
  'server.url.placeholder': 'https://your-webdav-server.com',
  username: 'Username',
  'username.placeholder': 'Your username',
  password: 'Password',
  'password.placeholder': 'Your password',
  'password.saved': 'Using saved password',
  'password.click.to.edit': 'Click to edit password',

  // OSS specific fields
  'oss.platform.select': 'Select Platform',
  'oss.region.select': 'Select Region',
  'oss.endpoint.placeholder': 'https://oss-cn-hangzhou.aliyuncs.com or https://s3.amazonaws.com',
  'oss.endpoint.custom': 'Custom Endpoint',
  'oss.endpoint.custom.description': 'Enter S3 API compatible object storage service endpoint',
  'oss.access.key': 'Access Key',
  'oss.access.key.placeholder': 'Access Key ID',
  'oss.secret.key': 'Secret Key',
  'oss.secret.key.placeholder': 'Secret Access Key',
  'oss.bucket': 'Bucket Name & Path',
  'oss.bucket.placeholder': 'Bucket name or path, e.g.: my-bucket or my-bucket/path/prefix',
  'oss.region': 'Region',
  'oss.region.placeholder': 'e.g.: cn-hangzhou, us-east-1',

  // SSH specific fields
  'ssh.server': 'Server URL',
  'ssh.server.placeholder': 'server.domain.com',
  'ssh.port': 'Port',
  'ssh.port.placeholder': '22',
  'ssh.username': 'Username',
  'ssh.username.placeholder': 'username',
  'ssh.authentication': 'Authentication',
  'ssh.password': 'Password',
  'ssh.password.placeholder': 'password',
  'ssh.private.key': 'Private Key File',
  'ssh.private.key.placeholder': 'private key file path',
  'ssh.select.private.key': 'Select Private Key File',
  'ssh.path': 'Remote Path',
  'ssh.path.placeholder': '/home/username',

  // SMB specific fields
  'smb.server': 'Server URL',
  'smb.server.placeholder': 'server.domain.com',
  'smb.share': 'Share Name',
  'smb.share.placeholder': 'shared',
  'smb.domain': 'Domain',
  'smb.domain.placeholder': 'WORKGROUP or DOMAIN',
  'smb.domain.description': 'Windows domain or workgroup (optional)',

  // Form validation errors
  'error.endpoint.required': 'Please enter OSS endpoint',
  'error.endpoint.invalid': 'Please enter a valid endpoint',
  'error.access.key.required': 'Please enter Access Key',
  'error.secret.key.required': 'Please enter Secret Key',
  'error.bucket.required': 'Please enter Bucket name',

  // Connection management
  'no.saved.connections': 'No saved connections',
  'save.connection.hint':
    'Connection information can be automatically saved after successful connection',
  'connection.select.saved': 'Select saved connection',
  'or.new.connection': 'Or create new connection',
  'set.default': 'Set as default',
  'unset.default': 'Unset default',
  'confirm.delete.connection': 'Are you sure you want to delete this connection?',

  // Local file system
  'local.error.access':
    'Cannot access the specified path, please check if the path exists and you have permission to access it',
  'local.error.connection': 'Failed to connect to local file system',

  // OSS errors
  'error.oss.connection.failed': 'OSS connection failed',

  // SSH errors

  // SMB errors

  // OSS help information
  'oss.help.credentials.title': 'How to get Access Key:',
  'oss.help.step1': 'Login to object storage service console (Alibaba Cloud, AWS, MinIO, etc.)',
  'oss.help.step2': 'Create Access Key in Access Control or Security Credentials page',
  'oss.help.step3': 'Record the generated Access Key ID and Secret Access Key',
  'oss.help.step4': 'Ensure the key has permission to access the target bucket',

  // Hugging Face fields
  'huggingface.apiToken': 'API Token',
  'huggingface.apiToken.placeholder': 'hf_xxxxxxxx',
  'huggingface.apiToken.help': 'Only required for accessing private datasets',
  'huggingface.organization': 'Organization',
  'huggingface.organization.placeholder': 'microsoft, openai, etc.',
  'huggingface.organization.help': 'Optional, specify datasets from a specific organization',
  'huggingface.help.token.title': 'How to get API Token:',
  'huggingface.help.token.step1': 'Visit',
  'huggingface.help.token.step2': 'Create new access token',
  'huggingface.help.token.step3': 'Select "Read" permission',

  // Connection switching
  'connection.switch.type_mismatch':
    'Connection type mismatch: Cannot use {{connectionType}} client to connect to "{{connectionName}}"',
  'connection.switch.missing_credentials':
    'Connection "{{connectionName}}" is missing required credentials',
};
