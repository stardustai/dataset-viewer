export const connection = {
  // Application description for connection page
  'connect.storage': 'Connect to data source or local file system',
  'app.tagline': 'Easily view and search your datasets',
  'app.description': 'Cross-platform dataset viewer supporting WebDAV, object storage, and local file systems with powerful features like streaming and virtual scrolling, designed for large datasets.',

  // Features
  'features.title': 'Core Features',
  'features.large_files': 'Large Dataset Support',
  'features.large_files.desc': 'Stream 100GB+ data files with chunked loading',
  'features.archive_preview': 'Archive Streaming',
  'features.archive_preview.desc': 'Stream ZIP/TAR data packages without extraction',
  'features.virtual_scrolling': 'Virtual Scrolling',
  'features.virtual_scrolling.desc': 'Efficiently handle millions of data records',
  'features.multi_storage': 'Multi Data Source Support',
  'features.multi_storage.desc': 'Support WebDAV, OSS and local file systems as data sources',
  'tech.stack': 'Tech Stack',

  // Storage types
  'storage.type.select': 'Select Data Source Type',
  'storage.type.webdav': 'WebDAV',
  'storage.type.webdav.description': 'WebDAV Server',
  'storage.type.local': 'Local Files',
  'storage.type.local.description': 'Browse local file system',
  'storage.type.oss': 'OSS',
  'storage.type.oss.description': 'Connect to Object Storage Service',
  'storage.type.huggingface': 'HuggingFace',
  'storage.type.huggingface.description': 'AI Datasets',

  // Connection name formats
  'connection.name.webdav': 'WebDAV({{host}})',
  'connection.name.local': 'Local Files({{path}})',
  'connection.name.oss': 'OSS({{host}}-{{bucket}})',
  'connection.name.huggingface': 'Hugging Face({{org}})',

  // Form fields
  'server.url': 'Server URL',
  'server.url.placeholder': 'https://your-webdav-server.com',
  'username': 'Username',
  'username.placeholder': 'Your username',
  'password': 'Password',
  'password.placeholder': 'Your password',
  'password.saved': 'Using saved password',
  'password.click.new': 'Click to enter new password',
  'connecting': 'Connecting...',
  'connect': 'Connect',
  'optional': '(Optional)',

  // OSS specific fields
  'oss.endpoint': 'Endpoint',
  'oss.endpoint.placeholder': 'https://oss-cn-hangzhou.aliyuncs.com or https://s3.amazonaws.com',
  'oss.endpoint.description': 'Support Alibaba Cloud OSS, AWS S3, MinIO and other S3 API compatible object storage services',
  'oss.access.key': 'Access Key',
  'oss.access.key.placeholder': 'Access Key ID',
  'oss.secret.key': 'Secret Key',
  'oss.secret.key.placeholder': 'Secret Access Key',
  'oss.bucket': 'Bucket Name',
  'oss.bucket.placeholder': 'Bucket name',
  'oss.region': 'Region',
  'oss.region.placeholder': 'e.g.: cn-hangzhou, us-east-1',
  'oss.region.optional': 'Region (Optional)',

  // Form validation errors
  'error.endpoint.required': 'Please enter OSS endpoint',
  'error.endpoint.invalid': 'Please enter a valid endpoint',
  'error.access.key.required': 'Please enter Access Key',
  'error.secret.key.required': 'Please enter Secret Key',
  'error.bucket.required': 'Please enter Bucket name',

  // Connection management
  'saved.connections': 'Saved Connections',
  'no.saved.connections': 'No saved connections',
  'save.connection.hint': 'Connection information can be automatically saved after successful connection',
  'connection.select.saved': 'Select saved connection',
  'or.new.connection': 'Or create new connection',
  'save.connection': 'Save Connection',
  'save.password': 'Save Password',
  'save.password.warning': 'Password will be saved in plain text in local storage, please use with caution',
  'connection.name.placeholder': 'Connection name (optional)',
  'connection.name.hint': 'Leave empty to auto-generate name',
  'last.connected': 'Last connected',
  'set.default': 'Set as default',
  'unset.default': 'Unset default',
  'confirm.delete.connection': 'Are you sure you want to delete this connection?',
  'deleted': 'Connection deleted',
  'undo': 'Undo',

  // Local file system
  'local.root.path': 'Root Directory Path',
  'local.path.placeholder': 'e.g.: /Users/username/Documents',
  'local.select.directory': 'Select Directory',
  'local.quick.select': 'Quick Select',
  'local.path.documents': 'Documents',
  'local.path.downloads': 'Downloads',
  'local.path.desktop': 'Desktop',
  'local.path.home': 'Home',
  'local.permission.notice': 'Permission Notice',
  'local.permission.description': 'The app can only access directories you explicitly select and their subdirectories. It is recommended to select common directories such as Documents and Downloads.',
  'local.connect': 'Connect to Local Files',
  'local.error.access': 'Cannot access the specified path, please check if the path exists and you have permission to access it',
  'local.error.connection': 'Failed to connect to local file system',
  'local.mobile.path.selector.title': 'Select Common Path',
  'local.mobile.path.downloads': 'Downloads Folder',
  'local.mobile.path.documents': 'Documents Folder',
  'local.mobile.path.pictures': 'Pictures Folder',
  'local.mobile.path.camera': 'Camera Folder',
  'local.mobile.path.app.data': 'App Data Folder',
  'local.mobile.manual.input': 'Or enter path manually:',
  'local.mobile.manual.placeholder': '/storage/emulated/0/your-folder',

  // OSS errors
  'error.oss.connection.failed': 'OSS connection failed',

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
  'error.huggingface.connection.failed': 'Hugging Face connection failed',

  // Connection switching
  'connection.switch.failed': 'Failed to switch connection',
  'connection.switch.error': 'Error occurred while switching connection: {{error}}',
  'dismiss': 'Dismiss',
};
