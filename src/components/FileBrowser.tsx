import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Folder,
  Eye,
  EyeOff,
  Home,
  ArrowLeft,
  ChevronRight,
  Loader2,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Search,
  X
} from 'lucide-react';
import { WebDAVFile } from '../types';
import { webdavService } from '../services/webdav';
import { LanguageSwitcher } from './LanguageSwitcher';
import { VirtualizedFileList } from './VirtualizedFileList';
import { PerformanceIndicator } from './PerformanceIndicator';
import { ThemeToggle } from './ThemeToggle';

interface FileBrowserProps {
  onFileSelect: (file: WebDAVFile, path: string) => void;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const tableHeaderRef = useRef<HTMLDivElement>(null);

  // 计算过滤后的文件数量
  const getFilteredFiles = () => {
    let filteredFiles = showHidden
      ? files
      : files.filter(file => !file.basename.startsWith('.'));

    if (searchTerm.trim()) {
      filteredFiles = filteredFiles.filter(file =>
        file.basename.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filteredFiles;
  };

  const loadDirectory = async (path: string, isManual = false) => {
    // 防止重复请求
    if (loadingRequest === path) {
      return;
    }

    setLoadingRequest(path);
    setLoading(true);
    setError('');
    setFailedPath(''); // 清除之前的失败路径
    setIsManualRefresh(isManual);

    try {
      const fileList = await webdavService.listDirectory(path);
      setFiles(fileList);
      setCurrentPath(path);
      // 通知父组件目录变化
      onDirectoryChange?.(path);
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
    loadDirectory(currentPath, true); // 标记为手动刷新
  };

  // 初始加载
  useEffect(() => {
    loadDirectory(initialPath);
  }, []); // 只在组件挂载时执行一次

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
      onFileSelect(file, fullPath);
    }
  };

  const connection = webdavService.getConnection();

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

  // 处理列标题点击排序
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

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('webdav.browser')}</h1>
            {connection && (
              <span className="text-sm text-gray-500 dark:text-gray-400 max-w-48 truncate" title={new URL(connection.url).hostname}>
                {t('connected.to')} {new URL(connection.url).hostname}
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
            <ThemeToggle />
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
        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        )}

        {error && (
          <div className="p-6">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-600 dark:text-red-400 font-medium">无法加载目录内容</p>
              {failedPath && (
                <p className="text-red-500 dark:text-red-400 text-sm mt-1">失败路径: {failedPath}</p>
              )}
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-2">
                请检查路径是否正确，或者尝试返回上级目录。
              </p>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="h-full flex flex-col">
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
              !showHidden && files.every(file => file.basename.startsWith('.')) ? (
                <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800">
                  <div className="text-center py-12">
                    <EyeOff className="mx-auto w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">{t('all.files.hidden')}</p>
                    <button
                      onClick={() => setShowHidden(true)}
                      className="mt-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm"
                    >
                      {t('show.hidden.files')}
                    </button>
                  </div>
                </div>
              ) : getFilteredFiles().length === 0 ? (
                <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800">
                  <div className="text-center py-12">
                    <Search className="mx-auto w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">{t('no.search.results')}</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                      {t('try.different.search')} "{searchTerm}"
                    </p>
                    <button
                      onClick={() => setSearchTerm('')}
                      className="mt-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm"
                    >
                      {t('clear.search')}
                    </button>
                  </div>
                </div>
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
              <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800">
                <div className="text-center py-12">
                  <Folder className="mx-auto w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">{t('directory.empty')}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
