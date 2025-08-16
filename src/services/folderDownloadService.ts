import { StorageServiceManager } from './storage/StorageManager';
import { StorageFile } from '../types';

export interface FolderDownloadState {
  folderId: string;
  folderName: string;
  totalFiles: number;
  completedFiles: number;
  currentFile: string;
  totalSize: number;
  downloadedSize: number;
  progress: number;
  status: 'preparing' | 'downloading' | 'completed' | 'error' | 'cancelled' | 'stopping';
  error?: string;
  startTime: number;
  folderPath?: string;
  recursive?: boolean;
}

export interface FolderDownloadEvents {
  onStart: (state: FolderDownloadState) => void;
  onProgress: (state: FolderDownloadState) => void;
  onFileComplete: (state: FolderDownloadState, completedFile: string) => void;
  onComplete: (state: FolderDownloadState) => void;
  onError: (state: FolderDownloadState, error: string) => void;
}

/**
 * 文件夹下载服务
 * 管理批量文件下载，聚合进度和状态
 */
export class FolderDownloadService {
  private static activeDownloads = new Map<string, FolderDownloadState>();
  private static globalStopFlag = false;

  /**
   * 拼接路径并规整斜杠，保留协议前缀
   */
  private static joinPath(...parts: (string | undefined)[]): string {
    const filteredParts = parts.filter(Boolean) as string[];
    if (filteredParts.length === 0) return '';

    // 检测并提取协议前缀
    const firstPart = filteredParts[0];
    const protocolMatch = firstPart.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)/);
    let protocolPrefix = '';
    let normalizedParts = filteredParts;

    if (protocolMatch) {
      protocolPrefix = protocolMatch[1];
      // 移除第一部分的协议前缀
      normalizedParts = [firstPart.substring(protocolPrefix.length), ...filteredParts.slice(1)];
    }

    // 处理每个部分：去除前后斜杠，过滤空值
    const cleanParts = normalizedParts
      .map(part => part.trim().replace(/^\/+|\/+$/g, ''))
      .filter(part => part.length > 0);

    // 拼接路径并重新附加协议前缀
    const joinedPath = cleanParts.join('/');
    return protocolPrefix + joinedPath;
  }

  /**
   * 开始下载文件夹
   */
  static async downloadFolder(
    folderPath: string,
    folderName: string,
    files: StorageFile[],
    savePath: string,
    events: FolderDownloadEvents,
    recursive: boolean = false
  ): Promise<string> {
    const folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 检查全局停止标志
    if (this.globalStopFlag) {
      throw new Error('Download service is stopped');
    }

    // 立即初始化准备状态并触发 onStart 事件
    const state: FolderDownloadState = {
      folderId,
      folderName,
      totalFiles: 0,
      completedFiles: 0,
      currentFile: recursive ? '正在扫描文件列表...' : '准备下载...',
      totalSize: 0,
      downloadedSize: 0,
      progress: 0,
      status: 'preparing',
      startTime: Date.now(),
      recursive,
    };

    // 立即注册状态并触发开始事件，这样 UI 可以立即显示
    this.activeDownloads.set(folderId, state);
    events.onStart(state);

    try {
      // 异步开始真正的下载流程
      setTimeout(async () => {
        try {
          // 初始化统计信息
          let totalFiles = 0;
          let totalSize = 0;

          // 先计算总文件数和大小（用于进度显示）
          if (recursive) {
            // 更新状态：正在扫描文件
            state.currentFile = '正在扫描文件和文件夹...';
            this.updateState(folderId, state);
            events.onProgress(state);

            const stats = await this.calculateFolderStats(folderPath, files, state, events);
            totalFiles = stats.fileCount;
            totalSize = stats.totalSize;
          } else {
            const currentFiles = files.filter(file => file.type === 'file');
            totalFiles = currentFiles.length;
            totalSize = currentFiles.reduce((sum: number, file: StorageFile) => sum + file.size, 0);
          }

          if (totalFiles === 0) {
            throw new Error('No files to download in the folder');
          }

          // 更新状态：准备完成，开始下载
          state.totalFiles = totalFiles;
          state.totalSize = totalSize;
          state.status = 'downloading';
          state.currentFile = '开始下载文件...';
          this.updateState(folderId, state);
          events.onProgress(state);

          // 使用新的递归下载逻辑
          await this.downloadFolderRecursive(
            folderPath,
            files,
            savePath,
            recursive,
            state,
            events
          );

          if (state.status === 'downloading' && !this.globalStopFlag) {
            // 下载完成
            state.status = 'completed';
            state.progress = 100;
            state.currentFile = '';

            this.updateState(folderId, state);
            events.onComplete(state);
          }
        } catch (error) {
          // 下载失败
          state.status = 'error';
          state.error = error instanceof Error ? error.message : String(error);

          this.updateState(folderId, state);
          events.onError(state, state.error);
        }
      }, 0);

      return `Folder download initiated: ${folderId}`;

    } catch (error) {
      // 初始化失败
      state.status = 'error';
      state.error = error instanceof Error ? error.message : String(error);

      this.updateState(folderId, state);
      events.onError(state, state.error);

      throw error;
    }
  }

  /**
   * 取消文件夹下载
   */
  static cancelDownload(folderId: string): void {
    const state = this.activeDownloads.get(folderId);
    if (state && (state.status === 'downloading' || state.status === 'preparing')) {
      state.status = 'cancelled';
      this.updateState(folderId, state);
    }
  }

  /**
   * 获取下载状态
   */
  static getDownloadState(folderId: string): FolderDownloadState | undefined {
    return this.activeDownloads.get(folderId);
  }

  /**
   * 移除下载记录
   */
  static removeDownload(folderId: string): void {
    this.activeDownloads.delete(folderId);
  }

  /**
   * 获取所有活跃的下载
   */
  static getActiveDownloads(): FolderDownloadState[] {
    return Array.from(this.activeDownloads.values());
  }

  /**
   * 停止所有下载
   */
  static async stopAllDownloads(): Promise<void> {
    this.globalStopFlag = true;

    // 将所有活跃下载标记为停止中
    for (const [folderId, state] of this.activeDownloads.entries()) {
      if (state.status === 'downloading') {
        state.status = 'stopping';
        this.updateState(folderId, state);
      }
    }

    // 同时调用后端取消所有下载
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('cancel_all_downloads');
    } catch (error) {
      console.warn('Failed to cancel backend downloads:', error);
    }
  }  /**
   * 重新启用下载服务
   */
  static resumeDownloadService(): void {
    this.globalStopFlag = false;
  }

  /**
   * 检查下载服务是否被停止
   */
  static isDownloadServiceStopped(): boolean {
    return this.globalStopFlag;
  }

  /**
   * 计算文件夹统计信息（文件数量和总大小）
   */
  private static async calculateFolderStats(
    basePath: string,
    files: StorageFile[],
    state?: FolderDownloadState,
    events?: FolderDownloadEvents
  ): Promise<{fileCount: number, totalSize: number}> {
    let fileCount = 0;
    let totalSize = 0;

    // 统计当前目录的文件
    const currentFiles = files.filter(file => file.type === 'file');
    fileCount += currentFiles.length;
    totalSize += currentFiles.reduce((sum: number, file: StorageFile) => sum + file.size, 0);

    // 更新扫描进度
    if (state && events) {
      state.currentFile = `扫描目录: ${basePath || '根目录'}`;
      this.updateState(state.folderId, state);
      events.onProgress(state);
    }

    // 递归统计子目录
    const directories = files.filter(file => file.type === 'directory');
    for (const dir of directories) {
      if (this.globalStopFlag || (state && state.status === 'cancelled')) break;

      try {
        const dirPath = basePath ? `${basePath}/${dir.filename}` : dir.filename;
        const subFiles = await StorageServiceManager.listDirectory(dirPath);
        const subStats = await this.calculateFolderStats(dirPath, subFiles, state, events);
        fileCount += subStats.fileCount;
        totalSize += subStats.totalSize;
      } catch (error) {
        console.error(`Failed to list directory ${dir.filename}:`, error);
      }
    }

    return { fileCount, totalSize };
  }

  /**
   * 递归下载文件夹 - 先下载文件，后处理子文件夹
   */
  private static async downloadFolderRecursive(
    currentPath: string,
    files: StorageFile[],
    baseSavePath: string,
    recursive: boolean,
    state: FolderDownloadState,
    events: FolderDownloadEvents
  ): Promise<void> {
    // 1. 先下载当前目录的所有文件
    const currentFiles = files.filter(file => file.type === 'file');

    for (const file of currentFiles) {
      if (state.status === 'cancelled' || this.globalStopFlag) {
        return;
      }

      // 更新当前文件
      state.currentFile = file.basename;
      this.updateState(state.folderId, state);
      events.onProgress(state);

      try {
        // 构建文件路径（若 filename 可能已包含 currentPath，使用更稳健的拼接）
        const filePath = currentPath
          ? (file.filename.startsWith(`${currentPath}/`) ? file.filename : this.joinPath(currentPath, file.filename))
          : file.filename;

        // 下载单个文件（savePath 传目录，文件名由 filename 指定）
        await StorageServiceManager.downloadFileWithProgress(filePath, file.basename, baseSavePath);

        // 更新进度
        state.completedFiles++;
        state.downloadedSize += file.size;
        state.progress = Math.round((state.completedFiles / state.totalFiles) * 100);

        this.updateState(state.folderId, state);
        events.onFileComplete(state, file.basename);
        events.onProgress(state);

      } catch (error) {
        console.error(`Failed to download file ${file.basename}:`, error);
        // 单个文件失败不影响整体下载，继续下载其他文件
      }
    }

    // 2. 如果启用递归，然后处理子文件夹
    if (recursive) {
      const directories = files.filter(file => file.type === 'directory');

      for (const dir of directories) {
        if (state.status === 'cancelled' || this.globalStopFlag) {
          return;
        }

        try {
          // 构建子目录路径（使用 basename 避免路径重复）
          const dirPath = this.joinPath(currentPath, dir.basename);
          const dirSavePath = this.joinPath(baseSavePath, dir.basename);

          // 获取子目录文件列表
          const subFiles = await StorageServiceManager.listDirectory(dirPath);

          // 递归下载子目录
          await this.downloadFolderRecursive(
            dirPath,
            subFiles,
            dirSavePath,
            recursive,
            state,
            events
          );

        } catch (error) {
          console.error(`Failed to process directory ${dir.basename}:`, error);
          // 单个目录失败不影响整体下载，继续处理其他目录
        }
      }
    }
  }

  private static updateState(folderId: string, state: FolderDownloadState): void {
    this.activeDownloads.set(folderId, { ...state });
  }
}
