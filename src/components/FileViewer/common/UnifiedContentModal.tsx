import DOMPurify from 'dompurify';
import { Braces, Check, Copy, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSyntaxHighlighting } from '../../../hooks/useSyntaxHighlighting';
import { useTheme } from '../../../hooks/useTheme';
import { copyToClipboard, showCopyToast } from '../../../utils/clipboard';
import {
  getLanguageFromFileName,
  highlightCodeBlock,
  isLanguageSupported,
} from '../../../utils/syntaxHighlighter';
import { ImageRenderer } from '../viewers/ImageRenderer';
import VirtualizedTextViewer from '../viewers/VirtualizedTextViewer';

// 检测是否为 base64 编码的图片
const isBase64Image = (text: string): { isImage: boolean; dataUrl?: string; format?: string } => {
  const trimmed = text.trim();

  // 匹配 "key": "data:image/format;base64,..." 格式
  const base64ImageRegex =
    /["']?\w*["']?\s*:\s*["']data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)["']?/i;
  const match = trimmed.match(base64ImageRegex);

  if (match) {
    const format = match[1];
    const base64Data = match[2];
    return {
      isImage: true,
      dataUrl: `data:image/${format};base64,${base64Data}`,
      format: format.toUpperCase(),
    };
  }

  // 也支持直接的 data URL 格式
  const directDataUrlRegex =
    /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/i;
  const directMatch = trimmed.match(directDataUrlRegex);

  if (directMatch) {
    const format = directMatch[1];
    return {
      isImage: true,
      dataUrl: trimmed,
      format: format.toUpperCase(),
    };
  }

  return { isImage: false };
};

// 检测是否为 JSON 内容 - 高性能版本，避免 trim() 操作
const isJSONContent = (text: string): boolean => {
  if (text.length === 0) return false;

  // 手动查找第一个非空白字符
  let start = 0;
  while (start < text.length && /\s/.test(text[start])) {
    start++;
  }

  // 手动查找最后一个非空白字符
  let end = text.length - 1;
  while (end >= start && /\s/.test(text[end])) {
    end--;
  }

  // 检查是否为空内容
  if (start > end) return false;

  // 检查首尾字符是否匹配 JSON 格式
  const firstChar = text[start];
  const lastChar = text[end];

  return (firstChar === '{' && lastChar === '}') || (firstChar === '[' && lastChar === ']');
};

// 检测是否为 XML 内容
const isXMLContent = (text: string): boolean => {
  return !!text.trim().match(/^\s*<[^>]+>.*<\/[^>]+>\s*$/s);
};

