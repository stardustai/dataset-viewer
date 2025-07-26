import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Eye,
  EyeOff,
  Home,
  ArrowLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Search,
  X,
  Settings,
  Copy
} from 'lucide-react';
import { WebDAVFile } from '../types';
import { StorageServiceManager } from '../services/storage';
import { BaseStorageClient } from '../services/storage/BaseStorageClient';
import { navigationHistoryService } from '../services/navigationHistory';
import { LanguageSwitcher } from './LanguageSwitcher';
import { VirtualizedFileList } from './VirtualizedFileList';
import { PerformanceIndicator } from './PerformanceIndicator';
import { SettingsPanel } from './SettingsPanel';
import { LoadingDisplay, HiddenFilesDisplay, NoSearchResultsDisplay, EmptyDisplay, ErrorDisplay } from './common';
import { copyToClipboard, normalizePath, showCopyToast } from '../utils/clipboard';

interface FileBrowserProps {
  onFileSelect: (file: WebDAVFile, path: string, storageClient?: BaseStorageClient) => void;
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
  const [files, setFiles] = useState<WebDAVFile[]>([]);
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

  const loadDirectory = async (path: string, isManual = false, forceReload = false) => {
    // 防止重复请求
    if (loadingRequest === path) {
      return;
    }

    // 如果不是强制重新加载且路径相同，则直接返回
    if (!forceReload && !isManual && currentPath === path && files.length > 0) {
      return;
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
        setTimeout(() => {
          if (fileListRef.current) {
            const scrollElement = fileListRef.current.querySelector('[data-virtualized-container]') as HTMLElement;
            if (scrollElement) {
              const savedPosition = navigationHistoryService.getScrollPosition(path);
              if (savedPosition) {
                scrollElement.scrollTop = savedPosition.scrollTop;
                scrollElement.scrollLeft = savedPosition.scrollLeft;
              }
            }
          }
        }, 50); // 缩短等待时间，因为是缓存数据

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
      setTimeout(() => {
        if (fileListRef.current) {
          const scrollElement = fileListRef.current.querySelector('[data-virtualized-container]') as HTMLElement;
          if (scrollElement) {
            const savedPosition = navigationHistoryService.getScrollPosition(path);
            if (savedPosition) {
              scrollElement.scrollTop = savedPosition.scrollTop;
              scrollElement.scrollLeft = savedPosition.scrollLeft;
            }
          }
        }
      }, 100); // 给一点时间让组件渲染完成

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

  // 初始加载 - 优化避免重复加载
  useEffect(() => {
    // 如果没有指定初始路径，尝试恢复最后访问的目录
    const pathToLoad = initialPath || navigationHistoryService.getLastVisitedPath();

    // 只有当目标路径与当前路径不同，或者还没有加载过数据时才加载
    if (pathToLoad !== currentPath || files.length === 0) {
      loadDirectory(pathToLoad);
    }
  }, []); // 只在组件挂载时执行一次

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

  const handleItemClick = (file: WebDAVFile) => {
    if (file.type === 'directory') {
      const newPath = currentPath === ''
        ? file.basename
        : `${currentPath}/${file.basename}`;
      loadDirectory(newPath);
    } else {
      // 处理所有类型的文件，不仅仅是文本文件
      const fullPath = currentPath === ''
        ? file.basename
        : `${currentPath}/${file.basename}`;

      // 获取当前的存储客户端
      const storageClient = StorageServiceManager.getCurrentClient();
      if (storageClient) {
        onFileSelect(file, fullPath, storageClient);
      } else {
        console.warn('No storage client available');
        onFileSelect(file, fullPath);
      }
    }
  };

  const connection = StorageServiceManager.getConnection();

  const getPathSegments = () => {
    if (currentPath === '') return [];
    return currentPath.split('/').filter(Boolean);
  };

  const navigateToSegment = (index: number) => {
    // 如果当前有错误，先清除错误状态
    if (error) {
      setError('');
    }

    const segments = getPathSegments();
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

      // 构建完整路径，使用规范化函数避免重复斜杠
      const fullPath = normalizePath(connection.url, currentPath);

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
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('webdav.browser')}</h1>
            {connection && (
              <span
                className="text-sm text-gray-500 dark:text-gray-400 max-w-48 truncate"
                title={StorageServiceManager.getConnectionDisplayName()}
              >
                {t('connected.to')} {StorageServiceManager.getConnectionDisplayName()}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <PerformanceIndicator
              fileCount={files.length}
              isVirtualized={true}
            />
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={showHidden ? t('hide.hidden.files') : t('show.hidden.files')}
            >
              {showHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{showHidden ? t('hide.hidden') : t('show.hidden')}</span>
            </button>
            <LanguageSwitcher />
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={t('settings')}
            >
              <Settings className="w-4 h-4" />
              <span>{t('settings')}</span>
            </button>
            <button
              onClick={onDisconnect}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {t('disconnect')}
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={navigateToHome}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={t('home')}
            >
              <Home className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>

            {currentPath !== '' && (
              <button
                onClick={navigateUp}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                title={t('go.up')}
              >
                <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            )}

            <div className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-300">
              <span
                onClick={navigateToHome}
                className="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                {t('home')}
              </span>

              {getPathSegments().map((segment, index) => (
                <React.Fragment key={index}>
                  <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span
                    onClick={() => navigateToSegment(index)}
                    className="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-block max-w-32 truncate"
                    title={segment}
                  >
                    {segment}
                  </span>
                </React.Fragment>
              ))}

              {/* 复制完整路径按钮 */}
              <button
                onClick={copyFullPath}
                className="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                title={t('copy.full.path')}
              >
                <Copy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* 搜索框和刷新按钮 */}
          <div className="flex items-center space-x-3">
            {searchTerm && (
              <div className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {t('search.results.count', { count: getFilteredFiles().length })}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('search.files')}
                className="w-64 pl-10 pr-8 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 刷新按钮 */}
            <button
              onClick={refreshCurrentDirectory}
              disabled={loading}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                const parentPath = currentPath.split('/').slice(0, -1).join('/');
                loadDirectory(parentPath);
              }}
            />
          )}

          {!loading && !error && (
            <>
              {/* 表头 */}
              <div ref={tableHeaderRef} className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
              <div className="flex items-center">
                <div className="flex-1 pr-4">
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
                <div className="w-24 text-right pr-4">
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
                <div className="w-48 text-right">
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
                <div className="bg-white dark:bg-gray-800">
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
