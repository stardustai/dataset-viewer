/**
 * 格式化文件大小为人类可读的字符串
 * @param bytes 文件大小（字节）
 * @returns 格式化后的文件大小字符串
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  );
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 格式化修改时间为人类可读的字符串
 * @param timeString 时间字符串
 * @returns 格式化后的时间字符串或null
 */
export const formatModifiedTime = (timeString: string | undefined): string | null => {
  if (!timeString) return null;
  
  try {
    const date = new Date(timeString);
    if (isNaN(date.getTime())) return null;
    
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  } catch {
    return null;
  }
};