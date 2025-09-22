import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Trash2, Edit2, Star, StarOff } from 'lucide-react';
import { StoredConnection, connectionStorage } from '../../services/connectionStorage';
import { useConnectionManager } from '../../hooks/useStorage';
import { formatConnectionDisplayName } from '../../utils/urlUtils';

interface UndoToastProps {
  deletedConnection: StoredConnection;
  onUndo: () => void;
}

const UndoToast: React.FC<UndoToastProps> = ({ deletedConnection, onUndo }) => {
  const { t } = useTranslation();

  return (
    <>
      <style>{`
        @keyframes undoProgress {
          0% {
            transform: scaleX(1);
          }
          100% {
            transform: scaleX(0);
          }
        }
        .undo-toast-bg {
          background: rgb(31 41 55 / 0.9);
        }
        .undo-toast-progress {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgb(79 70 229 / 0.9);
          transform-origin: left;
          animation: undoProgress 3s linear forwards;
        }
      `}</style>

      <div
        className="fixed bottom-4 right-4 text-white rounded-lg shadow-2xl overflow-hidden undo-toast-bg"
        style={{ zIndex: 9999 }}
      >
        {/* 进度条 */}
        <div className="undo-toast-progress" />

        {/* 内容 */}
        <div className="p-4 flex items-center space-x-3 relative z-10">
          <span className="text-sm">
            {t('deleted')}: {deletedConnection.name}
          </span>
          <button
            onClick={onUndo}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-sm rounded transition-colors"
          >
            {t('undo')}
          </button>
        </div>
      </div>
    </>
  );
};

interface ConnectionSelectorProps {
  onSelect: (connection: StoredConnection) => void;
  selectedConnection?: StoredConnection | null;
}

export const ConnectionSelector: React.FC<ConnectionSelectorProps> = ({
  onSelect,
  selectedConnection,
}) => {
  const { t } = useTranslation();

  // 使用新的 Zustand hook
  const { connections, loadConnections, removeConnection, updateConnection, setDefaultConnection } =
    useConnectionManager();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletedConnection, setDeletedConnection] = useState<StoredConnection | null>(null);
  const [undoTimer, setUndoTimer] = useState<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 加载连接列表（仅在组件挂载时）
  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // 点击外部区域关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // 如果正在编辑，也取消编辑状态
        if (editingId) {
          handleCancelEdit();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, editingId]);

  // 组件卸载时清理计时器
  useEffect(() => {
    return () => {
      if (undoTimer) {
        clearTimeout(undoTimer);
      }
    };
  }, [undoTimer]);

  const handleDelete = (connection: StoredConnection, e: React.MouseEvent) => {
    e.stopPropagation();

    // 清除之前的撤销计时器
    if (undoTimer) {
      clearTimeout(undoTimer);
    }

    // 立即删除连接
    removeConnection(connection.id);
    setDeletedConnection(connection);

    // 设置3秒后的自动清理（稍晚一点让动画完成）
    const timer = setTimeout(() => {
      setDeletedConnection(null);
    }, 3100);
    setUndoTimer(timer);
  };

  const handleUndoDelete = () => {
    if (deletedConnection && undoTimer) {
      // 恢复连接
      connectionStorage.restoreConnection(deletedConnection);

      // 清理状态
      clearTimeout(undoTimer);
      setDeletedConnection(null);
      setUndoTimer(null);

      // 重新加载连接列表
      loadConnections();
    }
  };

  const handleSetDefault = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDefaultConnection(id);
  };

  const handleEdit = (connection: StoredConnection, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(connection.id);
    setEditName(connection.name);
  };

  const handleSaveEdit = (id: string) => {
    if (editName.trim()) {
      // 使用 updateConnection 方法来重命名
      updateConnection(id, { name: editName.trim() });
    }
    setEditingId(null);
    setEditName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
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

  if (connections.length === 0) {
    return (
      <>
        <div className="p-4 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-sm">{t('no.saved.connections')}</div>
          <div className="text-xs mt-1">{t('save.connection.hint')}</div>
        </div>

        {/* 撤销删除提示 - 即使没有连接时也要显示 */}
        {deletedConnection && (
          <UndoToast deletedConnection={deletedConnection} onUndo={handleUndoDelete} />
        )}
      </>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <span className="truncate">
          {selectedConnection ? selectedConnection.name : t('connection.select.saved')}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
          {connections.map(connection => (
            <div
              key={connection.id}
              className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer border-b border-gray-100 dark:border-gray-600 last:border-b-0"
              onClick={e => {
                e.preventDefault(); // 防止触发表单提交
                e.stopPropagation(); // 防止事件冒泡
                onSelect(connection);
                setIsOpen(false);
              }}
            >
              {editingId === connection.id ? (
                <div className="flex items-center space-x-2" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        handleSaveEdit(connection.id);
                      } else if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(connection.id)}
                    className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    {t('save')}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                  >
                    {t('cancel')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                        {connection.name}
                      </div>
                      {connection.isDefault && (
                        <Star className="w-3 h-3 text-yellow-500 fill-current flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {formatConnectionDisplayName(connection.config)}
                    </div>
                    {connection.lastConnected && (
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {t('last.connected')}: {formatLastConnected(connection.lastConnected)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-1 ml-2">
                    <button
                      type="button"
                      onClick={e => handleSetDefault(connection.id, e)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      title={connection.isDefault ? t('unset.default') : t('set.default')}
                    >
                      {connection.isDefault ? (
                        <StarOff className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <Star className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={e => handleEdit(connection, e)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      title={t('rename')}
                    >
                      <Edit2 className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                    </button>
                    <button
                      type="button"
                      onClick={e => handleDelete(connection, e)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      title={t('delete')}
                    >
                      <Trash2 className="w-3 h-3 text-red-400 dark:text-red-500" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 撤销删除提示 */}
      {deletedConnection && (
        <UndoToast deletedConnection={deletedConnection} onUndo={handleUndoDelete} />
      )}
    </div>
  );
};
