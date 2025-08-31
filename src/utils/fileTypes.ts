import { pluginManager } from '../services/plugin/pluginManager';

export type FileType =
  | 'text'
  | 'markdown'
  | 'word'
  | 'presentation'
  | 'image'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'spreadsheet'
  | 'data'
  | 'pointcloud'
  | 'archive'
  | 'unknown';

// 文件扩展名到类型和MIME类型的映射
const FILE_EXTENSIONS: Record<string, { type: FileType; mime: string }> = {
  // Text files
  txt: { type: 'text', mime: 'text/plain' },
  json: { type: 'text', mime: 'application/json' },
  jsonl: { type: 'text', mime: 'application/jsonlines' },
  js: { type: 'text', mime: 'text/javascript' },
  ts: { type: 'text', mime: 'text/typescript' },
  jsx: { type: 'text', mime: 'text/jsx' },
  tsx: { type: 'text', mime: 'text/tsx' },
  html: { type: 'text', mime: 'text/html' },
  css: { type: 'text', mime: 'text/css' },
  scss: { type: 'text', mime: 'text/scss' },
  less: { type: 'text', mime: 'text/less' },
  py: { type: 'text', mime: 'text/x-python' },
  java: { type: 'text', mime: 'text/x-java-source' },
  cpp: { type: 'text', mime: 'text/x-c++src' },
  c: { type: 'text', mime: 'text/x-csrc' },
  php: { type: 'text', mime: 'text/x-php' },
  rb: { type: 'text', mime: 'text/x-ruby' },
  go: { type: 'text', mime: 'text/x-go' },
  rs: { type: 'text', mime: 'text/x-rust' },
  xml: { type: 'text', mime: 'text/xml' },
  yaml: { type: 'text', mime: 'text/yaml' },
  yml: { type: 'text', mime: 'text/yaml' },
  sql: { type: 'text', mime: 'text/x-sql' },
  sh: { type: 'text', mime: 'text/x-shellscript' },
  bat: { type: 'text', mime: 'text/x-batch' },
  ps1: { type: 'text', mime: 'text/x-powershell' },
  log: { type: 'text', mime: 'text/plain' },
  config: { type: 'text', mime: 'text/plain' },
  ini: { type: 'text', mime: 'text/plain' },
  tsv: { type: 'text', mime: 'text/tab-separated-values' },

  // Markdown files
  md: { type: 'markdown', mime: 'text/markdown' },
  markdown: { type: 'markdown', mime: 'text/markdown' },
  mdown: { type: 'markdown', mime: 'text/markdown' },
  mkd: { type: 'markdown', mime: 'text/markdown' },
  mdx: { type: 'markdown', mime: 'text/markdown' },

  // Word document files
  doc: { type: 'word', mime: 'application/msword' },
  docx: {
    type: 'word',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  rtf: { type: 'word', mime: 'application/rtf' },

  // Presentation files
  ppt: { type: 'presentation', mime: 'application/vnd.ms-powerpoint' },
  pptx: {
    type: 'presentation',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  odp: { type: 'presentation', mime: 'application/vnd.oasis.opendocument.presentation' },

  // Image files
  jpg: { type: 'image', mime: 'image/jpeg' },
  jpeg: { type: 'image', mime: 'image/jpeg' },
  png: { type: 'image', mime: 'image/png' },
  gif: { type: 'image', mime: 'image/gif' },
  webp: { type: 'image', mime: 'image/webp' },
  svg: { type: 'image', mime: 'image/svg+xml' },
  bmp: { type: 'image', mime: 'image/bmp' },
  ico: { type: 'image', mime: 'image/x-icon' },
  tiff: { type: 'image', mime: 'image/tiff' },
  tif: { type: 'image', mime: 'image/tiff' },

  // PDF files
  pdf: { type: 'pdf', mime: 'application/pdf' },

  // Video files
  mp4: { type: 'video', mime: 'video/mp4' },
  webm: { type: 'video', mime: 'video/webm' },
  ogv: { type: 'video', mime: 'video/ogg' },
  avi: { type: 'video', mime: 'video/x-msvideo' },
  mov: { type: 'video', mime: 'video/quicktime' },
  wmv: { type: 'video', mime: 'video/x-ms-wmv' },
  flv: { type: 'video', mime: 'video/x-flv' },
  mkv: { type: 'video', mime: 'video/x-matroska' },
  m4v: { type: 'video', mime: 'video/x-m4v' },
  ivf: { type: 'video', mime: 'video/x-ivf' },
  av1: { type: 'video', mime: 'video/av01' },

  // Audio files
  mp3: { type: 'audio', mime: 'audio/mpeg' },
  wav: { type: 'audio', mime: 'audio/wav' },
  oga: { type: 'audio', mime: 'audio/ogg' },
  aac: { type: 'audio', mime: 'audio/aac' },
  flac: { type: 'audio', mime: 'audio/flac' },
  ogg: { type: 'audio', mime: 'audio/ogg' },
  m4a: { type: 'audio', mime: 'audio/mp4' },
  wma: { type: 'audio', mime: 'audio/x-ms-wma' },

  // Spreadsheet files
  xlsx: {
    type: 'spreadsheet',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  xls: { type: 'spreadsheet', mime: 'application/vnd.ms-excel' },
  ods: { type: 'spreadsheet', mime: 'application/vnd.oasis.opendocument.spreadsheet' },
  csv: { type: 'spreadsheet', mime: 'text/csv' },

  // Data files
  parquet: { type: 'data', mime: 'application/vnd.apache.parquet' },
  pqt: { type: 'data', mime: 'application/vnd.apache.parquet' },

  // Point cloud files
  pcd: { type: 'pointcloud', mime: 'application/pcd' },
  ply: { type: 'pointcloud', mime: 'application/ply' },
  xyz: { type: 'pointcloud', mime: 'application/xyz' },
  pts: { type: 'pointcloud', mime: 'application/pts' },

  // Archive files
  zip: { type: 'archive', mime: 'application/zip' },
  tar: { type: 'archive', mime: 'application/x-tar' },
  gz: { type: 'archive', mime: 'application/gzip' },
  tgz: { type: 'archive', mime: 'application/x-tar-gz' },
  bz2: { type: 'archive', mime: 'application/x-bzip2' },
  xz: { type: 'archive', mime: 'application/x-xz' },
  '7z': { type: 'archive', mime: 'application/x-7z-compressed' },
  rar: { type: 'archive', mime: 'application/vnd.rar' },
  lz4: { type: 'archive', mime: 'application/x-lz4' },
  zst: { type: 'archive', mime: 'application/zstd' },
  zstd: { type: 'archive', mime: 'application/zstd' },
  br: { type: 'archive', mime: 'application/x-brotli' },
};

export const getFileType = (filename: string): FileType | string => {
  // 首先检查插件是否支持此文件类型
  try {
    const plugin = pluginManager.findViewerForFile(filename);
    if (plugin) {
      const pluginFileType = plugin.getFileType();
      console.log(`✅ Plugin file type for ${filename}: ${pluginFileType}`);
      return pluginFileType;
    } else {
      console.log(`❌ No plugin found for ${filename}`);
    }
  } catch (error) {
    // 如果插件系统不可用，继续使用默认逻辑
    console.log(`⚠️ Plugin system error for ${filename}:`, error);
  }

  const ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();

  const fileInfo = FILE_EXTENSIONS[ext];
  if (fileInfo) {
    return fileInfo.type;
  }

  // Check for tar.gz and other compound extensions
  if (filename.toLowerCase().endsWith('.tar.gz') || filename.toLowerCase().endsWith('.tar.bz2')) {
    return 'archive';
  }

  return 'unknown';
};

export const getMimeType = (filename: string): string => {
  const ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();

  const fileInfo = FILE_EXTENSIONS[ext];
  if (fileInfo) {
    return fileInfo.mime;
  }

  // Check for tar.gz and other compound extensions
  if (filename.toLowerCase().endsWith('.tar.gz')) {
    return 'application/x-tar-gz';
  }
  if (filename.toLowerCase().endsWith('.tar.bz2')) {
    return 'application/x-tar-bz2';
  }

  return 'application/octet-stream';
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
