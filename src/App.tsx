import { useState, useEffect } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel';
import { FileBrowser } from './components/FileBrowser';
import { FileViewer } from './components/FileViewer';
import { DownloadProgress } from './components/DownloadProgress';
import { UpdateNotification, useUpdateNotification } from './components/UpdateNotification';
import { WebDAVFile } from './types';
import { StorageServiceManager } from './services/storage';
import { navigationHistoryService } from './services/navigationHistory';
import { useTheme } from './hooks/useTheme';
import { Loader2 } from 'lucide-react';
import './i18n';
import './App.css';

type AppState = 'initializing' | 'connecting' | 'browsing' | 'viewing';

function App() {
  // 初始化主题系统
  useTheme();

  // 更新通知功能
  const { showNotification, hideUpdateDialog } = useUpdateNotification();

  const [appState, setAppState] = useState<AppState>('initializing');
  const [selectedFile, setSelectedFile] = useState<WebDAVFile | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [selectedStorageClient, setSelectedStorageClient] = useState<any>(null);
  const [currentDirectory, setCurrentDirectory] = useState<string>('');
  const [showDownloadProgress, setShowDownloadProgress] = useState(true);

  useEffect(() => {
    // 尝试自动连接到上次的服务
    const tryAutoConnect = async () => {
      try {
        // 检查用户是否主动断开了连接
        const wasDisconnected = localStorage.getItem('userDisconnected') === 'true';

        if (wasDisconnected) {
          // 如果用户主动断开过连接，直接显示连接页面
          setAppState('connecting');
          return;
        }

        const success = await StorageServiceManager.autoConnect();
        if (success) {
          setAppState('browsing');
        } else {
          setAppState('connecting');
        }
      } catch (error) {
        console.warn('Auto connect failed:', error);
        setAppState('connecting');
      }
    };

    tryAutoConnect();
  }, []);

  const handleConnect = () => {
    // 连接成功时清除断开连接标记
    localStorage.removeItem('userDisconnected');
    setAppState('browsing');
  };

  const handleDisconnect = () => {
    // 断开存储连接
    StorageServiceManager.disconnect();

    // 清理导航历史和缓存
    navigationHistoryService.clearHistory();
    navigationHistoryService.clearScrollPositions();
    navigationHistoryService.clearDirectoryCache();

    // 标记用户主动断开了连接
    localStorage.setItem('userDisconnected', 'true');

    // 重置应用状态
    setAppState('connecting');
    setSelectedFile(null);
    setSelectedFilePath('');
    setCurrentDirectory('');
  };

  const handleFileSelect = (file: WebDAVFile, path: string, storageClient?: any) => {
    setSelectedFile(file);
    setSelectedFilePath(path);
    setSelectedStorageClient(storageClient); // 保存存储客户端引用
    setAppState('viewing');
  };

  const handleBackToBrowser = () => {
    setAppState('browsing');
    setSelectedFile(null);
    setSelectedFilePath('');
    setSelectedStorageClient(null);
  };

  const handleDirectoryChange = (path: string) => {
    setCurrentDirectory(path);
  };

  if (appState === 'initializing') {
    return (
      <div className="h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">正在初始化...</p>
        </div>
      </div>
    );
  }

  if (appState === 'connecting') {
    return <ConnectionPanel onConnect={handleConnect} />;
  }

  // 主应用区域 - FileBrowser 和 FileViewer 都存在，但只显示其中一个
  return (
    <div className="h-screen">
      {/* 文件浏览器 - 始终渲染但可能隐藏 */}
      <div className={appState === 'viewing' ? 'hidden' : ''}>
        <FileBrowser
          onFileSelect={handleFileSelect}
          onDisconnect={handleDisconnect}
          initialPath={currentDirectory}
          onDirectoryChange={handleDirectoryChange}
        />
      </div>

      {/* 文件查看器 - 只在查看状态时显示 */}
      {appState === 'viewing' && selectedFile && (
        <FileViewer
          file={selectedFile}
          filePath={selectedFilePath}
          storageClient={selectedStorageClient}
          onBack={handleBackToBrowser}
        />
      )}

      {/* 下载进度组件 */}
      <DownloadProgress
        isVisible={showDownloadProgress}
        onClose={() => setShowDownloadProgress(false)}
      />

      {/* 更新通知 */}
      {showNotification && (
        <UpdateNotification onClose={hideUpdateDialog} />
      )}
    </div>
  );
}

export default App;
