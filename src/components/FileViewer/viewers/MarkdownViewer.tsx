import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { LoadingDisplay } from '../../common/StatusDisplay';
import { formatFileSize } from '../../../utils/fileUtils';

interface MarkdownViewerProps {
  content: string;
  fileName: string;
  className?: string;
  onScrollToBottom?: () => void;
  isLargeFile?: boolean;
  loadingMore?: boolean;
  loadedChunks?: number;
  loadedContentSize?: number;
}

// micromark 默认配置已经很好，无需额外配置
// micromark 默认支持 CommonMark 规范，性能优秀

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  fileName,
  className = '',
  onScrollToBottom,
  isLargeFile = false,
  loadingMore = false,
  loadedChunks = 0,
  loadedContentSize = 0
}) => {
  const { t } = useTranslation();
  
  // 从 localStorage 读取预览模式偏好，默认为 true（显示原始内容）
  const [showRaw, setShowRaw] = useState(() => {
    try {
      const saved = localStorage.getItem('markdown-show-raw');
      return saved !== null ? JSON.parse(saved) : true; // 默认显示原始内容
    } catch {
      return true;
    }
  });
  const [isParsingMarkdown, setIsParsingMarkdown] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const parseTimeoutRef = useRef<NodeJS.Timeout>();

  // 滚动事件处理
  const handleScroll = useCallback(() => {
    if (!contentRef.current || !onScrollToBottom) return;

    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    
    // 检查是否接近底部
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
    if (isNearBottom) {
      onScrollToBottom();
    }
  }, [onScrollToBottom]);

  // 异步解析 Markdown 内容
  const [parsedContent, setParsedContent] = useState('');
  
  // 异步解析函数
  const parseMarkdownAsync = useCallback(async (markdownContent: string) => {
    if (!markdownContent) {
      setParsedContent('');
      return;
    }

    setIsParsingMarkdown(true);
    
    try {
      // 移除 Front Matter (--- 开头和结尾的 YAML 内容)
      const contentWithoutFrontMatter = markdownContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
      
      // 根据文件大小选择不同的解析策略
      const contentSize = contentWithoutFrontMatter.length;
      
      if (contentSize > 200000) { // 200KB 以上使用 requestIdleCallback 优化
        // 使用 requestIdleCallback 在浏览器空闲时解析
        await new Promise<void>(resolve => {
          const parseInIdle = () => {
            if (window.requestIdleCallback) {
              window.requestIdleCallback((deadline) => {
                try {
                  // 如果有足够的空闲时间，直接解析
                  if (deadline.timeRemaining() > 50 || deadline.didTimeout) {
                    const parsed = micromark(contentWithoutFrontMatter, {
                       allowDangerousHtml: true,
                       extensions: [gfm()],
                       htmlExtensions: [gfmHtml()]
                     });
                    setParsedContent(parsed);
                    resolve();
                  } else {
                    // 空闲时间不够，延迟到下一个空闲周期
                    parseInIdle();
                  }
                } catch (error) {
                  console.error('Error parsing large markdown:', error);
                  setParsedContent(contentWithoutFrontMatter);
                  resolve();
                }
              }, { timeout: 1000 }); // 1秒超时
            } else {
              // 不支持 requestIdleCallback，回退到 setTimeout
              parseTimeoutRef.current = setTimeout(() => {
                try {
                  const parsed = micromark(contentWithoutFrontMatter, {
                     allowDangerousHtml: true,
                     extensions: [gfm()],
                     htmlExtensions: [gfmHtml()]
                   });
                  setParsedContent(parsed);
                } catch (error) {
                  console.error('Error parsing large markdown:', error);
                  setParsedContent(contentWithoutFrontMatter);
                }
                resolve();
              }, 50);
            }
          };
          parseInIdle();
        });
      } else if (contentSize > 50000) { // 50KB-200KB 使用异步处理
        // 使用 setTimeout 让出主线程控制权
        await new Promise<void>(resolve => {
          parseTimeoutRef.current = setTimeout(() => {
            try {
              const parsed = micromark(contentWithoutFrontMatter, {
                 allowDangerousHtml: true,
                 extensions: [gfm()],
                 htmlExtensions: [gfmHtml()]
               });
              setParsedContent(parsed);
            } catch (error) {
              console.error('Error parsing markdown:', error);
              setParsedContent(contentWithoutFrontMatter);
            }
            resolve();
          }, 0);
        });
      } else {
        // 小文件直接同步解析
        const parsed = micromark(contentWithoutFrontMatter, {
           allowDangerousHtml: true,
           extensions: [gfm()],
           htmlExtensions: [gfmHtml()]
         });
        setParsedContent(parsed);
      }
    } catch (error) {
      console.error('Error parsing markdown:', error);
      setParsedContent(markdownContent); // 解析失败时显示原始内容
    } finally {
      setIsParsingMarkdown(false);
    }
  }, []);

  // 当内容变化或预览模式变化时触发异步解析
  useEffect(() => {
    // 清除之前的解析任务
    if (parseTimeoutRef.current) {
      clearTimeout(parseTimeoutRef.current);
    }
    
    // 只有在预览模式（非原始模式）下才解析 Markdown
    if (!showRaw) {
      parseMarkdownAsync(content);
    }
    
    return () => {
      if (parseTimeoutRef.current) {
        clearTimeout(parseTimeoutRef.current);
      }
    };
  }, [content, parseMarkdownAsync, showRaw]);

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
          onClick={() => {
            const newShowRaw = !showRaw;
            setShowRaw(newShowRaw);
            // 保存到 localStorage
            try {
              localStorage.setItem('markdown-show-raw', JSON.stringify(newShowRaw));
            } catch (error) {
              console.warn('Failed to save markdown preview preference:', error);
            }
          }}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
          title={showRaw ? t('markdown.raw') : t('markdown.rendered')}
        >
          {showRaw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showRaw ? t('markdown.raw') : t('markdown.rendered')}
        </button>
      </div>
      
      {/* 内容区域 */}
      <div 
        ref={contentRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        {showRaw ? (
          <pre className="p-6 text-sm font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200">
            {content}
          </pre>
        ) : isParsingMarkdown ? (
          <div className="flex items-center justify-center p-12">
            <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('markdown.parsing')}</span>
            </div>
          </div>
        ) : (
          <div 
            className="prose prose-gray dark:prose-invert max-w-none p-6"
            dangerouslySetInnerHTML={{ __html: parsedContent }}
          />
        )}
      </div>
      
      {/* 分块加载状态指示器 */}
      {isLargeFile && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center justify-between">
            <span>
              {t('file.loaded.chunks', { chunks: loadedChunks, size: formatFileSize(loadedContentSize) })}
            </span>
            {loadingMore && (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <span>{t('loading.more.content')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};