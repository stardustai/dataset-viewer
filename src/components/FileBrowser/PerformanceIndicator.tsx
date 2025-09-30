import { Info, Zap } from 'lucide-react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface PerformanceIndicatorProps {
  fileCount: number;
  isVirtualized: boolean;
  className?: string;
}

export const PerformanceIndicator: FC<PerformanceIndicatorProps> = ({
  fileCount,
  isVirtualized,
  className = '',
}) => {
  const { t } = useTranslation();

  // 只在文件数量超过500时显示
  if (fileCount < 500) {
    return null;
  }

  return (
    <div
      className={`inline-flex items-center space-x-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm ${className}`}
    >
      {isVirtualized ? (
        <>
          <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-blue-700 dark:text-blue-300">
            {t('performance.virtualized.mode')} -{' '}
            {t('performance.file.count', { count: fileCount })}
          </span>
        </>
      ) : (
        <>
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span className="text-amber-700 dark:text-amber-300">
            {t('performance.rendering.files', { count: fileCount })}
          </span>
        </>
      )}
    </div>
  );
};
