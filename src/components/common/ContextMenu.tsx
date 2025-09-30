import { Check, ChevronRight, FileText, Wand2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ViewerOption } from '../../services/plugin/pluginFramework';

interface ContextMenuProps {
  x: number;
  y: number;
  compatiblePlugins: ViewerOption[];
  defaultPluginId: string | null;
  onOpenAsText: () => void;
  onOpenWithPlugin: (pluginId: string, setAsDefault: boolean) => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  compatiblePlugins,
  defaultPluginId,
  onOpenAsText,
  onOpenWithPlugin,
  onClose,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showOpenWithSubmenu, setShowOpenWithSubmenu] = useState(false);
  const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        // 检查是否点击了子菜单
        const target = event.target as HTMLElement;
        if (!target.closest('[data-submenu="true"]')) {
          onClose();
        }
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleOpenAsText = () => {
    onOpenAsText();
    onClose();
  };

  const handleOpenWithSubmenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();

    // 计算子菜单位置（显示在右侧）
    setSubmenuPosition({
      x: rect.right + 5,
      y: rect.top,
    });

    setShowOpenWithSubmenu(true);
  };

  const handlePluginSelect = (pluginId: string, setAsDefault: boolean) => {
    onOpenWithPlugin(pluginId, setAsDefault);
    onClose();
  };

  return (
    <>
      <div
        ref={menuRef}
        className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-2 min-w-48"
        style={{
          left: x,
          top: y,
        }}
      >
        {/* 以文本打开 */}
        <button
          type="button"
          onClick={handleOpenAsText}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2 transition-colors"
        >
          <FileText className="w-4 h-4" />
          <span>{t('context.menu.open.as.text')}</span>
        </button>

        {/* 打开方式（仅当有兼容插件时显示） */}
        {compatiblePlugins.length > 0 && (
          <button
            type="button"
            onMouseEnter={handleOpenWithSubmenu}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center space-x-2">
              <Wand2 className="w-4 h-4" />
              <span>{t('context.menu.open.with')}</span>
            </div>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 打开方式子菜单 */}
      {showOpenWithSubmenu && compatiblePlugins.length > 0 && (
        <div
          data-submenu="true"
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-2 min-w-56"
          style={{
            left: submenuPosition.x,
            top: submenuPosition.y,
          }}
        >
          {compatiblePlugins.map(viewer => {
            const isDefault = viewer.id === defaultPluginId;
            // 获取显示名称（内置查看器需要翻译，外部插件直接使用名称）
            const displayName = viewer.isBuiltIn ? t(viewer.name) : viewer.name;

            return (
              <button
                key={viewer.id}
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handlePluginSelect(viewer.id, true);
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between transition-colors"
              >
                <span>{displayName}</span>
                {isDefault && <Check className="w-3 h-3 text-blue-500" />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
};
