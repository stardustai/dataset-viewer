import { enableMapSet } from 'immer';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { connectionStorage, type StoredConnection } from '../services/connectionStorage';
import type { StorageClient } from '../services/storage/StorageClient';
import { StorageClientFactory } from '../services/storage/StorageManager';
import type {
  ConnectionConfig,
  DirectoryResult,
  FileContent,
  ListOptions,
  ReadOptions,
  StorageClientType,
} from '../services/storage/types';
import type { StorageFile } from '../types';

// 启用 Immer 的 Map 和 Set 支持
enableMapSet();

/**
 * 导航历史记录
 */
export interface NavigationHistoryItem {
  path: string;
  timestamp: number;
}

/**
 * 存储连接状态
 */
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';

/**
 * 文件操作状态
 */
export interface FileOperationStatus {
  isLoading: boolean;
  error: string | null;
  progress?: number;
}

/**
 * Zustand 存储状态接口
 */
export interface StorageState {
  // === 连接管理 ===
  connections: StoredConnection[];
  currentConnection: ConnectionConfig | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // === 文件操作 ===
  currentPath: string;
  fileList: StorageFile[];
  selectedFiles: StorageFile[];

  // === 文件内容缓存 ===
  fileCache: Map<string, FileContent>;

  // === 导航历史 ===
  navigationHistory: NavigationHistoryItem[];
  historyIndex: number;

  // === 操作状态 ===
  operationStatus: FileOperationStatus;

  // === 私有状态 ===
  _currentClient: StorageClient | null;
}

/**
 * 存储操作接口
 */
export interface StorageActions {
  // === 连接管理操作 ===
  loadConnections: () => void;
  connectWithConfig: (config: ConnectionConfig) => Promise<boolean>;
  disconnect: () => void;
  autoConnect: () => Promise<boolean>;
  setCurrentConnection: (connection: ConnectionConfig | null) => void;

  // === 连接CRUD操作 ===
  addConnection: (connection: StoredConnection) => void;
  removeConnection: (id: string) => void;
  updateConnection: (id: string, updates: Partial<StoredConnection>) => void;
  setDefaultConnection: (id: string) => void;

  // === 文件操作 ===
  listDirectory: (path?: string, options?: ListOptions) => Promise<DirectoryResult>;
  getFileContent: (path: string, options?: ReadOptions) => Promise<FileContent>;
  getFileSize: (path: string) => Promise<number>;
  downloadFile: (path: string) => Promise<Blob>;
  downloadFileWithProgress: (path: string, filename: string, savePath?: string) => Promise<string>;

  // === 文件选择管理 ===
  selectFile: (file: StorageFile) => void;
  selectMultipleFiles: (files: StorageFile[]) => void;
  unselectFile: (file: StorageFile) => void;
  clearSelection: () => void;

  // === 导航管理 ===
  navigateTo: (path: string) => void;
  goBack: () => boolean;
  goForward: () => boolean;
  clearHistory: () => void;

  // === 缓存管理 ===
  cacheFileContent: (path: string, content: FileContent) => void;
  getCachedFileContent: (path: string) => FileContent | undefined;
  clearCache: () => void;

  // === 工具方法 ===
  getCurrentClient: () => StorageClient;
  isConnected: () => boolean;
  getFileUrl: (path: string) => string;
  getStorageCapabilities: () => {
    type: StorageClientType;
    supportsRangeRequests: boolean;
    supportsSearch: boolean;
  };

  // === 错误处理 ===
  setError: (error: string | null) => void;
  clearError: () => void;

  // === 操作状态管理 ===
  setLoading: (isLoading: boolean) => void;
  setProgress: (progress?: number) => void;
}

/**
 * 完整的存储状态类型
 */
export type StorageStore = StorageState & StorageActions;

/**
 * 创建存储状态管理 store
 */
