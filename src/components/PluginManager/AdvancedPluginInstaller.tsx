import React, { useState, useEffect } from 'react';
import {
  Package,
  Download,
  AlertCircle,
  ExternalLink,
  Folder,
  Link as LinkIcon,
  Check,
  X,
  HelpCircle,
  Search,
} from 'lucide-react';
import { pluginManager } from '../../services/plugin/pluginManager';
import { PluginInstallInfo } from '../../types/plugin';

interface PluginInstallerProps {
  onInstallComplete?: (pluginId: string) => void;
  onError?: (error: string) => void;
}

type InstallSource = 'search' | 'npm' | 'local' | 'url';

/**
 * 高级插件安装组件
 */
export const PluginInstaller: React.FC<PluginInstallerProps> = ({ onInstallComplete, onError }) => {
  const [source, setSource] = useState<InstallSource>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [packageName, setPackageName] = useState('');
  const [version, setVersion] = useState('latest');
  const [localPath, setLocalPath] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<PluginInstallInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    npm: boolean | null;
    local: boolean | null;
  }>({ npm: null, local: null });

  /**
   * 搜索插件
   */
  const searchPlugins = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // 获取所有插件然后进行搜索过滤
      const allPlugins = await pluginManager.getAllPlugins();
      const filteredPlugins = allPlugins.filter(
        (plugin: any) =>
          plugin.metadata.name.toLowerCase().includes(query.toLowerCase()) ||
          plugin.metadata.description.toLowerCase().includes(query.toLowerCase()) ||
          (plugin.metadata.author &&
            plugin.metadata.author.toLowerCase().includes(query.toLowerCase()))
      );
      setSearchResults(filteredPlugins);
    } catch (error) {
      console.error('Failed to search plugins:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  /**
   * 防抖搜索
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (source === 'search') {
        searchPlugins(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, source]);

  /**
   * 验证NPM包名
   */
  const validateNpmPackage = async (name: string) => {
    if (!name.trim()) {
      setValidationStatus(prev => ({ ...prev, npm: null }));
      return;
    }

    try {
      // 自动添加前缀
      const fullPackageName = name.startsWith('@dataset-viewer/plugin-')
        ? name
        : `@dataset-viewer/plugin-${name}`;

      const response = await fetch(`https://registry.npmjs.org/${fullPackageName}`);
      setValidationStatus(prev => ({ ...prev, npm: response.ok }));

      if (response.ok) {
        setPackageName(fullPackageName);
      }
    } catch (error) {
      setValidationStatus(prev => ({ ...prev, npm: false }));
    }
  };

  /**
   * 验证本地路径
   */
  const validateLocalPath = async (path: string) => {
    if (!path.trim()) {
      setValidationStatus(prev => ({ ...prev, local: null }));
      return;
    }

    try {
      const { invoke } = (window as any).__TAURI__.tauri;
      const result = await invoke('validate_plugin_path', { path });
      setValidationStatus(prev => ({ ...prev, local: !!result }));
    } catch (error) {
      setValidationStatus(prev => ({ ...prev, local: false }));
    }
  };

  /**
   * 防抖验证
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (source === 'npm') {
        validateNpmPackage(packageName);
      } else if (source === 'local') {
        validateLocalPath(localPath);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [packageName, localPath, source]);

  /**
   * 安装插件
   */
  const handleInstall = async (pluginSource?: string, pluginType?: 'npm' | 'local' | 'url') => {
    if (isInstalling) return;

    setError(null);
    setIsInstalling(true);
    setInstallProgress(null);

    try {
      let sourcePath: string;
      let type: 'npm' | 'local' | 'url';

      if (pluginSource && pluginType) {
        // 从搜索结果安装
        sourcePath = pluginSource;
        type = pluginType;
      } else {
        // 从表单安装
        switch (source) {
          case 'npm':
            if (!packageName.trim()) {
              throw new Error('请输入包名');
            }
            sourcePath =
              version === 'latest' ? packageName.trim() : `${packageName.trim()}@${version}`;
            type = 'npm';
            break;
          case 'local':
            if (!localPath.trim()) {
              throw new Error('请输入本地路径');
            }
            sourcePath = localPath.trim();
            type = 'local';
            break;
          case 'url':
            if (!remoteUrl.trim()) {
              throw new Error('请输入URL地址');
            }
            try {
              new URL(remoteUrl.trim());
            } catch {
              throw new Error('请输入有效的URL地址');
            }
            sourcePath = remoteUrl.trim();
            type = 'url';
            break;
          default:
            throw new Error('请选择安装方式');
        }
      }

      const pluginId = `${type}:${sourcePath}`;

      // 简化安装过程，直接调用安装方法
      setInstallProgress({
        pluginId: pluginId || 'unknown',
        status: 'installing',
        progress: 50,
        source: type as 'local' | 'url',
        sourcePath,
      });

      await pluginManager.installPlugin(type as 'local' | 'url', sourcePath);

      // 设置完成状态
      setInstallProgress({
        pluginId: pluginId || 'unknown',
        status: 'installed',
        progress: 100,
        source: type as 'local' | 'url',
        sourcePath,
      });

      onInstallComplete?.(pluginId || 'unknown');

      // 重置表单
      setPackageName('');
      setVersion('latest');
      setLocalPath('');
      setRemoteUrl('');
      setSearchQuery('');
      setInstallProgress(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsInstalling(false);
    }
  };

  /**
   * 检测npm link插件
   */
  const detectNpmLinkPlugins = async () => {
    try {
      const { invoke } = (window as any).__TAURI__.tauri;
      const linkedPlugins = await invoke('get_npm_linked_plugins');

      if (linkedPlugins.length === 0) {
        alert('未检测到npm link的插件');
        return;
      }

      // 显示检测到的插件
      const pluginList = linkedPlugins.map((p: any) => `${p.name} (${p.local_path})`).join('\n');
      const useFirst = confirm(`检测到以下npm link插件:\n\n${pluginList}\n\n是否使用第一个插件?`);

      if (useFirst && linkedPlugins[0]) {
        setSource('local');
        setLocalPath(linkedPlugins[0].local_path);
      }
    } catch (error) {
      console.warn('Failed to detect npm link plugins:', error);
    }
  };

  const renderSourceSelector = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <button
        onClick={() => setSource('search')}
        className={`flex flex-col items-center space-y-2 p-3 rounded-lg border transition-colors ${
          source === 'search'
            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
            : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
        }`}
      >
        <Search size={20} />
        <span className="text-sm">搜索插件</span>
      </button>
      <button
        onClick={() => setSource('npm')}
        className={`flex flex-col items-center space-y-2 p-3 rounded-lg border transition-colors ${
          source === 'npm'
            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
            : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
        }`}
      >
        <Package size={20} />
        <span className="text-sm">NPM包</span>
      </button>
      <button
        onClick={() => setSource('local')}
        className={`flex flex-col items-center space-y-2 p-3 rounded-lg border transition-colors ${
          source === 'local'
            ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
            : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
        }`}
      >
        <Folder size={20} />
        <span className="text-sm">本地路径</span>
      </button>
      <button
        onClick={() => setSource('url')}
        className={`flex flex-col items-center space-y-2 p-3 rounded-lg border transition-colors ${
          source === 'url'
            ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300'
            : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
        }`}
      >
        <ExternalLink size={20} />
        <span className="text-sm">远程URL</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 安装源选择 */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">安装方式</label>
        {renderSourceSelector()}
      </div>

      {/* 搜索插件 */}
      {source === 'search' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              搜索插件
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="输入插件名称、功能或文件格式..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                disabled={isInstalling}
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>
          </div>

          {/* 搜索结果 */}
          <div className="max-h-64 overflow-y-auto space-y-2">
            {searchResults.map(plugin => (
              <div
                key={plugin.id}
                className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-medium text-gray-900 dark:text-white">{plugin.name}</h4>
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      v{plugin.version}
                    </span>
                    {plugin.official && (
                      <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-1 rounded">
                        官方
                      </span>
                    )}
                    {plugin.local && (
                      <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-1 rounded">
                        本地
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {plugin.description}
                  </p>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    支持: {(plugin.supportedExtensions || []).join(', ')}
                  </div>
                </div>
                <button
                  onClick={() =>
                    handleInstall(
                      plugin.npmPackage || plugin.localPath || plugin.id,
                      plugin.local ? 'local' : 'npm'
                    )
                  }
                  disabled={isInstalling}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-1"
                >
                  <Download size={14} />
                  <span>安装</span>
                </button>
              </div>
            ))}

            {searchQuery && !isSearching && searchResults.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Package size={32} className="mx-auto mb-2 opacity-50" />
                <p>未找到匹配的插件</p>
                <p className="text-sm">尝试其他关键词或使用其他安装方式</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NPM包安装 */}
      {source === 'npm' && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                包名
              </label>
              <div className="flex items-center space-x-1">
                {validationStatus.npm === true && <Check size={16} className="text-green-500" />}
                {validationStatus.npm === false && <X size={16} className="text-red-500" />}
              </div>
            </div>
            <input
              type="text"
              value={packageName}
              onChange={e => setPackageName(e.target.value)}
              placeholder="cad 或 @dataset-viewer/plugin-cad"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              disabled={isInstalling}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              支持简写（如: cad）或完整包名（@dataset-viewer/plugin-cad）
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              版本
            </label>
            <input
              type="text"
              value={version}
              onChange={e => setVersion(e.target.value)}
              placeholder="latest"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              disabled={isInstalling}
            />
          </div>
        </div>
      )}

      {/* 本地路径安装 */}
      {source === 'local' && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                本地路径
              </label>
              <div className="flex items-center space-x-2">
                {validationStatus.local === true && <Check size={16} className="text-green-500" />}
                {validationStatus.local === false && <X size={16} className="text-red-500" />}
                <button
                  onClick={detectNpmLinkPlugins}
                  className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <LinkIcon size={14} />
                  <span>检测npm link</span>
                </button>
              </div>
            </div>
            <input
              type="text"
              value={localPath}
              onChange={e => setLocalPath(e.target.value)}
              placeholder="/path/to/plugin 或 ./relative/path"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              disabled={isInstalling}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              支持绝对路径和相对路径，用于开发和调试
            </p>
          </div>
        </div>
      )}

      {/* URL安装 */}
      {source === 'url' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            远程URL
          </label>
          <input
            type="url"
            value={remoteUrl}
            onChange={e => setRemoteUrl(e.target.value)}
            placeholder="https://unpkg.com/@dataset-viewer/plugin-cad@latest/dist/index.js"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            disabled={isInstalling}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            直接从URL加载插件，支持unpkg、jsDelivr等CDN
          </p>
        </div>
      )}

      {/* 安装进度 */}
      {installProgress && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              {installProgress.status === 'installing' && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              )}
              {installProgress.status === 'installed' && (
                <Check className="text-green-600 dark:text-green-400" size={20} />
              )}
              {installProgress.status === 'failed' && (
                <X className="text-red-600 dark:text-red-400" size={20} />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {installProgress.status === 'installing' && '正在安装...'}
                {installProgress.status === 'installed' && '安装成功'}
                {installProgress.status === 'failed' && '安装失败'}
              </p>
              {installProgress.progress !== undefined && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${installProgress.progress}%` }}
                  />
                </div>
              )}
              {installProgress.error && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  {installProgress.error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={20} />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* 安装按钮 */}
      {source !== 'search' && (
        <div className="flex justify-end">
          <button
            onClick={() => handleInstall()}
            disabled={
              isInstalling ||
              (source === 'npm' && !packageName.trim()) ||
              (source === 'local' && !localPath.trim()) ||
              (source === 'url' && !remoteUrl.trim())
            }
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={16} />
            <span>{isInstalling ? '安装中...' : '安装插件'}</span>
          </button>
        </div>
      )}

      {/* 帮助信息 */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-start space-x-2">
          <HelpCircle className="text-gray-500 dark:text-gray-400 flex-shrink-0" size={16} />
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="font-medium mb-2">安装说明：</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>
                <strong>搜索插件</strong>：从npm仓库和本地发现可用插件
              </li>
              <li>
                <strong>NPM包</strong>：从npm registry安装，支持@dataset-viewer/plugin-*命名规范
              </li>
              <li>
                <strong>本地路径</strong>：用于开发调试，支持npm link和相对路径
              </li>
              <li>
                <strong>远程URL</strong>：直接从CDN或自定义URL加载插件
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
