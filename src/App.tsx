import { useState, useEffect } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel';
import { FileBrowser } from './components/FileBrowser';
import { FileViewer } from './components/FileViewer';
import { DownloadProgress } from './components/DownloadProgress';
import { UpdateNotification, useUpdateNotification } from './components/UpdateNotification';
import { SplashScreen } from './components/SplashScreen';
import ErrorBoundary from './components/common/ErrorBoundary';
import { StorageFile } from './types';
import { StorageServiceManager } from './services/storage';
import { navigationHistoryService } from './services/navigationHistory';
import { androidBackHandler, AndroidBackHandlerService } from './services/androidBackHandler';
import { useTheme } from './hooks/useTheme';
import './i18n';
import './App.css';

type AppState = 'initializing' | 'connecting' | 'browsing' | 'viewing';

function App() {
  // 初始化主题系统
  useTheme();

  // 更新通知功能
  const { showNotification, hideUpdateDialog } = useUpdateNotification();

  const [appState, setAppState] = useState<AppState>('initializing');
  const [selectedFile, setSelectedFile] = useState<StorageFile | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [selectedStorageClient, setSelectedStorageClient] = useState<any>(null);
  const [currentDirectory, setCurrentDirectory] = useState<string>('');
  const [showDownloadProgress, setShowDownloadProgress] = useState(true);

  useEffect(() => {
    // 移除初始加载指示器
    const removeInitialLoader = () => {
      const initialLoader = document.querySelector('.app-loading');
      if (initialLoader) {
        initialLoader.remove();
      }
    };

    // 初始化安卓返回按钮处理
    const initializeAndroidBackHandler = async () => {
      try {
        const isAndroid = AndroidBackHandlerService.isAndroid();
        if (isAndroid) {
          await androidBackHandler.initialize();
        }
      } catch (error) {
        console.error('Failed to initialize Android back handler:', error);
      }
    };

    // 尝试自动连接到上次的服务
    const tryAutoConnect = async () => {
      try {
        // 初始化安卓返回按钮处理
        await initializeAndroidBackHandler();

        // 检查用户是否主动断开了连接
        const wasDisconnected = localStorage.getItem('userDisconnected') === 'true';

        if (wasDisconnected) {
          // 如果用户主动断开过连接，直接显示连接页面
          setAppState('connecting');
          removeInitialLoader();
          return;
        }

        const success = await StorageServiceManager.autoConnect();
        if (success) {
          setAppState('browsing');
        } else {
          setAppState('connecting');
        }
        removeInitialLoader();
      } catch (error) {
        console.warn('Auto connect failed:', error);
        setAppState('connecting');
        removeInitialLoader();
      }
    };

    tryAutoConnect();
  }, []);

  // 安卓返回按钮处理逻辑
  useEffect(() => {
    const handleAndroidBack = () => {
      // 根据当前应用状态处理返回逻辑
      switch (appState) {
        case 'viewing':
          // 从文件查看器返回到文件浏览器
          handleBackToBrowser();
          return true; // 表示已处理
        
        case 'browsing':
          // 在文件浏览器中，如果不在根目录，则返回上级目录
          if (currentDirectory && currentDirectory !== '') {
            // 计算父目录路径
            const segments = currentDirectory.split('/').filter(s => s);
            segments.pop();
            const parentPath = segments.join('/');
            setCurrentDirectory(parentPath);
            return true; // 表示已处理
          }
          // 如果在根目录，返回 false 让系统处理（退出应用）
          return false;
        
        case 'connecting':
          // 在连接页面，返回 false 让系统处理（退出应用）
          return false;
        
        default:
          return false;
      }
    };

    // 注册安卓返回按钮处理器
    androidBackHandler.addHandler(handleAndroidBack);

    // 清理函数
    return () => {
      androidBackHandler.removeHandler(handleAndroidBack);
    };
  }, [appState, currentDirectory]);

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

  const handleFileSelect = (file: StorageFile, path: string, storageClient?: any) => {
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

  const renderContent = () => {
    if (appState === 'initializing') {
      return <SplashScreen />;
    }

    if (appState === 'connecting') {
      return (
        <div className="page-transition">
          <ConnectionPanel onConnect={handleConnect} />
        </div>
      );
    }

    // 主应用区域 - FileBrowser 和 FileViewer 都存在，但只显示其中一个
    return (
      <div className="h-screen page-transition">
        {/* 数据浏览器 - 始终渲染但可能隐藏 */}
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
          <div className="page-transition h-full">
            <FileViewer
              file={selectedFile}
              filePath={selectedFilePath}
              storageClient={selectedStorageClient}
              onBack={handleBackToBrowser}
            />
          </div>
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
  };

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // 记录错误到控制台，便于调试
        console.error('Application Error:', error);
        console.error('Error Info:', errorInfo);
        
        // 可以在这里添加错误上报逻辑
        // 例如发送到错误监控服务
      }}
    >
      {renderContent()}
    </ErrorBoundary>
  );
}

export default App;
