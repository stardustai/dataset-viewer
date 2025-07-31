import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Search,
  X,
  Settings
} from 'lucide-react';
import { StorageFile } from '../../types';
import { StorageServiceManager } from '../../services/storage';
import { BaseStorageClient } from '../../services/storage/BaseStorageClient';
import { navigationHistoryService } from '../../services/navigationHistory';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { VirtualizedFileList } from './VirtualizedFileList';
import { PerformanceIndicator } from './PerformanceIndicator';
import { SettingsPanel } from './SettingsPanel';
import { ConnectionSwitcher } from './ConnectionSwitcher';
import { LoadingDisplay, HiddenFilesDisplay, NoSearchResultsDisplay, EmptyDisplay, ErrorDisplay, BreadcrumbNavigation } from '../common';
import { copyToClipboard, showCopyToast } from '../../utils/clipboard';

interface FileBrowserProps {
  onFileSelect: (file: StorageFile, path: string, storageClient?: BaseStorageClient) => void;
  onDisconnect: () => void;
  initialPath?: string;
  onDirectoryChange?: (path: string) => void;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({
  onFileSelect,
  onDisconnect,
  initialPath = '',
  onDirectoryChange
}) => {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'size' | 'modified'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [loadingRequest, setLoadingRequest] = useState<string | null>(null); // 跟踪当前正在加载的路径
  const [isManualRefresh, setIsManualRefresh] = useState(false); // 追踪是否为手动刷新
  const [failedPath, setFailedPath] = useState<string>(''); // 记录失败的路径
  const [containerHeight, setContainerHeight] = useState(600); // 容器高度
  const [tableHeaderHeight, setTableHeaderHeight] = useState(40); // 表头高度
  const [searchTerm, setSearchTerm] = useState(''); // 文件名搜索
  const [showSettings, setShowSettings] = useState(false); // 设置面板显示状态
  const containerRef = useRef<HTMLDivElement>(null);
  const tableHeaderRef = useRef<HTMLDivElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 计算过滤后的文件数量
  const getFilteredFiles = () => {
    let filteredFiles = showHidden
      ? files
      : files.filter(file => file.basename && !file.basename.startsWith('.'));

    if (searchTerm.trim()) {
      filteredFiles = filteredFiles.filter(file =>
        file.basename && file.basename.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filteredFiles;
  };

  // 处理全局搜索（如HuggingFace数据集搜索）
  const handleGlobalSearch = async (query: string) => {
    if (!query.trim()) return;

    try {
      const client = StorageServiceManager.getCurrentClient();
      if (client.supportsSearch?.()) {
        setLoading(true);
        setError('');
        
        const searchPath = `/search/${encodeURIComponent(query)}`;
        const result = await StorageServiceManager.listDirectory(searchPath);
        
        setFiles(result);
        setLoading(false);
      }
    } catch (error) {
      console.error('Global search failed:', error);
      setError(`Search failed: ${error}`);
      setLoading(false);
    }
  };

  // 检查当前存储是否支持全局搜索
  const supportsGlobalSearch = () => {
    try {
      const client = StorageServiceManager.getCurrentClient();
      return client.supportsSearch?.() || false;
    } catch {
      return false;
    }
  };

  const loadDirectory = async (path: string, isManual = false, forceReload = false) => {
    // 防止重复请求
    if (loadingRequest === path) {
      return;
    }

    // 如果不是强制重新加载且路径相同，则直接返回
    if (!forceReload && !isManual && currentPath === path && files.length > 0) {
      return;
    }

    // 路径变化时清除搜索框状态
    if (currentPath !== path) {
      setSearchTerm('');
    }

    // 尝试从缓存获取数据（除非是手动刷新或强制重新加载）
    if (!isManual && !forceReload) {
      const cachedFiles = navigationHistoryService.getCachedDirectory(path);
      if (cachedFiles) {
        console.log('Using cached directory data for:', path);
        setFiles(cachedFiles);
        setCurrentPath(path);
        setLoading(false);

        // 记录访问历史
        navigationHistoryService.addToHistory(path);

        // 通知父组件目录变化
        onDirectoryChange?.(path);

        // 恢复滚动位置
        const restoreScrollPosition = () => {
          if (fileListRef.current) {
            const scrollElement = fileListRef.current.querySelector('[data-virtualized-container]') as HTMLElement;
            if (scrollElement) {
              const savedPosition = navigationHistoryService.getScrollPosition(path);
              if (savedPosition) {
                console.log('Restoring cached scroll position for path:', path, savedPosition);
                scrollElement.scrollTop = savedPosition.scrollTop;
                scrollElement.scrollLeft = savedPosition.scrollLeft;
                return true;
              }
            }
          }
          return false;
        };

        // 尝试立即恢复，如果失败则延迟重试
        setTimeout(() => {
          if (!restoreScrollPosition()) {
            // 如果第一次尝试失败，再次尝试
            setTimeout(() => {
              restoreScrollPosition();
            }, 50);
          }
        }, 20); // 缩短等待时间，因为是缓存数据

        return;
      }
    }

    // 保存当前目录的滚动位置（如果有的话）
    if (currentPath !== path && fileListRef.current) {
      const scrollElement = fileListRef.current.querySelector('[data-virtualized-container]') as HTMLElement;
      if (scrollElement) {
        navigationHistoryService.saveScrollPosition(
          currentPath,
          scrollElement.scrollTop,
          scrollElement.scrollLeft
        );
      }
    }

    setLoadingRequest(path);
    setLoading(true);
    setError('');
    setFailedPath(''); // 清除之前的失败路径
    setIsManualRefresh(isManual);

    try {
      console.log('Loading directory from server:', path);
      const fileList = await StorageServiceManager.listDirectory(path);
      setFiles(fileList);
      setCurrentPath(path);

      // 缓存目录数据
      navigationHistoryService.cacheDirectory(path, fileList);

      // 记录访问历史
      navigationHistoryService.addToHistory(path);

      // 通知父组件目录变化
      onDirectoryChange?.(path);

      // 恢复滚动位置
      const restoreScrollPosition = () => {
        if (fileListRef.current) {
          const scrollElement = fileListRef.current.querySelector('[data-virtualized-container]') as HTMLElement;
          if (scrollElement) {
            const savedPosition = navigationHistoryService.getScrollPosition(path);
            if (savedPosition) {
              console.log('Restoring scroll position for path:', path, savedPosition);
              scrollElement.scrollTop = savedPosition.scrollTop;
              scrollElement.scrollLeft = savedPosition.scrollLeft;
              return true;
            }
          }
        }
        return false;
      };

      // 尝试立即恢复，如果失败则延迟重试
      setTimeout(() => {
        if (!restoreScrollPosition()) {
          // 如果第一次尝试失败，再次尝试
          setTimeout(() => {
            restoreScrollPosition();
          }, 100);
        }
      }, 50);

    } catch (err) {
      setError('Failed to load directory contents');
      setFailedPath(path); // 记录失败的路径
      // 清除文件列表以避免显示过期数据
      setFiles([]);
      // 发生错误时，尝试恢复到上一个有效路径或根目录
      if (path !== '') {
        // 如果不是根目录出错，尝试恢复到父目录或根目录
        const segments = path.split('/').filter(s => s);
        if (segments.length > 1) {
          // 有父目录，回退到父目录
          const parentPath = segments.slice(0, -1).join('/');
          setCurrentPath(parentPath);
          onDirectoryChange?.(parentPath);
        } else {
          // 只有一级目录，回退到根目录
          setCurrentPath('');
          onDirectoryChange?.('');
        }
      }
      console.error('Directory loading failed:', err);
      console.log('Files array cleared, length:', [].length);
    } finally {
      setLoading(false);
      setLoadingRequest(null);
      setIsManualRefresh(false);
    }
  };

  // 添加刷新当前目录的函数
  const refreshCurrentDirectory = () => {
    loadDirectory(currentPath, true, true); // 标记为手动刷新和强制重新加载
  };

  // 初始加载 - 修复避免重复加载的逻辑
  useEffect(() => {
    // 如果是首次加载（currentPath 为空）或者 initialPath 与当前路径不同时才加载
    if (!currentPath || initialPath !== currentPath) {
      loadDirectory(initialPath);
    }
  }, [initialPath]);

  // 监听滚动事件，实时保存滚动位置
  useEffect(() => {
    const fileListElement = fileListRef.current;
    if (!fileListElement) return;

    const scrollElement = fileListElement.querySelector('[data-virtualized-container]') as HTMLElement;
    if (!scrollElement) return;

    const handleScroll = () => {
      // 使用防抖来避免过度频繁的保存
      if (scrollSaveTimeoutRef.current) {
        clearTimeout(scrollSaveTimeoutRef.current);
      }

      scrollSaveTimeoutRef.current = setTimeout(() => {
        navigationHistoryService.saveScrollPosition(
          currentPath,
          scrollElement.scrollTop,
          scrollElement.scrollLeft
        );
      }, 300); // 300ms 防抖
    };

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
      if (scrollSaveTimeoutRef.current) {
        clearTimeout(scrollSaveTimeoutRef.current);
      }
    };
  }, [currentPath, files.length]); // 当路径或文件列表变化时重新绑定事件

  // 组件卸载时保存当前滚动位置
  useEffect(() => {
    return () => {
      // 在组件卸载时保存当前滚动位置
      if (fileListRef.current && currentPath) {
        const scrollElement = fileListRef.current.querySelector('[data-virtualized-container]') as HTMLElement;
        if (scrollElement) {
          navigationHistoryService.saveScrollPosition(
            currentPath,
            scrollElement.scrollTop,
            scrollElement.scrollLeft
          );
        }
      }
    };
  }, [currentPath]);

  // 监听容器大小变化
  useEffect(() => {
    const updateContainerHeight = () => {
      if (containerRef.current && tableHeaderRef.current) {
        const mainRect = containerRef.current.getBoundingClientRect();
        const headerRect = tableHeaderRef.current.getBoundingClientRect();
        setContainerHeight(mainRect.height);
        setTableHeaderHeight(headerRect.height);
      } else if (containerRef.current) {
        // 如果表头还没有渲染，使用默认值
        const rect = containerRef.current.getBoundingClientRect();
        setContainerHeight(rect.height);
      }
    };

    updateContainerHeight();
    window.addEventListener('resize', updateContainerHeight);

    return () => {
      window.removeEventListener('resize', updateContainerHeight);
    };
  }, []);

  // 当文件列表变化时重新计算高度（确保表头已渲染）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current && tableHeaderRef.current) {
        const mainRect = containerRef.current.getBoundingClientRect();
        const headerRect = tableHeaderRef.current.getBoundingClientRect();
        setContainerHeight(mainRect.height);
        setTableHeaderHeight(headerRect.height);
      }
    }, 50); // 给一点时间让DOM更新

    return () => clearTimeout(timer);
  }, [files.length, loading, error]); // 当这些状态变化时重新计算

  // 当 initialPath 改变时加载
  useEffect(() => {
    // 只在 initialPath 与当前路径不同时才加载
    if (initialPath !== currentPath) {
      loadDirectory(initialPath);
    }
  }, [initialPath, currentPath]);

  const navigateUp = () => {
    if (currentPath === '') return; // Already at root

    // 如果当前有错误，先清除错误状态
    if (error) {
      setError('');
    }

    const segments = currentPath.split('/').filter(s => s);
    segments.pop(); // Remove last segment
    const parentPath = segments.join('/');
    loadDirectory(parentPath);
  };

  const navigateToHome = () => {
    // 如果当前有错误，先清除错误状态
    if (error) {
      setError('');
    }

    loadDirectory('');
  };

  const handleItemClick = (file: StorageFile) => {
    if (file.type === 'directory') {
      const newPath = currentPath ? `${currentPath}/${file.filename}` : file.filename;
      loadDirectory(newPath);
    } else {
      // 处理所有类型的文件，不仅仅是文本文件
      const currentStorageClient = StorageServiceManager.getCurrentClient();
      const fullPath = currentPath ? `${currentPath}/${file.basename}` : file.basename;
      onFileSelect(file, fullPath, currentStorageClient);
    }
  };

  const connection = StorageServiceManager.getConnection();

  const navigateToSegment = (index: number) => {
    // 如果当前有错误，先清除错误状态
    if (error) {
      setError('');
    }

    const segments = currentPath === '' ? [] : currentPath.split('/').filter(Boolean);
    const newPath = segments.slice(0, index + 1).join('/');
    loadDirectory(newPath);
  };

  const handleSort = (field: 'name' | 'size' | 'modified') => {
    if (sortField === field) {
      // 如果点击的是当前排序字段，则切换排序方向
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // 如果点击的是新字段，则设置为该字段并使用升序
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // 复制完整路径到剪贴板
  const copyFullPath = async () => {
    try {
      const connection = StorageServiceManager.getConnection();
      if (!connection) return;

      // 使用 StorageServiceManager.getFileUrl 获取正确的 URL
      // 这样可以正确处理 HuggingFace 等特殊协议
      const fullPath = StorageServiceManager.getFileUrl(currentPath);

      const success = await copyToClipboard(fullPath);
      if (success) {
        showCopyToast(t('copied.to.clipboard'));
      } else {
        showCopyToast(t('copy.failed'));
      }
    } catch (err) {
      console.error('复制路径失败:', err);
      showCopyToast(t('copy.failed'));
    }
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 lg:space-x-4 min-w-0 flex-1">
            <h1 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">{t('app.name')}</h1>
            {connection && (
              <div className="hidden md:block">
                <ConnectionSwitcher onConnectionChange={() => {
                  // 连接切换后重置到根目录并清除缓存
                  navigationHistoryService.clearCache();
                  setCurrentPath('');
                  loadDirectory('', true, true);
                }} />
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2 lg:space-x-4">
            <PerformanceIndicator
              fileCount={files.length}
              isVirtualized={true}
            />
            {/* 响应式显示/隐藏文件按钮 */}
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="flex items-center space-x-2 p-2 sm:px-3 sm:py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={showHidden ? t('hide.hidden.files') : t('show.hidden.files')}
            >
              {showHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="hidden lg:inline">{showHidden ? t('hide.hidden') : t('show.hidden')}</span>
            </button>
            <LanguageSwitcher />
            {/* 响应式设置按钮 */}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center space-x-2 p-2 sm:px-3 sm:py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={t('settings')}
            >
              <Settings className="w-4 h-4" />
              <span className="hidden lg:inline">{t('settings')}</span>
            </button>
            {/* 移动端断开连接按钮 */}
            <button
              onClick={onDisconnect}
              className="sm:hidden p-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title={t('disconnect')}
            >
              <X className="w-4 h-4" />
            </button>
            {/* 桌面端断开连接按钮 */}
            <button
              onClick={onDisconnect}
              className="hidden sm:flex items-center px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {t('disconnect')}
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between gap-2">
          <BreadcrumbNavigation
            currentPath={currentPath}
            onNavigateHome={navigateToHome}
            onNavigateBack={navigateUp}
            onNavigateToSegment={navigateToSegment}
            onCopyPath={copyFullPath}
            homeLabel={t('home')}
            showHomeIcon={true}
          />

          {/* 搜索框和刷新按钮 */}
          <div className="flex items-center space-x-2 lg:space-x-3 flex-shrink-0">
            {searchTerm && (
              <div className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {t('search.results.count', { count: getFilteredFiles().length })}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-2 lg:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('search.files')}
                className="w-32 sm:w-48 lg:w-64 pl-8 lg:pl-10 pr-6 lg:pr-8 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && supportsGlobalSearch() && searchTerm.trim()) {
                    handleGlobalSearch(searchTerm.trim());
                  }
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    // 重新加载当前目录以清除搜索结果
                    loadDirectory(currentPath);
                  }}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 全局搜索按钮 - 仅在支持的存储类型中显示 */}
            {supportsGlobalSearch() && searchTerm.trim() && (
              <button
                onClick={() => handleGlobalSearch(searchTerm.trim())}
                className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors flex-shrink-0 flex items-center space-x-1"
                title={t('search.global')}
              >
                <Search className="w-3 h-3" />
                <span className="hidden sm:inline">{t('search.datasets')}</span>
              </button>
            )}

            {/* 刷新按钮 */}
            <button
              onClick={refreshCurrentDirectory}
              disabled={loading}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              title="刷新当前目录"
            >
            <RefreshCw className={`w-4 h-4 text-gray-600 dark:text-gray-300 ${loading && isManualRefresh ? 'animate-spin' : ''}`} />
          </button>
        </div>
        </div>
      </nav>

      {/* Content */}
      <main ref={containerRef} className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          {loading && (
            <LoadingDisplay
              message={currentPath
                ? t('loading.directory', { path: ` "${currentPath}" ` })
                : t('loading.directory.root')
              }
            />
          )}

          {error && (
            <ErrorDisplay
              message={failedPath ? `${t('error.load.directory')}。${t('error.failed.path')}: ${failedPath}` : t('error.load.directory')}
              onRetry={() => {
                // 重试加载失败的路径，如果没有记录失败路径则加载当前路径
                const retryPath = failedPath || currentPath;
                loadDirectory(retryPath, true, true); // 标记为手动操作和强制重新加载
              }}
            />
          )}

          {!loading && !error && (
            <>
              {/* 表头 */}
              <div ref={tableHeaderRef} className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-3">
              <div className="flex items-center">
                <div className="flex-1 pr-2 lg:pr-4">
                  <div
                    className="flex items-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                    onClick={() => handleSort('name')}
                  >
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('name')}
                    </span>
                    {sortField === 'name' && (
                      sortDirection === 'asc' ?
                        <ChevronUp className="ml-1 w-3 h-3" /> :
                        <ChevronDown className="ml-1 w-3 h-3" />
                    )}
                  </div>
                </div>
                <div className="w-16 sm:w-20 lg:w-24 text-right pr-2 lg:pr-4">
                  <div
                    className="flex items-center justify-end cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                    onClick={() => handleSort('size')}
                  >
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('size')}
                    </span>
                    {sortField === 'size' && (
                      sortDirection === 'asc' ?
                        <ChevronUp className="ml-1 w-3 h-3" /> :
                        <ChevronDown className="ml-1 w-3 h-3" />
                    )}
                  </div>
                </div>
                <div className="w-24 sm:w-32 lg:w-48 text-right">
                  <div
                    className="flex items-center justify-end cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                    onClick={() => handleSort('modified')}
                  >
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t('modified')}
                    </span>
                    {sortField === 'modified' && (
                      sortDirection === 'asc' ?
                        <ChevronUp className="ml-1 w-3 h-3" /> :
                        <ChevronDown className="ml-1 w-3 h-3" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 文件列表或空状态 */}
            {files.length > 0 ? (
              !showHidden && files.every(file => file.basename && file.basename.startsWith('.')) ? (
                <HiddenFilesDisplay onShowHidden={() => setShowHidden(true)} />
              ) : getFilteredFiles().length === 0 ? (
                <NoSearchResultsDisplay
                  searchTerm={searchTerm}
                  onClearSearch={() => setSearchTerm('')}
                />
              ) : (
                <div ref={fileListRef} className="bg-white dark:bg-gray-800">
                  <VirtualizedFileList
                    files={files}
                    onFileClick={handleItemClick}
                    showHidden={showHidden}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    height={containerHeight - tableHeaderHeight} // 动态计算高度
                    searchTerm={searchTerm}
                  />
                </div>
              )
            ) : (
              <EmptyDisplay message={t('directory.empty')} />
            )}
          </>
          )}
        </div>
      </main>

      {/* 设置面板 */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
};
