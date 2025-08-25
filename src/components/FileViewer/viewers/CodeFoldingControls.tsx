import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface FoldingIndicatorProps {
  /** 是否已折叠 */
  isCollapsed: boolean;
  /** 切换折叠状态的回调 */
  onToggle: () => void;
}

export const FoldingIndicator: React.FC<FoldingIndicatorProps> = ({
  isCollapsed,
  onToggle
}) => {
  const { t } = useTranslation();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center justify-center w-4 h-4 ml-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
      title={isCollapsed ? t('unfold.range') : t('fold.range')}
    >
      {isCollapsed ? (
        <ChevronRight className="w-3 h-3" />
      ) : (
        <ChevronDown className="w-3 h-3" />
      )}
    </button>
  );
};

