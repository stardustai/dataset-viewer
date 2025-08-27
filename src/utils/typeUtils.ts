/**
 * 类型安全的数值处理工具类
 * 用于处理字符串和数字之间的安全转换
 */

/**
 * 安全地将字符串转换为数字
 * @param value 字符串值
 * @param defaultValue 默认值（当转换失败时使用）
 * @returns 转换后的数字
 */
export const safeParseInt = (value: string | number, defaultValue: number = 0): number => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return defaultValue;

  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * 安全地将字符串转换为浮点数
 * @param value 字符串值
 * @param defaultValue 默认值（当转换失败时使用）
 * @returns 转换后的浮点数
 */
export const safeParseFloat = (value: string | number, defaultValue: number = 0): number => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return defaultValue;

  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * 安全地将数值转换为字符串
 * @param value 数值
 * @returns 字符串值
 */
export const safeStringify = (value: string | number): string => {
  if (typeof value === 'string') return value;
  return value.toString();
};

/**
 * 比较两个文件大小（支持字符串和数字）
 * @param sizeA 文件大小A
 * @param sizeB 文件大小B
 * @returns 比较结果 (-1, 0, 1)
 */
export const compareFileSize = (sizeA: string | number, sizeB: string | number): number => {
  const numA = safeParseInt(sizeA);
  const numB = safeParseInt(sizeB);
  return numA - numB;
};

/**
 * 检查文件大小是否超过指定阈值
 * @param size 文件大小
 * @param threshold 阈值（字节）
 * @returns 是否超过阈值
 */
export const isFileSizeExceeds = (size: string | number, threshold: number): boolean => {
  const numSize = safeParseInt(size);
  return numSize > threshold;
};

/**
 * 计算文件列表的总大小
 * @param files 文件列表
 * @returns 总大小（数字）
 */
export const calculateTotalSize = (files: Array<{ size: string | number }>): number => {
  return files.reduce((sum, file) => sum + safeParseInt(file.size), 0);
};

/**
 * 格式化文件大小为人类可读的字符串（支持字符串输入）
 * @param bytes 文件大小（字节）- 可以是数字或字符串
 * @returns 格式化后的文件大小字符串
 */
export const formatFileSize = (bytes: number | string): string => {
  const numBytes = safeParseInt(bytes);

  if (numBytes === 0) return '';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(numBytes) / Math.log(k)),
    sizes.length - 1
  );
  return parseFloat((numBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
