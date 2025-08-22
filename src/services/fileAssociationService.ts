import { listen } from '@tauri-apps/api/event';
import { StorageFile } from '../types';
import { StorageServiceManager } from './storage';
import { navigationHistoryService } from './navigationHistory';

/**
 * Result type for file opening operations
 */
export interface OpenFileResult {
  success: boolean;
  file?: StorageFile;
  fileName: string;
  fileDirectory?: string;
  error?: string;
}

/**
 * 文件关联服务
 * 处理通过文件关联打开应用时的逻辑
 */
export class FileAssociationService {
  private static instance: FileAssociationService;
  private isListenerSetup = false;

  private constructor() {}

  public static getInstance(): FileAssociationService {
    if (!FileAssociationService.instance) {
      FileAssociationService.instance = new FileAssociationService();
    }
    return FileAssociationService.instance;
  }

  /**
   * 设置文件打开监听器
   * @param onFileOpen 文件打开回调函数
   * @param onError 错误回调函数
   */
  public async setupFileOpenListener(
    onFileOpen: (file: StorageFile, fileName: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (this.isListenerSetup) {
      return;
    }

    try {
      await listen('file-opened', async (event) => {
        const filePath = event.payload as string;
        console.log('File opened from association:', filePath);

        try {
          const result = await this.handleFileOpen(filePath);
          if (result.success && result.file) {
            onFileOpen(result.file, result.fileName);
          } else {
            onError(result.error || 'Unknown error occurred');
          }
        } catch (error) {
          console.error('Error opening file from association:', error);
          onError('Error opening file from association');
        }
      });

      this.isListenerSetup = true;
    } catch (error) {
      console.error('Failed to setup file open listener:', error);
      throw error;
    }
  }

  /**
   * 处理文件打开逻辑
   * @param filePath 文件路径
   * @returns 处理结果
   */
  private async handleFileOpen(filePath: string): Promise<OpenFileResult> {
    try {
      const fileDir = filePath.replace(/[/\\][^/\\]+$/, '') || '.';

      // 清除用户断开连接标记，允许文件关联打开
      localStorage.removeItem('userDisconnected');

      // 清除目录缓存，防止显示其他目录的缓存数据
      navigationHistoryService.clearDirectoryCache();

      // 连接到本地存储（使用临时连接，不保存到已保存连接）
      const success = await StorageServiceManager.connectToLocal(fileDir, 'File Association', true);

      if (!success) {
        return {
          success: false,
          fileName: '',
          error: 'Failed to connect to local storage'
        };
      }

      // 获取相对路径（文件名）
      const fileName = filePath.split(/[\/\\]/).pop() || '';

      // 创建文件对象
      const file = await this.createStorageFile(fileName);

      return {
        success: true,
        file,
        fileName,
        fileDirectory: fileDir
      };
    } catch (error) {
      console.error('Error in handleFileOpen:', error);
      return {
        success: false,
        fileName: '',
        fileDirectory: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 创建 StorageFile 对象
   * @param fileName 文件名
   * @returns StorageFile 对象
   */
  private async createStorageFile(fileName: string): Promise<StorageFile> {
    try {
      // 尝试获取文件大小
      const fileSize = await StorageServiceManager.getFileSize(fileName);

      return {
        filename: fileName,
        basename: fileName,
        lastmod: new Date().toISOString(),
        size: fileSize,
        type: 'file'
      };
    } catch (error) {
      console.error('Failed to get file size:', error);

      // 如果获取文件大小失败，不显示文件大小
      return {
        filename: fileName,
        basename: fileName,
        lastmod: new Date().toISOString(),
        size: 0,
        type: 'file'
      };
    }
  }

  /**
   * 公共方法：处理单个文件的打开
   * @param filePath 文件路径
   * @returns 处理结果
   */
  public async openFile(filePath: string): Promise<OpenFileResult> {
    return await this.handleFileOpen(filePath);
  }

  /**
   * 检查是否已通过文件关联连接
   * @returns 是否已通过文件关联（本地文件）连接
   */
  public async isConnectedViaFileAssociation(): Promise<boolean> {
    try {
      if (!StorageServiceManager.isConnected()) {
        return false;
      }

      const currentConnection = StorageServiceManager.getCurrentConnection();
      return currentConnection.type === 'local';
    } catch (error) {
      // 如果获取当前连接失败，说明没有连接
      return false;
    }
  }
}

// 导出单例实例
export const fileAssociationService = FileAssociationService.getInstance();
