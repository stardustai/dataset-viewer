import { StorageServiceManager } from '../services/storage';

// MIME 类型映射
const MIME_TYPES: { [key: string]: string } = {
  // Images
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'bmp': 'image/bmp',
  'ico': 'image/x-icon',
  // Documents
  'pdf': 'application/pdf',
  // Videos
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'ogv': 'video/ogg',
  'avi': 'video/x-msvideo',
  'mov': 'video/quicktime',
  'wmv': 'video/x-ms-wmv',
  'flv': 'video/x-flv',
  'mkv': 'video/x-matroska',
  'm4v': 'video/mp4',
  // Audio
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'oga': 'audio/ogg',
  'aac': 'audio/aac',
  'flac': 'audio/flac'
};

export const getMimeType = (filename: string): string => {
  const ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
};

/**
 * 统一处理文件数据获取的工具函数
 * 根据文件 URL 类型自动选择合适的获取方式
 * @param filePath 文件路径
 * @returns Promise<ArrayBuffer> 文件数据
 */
export async function getFileArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  // 统一走 Rust 后端命令，无论本地还是远程
  const fileBlob = await StorageServiceManager.downloadFile(filePath);
  return await fileBlob.arrayBuffer();
}

/**
 * 统一处理文件数据获取并转换为文本的工具函数
 * @param filePath 文件路径
 * @param encoding 文本编码，默认为 'utf-8'
 * @returns Promise<string> 文件文本内容
 */
export async function getFileText(filePath: string, encoding: string = 'utf-8'): Promise<string> {
  const arrayBuffer = await getFileArrayBuffer(filePath);
  return new TextDecoder(encoding).decode(arrayBuffer);
}

/**
 * 获取文件的可用 URL
 * 对于本地文件，返回 Blob URL；对于远程文件，直接返回原始 URL
 * @param filePath 文件路径
 * @returns Promise<string> 可用的文件 URL
 */
/**
 * 获取文件头部数据用于格式检测
 * @param filePath 文件路径
 * @param maxBytes 最大读取字节数，默认 2KB
 * @returns Promise<Uint8Array> 文件头部数据
 */
export async function getFileHeader(filePath: string, maxBytes: number = 2048): Promise<Uint8Array> {
  // 获取文件的下载 URL
  const fileUrl = await StorageServiceManager.getDownloadUrl(filePath);

  if (fileUrl.startsWith('file://')) {
    // 对于本地文件，使用 StorageServiceManager.downloadFile
    const fileBlob = await StorageServiceManager.downloadFile(filePath);
    const arrayBuffer = await fileBlob.arrayBuffer();
    const actualBytes = Math.min(maxBytes, arrayBuffer.byteLength);
    return new Uint8Array(arrayBuffer.slice(0, actualBytes));
  } else {
    // 对于远程文件，使用 Range 请求只获取头部数据
    const response = await fetch(fileUrl, {
      headers: {
        'Range': `bytes=0-${maxBytes - 1}`
      }
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch file header: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
}

export async function getFileUrl(filePath: string): Promise<string> {
  // 获取文件的下载 URL
  const fileUrl = await StorageServiceManager.getDownloadUrl(filePath);

  if (fileUrl.startsWith('file://')) {
    // 对于本地文件，获取数据并创建 Blob URL
    const fileBlob = await StorageServiceManager.downloadFile(filePath);
    // 获取文件名以确定 MIME 类型
    const fileName = filePath.split('/').pop() || '';
    const mimeType = getMimeType(fileName);
    // 创建带有正确 MIME 类型的新 Blob
    const typedBlob = new Blob([fileBlob], { type: mimeType });
    return URL.createObjectURL(typedBlob);
  } else {
    // 对于远程文件，直接返回 URL
    return fileUrl;
  }
}
