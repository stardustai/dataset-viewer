import { useState, useEffect } from 'react';
import { emit } from '@tauri-apps/api/event';
import { ConnectionPanel } from './components/ConnectionPanel';
import { FileBrowser } from './components/FileBrowser';
import { FileViewer } from './components/FileViewer';
import DownloadProgress from './components/DownloadProgress';
import { UpdateNotification, useUpdateNotification } from './components/UpdateNotification';
import ErrorBoundary from './components/common/ErrorBoundary';
import { StorageFile } from './types';
import { StorageServiceManager } from './services/storage';
import { navigationHistoryService } from './services/navigationHistory';
import { fileAssociationService } from './services/fileAssociationService';
import { useTheme } from './hooks/useTheme';
import './i18n';
import './App.css';

type AppState = 'initializing' | 'connecting' | 'browsing' | 'viewing';

function App() {
  // 检测是否为文件查看模式
  const urlParams = new URLSearchParams(window.location.search);
  const isFileViewerMode = urlParams.get('mode') === 'file-viewer';

  // 初始化主题系统
  useTheme();

  // 更新通知功能
  const { showNotification, hideUpdateDialog } = useUpdateNotification();

  const [appState, setAppState] = useState<AppState>('initializing');
  const [selectedFile, setSelectedFile] = useState<StorageFile | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [selectedStorageClient, setSelectedStorageClient] = useState<any>(null);
  const [currentDirectory, setCurrentDirectory] = useState<string>('');
  const [hasAssociatedFiles, setHasAssociatedFiles] = useState(false);
  const [showDownloadProgress, setShowDownloadProgress] = useState(true);
  const [isReturningFromViewer, setIsReturningFromViewer] = useState(false);
  const [isFileAssociationMode, setIsFileAssociationMode] = useState(false);
  const [forceTextMode, setForceTextMode] = useState(false);

  // 监听状态变化，立即移除loading以避免空白闪烁
  useEffect(() => {
    if (appState === 'initializing') return;
    const initialLoader = document.querySelector('.app-loading') as HTMLElement;
    if (initialLoader && initialLoader.parentNode) {
      initialLoader.parentNode.removeChild(initialLoader);
    }
  }, [appState]);

  const handleFileSelect = (
    file: StorageFile,
    path: string,
    storageClient?: any,
    files?: StorageFile[],
    isForceTextMode?: boolean
  ) => {
    setSelectedFile(file);
    setSelectedFilePath(path);
    setSelectedStorageClient(storageClient); // 保存存储客户端引用
    setForceTextMode(!!isForceTextMode); // 设置强制文本模式

    // 检查是否存在关联文件（如YOLO标注的txt文件）
    if (files && file.basename) {
      const baseName = file.basename.replace(/\.[^.]+$/, ''); // 移除扩展名
      const correspondingTxtExists = files.some(
        f => f.basename === `${baseName}.txt` && f.type === 'file'
      );
      setHasAssociatedFiles(correspondingTxtExists);
    } else {
      setHasAssociatedFiles(false);
    }

    setAppState('viewing');
  };

  useEffect(() => {
    // 如果是文件查看模式且URL中有文件参数，直接处理
    if (isFileViewerMode) {
      const filePathFromUrl = urlParams.get('file');
      if (filePathFromUrl) {
        const initFileViewer = async () => {
          try {
            // 直接处理文件路径
            const decodedFilePath = decodeURIComponent(filePathFromUrl);
            const result = await fileAssociationService.openFile(decodedFilePath);

            if (result.success && result.file) {
              const currentStorageClient = StorageServiceManager.getCurrentClient();
              // 标记当前是文件关联模式
              setIsFileAssociationMode(true);
              handleFileSelect(result.file, result.fileName, currentStorageClient);
            } else {
              setAppState('connecting');
            }
          } catch (error) {
            console.error('File association error:', error);
            setAppState('connecting');
          }
        };

        initFileViewer();
        return; // 文件查看模式下不执行后续的自动连接逻辑
      }
    }

    // 监听文件打开事件
    const setupFileOpenListener = async () => {
      try {
        await fileAssociationService.setupFileOpenListener(
          (file: StorageFile, fileName: string) => {
            // 文件打开成功回调
            const currentStorageClient = StorageServiceManager.getCurrentClient();
            // 文件关联连接后，根目录就是文件所在的目录
            // 所以我们需要将FileBrowser的初始路径设置为根目录（空字符串）
            setCurrentDirectory('');
            // 标记当前是文件关联模式
            setIsFileAssociationMode(true);
            // 确保应用状态首先设置为浏览状态
            setAppState('browsing');
            // 然后再处理文件选择（这会将状态改为viewing）
            handleFileSelect(file, fileName, currentStorageClient);
          },
          (error: string) => {
            // 错误回调
            console.error('File association error:', error);
            setAppState('connecting');
          }
        );
      } catch (error) {
        console.error('Failed to setup file open listener:', error);
      }
    };

    // 尝试自动连接到上次的服务
    const tryAutoConnect = async () => {
      try {
        // 设置文件打开监听器
        await setupFileOpenListener();

        // 等待一小段时间，让文件关联事件有机会触发
        await new Promise(resolve => setTimeout(resolve, 100));

        // 检查是否已经通过文件关联连接了
        const isConnected = await fileAssociationService.isConnectedViaFileAssociation();
        if (isConnected) {
          // 如果已经连接（通过文件关联），设置为browsing状态
          setAppState('browsing');
          return;
        }

        // 检查用户是否主动断开了连接
        const wasDisconnected = localStorage.getItem('userDisconnected') === 'true';

        if (wasDisconnected) {
          // 如果用户主动断开过连接，显示连接页面
          setAppState('connecting');
          return;
        }

        const success = await StorageServiceManager.autoConnect();
        if (success) {
          setAppState('browsing');
        } else {
          setAppState('connecting');
        }

        // 通知后端前端已初始化完成
        try {
          await emit('frontend-ready');
        } catch (error) {
          console.error('Failed to emit frontend-ready event:', error);
        }
      } catch (error) {
        console.warn('Auto connect failed:', error);
        // 自动连接失败，显示连接页面
        setAppState('connecting');

        // 即使出错也要通知后端前端已初始化完成
        try {
          await emit('frontend-ready');
        } catch (emitError) {
          console.error('Failed to emit frontend-ready event:', emitError);
        }
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
    setIsFileAssociationMode(false);
  };

  const handleBackToBrowser = async () => {
    setAppState('browsing');
    setSelectedFile(null);
    setSelectedFilePath('');
    setSelectedStorageClient(null);
    setForceTextMode(false); // 重置强制文本模式

    // 只有当是文件关联模式时，才需要刷新列表
    if (isFileAssociationMode) {
      setIsReturningFromViewer(true);
      // 重置标志，给 FileBrowser 机会响应
      setTimeout(() => setIsReturningFromViewer(false), 100);
      // 返回后清除文件关联模式标记
      setIsFileAssociationMode(false);
    }
  };

  const handleDirectoryChange = (path: string) => {
    setCurrentDirectory(path);
  };

  const renderContent = () => {
    // 在初始化阶段，不渲染任何内容，保持HTML的loading显示
    if (appState === 'initializing') {
      return null;
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
            shouldRefresh={isReturningFromViewer}
          />
        </div>

        {/* 文件查看器 - 只在查看状态时显示 */}
        {appState === 'viewing' && selectedFile && (
          <div className="page-transition h-full">
            <FileViewer
              file={selectedFile}
              filePath={selectedFilePath}
              storageClient={selectedStorageClient}
              hasAssociatedFiles={hasAssociatedFiles}
              onBack={handleBackToBrowser}
              hideBackButton={isFileViewerMode} // 如果是文件查看模式则隐藏返回按钮
              forceTextMode={forceTextMode}
            />
          </div>
        )}

        {/* 下载进度组件 */}
        <DownloadProgress
          isVisible={showDownloadProgress}
          onClose={() => setShowDownloadProgress(false)}
        />

        {/* 更新通知 */}
        {showNotification && <UpdateNotification onClose={hideUpdateDialog} />}
      </div>
    );
  };

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // 记录错误到控制台，便于调试
        console.error('Application Error:', error);
        console.error('Error Info:', errorInfo);
      }}
    >
      {renderContent()}
    </ErrorBoundary>
  );
}

export default App;
