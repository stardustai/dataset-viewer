import { formatFileSize } from './typeUtils';

// 重新导出工具函数，保持向后兼容
export { formatFileSize };

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
      hour12: false,
    }).format(date);
  } catch {
    return null;
  }
};
