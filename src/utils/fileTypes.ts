export type FileType = 'text' | 'markdown' | 'word' | 'presentation' | 'image' | 'pdf' | 'video' | 'audio' | 'spreadsheet' | 'data' | 'pointcloud' | 'archive' | 'unknown';

export const getFileType = (filename: string): FileType => {
  const ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();

  // Text files
  const textExtensions = [
    'txt', 'json', 'jsonl', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'less',
    'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'xml', 'yaml', 'yml',
    'sql', 'sh', 'bat', 'ps1', 'log', 'config', 'ini', 'tsv'
  ];

  // Markdown files
  const markdownExtensions = [
    'md', 'markdown', 'mdown', 'mkd', 'mdx'
  ];

  // Word document files
  const wordExtensions = [
    'doc', 'docx', 'rtf'
  ];

  // Presentation files
  const presentationExtensions = [
    'ppt', 'pptx', 'odp'
  ];

  // Image files
  const imageExtensions = [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif'
  ];

  // PDF files
  const pdfExtensions = ['pdf'];

  // Video files
  const videoExtensions = [
    'mp4', 'webm', 'ogv', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'm4v',
    'ivf', 'av1' // AV1 视频格式
  ];

  // Audio files
  const audioExtensions = [
    'mp3', 'wav', 'oga', 'aac', 'flac', 'ogg', 'm4a', 'wma'
  ];

  // Spreadsheet files (unified - all handled by DataTableViewer)
  const spreadsheetExtensions = [
    'xlsx', 'xls', 'ods', 'csv'
  ];

  // Data files (specialized data formats)
  const dataExtensions = [
    'parquet', 'pqt'
  ];

  // Point cloud data files
  const pointcloudExtensions = [
    'pcd', 'ply', 'xyz', 'pts'
  ];

  // Archive files
  const archiveExtensions = [
    'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'lz4', 'zst', 'zstd', 'br'
  ];

  if (textExtensions.includes(ext)) return 'text';
  if (markdownExtensions.includes(ext)) return 'markdown';
  if (wordExtensions.includes(ext)) return 'word';
  if (presentationExtensions.includes(ext)) return 'presentation';
  if (imageExtensions.includes(ext)) return 'image';
  if (pdfExtensions.includes(ext)) return 'pdf';
  if (videoExtensions.includes(ext)) return 'video';
  if (audioExtensions.includes(ext)) return 'audio';
  if (spreadsheetExtensions.includes(ext)) return 'spreadsheet';
  if (dataExtensions.includes(ext)) return 'data';
  if (pointcloudExtensions.includes(ext)) return 'pointcloud';
  if (archiveExtensions.includes(ext)) return 'archive';

  // Check for tar.gz and other compound extensions
  if (filename.toLowerCase().endsWith('.tar.gz') || filename.toLowerCase().endsWith('.tar.bz2')) {
    return 'archive';
  }

  return 'unknown';
};

export const isMediaFile = (filename: string): boolean => {
  const type = getFileType(filename);
  return ['image', 'pdf', 'video', 'audio'].includes(type);
};

export const isSpreadsheetFile = (filename: string): boolean => {
  return getFileType(filename) === 'spreadsheet';
};

export const isDataFile = (filename: string): boolean => {
  return getFileType(filename) === 'data';
};

export const isArchiveFile = (filename: string): boolean => {
  return getFileType(filename) === 'archive';
};

export const isTextFile = (filename: string): boolean => {
  return getFileType(filename) === 'text';
};

export const isMarkdownFile = (filename: string): boolean => {
  return getFileType(filename) === 'markdown';
};

export const isWordFile = (filename: string): boolean => {
  return getFileType(filename) === 'word';
};

export const isPresentationFile = (filename: string): boolean => {
  return getFileType(filename) === 'presentation';
};

export const isTextLikeFile = (filename: string): boolean => {
  return isTextFile(filename) || isMarkdownFile(filename);
};

export const isPointCloudFile = (filename: string): boolean => {
  return getFileType(filename) === 'pointcloud';
};
