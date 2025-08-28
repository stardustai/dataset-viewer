import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderDownloadService } from '../../services/folderDownloadService';
import { navigationHistoryService } from '../../services/navigationHistory';
import { StorageServiceManager } from '../../services/storage';
import type { StorageClient as IStorageClient, ListOptions } from '../../services/storage/types';
import type { StorageFile } from '../../types';
import { commands } from '../../types/tauri-commands';
import { copyToClipboard, showCopyToast, showErrorToast } from '../../utils/clipboard';
import { cleanPath } from '../../utils/pathUtils';
import { compareFileSize } from '../../utils/typeUtils';
import {
  BreadcrumbNavigation,
  EmptyDisplay,
  ErrorDisplay,
  HiddenFilesDisplay,
  LoadingDisplay,
  NoLocalResultsDisplay,
  NoRemoteResultsDisplay,
  NoSearchResultsDisplay,
} from '../common';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ConnectionSwitcher } from './ConnectionSwitcher';
import { PerformanceIndicator } from './PerformanceIndicator';
import { SettingsPanel } from './SettingsPanel';
import { VirtualizedFileList } from './VirtualizedFileList';

interface FileBrowserProps {
  onFileSelect: (
    file: StorageFile,
    path: string,
    storageClient?: IStorageClient,
    files?: StorageFile[]
  ) => void;
  onDisconnect: () => void;
  initialPath?: string;
  onDirectoryChange?: (path: string) => void;
  shouldRefresh?: boolean; // 新增：用于通知组件需要重新检查连接状态
}

// 类型适配函数：将 null 转换为 undefined
const nullToUndefined = <T,>(value: T | null): T | undefined =>
  value === null ? undefined : value;

