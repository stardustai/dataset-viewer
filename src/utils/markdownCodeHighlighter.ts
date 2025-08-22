import { highlightCodeBlock } from './syntaxHighlighter';

// 处理 markdown HTML 中的代码块，为其添加语法高亮
export async function highlightMarkdownCode(html: string, theme: 'light' | 'dark' = 'light'): Promise<string> {
  // 创建一个临时DOM元素来解析HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // 查找所有的代码块
  const preElements = tempDiv.querySelectorAll('pre');

  const highlightPromises = Array.from(preElements).map(async (preElement) => {
    const codeElement = preElement.querySelector('code');
    if (!codeElement) return;

    // 获取代码内容
    const codeText = codeElement.textContent || '';
    if (!codeText.trim()) return;

    // 尝试从class中提取语言信息
    let language = 'text';
    const className = codeElement.className || '';
    const langMatch = className.match(/language-(\w+)/);
    if (langMatch) {
      language = langMatch[1];
    }

    try {
      // 使用 shiki 高亮代码
      const highlightedHtml = await highlightCodeBlock(codeText, language, theme);

      // 创建新的元素来替换原来的 pre 元素
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = highlightedHtml;
      const newPreElement = tempContainer.firstElementChild;

      if (newPreElement) {
        // 保持原有的类名（如果有的话），并确保基本样式存在
        const existingClass = preElement.className || '';
        const newClass = newPreElement.className || '';

        // 合并类名，确保不重复添加样式
        const combinedClass = `${newClass} ${existingClass}`.trim();
        newPreElement.className = combinedClass;

        // 替换原元素
        preElement.replaceWith(newPreElement);
      }
    } catch (error) {
      console.error('Error highlighting code block:', error);
      // 如果高亮失败，至少添加一些基本样式
      preElement.className = `${preElement.className || ''} bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto`.trim();
      if (codeElement) {
        codeElement.className = `${codeElement.className || ''} text-sm font-mono`.trim();
      }
    }
  });

  // 等待所有高亮完成
  await Promise.all(highlightPromises);

  return tempDiv.innerHTML;
}
