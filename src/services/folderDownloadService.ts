import { StorageServiceManager } from './storage/StorageManager';
import { StorageFile } from '../types';
import { safeParseInt, calculateTotalSize } from '../utils/typeUtils';
import { commands } from '../types/tauri-commands';

export interface FolderDownloadState {
  folderId: string;
  folderName: string;
  totalFiles: number;
  completedFiles: number;
  currentFile: string;
  totalSize: number;
  downloadedSize: number;
  progress: number;
  status: 'preparing' | 'downloading' | 'completed' | 'error' | 'cancelled' | 'stopped';
  error?: string;
  startTime: number;
  folderPath?: string;
  recursive?: boolean;
  // 恢复下载需要的额外信息
  originalFolderPath?: string;
  originalFiles?: StorageFile[];
  originalSavePath?: string;
  originalEvents?: FolderDownloadEvents;
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

  // 并行下载配置
  private static readonly CONCURRENT_DOWNLOADS = 5;

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
   * 拼接本地文件系统路径
   */
  private static joinLocalPath(...parts: (string | undefined)[]): string {
    const filteredParts = parts.filter(Boolean) as string[];
    if (filteredParts.length === 0) return '';

    // 对于本地路径，使用标准的路径分隔符
    return filteredParts.join('/');
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
          // 立即开始下载当前目录的文件
          const currentFiles = files.filter(file => file.type === 'file');
          let totalFiles = currentFiles.length;
          let totalSize = calculateTotalSize(currentFiles);

          // 更新初始状态
          state.totalFiles = totalFiles;
          state.totalSize = totalSize;
          state.status = 'downloading';

          if (totalFiles > 0) {
            state.currentFile = '开始下载文件...';
          } else if (recursive && files.some(f => f.type === 'directory')) {
            state.currentFile = '扫描子目录...';
          } else {
            state.currentFile = '没有文件需要下载';
          }

          this.updateState(folderId, state);
          events.onProgress(state);

          // 如果启用递归下载，启动并行的扫描和下载
          if (recursive) {
            await this.downloadFolderRecursiveOptimized(
              folderPath,
              files,
              savePath,
              state,
              events
            );
          } else {
            // 非递归下载：只下载当前目录文件
            await this.downloadCurrentDirectoryFiles(
              currentFiles,
              folderPath,
              savePath,
              state,
              events
            );
          }

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
    // 倒序排列，最新的下载显示在前面
    return Array.from(this.activeDownloads.values()).reverse();
  }

  /**
   * 停止所有下载
   */
  static async stopAllDownloads(): Promise<void> {
    this.globalStopFlag = true;

    // 将所有活跃下载标记为已停止
    for (const [folderId, state] of this.activeDownloads.entries()) {
      if (state.status === 'downloading' || state.status === 'preparing') {
        state.status = 'stopped';
        state.currentFile = '下载已停止';
        this.updateState(folderId, state);
      }
    }

    // 同时调用后端取消所有下载
    try {
      await commands.downloadCancelAll();
    } catch (error) {
      console.warn('Failed to cancel backend downloads:', error);
    }
  }

  /**
   * 检查并自动恢复下载服务
   * 当没有正在进行的下载时，自动恢复服务
   */
  private static checkAndAutoResumeService(): void {
    if (!this.globalStopFlag) return;

    const activeDownloads = Array.from(this.activeDownloads.values());
    const hasActiveDownloads = activeDownloads.some(d =>
      d.status === 'downloading' || d.status === 'preparing'
    );

    if (!hasActiveDownloads) {
      this.globalStopFlag = false;
      console.log('Auto-resumed download service: no active downloads remaining');
    }
  }

  /**
   * 检查下载服务是否被停止
   */
  static isDownloadServiceStopped(): boolean {
    console.log('Checking download service status, globalStopFlag:', this.globalStopFlag);
    return this.globalStopFlag;
  }

  /**
   * 下载当前目录的文件（支持并行下载）
   */
  private static async downloadCurrentDirectoryFiles(
    currentFiles: StorageFile[],
    currentPath: string,
    baseSavePath: string,
    state: FolderDownloadState,
    events: FolderDownloadEvents
  ): Promise<void> {
    const downloadQueue = [...currentFiles];
    const activeDownloads = new Set<Promise<void>>();
    const activeFileNames = new Set<string>();

    while (downloadQueue.length > 0 || activeDownloads.size > 0) {
      if (state.status === 'cancelled' || this.globalStopFlag) {
        return;
      }

      // 启动新的下载任务（最多并行N个）
      while (downloadQueue.length > 0 && activeDownloads.size < this.CONCURRENT_DOWNLOADS) {
        const file = downloadQueue.shift()!;
        activeFileNames.add(file.basename);

        // 更新状态显示当前并行下载的文件
        const fileList = Array.from(activeFileNames).slice(0, 2).join(', ');
        const extraCount = activeFileNames.size > 2 ? ` +${activeFileNames.size - 2}` : '';
        state.currentFile = `正在下载: ${fileList}${extraCount}`;
        this.updateState(state.folderId, state);
        events.onProgress(state);

        console.log(`Starting parallel download: ${file.basename} (${activeDownloads.size + 1}/${this.CONCURRENT_DOWNLOADS})`);

        const downloadPromise = this.downloadSingleFile(
          file,
          currentPath,
          baseSavePath,
          state,
          events
        );

        activeDownloads.add(downloadPromise);

        // 当下载完成时从活跃集合中移除
        downloadPromise.finally(() => {
          activeDownloads.delete(downloadPromise);
          activeFileNames.delete(file.basename);
          console.log(`Completed download: ${file.basename} (remaining: ${activeDownloads.size})`);
        });
      }

      // 等待至少一个下载完成
      if (activeDownloads.size > 0) {
        await Promise.race(activeDownloads);
      }
    }
  }

