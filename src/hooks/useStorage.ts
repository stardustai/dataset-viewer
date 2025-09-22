import { useCallback } from 'react';
import { useStorageStore } from '../stores/storageStore';
import type { ReadOptions } from '../services/storage/types';

/**
 * 主要的存储 hook，提供完整的存储功能
 */
export const useStorage = () => {
  return useStorageStore();
};

/**
 * 获取当前连接状态的 hook
 */
export const useCurrentConnection = () => {
  return useStorageStore(state => ({
    connection: state.currentConnection,
    status: state.connectionStatus,
    error: state.connectionError,
    isConnected: state.isConnected(),
    displayName: state.currentConnection
      ? (state._currentClient?.getDisplayName() ?? 'Unknown')
      : 'Not Connected',
  }));
};

/**
 * 获取文件列表和相关操作的 hook
 */
export const useFileList = () => {
  return useStorageStore(state => ({
    files: state.fileList,
    currentPath: state.currentPath,
    isLoading: state.operationStatus.isLoading,
    error: state.operationStatus.error,
    listDirectory: state.listDirectory,
    navigateTo: state.navigateTo,
  }));
};

/**
 * 获取文件选择状态和操作的 hook
 */
export const useFileSelection = () => {
  return useStorageStore(state => ({
    selectedFiles: state.selectedFiles,
    selectFile: state.selectFile,
    selectMultipleFiles: state.selectMultipleFiles,
    unselectFile: state.unselectFile,
    clearSelection: state.clearSelection,
  }));
};

/**
 * 连接管理相关的 hook
 */
export const useConnectionManager = () => {
  const store = useStorageStore();

  return {
    connections: store.connections,
    currentConnection: store.currentConnection,
    connectionStatus: store.connectionStatus,
    connectionError: store.connectionError,

    // 操作方法
    loadConnections: store.loadConnections,
    connectWithConfig: store.connectWithConfig,
    disconnect: store.disconnect,
    autoConnect: store.autoConnect,

    // CRUD 操作
    addConnection: store.addConnection,
    removeConnection: store.removeConnection,
    updateConnection: store.updateConnection,
    setDefaultConnection: store.setDefaultConnection,

    // 便捷方法
    isConnected: store.isConnected,
    getStorageCapabilities: store.isConnected() ? store.getStorageCapabilities : null,
  };
};

/**
 * 文件操作相关的 hook
 */
export const useFileOperations = () => {
  const store = useStorageStore();

  const getFileContent = useCallback(
    (path: string, options?: ReadOptions) => {
      return store.getFileContent(path, options);
    },
    [store.getFileContent]
  );

  const downloadFile = useCallback(
    (path: string) => {
      return store.downloadFile(path);
    },
    [store.downloadFile]
  );

  const downloadFileWithProgress = useCallback(
    (path: string, filename: string, savePath?: string) => {
      return store.downloadFileWithProgress(path, filename, savePath);
    },
    [store.downloadFileWithProgress]
  );

  return {
    // 文件内容操作
    getFileContent,
    getFileSize: store.getFileSize,
    downloadFile,
    downloadFileWithProgress,
    getFileUrl: store.getFileUrl,

    // 缓存操作
    getCachedFileContent: store.getCachedFileContent,
    cacheFileContent: store.cacheFileContent,
    clearCache: store.clearCache,

    // 状态
    isLoading: store.operationStatus.isLoading,
    error: store.operationStatus.error,
    progress: store.operationStatus.progress,
  };
};

/**
 * 导航历史相关的 hook
 */
export const useNavigationHistory = () => {
  return useStorageStore(state => ({
    history: state.navigationHistory,
    currentIndex: state.historyIndex,
    currentPath: state.currentPath,

    // 导航操作
    navigateTo: state.navigateTo,
    goBack: state.goBack,
    goForward: state.goForward,
    clearHistory: state.clearHistory,

    // 状态检查
    canGoBack: state.historyIndex > 0,
    canGoForward: state.historyIndex < state.navigationHistory.length - 1,
  }));
};

/**
 * 操作状态管理的 hook
 */
export const useOperationStatus = () => {
  return useStorageStore(state => ({
    isLoading: state.operationStatus.isLoading,
    error: state.operationStatus.error,
    progress: state.operationStatus.progress,

    // 操作方法
    setLoading: state.setLoading,
    setError: state.setError,
    clearError: state.clearError,
    setProgress: state.setProgress,
  }));
};

/**
 * 存储能力相关的 hook
 */
export const useStorageCapabilities = () => {
  return useStorageStore(state => {
    if (!state.isConnected()) {
      return null;
    }

    try {
      return state.getStorageCapabilities();
    } catch {
      return null;
    }
  });
};

/**
 * 获取存储客户端实例的 hook (谨慎使用)
 */
export const useStorageClient = () => {
  return useStorageStore(state => {
    try {
      return state.getCurrentClient();
    } catch {
      return null;
    }
  });
};
