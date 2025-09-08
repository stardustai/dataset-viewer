import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import DOMPurify from 'dompurify';
import { highlightMarkdownCode } from '../../../utils/syntaxHighlighter';
import { useTheme } from '../../../hooks/useTheme';

interface MarkdownPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  fileName: string;
}

export const MarkdownPreviewModal: React.FC<MarkdownPreviewModalProps> = ({
  isOpen,
  onClose,
  content,
  fileName,
}) => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const [parsedContent, setParsedContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !content) return;

    const parseMarkdown = async () => {
      setIsLoading(true);
      try {
        // 首先将 Markdown 转换为 HTML
        const html = micromark(content, {
          extensions: [gfm()],
          htmlExtensions: [gfmHtml()],
          allowDangerousHtml: true, // 启用 HTML 支持
        });

        // 然后对 HTML 中的代码块进行语法高亮
        const highlightedHtml = await highlightMarkdownCode(html, isDark ? 'dark' : 'light');
        setParsedContent(highlightedHtml);
      } catch (error) {
        console.error('Error parsing markdown:', error);
        setParsedContent('<p>Error parsing markdown content</p>');
      } finally {
        setIsLoading(false);
      }
    };

    parseMarkdown();
  }, [isOpen, content, isDark]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 w-full h-full max-w-6xl max-h-[90vh] m-4 bg-white dark:bg-gray-900 rounded-lg shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('markdown.preview')} - {fileName}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-600 dark:text-gray-400">{t('markdown.parsing')}</div>
            </div>
          ) : (
            <div
              className="prose prose-gray dark:prose-invert max-w-none  prose-pre:bg-gray-100 prose-pre:text-gray-800 prose-pre:dark:bg-gray-800 prose-pre:dark:text-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parsedContent) }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