// XML格式化函数
const formatXML = (xml: string): string => {
  const PADDING = '  ';
  let formatted = '';
  let pad = 0;

  // 先处理标签间的换行
  xml = xml.replace(/(>)(<)(\/*)/g, '$1\n$2$3');

  // 分割成行并处理每一行
  const nodes = xml.split('\n');

  nodes.forEach(node => {
    let indent = 0;
    const trimmedNode = node.trim();

    if (trimmedNode === '') return; // 跳过空行

    // 处理结束标签
    if (trimmedNode.match(/^<\/\w/)) {
      pad = Math.max(0, pad - 1);
    }
    // 处理自闭合标签或者单行完整标签
    else if (
      trimmedNode.match(/^<\w[^>]*\/>\s*$/) ||
      trimmedNode.match(/^<\w[^>]*>.*<\/\w[^>]*>\s*$/)
    ) {
      indent = 0;
    }
    // 处理开始标签
    else if (trimmedNode.match(/^<\w/) && !trimmedNode.match(/\/>\s*$/)) {
      indent = 1;
    }

    // 添加缩进和内容
    formatted += PADDING.repeat(pad) + trimmedNode + '\n';
    pad += indent;
  });

  return formatted.trim();
};

// 高亮文本渲染组件
interface HighlightedTextRendererProps {
  content: string;
  fileName?: string;
  searchTerm?: string;
  className?: string;
}

const HighlightedTextRenderer: React.FC<HighlightedTextRendererProps> = ({
  content,
  fileName,
  searchTerm,
  className = '',
}) => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const { enabled: syntaxHighlightingEnabled } = useSyntaxHighlighting();

  // 语法高亮相关
  const detectedLanguage = useMemo(() => {
    if (!syntaxHighlightingEnabled || !fileName) return 'text';
    return getLanguageFromFileName(fileName);
  }, [syntaxHighlightingEnabled, fileName]);

  const shouldHighlight = useMemo(() => {
    return (
      syntaxHighlightingEnabled && isLanguageSupported(detectedLanguage) && content.length <= 50000
    );
  }, [syntaxHighlightingEnabled, detectedLanguage, content.length]);

  // 高亮后的内容
  const [highlightedContent, setHighlightedContent] = useState<string | null>(null);
  const [isHighlighting, setIsHighlighting] = useState(false);

  // 处理语法高亮
  useEffect(() => {
    if (!shouldHighlight) {
      setHighlightedContent(null);
      return;
    }

    const performHighlight = async () => {
      setIsHighlighting(true);
      try {
        const blockHtml = await highlightCodeBlock(
          content,
          detectedLanguage,
          isDark ? 'dark' : 'light'
        );
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = blockHtml;
        const codeElement = tempDiv.querySelector('code');
        setHighlightedContent(codeElement?.innerHTML || null);
      } catch (error) {
        console.error('Failed to highlight content:', error);
        setHighlightedContent(null);
      } finally {
        setIsHighlighting(false);
      }
    };

    performHighlight();
  }, [content, shouldHighlight, detectedLanguage, isDark]);

  // 统一的容器样式
  const containerProps = {
    className: `whitespace-pre-wrap break-words font-mono text-sm overflow-wrap-anywhere bg-gray-50 dark:bg-gray-900 p-3 rounded ${className}`,
    style: { whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const },
  };

  // 搜索高亮处理函数
  const applySearchHighlight = (text: string, isHTML = false) => {
    if (!searchTerm || searchTerm.length < 2) return text;

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    if (isHTML) {
      // 先净化HTML内容，再应用搜索高亮
      const sanitizedText = DOMPurify.sanitize(text);
      return sanitizedText.replace(
        regex,
        '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>'
      );
    } else {
      return text.split(regex).map((part, index) =>
        regex.test(part) ? (
          <mark key={index} className="bg-yellow-200 dark:bg-yellow-800">
            {part}
          </mark>
        ) : (
          part
        )
      );
    }
  };

  // 加载状态
  if (isHighlighting) {
    return (
      <div {...containerProps} className={`text-gray-500 dark:text-gray-400 p-3 ${className}`}>
        {t('highlighting.content', '正在处理语法高亮...')}
      </div>
    );
  }

  // 有语法高亮的内容
  if (highlightedContent) {
    return (
      <div
        {...containerProps}
        dangerouslySetInnerHTML={{
          __html: applySearchHighlight(highlightedContent, true) as string,
        }}
      />
    );
  }

  // 普通文本（带搜索高亮）
  return <div {...containerProps}>{applySearchHighlight(content)}</div>;
};

export interface UnifiedContentModalData {
  // 核心内容
  content: string;
  title: string;

  // 可选配置
  searchTerm?: string;
  fileName?: string;

  // 自定义描述区域
  description?: React.ReactNode;
}

interface UnifiedContentModalProps {
  isOpen: boolean;
  onClose: () => void;

  // 核心内容
  content: string;
  title: string;

  // 可选配置
  searchTerm?: string;
  fileName?: string;

  // 自定义描述区域
  description?: React.ReactNode;
}

export const UnifiedContentModal: React.FC<UnifiedContentModalProps> = ({
  isOpen,
  onClose,
  content,
  title,
  searchTerm,
  fileName,
  description,
}) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // 检测逻辑 - 优先级：图片 > 结构化数据格式化 > 原始文本
  const imageInfo = isBase64Image(content);
  const isJSON = !imageInfo.isImage && isJSONContent(content);
  const isXML = !imageInfo.isImage && !isJSON && isXMLContent(content);

  const shouldDefaultFormat = Boolean(isJSON || isXML);
  const [manualFormatState, setManualFormatState] = useState<boolean | null>(null);
  const isFormatted = manualFormatState !== null ? manualFormatState : shouldDefaultFormat;

  // 当内容改变时，重置手动格式化状态，让新内容使用默认格式化
  useEffect(() => {
    setManualFormatState(null);
  }, [content]);

  // 确定显示内容
  const displayContent = (() => {
    if (imageInfo.isImage) return content; // 图片直接返回原始内容

    if (isJSON && isFormatted) {
      try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return content;
      }
    }

    if (isXML && isFormatted) {
      try {
        return formatXML(content.trim());
      } catch (error) {
        // 如果格式化失败，返回原始内容
        console.warn('XML formatting failed:', error);
        return content;
      }
    }

    return content;
  })();

  const toggleFormatView = () => {
    setManualFormatState(!isFormatted);
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(displayContent);
    if (success) {
      setCopied(true);
      showCopyToast(t('copied.to.clipboard'));
      setTimeout(() => setCopied(false), 2000);
    } else {
      showCopyToast(t('copy.failed'));
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg max-w-6xl h-[85vh] w-full flex flex-col shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>

              {/* Content Type Indicators - 紧贴标题右侧 */}
              {isFormatted && isJSON && (
                <span className="text-sm px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                  {t('formatted.json')}
                </span>
              )}
              {isFormatted && isXML && (
                <span className="text-sm px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                  {t('formatted.xml')}
                </span>
              )}
              {imageInfo.isImage && (
                <span className="text-sm px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                  {imageInfo.format} {t('image')}
                </span>
              )}
            </div>

            {/* 描述区域 - 使用自定义描述或默认统计信息 */}
            {description && (
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{description}</div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* JSON/XML格式化按钮 - 激活态保留背景色，未激活态无文本颜色 */}
            {(isJSON || isXML) && (
              <button
                onClick={toggleFormatView}
                className={`p-2 rounded-lg transition-colors ${
                  isFormatted
                    ? 'bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={
                  isFormatted ? t('original.content') : isJSON ? t('format.json') : t('format.xml')
                }
              >
                <Braces
                  className={`w-4 h-4 ${
                    isFormatted
                      ? 'text-purple-700 dark:text-purple-400'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                />
              </button>
            )}

            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={t('data.table.cell.copy')}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              )}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={t('close')}
            >
              <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {imageInfo.isImage ? (
            // 使用 ImageRenderer 展示 base64 图片
            <ImageRenderer
              mediaUrl={imageInfo.dataUrl || content}
              fileName={fileName || `content-${imageInfo.format?.toLowerCase() || 'image'}`}
              filePath="data://content"
              hasAssociatedFiles={false}
            />
          ) : (isJSON || isXML) && isFormatted ? (
            // 格式化的JSON/XML使用虚拟文本查看器，支持语法高亮
            <VirtualizedTextViewer
              content={displayContent}
              searchTerm={searchTerm || ''}
              fileName={fileName ?? (isJSON ? 'formatted.json' : 'formatted.xml')}
              containerHeight={400}
              calculateStartLineNumber={(lineIndex: number) => lineIndex + 1}
              currentSearchIndex={0}
              fullFileSearchMode={false}
              fullFileSearchResults={[]}
              searchResults={[]}
              key="unified-modal-formatted-viewer"
            />
          ) : (
            // 原始内容或简单文本 - 使用高亮文本渲染组件
            <div className="flex-1 overflow-auto p-4">
              <HighlightedTextRenderer
                content={displayContent}
                fileName={fileName}
                searchTerm={searchTerm}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};