export const FileBrowser: React.FC<FileBrowserProps> = ({
  onFileSelect,
  onDisconnect,
  initialPath = '',
  onDirectoryChange,
  shouldRefresh = false,
}) => {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 从localStorage获取隐藏文件显示偏好
  const [showHidden, setShowHidden] = useState(() => {
    try {
      const saved = localStorage.getItem('file-viewer-show-hidden');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // 保存隐藏文件显示偏好到localStorage
  useEffect(() => {
    try {
      localStorage.setItem('file-viewer-show-hidden', JSON.stringify(showHidden));
    } catch {
      // 忽略localStorage错误
    }
  }, [showHidden]);
  const [sortField, setSortField] = useState<'name' | 'size' | 'modified'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [loadingRequest, setLoadingRequest] = useState<string | null>(null); // 跟踪当前正在加载的路径
  const [isRefreshing, setIsRefreshing] = useState(false); // 专门跟踪刷新按钮状态
  const [failedPath, setFailedPath] = useState<string>(''); // 记录失败的路径
  const [containerHeight, setContainerHeight] = useState(600); // 容器高度
  const [tableHeaderHeight, setTableHeaderHeight] = useState(40); // 表头高度
  const [searchTerm, setSearchTerm] = useState(''); // 文件名搜索
  const [showSettings, setShowSettings] = useState(false); // 设置面板显示状态
  const [currentView, setCurrentView] = useState<'directory' | 'remote-search'>('directory'); // 当前显示的内容类型
  const [remoteSearchQuery, setRemoteSearchQuery] = useState(''); // 远程搜索查询词
  // OSS 分页状态
  const [hasMore, setHasMore] = useState(false); // 是否有更多文件可加载
  const [nextMarker, setNextMarker] = useState<string | undefined>(); // 下一页标记
  const [loadingMore, setLoadingMore] = useState(false); // 是否正在加载更多
  const containerRef = useRef<HTMLDivElement>(null);
  const tableHeaderRef = useRef<HTMLDivElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadMoreThrottleRef = useRef<NodeJS.Timeout | null>(null);

  // 计算过滤后的文件数量

  const getFilteredFiles = () => {
    let filteredFiles = showHidden
      ? files
      : files.filter(file => file.basename && !file.basename.startsWith('.'));

    if (searchTerm.trim()) {
      filteredFiles = filteredFiles.filter(file =>
        file.basename?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filteredFiles;
  };

  // 获取要显示的文件列表（包含过滤和排序）
  const getDisplayFiles = () => {
    let filteredFiles;

    // 在远程搜索模式下，直接使用服务器端过滤的结果
    if (currentView === 'remote-search') {
      filteredFiles = showHidden
        ? files
        : files.filter(file => file.basename && !file.basename.startsWith('.'));
    } else {
      // 在目录浏览模式下，使用本地过滤逻辑
      filteredFiles = getFilteredFiles();
    }

    // 检查当前客户端是否使用服务端排序
    const currentClient = StorageServiceManager.getCurrentClient();
    const defaultSortOptions = currentClient.getDefaultSortOptions();

    // 如果客户端指定了默认排序选项，则不应用前端排序，直接返回服务端排序的结果
    if (defaultSortOptions) {
      return filteredFiles;
    }

    // 否则对过滤后的文件进行前端排序
    return [...filteredFiles].sort((a, b) => {
      // 目录总是排在文件前面
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;

      let compareValue = 0;

      switch (sortField) {
        case 'name':
          compareValue = a.basename.toLowerCase().localeCompare(b.basename.toLowerCase());
          break;
        case 'size':
          compareValue = compareFileSize(a.size || '0', b.size || '0');
          break;
        case 'modified':
          compareValue = new Date(a.lastmod).getTime() - new Date(b.lastmod).getTime();
          break;
      }

      return sortDirection === 'asc' ? compareValue : -compareValue;
    });
  };

  // 处理全局搜索（如HuggingFace数据集搜索）
  const handleGlobalSearch = async (query: string) => {
    if (!query.trim()) return;

    try {
      const client = StorageServiceManager.getCurrentClient();
      if (client.supportsSearch?.()) {
        // 检查是否应该允许远程搜索（HuggingFace在子目录时禁用）
        if (!shouldAllowRemoteSearch()) {
          return;
        }

        setLoading(true);
        setError('');
        setCurrentView('remote-search');
        setRemoteSearchQuery(query);

        const searchPath = `/search/${encodeURIComponent(query)}`;
        const result = await StorageServiceManager.listDirectory(searchPath);

        setFiles(result.files);
        setHasMore(false); // Remote search typically doesn't have pagination
        setNextMarker(undefined);
        setLoading(false);
      }
    } catch (error) {
      console.error('Global search failed:', error);
      setError(`Search failed: ${error}`);
      setLoading(false);
    }
  };

  // 返回到目录浏览模式
  const returnToDirectory = () => {
    setCurrentView('directory');
    setRemoteSearchQuery('');
    loadDirectory(currentPath, false, true); // 强制重新加载当前目录
  };

  // 清空搜索
  const handleClearSearch = () => {
    setSearchTerm('');
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

  // 检查是否应该允许远程搜索
  // 对于 HuggingFace，只有在首页或组织根页面才允许远程搜索
  const shouldAllowRemoteSearch = () => {
    try {
      const connection = StorageServiceManager.getCurrentConnection();

      // 只有 HuggingFace 需要特殊处理
      if (connection.type !== 'huggingface') {
        return true;
      }

      // 对于 HuggingFace，检查当前路径
      // 首页：空路径、'/'
      // 组织根页：只包含组织名，不包含数据集路径
      if (!currentPath || currentPath === '' || currentPath === '/') {
        return true; // 首页允许搜索
      }

      // 检查是否是组织根页面（路径中不包含 ':' 和不包含多层路径）
      const cleanPath = currentPath.replace(/^\/+|\/+$/g, '');
      const pathParts = cleanPath.split('/');
      if (pathParts.length === 1 && pathParts[0] && !pathParts[0].includes(':')) {
        return true; // 组织根页面允许搜索
      }

      // 其他情况（在具体数据集内部）不允许远程搜索
      return false;
    } catch {
      return true; // 出错时允许搜索（保持向后兼容）
    }
  };
  const loadDirectory = async (path: string, isManual = false, forceReload = false) => {
    console.log(
      `loadDirectory called: path="${path}", isManual=${isManual}, forceReload=${forceReload}, currentPath="${currentPath}", loading=${loading}`
    );

    // 防止重复请求
    if (loadingRequest === path && !forceReload) {
      console.log('Skipping duplicate request for path:', path);
      return;
    }

    // 检查存储是否已连接，如果未连接则返回错误但不设置loading状态
    if (!StorageServiceManager.isConnected()) {
      console.warn('Storage not connected, cannot load directory:', path);
      setError('Storage connection not ready');
      // 不在这里设置setLoading(false)，让重试机制处理
      return;
    }

    // 如果不是强制重新加载且路径相同，则直接返回
    if (!forceReload && !isManual && currentPath === path && files.length > 0) {
      console.log('Skipping reload for same path with existing files:', path);
      return;
    }

    // 路径变化时清除搜索框状态
    if (currentPath !== path) {
      setSearchTerm('');
    }

    // 尝试从缓存获取数据（除非是手动刷新或强制重新加载）
    if (!isManual && !forceReload) {
      const cachedData = navigationHistoryService.getCachedDirectory(path);
      if (cachedData) {
        console.log('Using cached directory data for:', path);
        setFiles(cachedData.files);
        setCurrentPath(path);
        setLoading(false);

        // 恢复分页状态，而不是重置
        setHasMore(cachedData.hasMore || false);
        setNextMarker(cachedData.nextMarker);

        // 记录访问历史
        navigationHistoryService.addToHistory(path);

        // 通知父组件目录变化
        onDirectoryChange?.(path);

        // 恢复滚动位置
        const restoreScrollPosition = () => {
          if (fileListRef.current) {
            const scrollElement = fileListRef.current.querySelector(
              '[data-virtualized-container]'
            ) as HTMLElement;
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
      const scrollElement = fileListRef.current.querySelector(
        '[data-virtualized-container]'
      ) as HTMLElement;
      if (scrollElement) {
        navigationHistoryService.saveScrollPosition(
          currentPath,
          scrollElement.scrollTop,
          scrollElement.scrollLeft
        );
      }
    }

    setLoadingRequest(path);

    // 如果当前已有文件内容且是手动刷新，则不显示全屏loading，只显示刷新按钮动画
    const shouldShowFullLoading = !(isManual && files.length > 0);
    setLoading(shouldShowFullLoading);

    // 设置刷新按钮状态
    if (isManual) {
      setIsRefreshing(true);
    }

    setError('');
    setFailedPath(''); // 清除之前的失败路径

    try {
      console.log('Loading directory from server:', path);

      // 获取当前客户端的默认分页大小
      const currentClient = StorageServiceManager.getCurrentClient();
      const defaultPageSize = currentClient.getDefaultPageSize();

      // 构建请求选项
      const listOptions: Partial<ListOptions> = {};
      if (defaultPageSize) {
        listOptions.pageSize = defaultPageSize;
      }

      const fileList = await StorageServiceManager.listDirectory(path, listOptions);
      setFiles(fileList.files);
      setCurrentPath(path);

      // 设置分页状态
      setHasMore(fileList.hasMore || false);
      setNextMarker(nullToUndefined(fileList.nextMarker));

      // 缓存目录数据（包含分页状态）
      navigationHistoryService.cacheDirectory(
        path,
        fileList.files,
        fileList.hasMore,
        nullToUndefined(fileList.nextMarker)
      );

      // 记录访问历史
      navigationHistoryService.addToHistory(path);

      // 通知父组件目录变化
      onDirectoryChange?.(path);

      // 恢复滚动位置
      const restoreScrollPosition = () => {
        if (fileListRef.current) {
          const scrollElement = fileListRef.current.querySelector(
            '[data-virtualized-container]'
          ) as HTMLElement;
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
      console.error('Directory loading failed for path:', path, err);

      // 解析错误类型，提供更具体的错误信息
      const errorMessage = String(err);
      let displayError = t('error.load.directory');
      let shouldRetryPathFallback = true;

      if (
        errorMessage.includes('403') ||
        errorMessage.includes('Forbidden') ||
        errorMessage.includes('AccessDenied')
      ) {
        displayError = t('error.access.denied');
        shouldRetryPathFallback = false; // 权限错误不尝试路径回退
      } else if (errorMessage.includes('404') || errorMessage.includes('NotFound')) {
        displayError = t('error.directory.not.found');
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        displayError = t('error.authentication.failed');
        shouldRetryPathFallback = false;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
        displayError = t('error.network.failed');
      }

      // 如果有失败的路径，将其添加到错误信息中
      if (path) {
        displayError = `${displayError}。${t('error.failed.path')}: ${path}`;
      }

      setError(displayError);
      setFailedPath(path); // 记录失败的路径
      // 清除文件列表以避免显示过期数据
      setFiles([]);
      // 重置分页状态
      setHasMore(false);
      setNextMarker(undefined);

      // 只有在非权限错误的情况下才尝试路径回退
      if (shouldRetryPathFallback && path !== '') {
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
      console.log('Files array cleared, length:', [].length);
    } finally {
      console.log('loadDirectory finally block: clearing loading states for path:', path);
      setLoading(false);
      setLoadingRequest(null);
      setIsRefreshing(false); // 重置刷新按钮状态
    }
  };

  // 滚动到底部的处理函数
  const handleScrollToBottom = () => {
    // Allow loading when hasMore is true, even if nextMarker is null
    // Some OSS implementations might not provide markers but still support pagination
    if (hasMore && !loadingMore) {
      loadMoreFiles();
    }
  };

  // 加载更多文件的函数（带节流）
  const loadMoreFiles = async () => {
    if (!hasMore || loadingMore) return;

    // 清除之前的节流器
    if (loadMoreThrottleRef.current) {
      clearTimeout(loadMoreThrottleRef.current);
    }

    // 设置节流，避免频繁触发
    loadMoreThrottleRef.current = setTimeout(async () => {
      try {
        setLoadingMore(true);
        console.log('Loading more files with marker:', nextMarker);

        const currentClient = StorageServiceManager.getCurrentClient();
        const defaultPageSize = currentClient.getDefaultPageSize();

        const result = await StorageServiceManager.listDirectory(currentPath, {
          marker: nextMarker, // nextMarker can be null/undefined, which is fine
          pageSize: defaultPageSize || 1000, // 使用客户端默认页面大小，fallback 到 1000
        });

        // 将新文件追加到现有文件列表
        setFiles(prev => [...prev, ...result.files]);

        // 更新分页状态
        setHasMore(result.hasMore || false);
        setNextMarker(nullToUndefined(result.nextMarker));

        // 更新缓存
        navigationHistoryService.updateCachedDirectory(
          currentPath,
          result.files,
          result.hasMore,
          nullToUndefined(result.nextMarker)
        );

        console.log(
          `Loaded ${result.files.length} more files, hasMore: ${result.hasMore}, nextMarker: ${result.nextMarker}`
        );
      } catch (err) {
        console.error('Failed to load more files:', err);
        // 显示分页失败的友好提示，但不设置全局错误状态
        // 这样用户仍然可以看到已加载的文件
        const errorMessage = err instanceof Error ? err.message : String(err);

        // 显示友好的错误提示
        showErrorToast(t('loading.more.failed'));

        console.warn('Pagination failed, but keeping existing files visible:', errorMessage);

        // 重置分页状态，防止无限重试
        setHasMore(false);
        setNextMarker(undefined);
      } finally {
        setLoadingMore(false);
      }
    }, 300); // 300ms 节流
  };

  // 添加刷新当前目录的函数
  const refreshCurrentDirectory = () => {
    loadDirectory(currentPath, true, true); // 标记为手动刷新和强制重新加载
  };

  // 下载当前文件夹的所有文件
  const downloadCurrentFolder = async () => {
    if (!connection) return;

    try {
      // 如果下载服务被停止，直接返回（用户需要等待当前下载完成）
      if (FolderDownloadService.isDownloadServiceStopped()) {
        console.log('Download service is stopped, cannot start new downloads');
        return;
      }

      // 让用户选择一次保存目录
      const result = await commands.systemSelectFolder();

      if (result.status === 'error') {
        console.error('Failed to select folder:', result.error);
        return;
      }

      const selectedDirectory = result.data;

      if (!selectedDirectory) {
        return;
      }

      // 生成文件夹名称和保存路径
      let fullSavePath: string;
      let folderName: string;

      if (currentPath) {
        // 下载子目录：在用户选择的目录下创建子目录
        folderName = currentPath.split('/').pop() || currentPath;
        fullSavePath = selectedDirectory.endsWith('/')
          ? `${selectedDirectory}${folderName}`
          : `${selectedDirectory}/${folderName}`;
      } else {
        // 下载根目录：直接在用户选择的目录中下载
        folderName = 'root';
        fullSavePath = selectedDirectory;
      }

      // 获取完整的文件列表（处理分页）
      setIsRefreshing(true); // 使用刷新状态而不是全屏loading
      const allFiles: StorageFile[] = [];
      let hasMorePages = true;
      let marker: string | undefined;

      console.log('Fetching complete file list for folder download...');

      const currentClient = StorageServiceManager.getCurrentClient();
      const defaultPageSize = currentClient.getDefaultPageSize();

      while (hasMorePages) {
        const result = await StorageServiceManager.listDirectory(currentPath, {
          marker,
          pageSize: defaultPageSize || 1000, // 使用客户端默认页面大小，fallback 到 1000
        });

        allFiles.push(...result.files);
        hasMorePages = result.hasMore || false;
        marker = nullToUndefined(result.nextMarker);

        // 安全检查：防止无限循环
        if (hasMorePages && !marker) {
          console.warn(
            `Directory ${currentPath} reported hasMore=true but no nextMarker provided, stopping pagination`
          );
          break;
        }
      }

      console.log(`Fetched complete file list: ${allFiles.length} items`);
      setIsRefreshing(false); // 重置刷新状态

      // 开始下载（默认递归下载）
      const downloadId = await FolderDownloadService.downloadFolder(
        currentPath,
        folderName,
        allFiles, // 使用完整文件列表而不是 UI 中显示的部分列表
        fullSavePath,
        {
          onStart: state => {
            console.log(`Started downloading folder: ${state.folderName}`);
          },
          onProgress: state => {
            console.log(`Download progress: ${state.progress}%`);
          },
          onFileComplete: (_state, filename) => {
            console.log(`Completed file: ${filename}`);
          },
          onComplete: state => {
            console.log(`Folder download completed: ${state.folderName}`);
          },
          onError: (_state, error) => {
            console.error(`Folder download error:`, error);
          },
        },
        true // 默认启用递归下载
      );

      console.log(`Folder download initiated with ID: ${downloadId}`);
    } catch (error) {
      console.error('Failed to start folder download:', error);
      showErrorToast(t('download.folder.failed'));
    } finally {
      setIsRefreshing(false); // 确保状态被重置
    }
  };

  // 初始加载和重试逻辑
  useEffect(() => {
    let retryTimer: NodeJS.Timeout;

    // 如果存储已连接，直接加载
    if (StorageServiceManager.isConnected()) {
      // 如果是首次加载或路径不同时才加载
      if (!currentPath || initialPath !== currentPath) {
        loadDirectory(initialPath);
      }
    } else if (error?.includes('Storage connection not ready')) {
      // 只有当错误是由于存储未连接引起时才重试
      console.log('Storage not connected, setting up retry...');
      retryTimer = setTimeout(() => {
        if (StorageServiceManager.isConnected()) {
          console.log('Storage connection ready, retrying directory load');
          setError(''); // 清除错误状态
          loadDirectory(initialPath || currentPath, false, true);
        }
      }, 1000);
    }

    return () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [initialPath, currentPath, error?.includes, loadDirectory]); // 移除error依赖避免无限重试循环

  // 响应从文件查看器返回的刷新请求
  useEffect(() => {
    if (shouldRefresh && StorageServiceManager.isConnected()) {
      console.log('Refreshing FileBrowser after returning from viewer');
      setError(''); // 清除可能存在的错误状态
      loadDirectory(initialPath || currentPath, false, true);
    }
  }, [shouldRefresh, currentPath, initialPath, loadDirectory]);

  // 监听滚动事件，实时保存滚动位置
  useEffect(() => {
    const fileListElement = fileListRef.current;
    if (!fileListElement) return;

    const scrollElement = fileListElement.querySelector(
      '[data-virtualized-container]'
    ) as HTMLElement;
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
  }, [currentPath]); // 当路径或文件列表变化时重新绑定事件

  // 组件卸载时保存当前滚动位置
  useEffect(() => {
    return () => {
      // 在组件卸载时保存当前滚动位置
      if (fileListRef.current && currentPath) {
        const scrollElement = fileListRef.current.querySelector(
          '[data-virtualized-container]'
        ) as HTMLElement;
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
  }, []); // 当这些状态变化时重新计算

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

    // 重置到目录浏览模式
    setCurrentView('directory');
    setRemoteSearchQuery('');
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
      onFileSelect(file, fullPath, currentStorageClient, files);
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

  const navigateToPath = (path: string) => {
    // 如果当前有错误，先清除错误状态
    if (error) {
      setError('');
    }

    // 重置到目录浏览模式
    setCurrentView('directory');
    setRemoteSearchQuery('');

    // 使用通用路径清理工具
    const cleanedPath = cleanPath(path);
    loadDirectory(cleanedPath);
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
            <h1 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">
              {t('app.name')}
            </h1>
            {connection && (
              <div className="hidden md:block">
                <ConnectionSwitcher
                  onConnectionChange={() => {
                    // 连接切换后重置到根目录并清除缓存
                    navigationHistoryService.clearCache();
                    setCurrentPath('');
                    loadDirectory('', true, true);
                  }}
                />
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2 lg:space-x-4">
            <PerformanceIndicator fileCount={files.length} isVirtualized={true} />
            {/* 响应式显示/隐藏文件按钮 */}
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="flex items-center space-x-2 p-2 sm:px-3 sm:py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={showHidden ? t('hide.hidden.files') : t('show.hidden.files')}
            >
              {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span className="hidden lg:inline">{t('hide.hidden')}</span>
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
            onNavigateToPath={navigateToPath}
            onCopyPath={copyFullPath}
            homeLabel="Home"
            showHomeIcon={true}
          />

          {/* 搜索框和刷新按钮 */}
          <div className="flex items-center space-x-2 lg:space-x-3 flex-shrink-0">
            {searchTerm && (
              <div className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {t('search.results.count', { count: getDisplayFiles().length })}
              </div>
            )}

            {/* 远程搜索结果页面的返回按钮 */}
            {currentView === 'remote-search' && (
              <button
                onClick={returnToDirectory}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0 mr-2"
                title={t('search.backToDirectory')}
              >
                <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            )}

            <div className="relative">
              <Search className="absolute left-2 lg:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={currentView === 'remote-search' ? remoteSearchQuery : searchTerm}
                onChange={e => {
                  if (currentView === 'directory') {
                    setSearchTerm(e.target.value);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (currentView === 'directory' && searchTerm.trim()) {
                      // 检查本地是否有搜索结果
                      const localResults = getDisplayFiles();
                      const client = StorageServiceManager.getCurrentClient();

                      // 如果本地没有结果且支持远程搜索且允许远程搜索，则触发远程搜索
                      if (
                        localResults.length === 0 &&
                        client.supportsSearch?.() &&
                        shouldAllowRemoteSearch()
                      ) {
                        handleGlobalSearch(searchTerm);
                      }
                    } else if (currentView === 'remote-search') {
                      // 在远程搜索模式下按回车返回目录模式
                      returnToDirectory();
                    }
                  }
                }}
                placeholder={
                  currentView === 'remote-search' ? t('search.remoteResults') : t('search.files')
                }
                className="w-32 sm:w-48 lg:w-64 pl-8 lg:pl-10 pr-6 lg:pr-8 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                readOnly={currentView === 'remote-search'}
              />
              {((currentView === 'directory' && searchTerm) || currentView === 'remote-search') && (
                <button
                  onClick={currentView === 'remote-search' ? returnToDirectory : handleClearSearch}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 刷新按钮 */}
            <button
              onClick={refreshCurrentDirectory}
              disabled={isRefreshing}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              title="刷新当前目录"
            >
              <RefreshCw
                className={`w-4 h-4 text-gray-600 dark:text-gray-300 ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </button>

            {/* 文件夹下载按钮 */}
            {/* 下载文件夹按钮 */}
            <button
              onClick={downloadCurrentFolder}
              disabled={loading || isRefreshing || files.length === 0}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              title={t('download.folder.all')}
            >
              <Download className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main ref={containerRef} className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          {loading && (
            <LoadingDisplay
              message={
                currentPath
                  ? t('loading.directory', { path: ` "${currentPath}" ` })
                  : t('loading.directory.root')
              }
            />
          )}

          {error && (
            <ErrorDisplay
              message={error} // 直接使用error状态中的具体错误信息
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
              <div
                ref={tableHeaderRef}
                className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-3"
              >
                <div className="flex items-center">
                  <div className="flex-1 pr-2 lg:pr-4">
                    <div
                      className="flex items-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                      onClick={() => handleSort('name')}
                    >
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('name')}
                      </span>
                      {sortField === 'name' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="ml-1 w-3 h-3" />
                        ) : (
                          <ChevronDown className="ml-1 w-3 h-3" />
                        ))}
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
                      {sortField === 'size' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="ml-1 w-3 h-3" />
                        ) : (
                          <ChevronDown className="ml-1 w-3 h-3" />
                        ))}
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
                      {sortField === 'modified' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="ml-1 w-3 h-3" />
                        ) : (
                          <ChevronDown className="ml-1 w-3 h-3" />
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 文件列表或空状态 */}
              {files.length > 0 ? (
                !showHidden && files.every(file => file.basename?.startsWith('.')) ? (
                  <HiddenFilesDisplay onShowHidden={() => setShowHidden(true)} />
                ) : getDisplayFiles().length === 0 ? (
                  supportsGlobalSearch() && shouldAllowRemoteSearch() ? (
                    <NoLocalResultsDisplay
                      searchTerm={searchTerm}
                      onRemoteSearch={() => handleGlobalSearch(searchTerm)}
                    />
                  ) : currentView === 'remote-search' ? (
                    <NoRemoteResultsDisplay
                      searchTerm={remoteSearchQuery}
                      onClearSearch={returnToDirectory}
                    />
                  ) : (
                    <NoSearchResultsDisplay
                      searchTerm={searchTerm}
                      onClearSearch={handleClearSearch}
                    />
                  )
                ) : (
                  <div ref={fileListRef} className="bg-white dark:bg-gray-800 relative">
                    <VirtualizedFileList
                      files={getDisplayFiles()}
                      onFileClick={handleItemClick}
                      height={containerHeight - tableHeaderHeight} // 恢复原来的高度
                      onScrollToBottom={handleScrollToBottom}
                    />
                    {/* Loading more indicator - 绝对定位覆盖层 */}
                    {loadingMore && (
                      <div className="absolute bottom-0 left-0 right-0 px-4 py-2 bg-gray-50/95 dark:bg-gray-800/95 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 backdrop-blur-sm">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          <span>{t('loading.more')}</span>
                        </div>
                      </div>
                    )}
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
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
};