  /**
   * 下载单个文件
   */
  private static async downloadSingleFile(
    file: StorageFile,
    currentPath: string,
    baseSavePath: string,
    state: FolderDownloadState,
    events: FolderDownloadEvents
  ): Promise<void> {
    try {
      // 构建文件路径
      const filePath = currentPath
        ? (file.filename.startsWith(`${currentPath}/`) ? file.filename : this.joinPath(currentPath, file.filename))
        : file.filename;

      // 下载单个文件
      const fullFilePath = this.joinLocalPath(baseSavePath, file.basename);
      await StorageServiceManager.downloadFileWithProgress(filePath, file.basename, fullFilePath);

      // 更新进度
      state.completedFiles++;
      state.downloadedSize += safeParseInt(file.size);
      state.progress = state.totalFiles > 0 ? Math.round((state.completedFiles / state.totalFiles) * 100) : 0;

      this.updateState(state.folderId, state);
      events.onFileComplete(state, file.basename);
      events.onProgress(state);

    } catch (error) {
      console.error(`Failed to download file ${file.basename}:`, error);
      // 单个文件失败不影响整体下载，继续下载其他文件
    }
  }

  /**
   * 优化的递归下载：边扫描边下载
   */
  private static async downloadFolderRecursiveOptimized(
    currentPath: string,
    files: StorageFile[],
    baseSavePath: string,
    state: FolderDownloadState,
    events: FolderDownloadEvents
  ): Promise<void> {
    // 1. 先下载当前目录的文件
    const currentFiles = files.filter(file => file.type === 'file');
    await this.downloadCurrentDirectoryFiles(currentFiles, currentPath, baseSavePath, state, events);

    // 2. 同时处理子目录：边扫描边下载
    const directories = files.filter(file => file.type === 'directory');
    for (const dir of directories) {
      if (state.status === 'cancelled' || this.globalStopFlag) {
        return;
      }

      try {
        // 构建子目录路径
        const dirPath = this.joinPath(currentPath, dir.basename);
        const dirSavePath = this.joinLocalPath(baseSavePath, dir.basename);

        // 获取子目录完整文件列表（处理分页）
        let subFiles: StorageFile[] = [];
        let hasMore = true;
        let nextMarker: string | undefined;

        state.currentFile = `扫描目录: ${dir.basename}...`;
        this.updateState(state.folderId, state);
        events.onProgress(state);

        while (hasMore) {
          const subDirectoryResult = await StorageServiceManager.listDirectory(dirPath, {
            marker: nextMarker,
            pageSize: 1000 // 使用大页面大小提高效率
          });

          // 类型转换：将 tauri-commands StorageFile[] 转换为前端 StorageFile[]
          const convertedFiles = subDirectoryResult.files.map(file => ({
            ...file,
            mime: file.mime ?? undefined,
            etag: file.etag ?? undefined
          } as import('../types').StorageFile));

          subFiles.push(...convertedFiles);
          hasMore = subDirectoryResult.hasMore || false;
          nextMarker = subDirectoryResult.nextMarker ?? undefined;

          // 更新扫描进度
          const currentFileCount = subFiles.filter(file => file.type === 'file').length;
          state.currentFile = `扫描目录: ${dir.basename} (已发现 ${currentFileCount} 个文件)`;
          this.updateState(state.folderId, state);
          events.onProgress(state);

          // 安全检查：防止无限循环
          if (hasMore && !nextMarker) {
            console.warn(`Directory ${dirPath} reported hasMore=true but no nextMarker provided, stopping pagination`);
            break;
          }
        }

        // 动态更新总文件数和大小
        const subCurrentFiles = subFiles.filter(file => file.type === 'file');
        const additionalFiles = subCurrentFiles.length;
        const additionalSize = calculateTotalSize(subCurrentFiles);

        // 添加调试日志用于验证分页
        console.log(`Directory ${dir.basename}: found ${additionalFiles} files and ${subFiles.filter(file => file.type === 'directory').length} subdirectories through pagination`);

        // 更新扫描状态
        state.currentFile = `扫描目录: ${dir.basename} (发现 ${additionalFiles} 个文件)`;
        this.updateState(state.folderId, state);
        events.onProgress(state);

        // 保存当前进度，避免进度条倒退
        const currentProgress = state.progress;

        state.totalFiles += additionalFiles;
        state.totalSize += additionalSize;

        // 重新计算进度，确保不会倒退
        const newProgress = state.totalFiles > 0 ? Math.round((state.completedFiles / state.totalFiles) * 100) : 0;
        state.progress = Math.max(currentProgress, newProgress);

        this.updateState(state.folderId, state);
        events.onProgress(state);

        // 递归下载子目录
        await this.downloadFolderRecursiveOptimized(
          dirPath,
          subFiles,
          dirSavePath,
          state,
          events
        );

      } catch (error) {
        console.error(`Failed to process directory ${dir.basename}:`, error);
        // 单个目录失败不影响整体下载，继续处理其他目录
      }
    }
  }

  private static updateState(folderId: string, state: FolderDownloadState): void {
    this.activeDownloads.set(folderId, { ...state });

    // 当下载状态变为终止状态时，检查是否需要自动恢复服务
    if (state.status === 'completed' || state.status === 'error' || state.status === 'cancelled' || state.status === 'stopped') {
      setTimeout(() => {
        this.checkAndAutoResumeService();
      }, 500);
    }
  }
}
