import { Check, ChevronDown, Loader2, Star } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredConnection } from '../../services/connectionStorage';
import { StorageServiceManager } from '../../services/storage';
import { showErrorToast } from '../../utils/clipboard';
import { formatConnectionDisplayName } from '../../utils/urlUtils';

interface ConnectionSwitcherProps {
  onConnectionChange?: () => void;
}

export const ConnectionSwitcher: React.FC<ConnectionSwitcherProps> = ({ onConnectionChange }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [connections, setConnections] = useState<StoredConnection[]>([]);
  const [currentConnection, setCurrentConnection] = useState<string>('');
  const [switchingConnection, setSwitchingConnection] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConnections();
    updateCurrentConnection();
  }, [loadConnections, updateCurrentConnection]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadConnections = () => {
    const storedConnections = StorageServiceManager.getStoredConnections();
    setConnections(storedConnections);
  };

  const updateCurrentConnection = () => {
    const displayName = StorageServiceManager.getConnectionDisplayName();
    setCurrentConnection(displayName);
  };

  const handleConnectionSwitch = async (connection: StoredConnection) => {
    if (switchingConnection) return; // 防止重复点击

    setSwitchingConnection(connection.id);

    // 保存当前连接状态，以便失败时恢复
    let previousConnection: any = null;
    try {
      previousConnection = StorageServiceManager.getCurrentConnection();
    } catch {
      // 如果没有当前连接，previousConnection保持为null
    }

    // 根据StoredConnection推断连接类型（在try块外定义，以便在catch块中使用）
    const isLocal = connection.url?.startsWith('file:///');
    const isOSS = connection.url?.startsWith('oss://') || connection.metadata?.bucket;
    const isHuggingFace =
      connection.url?.startsWith('huggingface://') || connection.metadata?.organization;

    try {
      // 根据StoredConnection构建ConnectionConfig

      const config = {
        type: isLocal
          ? ('local' as const)
          : isOSS
            ? ('oss' as const)
            : isHuggingFace
              ? ('huggingface' as const)
              : ('webdav' as const),
        url: isLocal ? undefined : connection.url,
        username: connection.username,
        password: connection.password,
        name: connection.name,
        rootPath: isLocal ? connection.url.replace('file:///', '') : undefined,
        bucket: connection.metadata?.bucket,
        region: connection.metadata?.region,
        endpoint: connection.metadata?.endpoint,
        apiToken: connection.metadata?.apiToken,
        organization: connection.metadata?.organization,
      };

      const success = await StorageServiceManager.connectWithConfig(config);
      if (success) {
        updateCurrentConnection();
        setIsOpen(false);
        onConnectionChange?.();
      } else {
        // 连接失败，尝试恢复之前的连接
        if (previousConnection) {
          try {
            await StorageServiceManager.connectWithConfig(previousConnection);
          } catch (restoreError) {
            console.error('恢复之前连接失败:', restoreError);
          }
        }
        showErrorToast(t('connection.switch.failed'));
      }
    } catch (error) {
      console.error('切换连接失败:', error);
      // 连接异常，尝试恢复之前的连接
      if (previousConnection) {
        try {
          await StorageServiceManager.connectWithConfig(previousConnection);
        } catch (restoreError) {
          console.error('恢复之前连接失败:', restoreError);
        }
      }
      let errorMessage = error instanceof Error ? error.message : String(error);

      // 提供更友好的错误信息
      if (errorMessage.includes('WebDAV client cannot handle')) {
        // 使用与上面相同的连接类型推断逻辑
        let connectionType = 'unknown';
        if (isLocal) {
          connectionType = 'LOCAL';
        } else if (isOSS) {
          connectionType = 'OSS';
        } else if (isHuggingFace) {
          connectionType = 'HUGGINGFACE';
        } else {
          connectionType = 'WEBDAV';
        }

        errorMessage = t('connection.switch.type_mismatch', {
          connectionType: connectionType,
          connectionName: connection.name,
        });
      } else if (errorMessage.includes('requires URL, username, and password')) {
        errorMessage = t('connection.switch.missing_credentials', {
          connectionName: connection.name,
        });
      }

      showErrorToast(errorMessage);
    } finally {
      setSwitchingConnection(null);
    }
  };

  const getCurrentConnectionId = () => {
    try {
      const current = StorageServiceManager.getCurrentConnection();
      if (!current) return null;

      return (
        connections.find(
          conn => conn && conn.url === current.url && conn.username === current.username
        )?.id || null
      );
    } catch (_error) {
      // 没有活动连接时返回null，避免抛出错误
      return null;
    }
  };

  const formatLastConnected = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return t('time.today');
    } else if (diffDays === 1) {
      return t('time.yesterday');
    } else if (diffDays < 7) {
      return t('time.days.ago', { count: diffDays });
    } else {
      return date.toLocaleDateString();
    }
  };

  const currentConnectionId = getCurrentConnectionId();

  if (connections.length === 0) {
    return (
      <span className="text-sm text-gray-500 dark:text-gray-400 max-w-32 lg:max-w-48 truncate">
        {t('connected.to')} {currentConnection}
      </span>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors max-w-32 lg:max-w-48"
        title={`${t('connected.to')} ${currentConnection}`}
      >
        <span className="truncate">{currentConnection}</span>
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto z-50">
          {connections.map(connection => {
            const isActive = connection.id === currentConnectionId;
            const isSwitching = switchingConnection === connection.id;
            return (
              <div
                key={connection.id}
                className={`px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer border-b border-gray-100 dark:border-gray-600 last:border-b-0 ${
                  isActive ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                } ${isSwitching ? 'opacity-75' : ''}`}
                onClick={() => !isSwitching && handleConnectionSwitch(connection)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`font-medium text-sm truncate ${
                          isActive
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {connection.name}
                      </div>
                      {connection.isDefault && (
                        <Star className="w-3 h-3 text-yellow-500 fill-current flex-shrink-0" />
                      )}
                      {isSwitching && (
                        <Loader2 className="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0 animate-spin" />
                      )}
                      {isActive && !isSwitching && (
                        <Check className="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {connection.url?.startsWith('file:///')
                        ? connection.url.replace('file:///', '')
                        : connection.url?.startsWith('oss://')
                          ? `OSS: ${connection.username}`
                          : connection.url?.startsWith('huggingface://')
                            ? `HuggingFace: ${connection.url.replace('huggingface://', '')}`
                            : formatConnectionDisplayName(connection.url, connection.username) ||
                              ''}
                    </div>
                    {connection.lastConnected && (
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {t('last.connected')}: {formatLastConnected(connection.lastConnected)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
