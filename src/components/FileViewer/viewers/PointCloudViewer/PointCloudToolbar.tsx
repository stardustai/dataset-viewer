import { ChevronDown, Minus, Plus } from 'lucide-react';
import type { FC } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColorMode } from './types';

interface PointCloudToolbarProps {
  hasRgbData: boolean;
  hasIntensityData: boolean;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
  pointSize: number;
  onPointSizeChange: (size: number) => void;
  lodEnabled: boolean;
  onLodToggle: (enabled: boolean) => void;
  loadingProgress?: {
    percentage: number;
    pointsProcessed: number;
    stage: 'loading' | 'parsing' | 'optimizing';
    isIndeterminate?: boolean;
  } | null;
}

export const PointCloudToolbar: FC<PointCloudToolbarProps> = ({
  hasRgbData,
  hasIntensityData,
  colorMode,
  onColorModeChange,
  pointSize,
  onPointSizeChange,
  lodEnabled,
  onLodToggle,
  loadingProgress,
}) => {
  const { t } = useTranslation();
  const [showColorMenu, setShowColorMenu] = useState(false);

  const handleDecrease = () => {
    onPointSizeChange(Math.max(0.05, pointSize - 0.05));
  };

  const handleIncrease = () => {
    onPointSizeChange(Math.min(5, pointSize + 0.05));
  };

  return (
    <>
      {/* 左侧工具栏 */}
      <div className="absolute top-4 left-4 flex items-center gap-2">
        {/* 点大小调整 - 始终显示 */}
        <div className="flex items-center gap-1 px-2 h-8 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg text-gray-900 dark:text-white text-sm shadow-sm">
          <button
            onClick={handleDecrease}
            disabled={pointSize <= 0.05}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('pcd.toolbar.decreaseSize')}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="min-w-[3rem] text-center text-xs">{pointSize.toFixed(2)}</span>
          <button
            onClick={handleIncrease}
            disabled={pointSize >= 5}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={t('pcd.toolbar.increaseSize')}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 加载进度 */}
        {loadingProgress && (
          <div className="flex items-center gap-2 px-2.5 h-8 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg text-gray-900 dark:text-white text-sm shadow-sm">
            <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-1.5 rounded-full bg-blue-500 transition-all duration-300"
                style={{
                  width: loadingProgress.isIndeterminate
                    ? '100%'
                    : `${loadingProgress.percentage}%`,
                  ...(loadingProgress.isIndeterminate && {
                    backgroundImage:
                      'linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent)',
                    backgroundSize: '8px 8px',
                    animation: 'progress-stripes 1s linear infinite',
                  }),
                }}
              />
            </div>
            {loadingProgress.isIndeterminate && (
              <style>{`
                @keyframes progress-stripes {
                  0% { background-position: 0 0; }
                  100% { background-position: 8px 0; }
                }
              `}</style>
            )}
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {t(`pcd.progress.${loadingProgress.stage}`)}
            </span>
          </div>
        )}

        {/* 颜色模式选择 */}
        {(hasRgbData || hasIntensityData) && !loadingProgress && (
          <div className="relative">
            <button
              onClick={() => setShowColorMenu(!showColorMenu)}
              className="flex items-center gap-2 px-2.5 h-8 rounded-lg text-sm transition-colors shadow-sm bg-white/90 dark:bg-gray-800/90 hover:bg-gray-50 dark:hover:bg-gray-700/90 text-gray-900 dark:text-white backdrop-blur-sm"
            >
              <span>{t(`pcd.toolbar.${colorMode}`)}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showColorMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowColorMenu(false)} />
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-20 min-w-[120px]">
                  <button
                    onClick={() => {
                      onColorModeChange('height');
                      setShowColorMenu(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                      colorMode === 'height'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    {t('pcd.toolbar.height')}
                  </button>
                  {hasRgbData && (
                    <button
                      onClick={() => {
                        onColorModeChange('rgb');
                        setShowColorMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                        colorMode === 'rgb'
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {t('pcd.toolbar.rgb')}
                    </button>
                  )}
                  {hasIntensityData && (
                    <button
                      onClick={() => {
                        onColorModeChange('intensity');
                        setShowColorMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                        colorMode === 'intensity'
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {t('pcd.toolbar.intensity')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 右侧 LOD 开关 - 固定在屏幕最右侧 */}
      {!loadingProgress && (
        <div className="absolute top-4 right-4">
          <button
            onClick={() => onLodToggle(!lodEnabled)}
            className={`flex items-center gap-2 px-2.5 h-8 rounded-lg text-sm shadow-sm backdrop-blur-sm ${
              lodEnabled
                ? 'bg-blue-500/90 hover:bg-blue-600/90 text-white'
                : 'bg-white/90 dark:bg-gray-800/90 hover:bg-gray-50 dark:hover:bg-gray-700/90 text-gray-900 dark:text-white'
            }`}
            title={t('pcd.toolbar.lod')}
          >
            <span className="text-xs font-medium">LOD</span>
          </button>
        </div>
      )}
    </>
  );
};
