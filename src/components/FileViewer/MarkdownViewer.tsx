import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { marked } from 'marked';
import { LoadingDisplay } from '../common/StatusDisplay';

interface MarkdownViewerProps {
  content: string;
  fileName: string;
  className?: string;
}

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  fileName,
  className = ''
}) => {
  const { t } = useTranslation();
  const [parsedContent, setParsedContent] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    const parseContent = async () => {
      if (content) {
        try {
          // 移除 Front Matter (--- 开头和结尾的 YAML 内容)
          const contentWithoutFrontMatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
          const parsed = await marked(contentWithoutFrontMatter);
          setParsedContent(parsed);
        } catch (error) {
          console.error('Error parsing markdown:', error);
          setParsedContent(content); // 如果解析失败，显示原始内容
        }
      }
    };
    parseContent();
  }, [content]);

  if (!content) {
    return (
      <LoadingDisplay
        message={t('loading.file', { filename: fileName })}
        className={className}
      />
    );
  }

  return (
    <div className={`h-full flex flex-col bg-white dark:bg-gray-900 ${className}`}>
      {/* 预览模式切换按钮 */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 p-3">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
          title={showRaw ? t('markdown.raw') : t('markdown.rendered')}
        >
          {showRaw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showRaw ? t('markdown.raw') : t('markdown.rendered')}
        </button>
      </div>
      
      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        {showRaw ? (
          <pre className="p-6 text-sm font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200">
            {content}
          </pre>
        ) : (
          <div 
            className="prose prose-gray dark:prose-invert max-w-none p-6"
            dangerouslySetInnerHTML={{ __html: parsedContent }}
          />
        )}
      </div>
    </div>
  );
};