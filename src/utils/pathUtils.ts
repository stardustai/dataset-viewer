/**
 * 路径处理工具函数
 */

/**
 * 解析协议URL并提取路径部分
 * @param input - 输入的路径或协议URL
 * @returns 清理后的相对路径
 */
export function parseProtocolUrl(input: string): string {
  const trimmed = input.trim();

  // 检查是否是协议URL（如 file:///path, oss://bucket/path, webdav://host/path 等）
  const protocolMatch = trimmed.match(/^([a-z]+):\/\/(.*)$/);
  if (protocolMatch) {
    const protocol = protocolMatch[1];
    const remaining = protocolMatch[2];

    if (protocol === 'file') {
      // 对于 file:/// 协议，直接使用后面的路径
      // file:///202508/occ-gaofanpai -> 202508/occ-gaofanpai
      return remaining.startsWith('/') ? remaining.slice(1) : remaining;
    } else {
      // 对于其他协议（oss://bucket/path, webdav://host/path），提取路径部分
      const pathStartIndex = remaining.indexOf('/');
      if (pathStartIndex >= 0) {
        return remaining.slice(pathStartIndex + 1);
      } else {
        return '';
      }
    }
  }

  return trimmed;
}

/**
 * 清理和规范化路径
 * @param path - 需要清理的路径
 * @returns 规范化的相对路径
 */
export function cleanPath(path: string): string {
  let cleanPath = path.trim();

  // 移除开头的斜杠（转换为相对路径）
  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.slice(1);
  }

  // 移除结尾的斜杠（除非是根路径）
  if (cleanPath.endsWith('/') && cleanPath.length > 1) {
    cleanPath = cleanPath.slice(0, -1);
  }

  // 处理根路径的特殊情况
  if (cleanPath === '/') {
    cleanPath = '';
  }

  // 规范化路径：移除多余的斜杠
  cleanPath = cleanPath.replace(/\/+/g, '/');

  return cleanPath;
}

/**
 * 解析用户输入的路径，支持协议URL、绝对路径和相对路径
 * @param input - 用户输入
 * @param currentPath - 当前路径（用于处理相对路径）
 * @returns 解析后的相对路径
 */
export function parseUserInput(input: string, currentPath: string = ''): string {
  // 首先尝试解析协议URL
  let path = parseProtocolUrl(input);

  // 如果不是协议URL，处理普通路径
  if (path === input.trim()) {
    // 如果路径不以 / 开头，认为是相对于当前路径
    if (!path.startsWith('/') && currentPath) {
      path = `${currentPath}/${path}`;
    }
  }

  // 最后清理和规范化路径
  return cleanPath(path);
}
