import { listen } from '@tauri-apps/api/event';
import { StorageFile } from '../types';
import { StorageServiceManager } from './storage';

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
  private async handleFileOpen(filePath: string): Promise<{
    success: boolean;
    file?: StorageFile;
    fileName: string;
    error?: string;
  }> {
    try {
      // 获取文件所在目录作为本地存储根路径
      const separator = filePath.includes('/') ? '/' : '\\';
      const lastSeparatorIndex = filePath.lastIndexOf(separator);
      const fileDir = lastSeparatorIndex > 0 ? filePath.substring(0, lastSeparatorIndex) : '.';
      
      // 清除用户断开连接标记，允许文件关联打开
      localStorage.removeItem('userDisconnected');
      
      // 连接到本地存储
      const success = await StorageServiceManager.connectToLocal(fileDir, 'File Association');
      
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
        fileName
      };
    } catch (error) {
      console.error('Error in handleFileOpen:', error);
      return {
        success: false,
        fileName: '',
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
        size: undefined,
        type: 'file'
      };
    }
  }

  /**
   * 检查是否已通过文件关联连接
   * @returns 是否已连接
   */
  public async isConnectedViaFileAssociation(): Promise<boolean> {
    return await StorageServiceManager.isConnected();
  }
}

// 导出单例实例
export const fileAssociationService = FileAssociationService.getInstance();