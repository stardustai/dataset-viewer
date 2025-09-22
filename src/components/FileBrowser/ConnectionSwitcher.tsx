import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { useStorageStore } from '../../stores/storageStore';
import { formatConnectionDisplayName } from '../../utils/urlUtils';
import { getConnectionIcon } from '../../utils/connectionIcons';
import { StoredConnection } from '../../services/connectionStorage';

interface ConnectionSwitcherProps {
  onConnectionChange?: () => void;
}

export const ConnectionSwitcher: React.FC<ConnectionSwitcherProps> = ({ onConnectionChange }) => {
  const { t } = useTranslation();
  const { currentConnection, connections, loadConnections, connectWithConfig, removeConnection } =
    useStorageStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 加载连接列表
  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 获取连接图标 - 使用公共工具函数
  const getStorageIcon = (type: string) => {
    return getConnectionIcon(type, 16, 'text-gray-500 dark:text-gray-400');
  };

  // 切换连接
  const handleConnectionSwitch = async (connection: StoredConnection) => {
    if (isConnecting) return;

    setIsConnecting(true);
    setIsOpen(false);

    try {
      const success = await connectWithConfig(connection.config);
      if (success) {
        onConnectionChange?.();
      }
    } catch (error) {
      console.error('Failed to switch connection:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  // 删除连接
  const handleDeleteConnection = (e: React.MouseEvent, connectionId: string) => {
    e.stopPropagation();
    if (confirm(t('confirm.delete.connection'))) {
      removeConnection(connectionId);
    }
  };

  // 获取当前连接显示名称
  const getCurrentDisplayName = () => {
    if (!currentConnection) return t('no.connection');
    return formatConnectionDisplayName(currentConnection);
  };

  return (
    <div className="relative min-w-64" ref={dropdownRef}>
      {/* 主按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isConnecting}
        className="flex items-center justify-between w-full p-2 bg-white dark:bg-gray-800 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
      >
        <div className="flex items-center space-x-3 min-w-0">
          {currentConnection && getStorageIcon(currentConnection.type)}
          <div className="flex flex-col items-start min-w-0">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {getCurrentDisplayName()}
            </span>
          </div>
        </div>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg dark:shadow-gray-900/20 z-50 max-h-64 overflow-y-auto">
          {connections.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
              {t('no.saved.connections')}
            </div>
          ) : (
            <>
              {/* 连接列表 */}
              {connections.map(connection => {
                const isCurrentConnection =
                  currentConnection &&
                  JSON.stringify(currentConnection) === JSON.stringify(connection.config);

                return (
                  <div
                    key={connection.id}
                    className={`group flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
                      isCurrentConnection ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                    }`}
                    onClick={() => handleConnectionSwitch(connection)}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      {getStorageIcon(connection.config.type)}
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {connection.name}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {formatConnectionDisplayName(connection.config)}
                        </span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => handleDeleteConnection(e, connection.id)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
                        title={t('delete.connection')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* 连接中遮罩 */}
      {isConnecting && (
        <div className="absolute inset-0 bg-white dark:bg-gray-800 bg-opacity-75 dark:bg-opacity-75 flex items-center justify-center rounded-md">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
            <span className="text-sm text-blue-600 dark:text-blue-400">{t('connecting')}</span>
          </div>
        </div>
      )}
    </div>
  );
};
