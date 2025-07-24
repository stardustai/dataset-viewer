export type FileType = 'text' | 'image' | 'pdf' | 'video' | 'audio' | 'spreadsheet' | 'archive' | 'unknown';

export const getFileType = (filename: string): FileType => {
  const ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();

  // Text files
  const textExtensions = [
    'txt', 'md', 'json', 'jsonl', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'less',
    'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'xml', 'yaml', 'yml',
    'sql', 'sh', 'bat', 'ps1', 'log', 'config', 'ini', 'tsv'
  ];

  // Image files
  const imageExtensions = [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif'
  ];

  // PDF files
  const pdfExtensions = ['pdf'];

  // Video files
  const videoExtensions = [
    'mp4', 'webm', 'ogv', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'm4v'
  ];

  // Audio files
  const audioExtensions = [
    'mp3', 'wav', 'oga', 'aac', 'flac', 'ogg', 'm4a', 'wma'
  ];

  // Spreadsheet files
  const spreadsheetExtensions = [
    'xlsx', 'xls', 'ods', 'csv'
  ];

  // Archive files
  const archiveExtensions = [
    'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'lz4', 'zst', 'zstd', 'br'
  ];

  if (textExtensions.includes(ext)) return 'text';
  if (imageExtensions.includes(ext)) return 'image';
  if (pdfExtensions.includes(ext)) return 'pdf';
  if (videoExtensions.includes(ext)) return 'video';
  if (audioExtensions.includes(ext)) return 'audio';
  if (spreadsheetExtensions.includes(ext)) return 'spreadsheet';
  if (archiveExtensions.includes(ext)) return 'archive';

  // Check for tar.gz and other compound extensions
  if (filename.toLowerCase().endsWith('.tar.gz') || filename.toLowerCase().endsWith('.tar.bz2')) {
    return 'archive';
  }

  return 'unknown';
};

export const isMediaFile = (filename: string): boolean => {
  const type = getFileType(filename);
  return ['image', 'pdf', 'video', 'audio', 'spreadsheet'].includes(type);
};

export const isArchiveFile = (filename: string): boolean => {
  return getFileType(filename) === 'archive';
};

export const isStreamableArchive = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return lower.endsWith('.zip') ||
         lower.endsWith('.tar.gz') ||
         lower.endsWith('.tgz') ||
         lower.endsWith('.tar') ||
         lower.endsWith('.gz');
};

export const isTextFile = (filename: string): boolean => {
  return getFileType(filename) === 'text';
};
