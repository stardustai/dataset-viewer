/**
 * 规范化路径，移除重复的斜杠
 * @param baseUrl 基础 URL
 * @param path 路径
 * @returns 规范化后的完整路径
 */
export const normalizePath = (baseUrl: string, path: string = ''): string => {
  // 移除 baseUrl 末尾的斜杠
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  // 如果没有路径，直接返回 baseUrl
  if (!path || path === '') {
    return normalizedBaseUrl;
  }

  // 移除路径开头的斜杠，确保只有一个斜杠分隔
  const normalizedPath = path.replace(/^\/+/, '');

  return `${normalizedBaseUrl}/${normalizedPath}`;
};

/**
 * 复制文本到剪贴板
 * @param text 要复制的文本
 * @returns Promise<boolean> 复制是否成功
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // 回退到传统方法
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    return successful;
  } catch (err) {
    console.error('复制到剪贴板失败:', err);
    return false;
  }
};

/**
 * 显示复制成功的提示
 * @param message 提示消息
 */
export const showCopyToast = (message: string) => {
  // 创建提示元素
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.className = `
    fixed bottom-4 right-4 z-50
    bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg
    transform transition-all duration-300 ease-in-out
    pointer-events-none
  `;

  // 初始状态：从下方滑入
  toast.style.transform = 'translateY(100%)';
  toast.style.opacity = '0';

  document.body.appendChild(toast);

  // 动画效果：滑入
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  // 3秒后移除：滑出
  setTimeout(() => {
    toast.style.transform = 'translateY(100%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, 3000);
};
