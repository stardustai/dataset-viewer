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
  showToast(message, 'success');
};

/**
 * 显示错误提示
 * @param message 提示消息
 */
export const showErrorToast = (message: string) => {
  showToast(message, 'error');
};

/**
 * 显示通用提示
 * @param message 提示消息
 * @param type 提示类型
 */
export const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  // 创建提示元素
  const toast = document.createElement('div');
  toast.textContent = message;

  // 根据类型设置不同的样式
  const typeStyles = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600',
  };

  toast.className = `
    fixed bottom-4 right-4 z-50
    ${typeStyles[type]} text-white px-4 py-2 rounded-lg shadow-lg
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
