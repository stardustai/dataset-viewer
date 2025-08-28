import { bundledLanguages, createHighlighter } from 'shiki';

// 语言映射表，根据文件扩展名映射到 shiki 支持的语言
const LANGUAGE_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  mjs: 'javascript',
  cjs: 'javascript',

  // Web 技术
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  xml: 'xml',
  svg: 'xml',

  // Python
  py: 'python',
  pyx: 'python',
  pyi: 'python',

  // Java
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',

  // C/C++
  c: 'c',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  h: 'c',
  hpp: 'cpp',
  hxx: 'cpp',

  // Rust
  rs: 'rust',

  // Go
  go: 'go',

  // PHP
  php: 'php',

  // Ruby
  rb: 'ruby',
  erb: 'erb',

  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'zsh',
  fish: 'fish',
  ps1: 'powershell',
  bat: 'batch',
  cmd: 'batch',

  // 配置文件
  json: 'json',
  jsonl: 'json',
  json5: 'json5',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',

  // 数据库
  sql: 'sql',

  // Markdown
  md: 'markdown',
  markdown: 'markdown',
  mdown: 'markdown',
  mkd: 'markdown',
  mdx: 'mdx',

  // Docker
  dockerfile: 'dockerfile',

  // 其他
  log: 'log',
  txt: 'text',
};

// 高亮器实例缓存
let highlighterInstance: any = null;
let isInitializing = false;

// 初始化高亮器
async function initializeHighlighter() {
  if (highlighterInstance) return highlighterInstance;
  if (isInitializing) {
    // 等待初始化完成
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return highlighterInstance;
  }

  isInitializing = true;
  try {
    highlighterInstance = await createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: Object.values(LANGUAGE_MAP).filter(
        (lang, index, self) => self.indexOf(lang) === index && lang in bundledLanguages
      ),
    });
  } catch (error) {
    console.error('Failed to initialize syntax highlighter:', error);
    highlighterInstance = null;
  } finally {
    isInitializing = false;
  }

  return highlighterInstance;
}

// 根据文件名获取语言类型
export function getLanguageFromFileName(fileName: string): string {
  if (!fileName) return 'text';

  const ext = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();

  // 处理特殊文件名
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName === 'dockerfile' || lowerFileName.startsWith('dockerfile.')) {
    return 'dockerfile';
  }
  if (lowerFileName === 'makefile' || lowerFileName.startsWith('makefile.')) {
    return 'makefile';
  }

  return LANGUAGE_MAP[ext] || 'text';
}

// 检查是否支持语法高亮
export function isLanguageSupported(language: string): boolean {
  return language !== 'text' && language in bundledLanguages;
}

// 高亮单行代码
export async function highlightLine(
  code: string,
  language: string,
  theme: 'light' | 'dark' = 'light'
): Promise<string> {
  if (!code.trim() || !isLanguageSupported(language)) {
    return code;
  }

  try {
    const highlighter = await initializeHighlighter();
    if (!highlighter) return code;

    const html = await highlighter.codeToHtml(code, {
      lang: language,
      theme: theme === 'dark' ? 'github-dark' : 'github-light',
      transformers: [
        {
          // 移除 pre 和 code 标签，只保留内容
          root(node: any) {
            if (node.type === 'element' && node.tagName === 'pre') {
              const codeElement = node.children.find(
                (child: any) => child.type === 'element' && child.tagName === 'code'
              );
              if (codeElement) {
                return codeElement.children;
              }
            }
            return node;
          },
        },
      ],
    });

    // 提取实际的高亮内容
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const codeElement = tempDiv.querySelector('code');
    return codeElement ? codeElement.innerHTML : code;
  } catch (error) {
    console.error('Error highlighting code:', error);
    return code;
  }
}

// 批量高亮多行代码 (用于性能优化)
export async function highlightLines(
  lines: string[],
  language: string,
  theme: 'light' | 'dark' = 'light'
): Promise<string[]> {
  if (!isLanguageSupported(language)) {
    return lines;
  }

  try {
    const highlighter = await initializeHighlighter();
    if (!highlighter) return lines;

    // 将多行合并成一个代码块进行高亮，然后分割
    const code = lines.join('\n');
    const html = await highlighter.codeToHtml(code, {
      lang: language,
      theme: theme === 'dark' ? 'github-dark' : 'github-light',
    });

    // 解析 HTML 并提取每一行
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const codeElement = tempDiv.querySelector('code');

    if (codeElement) {
      const highlightedLines = codeElement.innerHTML.split('\n');
      // 确保返回的行数与输入行数一致
      return lines.map((_, index) => highlightedLines[index] || lines[index]);
    }

    return lines;
  } catch (error) {
    console.error('Error highlighting code lines:', error);
    return lines;
  }
}

// 高亮完整代码块（用于 markdown 代码块）
export async function highlightCodeBlock(
  code: string,
  language: string,
  theme: 'light' | 'dark' = 'light'
): Promise<string> {
  if (!code.trim() || !isLanguageSupported(language)) {
    // 返回带基本样式的代码块
    return `<pre class="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto"><code class="text-sm font-mono">${escapeHtml(code)}</code></pre>`;
  }

  try {
    const highlighter = await initializeHighlighter();
    if (!highlighter) {
      return `<pre class="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto"><code class="text-sm font-mono">${escapeHtml(code)}</code></pre>`;
    }

    const html = await highlighter.codeToHtml(code, {
      lang: language,
      theme: theme === 'dark' ? 'github-dark' : 'github-light',
    });

    // 为 shiki 生成的代码块添加额外的 Tailwind 样式类
    const styledHtml = html.replace(/<pre[^>]*>/, (match: string) => {
      // 保留原有的样式，并添加我们需要的 Tailwind 类
      const hasClass = match.includes('class="');
      if (hasClass) {
        return match.replace(
          /class="([^"]*)"/,
          'class="$1 p-4 !bg-gray-100 dark:!bg-gray-800 rounded-md overflow-x-auto border border-gray-200 dark:border-gray-700"'
        );
      } else {
        return match.replace(
          '<pre',
          '<pre class="p-4 !bg-gray-100 dark:!bg-gray-800 rounded-md overflow-x-auto border border-gray-200 dark:border-gray-700"'
        );
      }
    });

    return styledHtml;
  } catch (error) {
    console.error('Error highlighting code block:', error);
    return `<pre class="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto"><code class="text-sm font-mono">${escapeHtml(code)}</code></pre>`;
  }
}

// HTML 转义函数
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 清理高亮器资源
export function disposeHighlighter() {
  highlighterInstance = null;
}