export const useStorageStore = create<StorageStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // === 初始状态 ===
      connections: [],
      currentConnection: null,
      connectionStatus: 'idle',
      connectionError: null,
      currentPath: '',
      fileList: [],
      selectedFiles: [],
      fileCache: new Map(),
      navigationHistory: [],
      historyIndex: -1,
      operationStatus: {
        isLoading: false,
        error: null,
      },
      _currentClient: null,

      // === 连接管理操作 ===
      loadConnections: () => {
        set(state => {
          state.connections = connectionStorage.getStoredConnections();
        });
      },

      connectWithConfig: async (config: ConnectionConfig): Promise<boolean> => {
        const state = get();

        set(state => {
          state.connectionStatus = 'connecting';
          state.connectionError = null;
        });

        try {
          // 断开现有连接
          if (state._currentClient) {
            state._currentClient.disconnect();
          }

          // 连接新的存储
          const client = await StorageClientFactory.connectToStorage(config);

          set(state => {
            state._currentClient = client;
            state.currentConnection = config;
            state.connectionStatus = 'connected';
            state.currentPath = ''; // 重置当前路径
            state.fileList = []; // 清空文件列表
            state.selectedFiles = []; // 清空选择
            state.clearHistory(); // 清空导航历史
          });

          // 自动保存连接信息（除非明确标记为临时连接）
          if (!config.isTemporary) {
            const connectionId = await connectionStorage.saveConnection(
              config,
              client.generateConnectionName(config)
            );
            if (connectionId) {
              connectionStorage.setDefaultConnection(connectionId);
              // 重新加载连接列表
              get().loadConnections();
            }
          }

          return true;
        } catch (error) {
          console.error('Connection failed:', error);
          set(state => {
            state.connectionStatus = 'error';
            state.connectionError = error instanceof Error ? error.message : String(error);
            state._currentClient = null;
            state.currentConnection = null;
          });
          return false;
        }
      },

      disconnect: () => {
        const state = get();
        if (state._currentClient) {
          state._currentClient.disconnect();
        }

        set(state => {
          state._currentClient = null;
          state.currentConnection = null;
          state.connectionStatus = 'disconnected';
          state.connectionError = null;
          state.currentPath = '';
          state.fileList = [];
          state.selectedFiles = [];
          state.clearHistory();
          state.clearCache();
        });
      },

      autoConnect: async (): Promise<boolean> => {
        try {
          // 尝试使用默认连接
          const defaultConnection = connectionStorage.getDefaultConnection();
          if (defaultConnection) {
            return await get().connectWithConfig(defaultConnection.config);
          }

          // 尝试使用最近的连接
          const connections = connectionStorage.getStoredConnections();
          if (connections.length > 0) {
            return await get().connectWithConfig(connections[0].config);
          }

          return false;
        } catch (error) {
          console.warn('Auto connect failed:', error);
          return false;
        }
      },

      setCurrentConnection: (connection: ConnectionConfig | null) => {
        set(state => {
          state.currentConnection = connection;
        });
      },

      // === 连接CRUD操作 ===
      addConnection: (connection: StoredConnection) => {
        // connectionStorage 没有 addConnection 方法，直接保存连接
        connectionStorage.saveConnection(connection.config, connection.name);
        get().loadConnections();
      },

      removeConnection: (id: string) => {
        connectionStorage.deleteConnection(id);
        get().loadConnections();
      },

      updateConnection: (id: string, updates: Partial<StoredConnection>) => {
        const connections = connectionStorage.getStoredConnections();
        const connection = connections.find(c => c.id === id);
        if (connection) {
          // 更新连接名称
          if (updates.name) {
            connectionStorage.renameConnection(id, updates.name);
          }
          // 如果需要更新配置，重新保存连接
          if (updates.config) {
            connectionStorage.saveConnection(updates.config, updates.name || connection.name);
          }
          get().loadConnections();
        }
      },

      setDefaultConnection: (id: string) => {
        connectionStorage.setDefaultConnection(id);
        get().loadConnections();
      },

      // === 文件操作 ===
      listDirectory: async (path: string = '', options?: ListOptions): Promise<DirectoryResult> => {
        const client = get().getCurrentClient();

        set(state => {
          state.setLoading(true);
          state.setError(null);
        });

        try {
          const result = await client.listDirectory(path, options);

          set(state => {
            state.currentPath = path;
            state.fileList = result.files;
            state.setLoading(false);
          });

          return result;
        } catch (error) {
          set(state => {
            state.setError(error instanceof Error ? error.message : String(error));
            state.setLoading(false);
          });
          throw error;
        }
      },

      getFileContent: async (path: string, options?: ReadOptions): Promise<FileContent> => {
        const client = get().getCurrentClient();

        // 检查缓存
        const cached = get().getCachedFileContent(path);
        if (cached && !options) {
          return cached;
        }

        set(state => {
          state.setLoading(true);
          state.setError(null);
        });

        try {
          const content = await client.getFileContent(path, options);

          // 缓存完整文件内容
          if (!options) {
            get().cacheFileContent(path, content);
          }

          set(state => {
            state.setLoading(false);
          });

          return content;
        } catch (error) {
          set(state => {
            state.setError(error instanceof Error ? error.message : String(error));
            state.setLoading(false);
          });
          throw error;
        }
      },

      getFileSize: async (path: string): Promise<number> => {
        const client = get().getCurrentClient();
        return await client.getFileSize(path);
      },

      downloadFile: async (path: string): Promise<Blob> => {
        const client = get().getCurrentClient();
        return await client.getFileAsBlob(path);
      },

      downloadFileWithProgress: async (
        path: string,
        filename: string,
        savePath?: string
      ): Promise<string> => {
        const client = get().getCurrentClient();
        if (client.downloadFileWithProgress) {
          return await client.downloadFileWithProgress(path, filename, savePath);
        }
        throw new Error('Progress download not supported for this storage type');
      },

      // === 文件选择管理 ===
      selectFile: (file: StorageFile) => {
        set(state => {
          const index = state.selectedFiles.findIndex(
            (f: StorageFile) => f.filename === file.filename
          );
          if (index === -1) {
            state.selectedFiles.push(file);
          }
        });
      },

      selectMultipleFiles: (files: StorageFile[]) => {
        set(state => {
          // 去重添加
          files.forEach(file => {
            const index = state.selectedFiles.findIndex(
              (f: StorageFile) => f.filename === file.filename
            );
            if (index === -1) {
              state.selectedFiles.push(file);
            }
          });
        });
      },

      unselectFile: (file: StorageFile) => {
        set(state => {
          const index = state.selectedFiles.findIndex(
            (f: StorageFile) => f.filename === file.filename
          );
          if (index !== -1) {
            state.selectedFiles.splice(index, 1);
          }
        });
      },

      clearSelection: () => {
        set(state => {
          state.selectedFiles = [];
        });
      },

      // === 导航管理 ===
      navigateTo: (path: string) => {
        set(state => {
          // 添加到历史记录
          const historyItem: NavigationHistoryItem = {
            path,
            timestamp: Date.now(),
          };

          // 如果当前不在历史记录的末尾，删除前进历史
          if (state.historyIndex < state.navigationHistory.length - 1) {
            state.navigationHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
          }

          state.navigationHistory.push(historyItem);
          state.historyIndex = state.navigationHistory.length - 1;
          state.currentPath = path;
        });
      },

      goBack: (): boolean => {
        const state = get();
        if (state.historyIndex > 0) {
          set(state => {
            state.historyIndex--;
            state.currentPath = state.navigationHistory[state.historyIndex].path;
          });
          return true;
        }
        return false;
      },

      goForward: (): boolean => {
        const state = get();
        if (state.historyIndex < state.navigationHistory.length - 1) {
          set(state => {
            state.historyIndex++;
            state.currentPath = state.navigationHistory[state.historyIndex].path;
          });
          return true;
        }
        return false;
      },

      clearHistory: () => {
        set(state => {
          state.navigationHistory = [];
          state.historyIndex = -1;
        });
      },

      // === 缓存管理 ===
      cacheFileContent: (path: string, content: FileContent) => {
        set(state => {
          state.fileCache.set(path, content);
        });
      },

      getCachedFileContent: (path: string): FileContent | undefined => {
        return get().fileCache.get(path);
      },

      clearCache: () => {
        set(state => {
          state.fileCache.clear();
        });
      },

      // === 工具方法 ===
      getCurrentClient: (): StorageClient => {
        const client = get()._currentClient;
        if (!client) {
          throw new Error('No storage client connected');
        }
        return client;
      },

      isConnected: (): boolean => {
        const state = get();
        return state._currentClient?.isConnected() || false;
      },

      getFileUrl: (path: string): string => {
        const client = get().getCurrentClient();
        return client.toProtocolUrl(path);
      },

      getStorageCapabilities: () => {
        const state = get();
        if (!state._currentClient || !state.currentConnection) {
          throw new Error('No storage connection active');
        }

        return {
          type: state.currentConnection.type,
          supportsRangeRequests: true,
          supportsSearch: state._currentClient.supportsSearch(),
        };
      },

      // === 错误处理 ===
      setError: (error: string | null) => {
        set(state => {
          state.operationStatus.error = error;
        });
      },

      clearError: () => {
        set(state => {
          state.operationStatus.error = null;
        });
      },

      // === 操作状态管理 ===
      setLoading: (isLoading: boolean) => {
        set(state => {
          state.operationStatus.isLoading = isLoading;
        });
      },

      setProgress: (progress?: number) => {
        set(state => {
          state.operationStatus.progress = progress;
        });
      },
    }))
  )
);
