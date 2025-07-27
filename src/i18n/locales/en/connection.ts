export const connection = {
  // Application title and description
  'app.name': 'Dataset Viewer',
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
  'storage.type.webdav': 'WebDAV Server',
  'storage.type.webdav.description': 'Connect to WebDAV server for dataset browsing',
  'storage.type.local': 'Local Files',
  'storage.type.local.description': 'Browse local file system',
  'storage.type.oss': 'OSS',
  'storage.type.oss.description': 'Connect to object storage service',

  // Connection name formats
  'connection.name.webdav': 'WebDAV({{host}})',
  'connection.name.local': 'Local Files({{path}})',
  'connection.name.oss': 'OSS({{host}}-{{bucket}})',

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
  'connected.to': 'Connected to',
  'connect': 'Connect',

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

  // OSS errors
  'error.oss.connection.failed': 'OSS connection failed',
};
