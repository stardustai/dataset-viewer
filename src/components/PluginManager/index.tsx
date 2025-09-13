import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Download, Trash2, AlertCircle, Loader, RefreshCw, X } from 'lucide-react';
import { commands } from '../../types/tauri-commands';
import type { LocalPluginInfo } from '../../types/tauri-commands';
import { pluginManager } from '../../services/plugin/pluginManager';
import { showToast, showErrorToast } from '../../utils/clipboard';

interface PluginManagerProps {
  onClose: () => void;
}

interface PluginCardProps {
  plugin: LocalPluginInfo;
  isInstalled: boolean;
  onToggle: (pluginId: string, enabled: boolean) => void;
  onUninstall: (pluginId: string) => void;
  onInstall: (packageName: string) => void;
}

const PluginCard: React.FC<PluginCardProps> = ({
  plugin,
  isInstalled,
  onToggle,
  onUninstall,
  onInstall,
}) => {
  const { t } = useTranslation();
  const pluginId = plugin.id;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-lg flex-shrink-0">
            📦
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                {plugin.name}
              </h3>
              <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300 flex-shrink-0">
                v{plugin.version}
              </span>
              {plugin.official && (
                <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-1.5 py-0.5 rounded flex-shrink-0">
                  {t('plugin.status.official')}
                </span>
              )}
              {plugin.local && (
                <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-1.5 py-0.5 rounded flex-shrink-0">
                  {t('plugin.status.installed')}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
              {plugin.description}
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">作者: {plugin.author}</span>
              <span className="truncate">支持: {plugin.supported_extensions.join(', ')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
          {isInstalled ? (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onToggle(pluginId, !plugin.enabled)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  plugin.enabled
                    ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {plugin.enabled ? t('plugin.status.enabled') : t('plugin.status.disabled')}
              </button>
              <button
                onClick={() => onUninstall(pluginId)}
                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                title={t('plugin.action.uninstall')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                // 使用统一的包名格式
                const packageName = `@dataset-viewer/plugin-${plugin.id}`;
                onInstall(packageName);
              }}
              className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center space-x-1 text-sm"
            >
              <Download className="w-4 h-4" />
              <span>{t('plugin.action.install')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const PluginManager: React.FC<PluginManagerProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'installed' | 'available'>('installed');
  const [allPlugins, setAllPlugins] = useState<LocalPluginInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [customPackageName, setCustomPackageName] = useState('');

  // 加载插件数据
  useEffect(() => {
    loadPluginData();
  }, []);

  const loadPluginData = async () => {
    setLoading(true);
    try {
      console.log('正在加载插件数据...');
      const result = await commands.discoverPlugins();

      if (result.status === 'error') {
        console.error('Failed to discover plugins:', result.error);
        return;
      }

      console.log('发现的所有插件:', result.data);
      setAllPlugins(result.data);
    } catch (error) {
      console.error('Failed to load plugin data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 统一的刷新函数：数据 + 状态同步
  const refreshPluginData = async () => {
    setLoading(true);
    try {
      console.log('刷新插件数据并同步状态...');

      // 同步插件状态
      await pluginManager.syncPluginState();

      // 重新加载数据
      await loadPluginData();
    } catch (error) {
      console.error('Failed to refresh plugin data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 刷新插件数据（包含状态同步）
  const handleRefresh = async () => {
    await refreshPluginData();
  };

  // 获取已安装的插件
  const getInstalledPlugins = (): LocalPluginInfo[] => {
    return allPlugins.filter(plugin => plugin.local);
  };

  // 获取可用的插件（未安装的插件）
  const getAvailablePlugins = (): LocalPluginInfo[] => {
    return allPlugins.filter(plugin => !plugin.local);
  };

  // 安装/激活插件（统一接口）
  const handleInstallPlugin = async (packageName: string) => {
    try {
      console.log('Installing plugin:', packageName);

      // 调用统一的后端安装接口
      const result = await commands.installPlugin(packageName);
      console.log('Plugin installation result:', result);

      if (result.status === 'ok' && result.data.success) {
        console.log(
          `Plugin ${result.data.plugin_id} installed successfully from ${result.data.source}`
        );
        showToast(`插件 ${result.data.plugin_id} 安装成功`, 'success');

        // 重新加载插件列表（包含自动激活）
        await refreshPluginData();
      } else {
        const errorMsg = result.status === 'error' ? result.error : 'Unknown error';
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Failed to install plugin:', error);
      showErrorToast(`安装插件失败: ${error}`);
      throw error;
    }
  };

  // 卸载插件
  const handleUninstallPlugin = async (pluginId: string) => {
    try {
      console.log('Uninstalling plugin:', pluginId);

      // 调用后端卸载接口
      const result = await commands.uninstallPlugin(pluginId);

      if (result.status === 'ok' && result.data.success) {
        console.log(`Plugin ${pluginId} uninstalled successfully`);
        showToast(`插件 ${pluginId} 卸载成功`, 'success');
        await refreshPluginData();
      } else {
        const errorMsg = result.status === 'error' ? result.error : 'Unknown error';
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Failed to uninstall plugin:', error);
      showErrorToast(`卸载插件失败: ${error}`);
    }
  };

  // 切换插件启用状态
  const handleTogglePlugin = async (pluginId: string, enabled: boolean) => {
    try {
      console.log('Toggling plugin:', pluginId, 'to', enabled);

      if (enabled) {
        // 启用插件：调用 pluginManager 的激活方法（包含热加载）
        await pluginManager.activatePlugin(pluginId);
        showToast(`插件 ${pluginId} 启用成功`, 'success');
      } else {
        // 禁用插件：调用 pluginManager 的停用方法（包含热卸载）
        await pluginManager.deactivatePlugin(pluginId);
        showToast(`插件 ${pluginId} 禁用成功`, 'success');
      }

      // 重新加载数据
      await refreshPluginData();
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
      showErrorToast(`${enabled ? '启用' : '禁用'}插件失败: ${error}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <Package className="w-5 h-5 text-blue-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('plugin.manager.title')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('plugin.description')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 标签页 */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            <button
              onClick={() => setActiveTab('installed')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'installed'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {t('plugin.manager.installed')} ({getInstalledPlugins().length})
            </button>
            <button
              onClick={() => {
                setActiveTab('available');
                // 切换到插件市场时刷新插件列表
                handleRefresh();
              }}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'available'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {t('plugin.manager.available')}
            </button>
          </div>

          <button
            onClick={handleRefresh}
            className="mr-6 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
            title={t('plugin.action.refresh')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* 操作栏 */}
        {activeTab === 'available' && (
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <input
                type="text"
                placeholder={t('plugin.manager.custom.placeholder')}
                value={customPackageName}
                onChange={e => setCustomPackageName(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              <button
                onClick={() => handleInstallPlugin(customPackageName)}
                disabled={!customPackageName.trim()}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2 text-sm"
              >
                <Download className="w-4 h-4" />
                <span>{t('plugin.action.install')}</span>
              </button>
            </div>
          </div>
        )}

        {/* 内容区域 */}
        <div className="flex-1 p-5 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-600 dark:text-gray-400">{t('plugin.loading')}</span>
            </div>
          ) : activeTab === 'installed' ? (
            <div className="space-y-3">
              {getInstalledPlugins().length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">{t('plugin.empty.installed')}</p>
                </div>
              ) : (
                getInstalledPlugins().map(plugin => (
                  <PluginCard
                    key={`${plugin.id}-${plugin.local}-${plugin.enabled}`}
                    plugin={plugin}
                    isInstalled={true}
                    onToggle={handleTogglePlugin}
                    onUninstall={handleUninstallPlugin}
                    onInstall={handleInstallPlugin}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {getAvailablePlugins().length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">{t('plugin.empty.available')}</p>
                </div>
              ) : (
                getAvailablePlugins().map(plugin => (
                  <PluginCard
                    key={`${plugin.id}-${plugin.local}-${plugin.enabled}`}
                    plugin={plugin}
                    isInstalled={getInstalledPlugins().some(p => p.id === plugin.id)}
                    onToggle={handleTogglePlugin}
                    onUninstall={handleUninstallPlugin}
                    onInstall={handleInstallPlugin}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800 rounded-b-lg border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4" />
              <span>{t('plugin.security.notice')}</span>
            </div>
            <div className="text-xs">
              {t('plugin.naming.convention')}{' '}
              <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                @dataset-viewer/plugin-*
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
