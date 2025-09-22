export const errors = {
  // Connection errors
  'error.connection.failed': 'Connection failed. Please check your server address and credentials.',
  'error.unknown': 'Unknown error',

  // File operation errors
  'error.load.directory': 'Failed to load directory contents',
  'error.failed.path': 'Failed path',
  'error.load.archive': 'Failed to load archive',
  'error.load.details': 'Failed to load details',
  'error.preview.file': 'Failed to preview file',

  // Permission and authentication errors
  'error.access.denied': 'Access denied: Please check your credentials and permissions',
  'error.directory.not.found': 'Directory not found',
  'error.not.directory': 'Path is not a directory',
  'error.authentication.failed': 'Authentication failed: Please check your credentials',
  'error.network.failed': 'Network connection failed: Please check your connection',

  // Download errors
  'download.failed': 'Download failed',
  'error.failedToLoadDataFile': 'Failed to load data file',
  'error.failedToSwitchSheet': 'Failed to switch sheet',

  // Viewer errors
  'viewer.load.error': 'Failed to load file',
  'viewer.unsupported.format': 'Unsupported file format',
  'viewer.download.to.view': 'Please download the file to view its content',
  'viewer.video.not.supported': 'Your browser does not support this video format',
  'viewer.audio.not.supported': 'Your browser does not support this audio format',
  'viewer.pdf.not.supported': 'Your browser does not support PDF preview',
  'viewer.video.playback.error': 'Video playback error',

  // Preview errors

  // Archive format errors
  'archive.format.7z.not.supported':
    '7Z format is not supported for online preview. 7Z file structure is located at the end of the file, making streaming impossible. Full file download is required for analysis. Please use dedicated extraction tools.',
  'archive.format.rar.not.supported':
    'RAR format is not supported for online preview. RAR is a proprietary format with file headers at the end and complex compression algorithms that prevent streaming. Please use WinRAR or similar tools.',
  'archive.format.brotli.not.supported':
    'Brotli format is not supported yet. Supported formats: ZIP, TAR, TAR.GZ, GZIP',
  'archive.format.lz4.not.supported':
    'LZ4 format is not supported yet. Supported formats: ZIP, TAR, TAR.GZ, GZIP',
  'archive.format.zstd.not.supported':
    'Zstd format is not supported yet. Supported formats: ZIP, TAR, TAR.GZ, GZIP',

  // Error boundary
  'error.boundary.title': 'Application Error',
  'error.boundary.description':
    'Sorry, the application encountered an unexpected error. You can try refreshing the page or returning to the home page.',
  'error.boundary.details': 'Error Details',
  'error.boundary.retry': 'Retry',
  'error.boundary.home': 'Go Home',
};
