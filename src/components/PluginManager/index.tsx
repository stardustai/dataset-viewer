import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Package,
  Download,
  AlertCircle,
  Loader,
  RefreshCw,
  X,
  ArrowUp,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import * as semver from 'semver';
import { commands } from '../../types/tauri-commands';
import type {
  LocalPluginInfo,
  PluginVersionInfo,
  PluginInstallOptions,
} from '../../types/tauri-commands';
import { pluginManager } from '../../services/plugin/pluginManager';
import { showToast, showErrorToast } from '../../utils/clipboard';

interface PluginManagerProps {
  onClose: () => void;
}

interface ExtendedPluginInfo extends LocalPluginInfo {
  updateInfo?: PluginVersionInfo;
  isUpdating?: boolean;
  isInstalling?: boolean;
}

interface PluginCardProps {
  plugin: ExtendedPluginInfo;
  isInstalled: boolean;
  onToggle: (pluginId: string, enabled: boolean) => void;
  onInstall: (packageName: string, options?: PluginInstallOptions) => void;
  onUpdate: (pluginId: string) => void;
  onUninstall: (pluginId: string) => void;
  onCheckUpdate: (pluginId: string) => void;
}

const PluginCard: React.FC<PluginCardProps> = ({
  plugin,
  isInstalled,
  onToggle,
  onInstall,
  onUpdate,
  onUninstall,
  onCheckUpdate,
}) => {
  const { t } = useTranslation();
  const pluginId = plugin.id;
  const [showDropdown, setShowDropdown] = useState(false);

  // 根据插件来源决定是否显示删除按钮
  const canDelete = plugin.source === 'npm-registry' || plugin.source === 'local-cache';
  const hasUpdate = plugin.updateInfo
    ? semver.gt(plugin.updateInfo.latest, plugin.updateInfo.current)
    : false;
  const isUpdating = plugin.isUpdating || false;
  const isInstalling = plugin.isInstalling || false;

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
              {/* 状态指示器 */}
              {plugin.local && (
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    plugin.enabled ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-500'
                  }`}
                  title={
                    plugin.enabled
                      ? t('plugin.status.enabled_tooltip')
                      : t('plugin.status.disabled_tooltip')
                  }
                />
              )}

              {/* 版本信息 */}
              <div className="flex items-center space-x-1">
                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300 flex-shrink-0">
                  v{plugin.version}
                </span>

                {/* 更新提示 */}
                {hasUpdate && (
                  <div className="flex items-center space-x-1">
                    <ArrowUp className="w-3 h-3 text-blue-500" />
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      v{plugin.updateInfo?.latest}
                    </span>
                  </div>
                )}
              </div>

              {/* 标签 */}
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

              {/* 插件来源标识 */}
              {plugin.source === 'npm-link' && (
                <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 px-1.5 py-0.5 rounded flex-shrink-0">
                  {t('plugin.source.dev')}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
              {plugin.description}
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">{t('plugin.info.author', { author: plugin.author })}</span>
              <span className="truncate">
                {t('plugin.info.supports', { extensions: plugin.supported_extensions.join(', ') })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
          {isInstalled ? (
            <>
              {/* 更新按钮 */}
              {hasUpdate && !isUpdating && (
                <button
                  onClick={() => onUpdate(pluginId)}
                  className="px-3 py-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded text-sm font-medium transition-colors flex items-center space-x-1"
                  title={t('plugin.action.update')}
                >
                  <ArrowUp className="w-3 h-3" />
                  <span>{t('plugin.button.update')}</span>
                </button>
              )}

              {/* 更新中状态 */}
              {isUpdating && (
                <div className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded text-sm font-medium flex items-center space-x-1">
                  <Loader className="w-3 h-3 animate-spin" />
                  <span>{t('plugin.button.updating')}</span>
                </div>
              )}

              {/* 启用/禁用按钮 */}
              <button
                onClick={() => onToggle(pluginId, !plugin.enabled)}
                disabled={isUpdating}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  plugin.enabled
                    ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900 dark:text-orange-200'
                    : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200'
                } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {plugin.enabled ? t('plugin.action.disable') : t('plugin.action.enable')}
              </button>

              {/* 更多操作菜单 */}
              <div className="relative">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showDropdown && (
                  <div className="absolute right-0 top-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-32">
                    <button
                      onClick={() => {
                        onCheckUpdate(pluginId);
                        setShowDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>{t('plugin.button.check_update')}</span>
                    </button>

                    {canDelete && (
                      <button
                        onClick={() => {
                          onUninstall(pluginId);
                          setShowDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{t('plugin.button.uninstall')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={() => {
                const packageName = `@dataset-viewer/plugin-${plugin.id}`;
                onInstall(packageName);
              }}
              disabled={isInstalling}
              className={`px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center space-x-1 text-sm ${
                isInstalling ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isInstalling ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>{t('plugin.button.installing')}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>{t('plugin.action.install')}</span>
                </>
              )}
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
  const [installedPlugins, setInstalledPlugins] = useState<ExtendedPluginInfo[]>([]);
  const [availablePlugins, setAvailablePlugins] = useState<ExtendedPluginInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载插件数据
  useEffect(() => {
    loadPluginData();
  }, [activeTab]); // 当标签页切换时重新加载数据

  const loadPluginData = async () => {
    setLoading(true);
    try {
      console.log('正在加载插件数据...');

      if (activeTab === 'installed') {
        // 加载已安装插件
        const result = await commands.pluginDiscover(false); // 不包含npm仓库

        if (result.status === 'error') {
          console.error('Failed to discover installed plugins:', result.error);
          return;
        }

        const extendedPlugins: ExtendedPluginInfo[] = result.data.map(plugin => ({
          ...plugin,
          updateInfo: undefined,
          isUpdating: false,
          isInstalling: false,
        }));

        console.log('加载的已安装插件:', extendedPlugins);
        setInstalledPlugins(extendedPlugins);
      } else {
        // 加载插件市场数据时，需要同时获取已安装插件列表用于比较
        const [installedResult, availableResult] = await Promise.all([
          commands.pluginDiscover(false), // 已安装插件
          commands.pluginDiscover(true), // npm仓库插件
        ]);

        if (installedResult.status === 'error' || availableResult.status === 'error') {
          console.error('Failed to discover plugins:');
          if (installedResult.status === 'error') {
            console.error('Installed plugins error:', installedResult.error);
          }
          if (availableResult.status === 'error') {
            console.error('Available plugins error:', availableResult.error);
          }
          return;
        }

        // 更新已安装插件列表
        const installedList: ExtendedPluginInfo[] = installedResult.data.map(plugin => ({
          ...plugin,
          updateInfo: undefined,
          isUpdating: false,
          isInstalling: false,
        }));
        setInstalledPlugins(installedList);

        // 更新可用插件列表，并合并已安装插件的状态信息
        const availableList: ExtendedPluginInfo[] = availableResult.data.map(plugin => {
          // 查找对应的已安装插件以获取状态信息
          const installedPlugin = installedList.find(p => p.id === plugin.id);

          return {
            ...plugin,
            // 如果插件已安装，使用已安装插件的状态信息
            local: installedPlugin?.local || plugin.local,
            enabled: installedPlugin?.enabled || plugin.enabled,
            updateInfo: undefined,
            isUpdating: false,
            isInstalling: false,
          };
        });

        console.log('加载的已安装插件:', installedList);
        console.log('加载的可用插件:', availableList);
        setAvailablePlugins(availableList);
      }
    } catch (error) {
      console.error('Failed to load plugin data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 统一的刷新函数：数据 + 状态同步（仅在必要时使用）
  const refreshPluginData = async () => {
    setLoading(true);
    try {
      console.log('执行全量刷新插件数据...');

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

  // 检查单个插件更新
  const handleCheckUpdate = async (pluginId: string) => {
    try {
      const result = await commands.pluginCheckUpdates(pluginId);
      if (result.status === 'ok') {
        // 优化：只更新特定插件的更新信息，而不是全量刷新
        setInstalledPlugins(prev =>
          prev.map(plugin =>
            plugin.id === pluginId ? { ...plugin, updateInfo: result.data } : plugin
          )
        );

        if (semver.gt(result.data.latest, result.data.current)) {
          showToast(
            t('plugin.check_update.success', { pluginId, latestVersion: result.data.latest }),
            'success'
          );
        } else {
          showToast(t('plugin.check_update.up_to_date', { pluginId }), 'info');
        }
      }
    } catch (error) {
      console.error('Failed to check update:', error);
      showErrorToast(t('plugin.check_update.failed', { error: String(error) }));
    }
  };

  // 更新插件
  const handleUpdatePlugin = async (pluginId: string) => {
    try {
      // 设置更新状态（优化：只更新特定插件状态）
      const updatePluginUpdateState = (plugins: ExtendedPluginInfo[], isUpdating: boolean) =>
        plugins.map(plugin => (plugin.id === pluginId ? { ...plugin, isUpdating } : plugin));

      setInstalledPlugins(prev => updatePluginUpdateState(prev, true));

      const result = await commands.pluginUpdate(pluginId);

      if (result.status === 'ok' && result.data.success) {
        showToast(
          t('plugin.update.success_detail', {
            pluginId,
            oldVersion: result.data.old_version,
            newVersion: result.data.new_version,
          }),
          'success'
        );

        // 优化：只更新必要的插件信息，而不是全量刷新
        setInstalledPlugins(prev =>
          prev.map(plugin =>
            plugin.id === pluginId
              ? {
                  ...plugin,
                  version: result.data.new_version,
                  isUpdating: false,
                  updateInfo: undefined, // 清除更新信息
                }
              : plugin
          )
        );
      } else {
        throw new Error(result.status === 'error' ? result.error : 'Update failed');
      }
    } catch (error) {
      console.error('Failed to update plugin:', error);
      showErrorToast(t('plugin.update.failed_detail', { error: String(error) }));

      // 清除更新状态
      setInstalledPlugins(prev =>
        prev.map(plugin => (plugin.id === pluginId ? { ...plugin, isUpdating: false } : plugin))
      );
    }
  };

  // 刷新插件数据（包含状态同步） - 优化：减少使用频率
  const handleRefresh = async () => {
    console.log('用户手动刷新插件列表');
    await refreshPluginData();
  };

  // 安装/激活插件（统一接口）
  const handleInstallPlugin = async (packageName: string, options?: PluginInstallOptions) => {
    const pluginId = packageName.replace('@dataset-viewer/plugin-', '');

    try {
      // 设置安装状态 - 优化：只更新特定插件的状态
      const updatePluginInstallState = (plugins: ExtendedPluginInfo[], isInstalling: boolean) =>
        plugins.map(plugin => (plugin.id === pluginId ? { ...plugin, isInstalling } : plugin));

      setAvailablePlugins(prev => updatePluginInstallState(prev, true));

      console.log('Installing plugin:', packageName, options);

      // 构建统一的安装请求
      const installRequest = {
        source: { Registry: { package_name: packageName } },
        options: options || null,
      };

      // 调用统一的后端安装接口
      const result = await commands.pluginInstall(installRequest);

      console.log('Plugin installation result:', result);

      if (result.status === 'ok' && result.data.success) {
        console.log(
          `Plugin ${result.data.plugin_id} installed successfully from ${result.data.source}`
        );

        // 优化：直接更新状态而不是全量刷新
        const newPluginInfo: ExtendedPluginInfo = {
          id: result.data.plugin_id,
          name:
            result.data.plugin_id
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ') + ' Viewer',
          version: result.data.version,
          description: 'Installed plugin',
          author: 'Unknown',
          supported_extensions: [],
          official: true,
          keywords: [],
          local: true,
          local_path: result.data.install_path,
          enabled: true, // 新安装的插件通常会自动启用
          entry_path: null,
          source: result.data.source,
          isInstalling: false,
        };

        // 添加到已安装插件列表
        setInstalledPlugins(prev => [...prev, newPluginInfo]);

        // 更新可用插件列表中的状态
        setAvailablePlugins(prev =>
          prev.map(plugin =>
            plugin.id === pluginId
              ? { ...plugin, local: true, enabled: true, isInstalling: false }
              : plugin
          )
        );

        // 关键修复：安装成功后立即加载插件到前端，实现热加载
        try {
          // 获取刚安装的插件信息，包含入口路径
          const pluginsResult = await commands.pluginDiscover(false);
          if (pluginsResult.status === 'ok') {
            const installedPlugin = pluginsResult.data.find(
              (p: any) => p.id === pluginId && p.enabled
            );
            if (installedPlugin?.entry_path) {
              // 直接加载插件，无需重复调用后端启用接口
              await pluginManager.loadPluginDirect(installedPlugin.id, installedPlugin.entry_path);
              console.log('Plugin hot-loaded successfully after installation');
              showToast(`插件 ${result.data.plugin_id} 已安装并激活`, 'success');
            } else {
              throw new Error('Plugin not found or missing entry path');
            }
          } else {
            throw new Error('Failed to get plugin info');
          }
        } catch (loadError) {
          console.warn('Failed to hot-load plugin after installation:', loadError);
          // 热加载失败，建议用户重新启动或手动启用
          showToast(`插件 ${result.data.plugin_id} 安装成功，请刷新页面或手动启用`, 'info');
        }
      } else {
        const errorMsg = result.status === 'error' ? result.error : 'Unknown error';
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Failed to install plugin:', error);
      showErrorToast(`安装插件失败: ${error}`);
      throw error;
    } finally {
      // 确保清除安装状态
      setAvailablePlugins(prev =>
        prev.map(plugin => (plugin.id === pluginId ? { ...plugin, isInstalling: false } : plugin))
      );
    }
  };

  // 切换插件启用状态
  const handleTogglePlugin = async (pluginId: string, enabled: boolean) => {
    try {
      console.log('Toggling plugin:', pluginId, 'to', enabled);

      if (enabled) {
        // 启用插件：调用 pluginManager 的激活方法（包含热加载）
        await pluginManager.activatePlugin(pluginId);
        showToast(t('plugin.enable.success', { pluginId }), 'success');
      } else {
        // 禁用插件：调用 pluginManager 的停用方法（包含热卸载）
        await pluginManager.deactivatePlugin(pluginId);
        showToast(t('plugin.disable.success', { pluginId }), 'success');
      }

      // 优化：直接更新前端状态，避免重新获取数据
      const updatePluginState = (plugins: ExtendedPluginInfo[]) =>
        plugins.map(plugin => (plugin.id === pluginId ? { ...plugin, enabled } : plugin));

      setInstalledPlugins(prev => updatePluginState(prev));

      // 如果当前在插件市场标签页，也需要更新可用插件列表
      if (activeTab === 'available') {
        setAvailablePlugins(prev => updatePluginState(prev));
      }
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
      showErrorToast(
        enabled
          ? t('plugin.enable.failed', { error: String(error) })
          : t('plugin.disable.failed', { error: String(error) })
      );
    }
  };

  // 卸载插件
  const handleUninstallPlugin = async (pluginId: string) => {
    try {
      console.log('Uninstalling plugin:', pluginId);

      const result = await commands.pluginUninstall(pluginId);
      console.log('Plugin uninstall result:', result);

      if (result.status === 'ok' && result.data.success) {
        console.log(`Plugin ${result.data.plugin_id} uninstalled: ${result.data.message}`);
        showToast(t('plugin.uninstall.success', { pluginId: result.data.plugin_id }), 'success');

        // 优化：直接从状态中移除卸载的插件，避免全量刷新
        setInstalledPlugins(prev => prev.filter(plugin => plugin.id !== pluginId));

        // 如果在可用插件列表中，更新其状态为未安装
        if (activeTab === 'available') {
          setAvailablePlugins(prev =>
            prev.map(plugin =>
              plugin.id === pluginId ? { ...plugin, local: false, enabled: false } : plugin
            )
          );
        }
      } else {
        const errorMsg = result.status === 'error' ? result.error : 'Unknown error';
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Failed to uninstall plugin:', error);
      showErrorToast(t('plugin.uninstall.failed', { error: String(error) }));
    }
  };

  // 统计信息
  const hasUpdates = installedPlugins.some(plugin =>
    plugin.updateInfo ? semver.gt(plugin.updateInfo.latest, plugin.updateInfo.current) : false
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
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
          <div className="flex items-center">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 标签页 */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            <button
              onClick={() => setActiveTab('installed')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                activeTab === 'installed'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <span className="relative">
                {t('plugin.manager.installed')}
                {hasUpdates && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></div>
                )}
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTab('available');
                // 不需要手动刷新，useEffect会自动处理
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
            disabled={loading}
            className="mr-6 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
            title={t('plugin.action.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 p-5 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-600 dark:text-gray-400">{t('plugin.loading')}</span>
            </div>
          ) : activeTab === 'installed' ? (
            <div className="space-y-3">
              {installedPlugins.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{t('plugin.empty.installed')}</p>
                </div>
              ) : (
                installedPlugins.map(plugin => (
                  <PluginCard
                    key={`${plugin.id}-${plugin.local}-${plugin.enabled}`}
                    plugin={plugin}
                    isInstalled={true}
                    onToggle={handleTogglePlugin}
                    onInstall={handleInstallPlugin}
                    onUpdate={handleUpdatePlugin}
                    onUninstall={handleUninstallPlugin}
                    onCheckUpdate={handleCheckUpdate}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {availablePlugins.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{t('plugin.empty.available')}</p>
                </div>
              ) : (
                availablePlugins.map(plugin => (
                  <PluginCard
                    key={`${plugin.id}-${plugin.local}-${plugin.enabled}`}
                    plugin={plugin}
                    isInstalled={installedPlugins.some(p => p.id === plugin.id)}
                    onToggle={handleTogglePlugin}
                    onInstall={handleInstallPlugin}
                    onUpdate={handleUpdatePlugin}
                    onUninstall={handleUninstallPlugin}
                    onCheckUpdate={handleCheckUpdate}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800 rounded-b-lg border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4" />
                <span>{t('plugin.security.notice')}</span>
              </div>
              {hasUpdates && (
                <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400">
                  <ArrowUp className="w-4 h-4" />
                  <span>{t('plugin.updates.available')}</span>
                </div>
              )}
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
