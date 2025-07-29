import React from 'react';
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
  maxLength = 80,
  onOpenModal
}) => {
  const { t } = useTranslation();

  if (value === null || value === undefined) {
    return <span className="text-gray-400 italic text-sm">{t('data.table.null.value')}</span>;
  }

  // 通用的渲染函数，为所有非null值提供详情查看功能
  const renderCellWithModal = (
    displayContent: React.ReactNode,
    isLong: boolean,
    textClasses: string = "text-sm text-gray-900 dark:text-gray-100"
  ) => {
    if (isLong) {
      // 长内容 - 显示展开按钮
      return (
        <div className="flex items-center space-x-2 w-full">
          <span
            className={`${textClasses} flex-1 min-w-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1 py-0.5 transition-colors`}
            onClick={() => onOpenModal(value, column, rowIndex)}
            title={t('data.table.cell.click.view')}
          >
            {displayContent}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenModal(value, column, rowIndex);
            }}
            className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title={t('data.table.cell.view.full')}
          >
            <Maximize2 className="w-3 h-3 text-gray-400" />
          </button>
        </div>
      );
    } else {
      // 短内容 - 双击查看详情
      return (
        <span
          className={`${textClasses} cursor-pointer`}
          onDoubleClick={() => onOpenModal(value, column, rowIndex)}
          title={t('data.table.cell.double.click.view')}
        >
          {displayContent}
        </span>
      );
    }
  };

  // 处理数组类型
  if (Array.isArray(value)) {
    const arrayStr = JSON.stringify(value);
    const isLong = arrayStr.length > maxLength;

    const displayContent = isLong ? (
      <span className="truncate block">
        [{t('data.table.items.count', { count: value.length })}] {arrayStr.substring(0, maxLength - 15)}...
      </span>
    ) : (
      arrayStr
    );

    return renderCellWithModal(
      displayContent,
      isLong,
      "text-xs font-mono text-blue-600 dark:text-blue-400"
    );
  }

  // 处理对象类型
  if (typeof value === 'object') {
    const objStr = JSON.stringify(value, null, 2);
    const isLong = objStr.length > maxLength;

    const displayContent = isLong ? (
      <span className="truncate block">
        {'{...} '}{objStr.substring(0, maxLength - 10)}...
      </span>
    ) : (
      objStr
    );

    return renderCellWithModal(
      displayContent,
      isLong,
      "text-xs font-mono text-blue-600 dark:text-blue-400"
    );
  }

  // 处理布尔类型
  if (typeof value === 'boolean') {
    return renderCellWithModal(
      <span className="font-mono text-purple-600 dark:text-purple-400">
        {value.toString()}
      </span>,
      false,
      ""
    );
  }

  // 处理数值类型
  if (typeof value === 'number') {
    const displayValue = Number.isInteger(value)
      ? value.toLocaleString()
      : value.toFixed(6).replace(/\.?0+$/, '');

    const isLong = displayValue.length > 20;

    const displayContent = isLong ? (
      <span className="truncate block">{displayValue}</span>
    ) : (
      displayValue
    );

    return renderCellWithModal(
      displayContent,
      isLong,
      "text-sm text-gray-900 dark:text-gray-100 font-mono"
    );
  }

  // 处理日期类型
  if (value instanceof Date) {
    const dateStr = value.toISOString();
    return renderCellWithModal(
      <span className="font-mono text-green-600 dark:text-green-400">
        {dateStr}
      </span>,
      false,
      ""
    );
  }

  // 处理字符串类型（包括所有其他转换为字符串的类型）
  const stringValue = String(value);
  const isLong = stringValue.length > 100;

  // 检查是否包含换行符或特殊字符
  const hasSpecialChars = /[\n\r\t]/.test(stringValue);
  const shouldShowExpand = isLong || hasSpecialChars;

  const displayContent = shouldShowExpand ? (
    <span className="truncate block">
      {stringValue.substring(0, 97)}...
    </span>
  ) : (
    stringValue
  );

  return renderCellWithModal(
    displayContent,
    shouldShowExpand,
    "text-sm text-gray-900 dark:text-gray-100"
  );
};
