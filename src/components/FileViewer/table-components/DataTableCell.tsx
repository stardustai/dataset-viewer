import React, { useRef, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2 } from 'lucide-react';

interface DataTableCellProps {
  value: any;
  column: string;
  rowIndex: number;
  maxLength?: number;
  onOpenModal: (value: any, column: string, rowIndex: number) => void;
}

export const DataTableCell: React.FC<DataTableCellProps> = ({
  value,
  column,
  rowIndex,
  onOpenModal
}) => {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [showExpandButton, setShowExpandButton] = useState(false);

  // 使用 layoutEffect 来同步检测是否需要展开按钮
  useLayoutEffect(() => {
    if (!contentRef.current) return;

    const element = contentRef.current;
    const textElement = element.querySelector('[data-text-content]') as HTMLElement;

    if (!textElement) return;

    // 快速检测：比较 scrollWidth 和 clientWidth
    const needsExpand = textElement.scrollWidth > textElement.clientWidth ||
                       textElement.scrollHeight > textElement.clientHeight;

    setShowExpandButton(needsExpand);
  });

  if (value === null || value === undefined) {
    return <span className="text-gray-400 italic text-sm">{t('data.table.null.value')}</span>;
  }

  // 格式化显示值
  const getDisplayContent = () => {
    if (Array.isArray(value)) {
      return {
        content: JSON.stringify(value),
        className: "text-xs font-mono text-blue-600 dark:text-blue-400",
        isComplex: true
      };
    }

    if (typeof value === 'object') {
      return {
        content: JSON.stringify(value),
        className: "text-xs font-mono text-blue-600 dark:text-blue-400",
        isComplex: true
      };
    }

    if (typeof value === 'boolean') {
      return {
        content: value.toString(),
        className: "font-mono text-purple-600 dark:text-purple-400",
        isComplex: false
      };
    }

    if (typeof value === 'number') {
      const displayValue = Number.isInteger(value)
        ? value.toLocaleString()
        : value.toFixed(6).replace(/\.?0+$/, '');

      return {
        content: displayValue,
        className: "font-mono text-gray-900 dark:text-gray-100",
        isComplex: false
      };
    }

    if (value instanceof Date) {
      return {
        content: value.toISOString(),
        className: "font-mono text-green-600 dark:text-green-400",
        isComplex: false
      };
    }

    // 字符串或其他类型
    return {
      content: String(value),
      className: "text-gray-900 dark:text-gray-100",
      isComplex: /[\n\r\t]/.test(String(value)) || String(value).length > 200
    };
  };

  const { content, className, isComplex } = getDisplayContent();

  return (
    <div
      ref={contentRef}
      className="flex items-center w-full min-w-0"
    >
      <div
        data-text-content
        className={`${className} text-sm flex-1 min-w-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1 py-0.5 transition-colors`}
        onClick={() => onOpenModal(value, column, rowIndex)}
        title={showExpandButton ? t('data.table.cell.click.view') : t('data.table.cell.double.click.view')}
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-all',
          lineHeight: '1.3'
        }}
      >
        {content}
      </div>

      {(showExpandButton || isComplex) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenModal(value, column, rowIndex);
          }}
          className="flex-shrink-0 ml-1 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors opacity-60 hover:opacity-100"
          title={t('data.table.cell.view.full')}
        >
          <Maximize2 className="w-3 h-3 text-gray-400" />
        </button>
      )}
    </div>
  );
};
