import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Braces } from 'lucide-react';
import { copyToClipboard, showCopyToast } from '../../../utils/clipboard';
import { VirtualizedTextViewer } from './VirtualizedTextViewer';
import { ImageRenderer } from './ImageRenderer';

// 检测是否为 base64 编码的图片
const isBase64Image = (text: string): { isImage: boolean; dataUrl?: string; format?: string } => {
	const trimmed = text.trim();

	// 匹配 "key": "data:image/format;base64,..." 格式
	const base64ImageRegex = /["']?\w*["']?\s*:\s*["']data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)["']?/i;
	const match = trimmed.match(base64ImageRegex);

	if (match) {
		const format = match[1];
		const base64Data = match[2];
		return {
			isImage: true,
			dataUrl: `data:image/${format};base64,${base64Data}`,
			format: format.toUpperCase()
		};
	}

	// 也支持直接的 data URL 格式
	const directDataUrlRegex = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/i;
	const directMatch = trimmed.match(directDataUrlRegex);

	if (directMatch) {
		const format = directMatch[1];
		return {
			isImage: true,
			dataUrl: trimmed,
			format: format.toUpperCase()
		};
	}

	return { isImage: false };
};

interface LineContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  lineNumber: number;
  content: string;
  searchTerm?: string;
}

export const LineContentModal: React.FC<LineContentModalProps> = ({
  isOpen,
  onClose,
  lineNumber,
  content,
  searchTerm
}) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const [isFormatted, setIsFormatted] = useState(false);

  // 检测逻辑 - 优先级：图片 > JSON格式化 > 原始文本
  const imageInfo = isBase64Image(content);
  const isJSONContent = !imageInfo.isImage && content.trim().match(/^[\[\{].*[\]\}]$/s);

  // 确定显示内容
  const displayContent = (() => {
    if (imageInfo.isImage) return content; // 图片直接返回原始内容
    if (isJSONContent && isFormatted) {
      try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return content;
      }
    }
    return content;
  })();

  const toggleFormatView = () => {
    setIsFormatted(!isFormatted);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') onClose();
      });
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', (e) => {
        if (e.key === 'Escape') onClose();
      });
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full mx-4 h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('line.content', { line: lineNumber })}
            </h3>
            {isFormatted && isJSONContent && (
              <span className="text-sm px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                {t('formatted.json')}
              </span>
            )}
            {imageInfo.isImage && (
              <span className="text-sm px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                {imageInfo.format} {t('image')}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {/* JSON格式化按钮 */}
            {isJSONContent && (
              <button
                onClick={toggleFormatView}
                className="flex items-center space-x-2 px-3 py-1 text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                title={isFormatted ? t('original.content') : t('format.json')}
              >
                <Braces className="w-4 h-4" />
                <span>{isFormatted ? t('original.content') : t('format.json')}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {imageInfo.isImage ? (
            // 使用 ImageRenderer 展示 base64 图片
            <ImageRenderer
              mediaUrl={imageInfo.dataUrl || content}
              fileName={`line-${lineNumber}-${imageInfo.format?.toLowerCase() || 'image'}`}
              filePath={`data://line-${lineNumber}`}
              hasAssociatedFiles={false}
            />
          ) : isJSONContent && isFormatted ? (
            // 格式化的JSON使用虚拟文本查看器，支持语法高亮
            <VirtualizedTextViewer
              content={displayContent}
              searchTerm={searchTerm}
              fileName="formatted.json"

              className="h-full"
              key={`modal-viewer-formatted`}
            />
          ) : (
            // 原始内容使用简单渲染
            <div className="p-4 h-full overflow-auto">
              <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 font-mono text-sm whitespace-pre-wrap break-words">
                {searchTerm && searchTerm.length >= 2 ? (
                  displayContent.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part: string, index: number) => {
                    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                    if (regex.test(part)) {
                      return (
                        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800">
                          {part}
                        </mark>
                      );
                    }
                    return part;
                  })
                ) : (
                  displayContent
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <span>{t('characters')}: {displayContent.length.toLocaleString()}</span>
            <span>{t('lines')}: {displayContent.split('\n').length.toLocaleString()}</span>
          </div>
          <button
            onClick={async () => {
              const success = await copyToClipboard(displayContent);
              if (success) {
                showCopyToast(t('copied.to.clipboard'));
              } else {
                showCopyToast(t('copy.failed'));
              }
            }}
            className="flex items-center space-x-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            <Copy className="w-4 h-4" />
            <span>{t('copy.line.content')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
