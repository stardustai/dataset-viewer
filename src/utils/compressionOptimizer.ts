/**
 * 压缩文件处理性能优化配置
 */

export interface CompressionOptimizationConfig {
  // 流式处理配置
  streaming: {
    enabled: boolean;
    maxChunkSize: number; // 每次读取的最大块大小
    concurrentChunks: number; // 并发读取的块数量
  };

  // 文件大小阈值
  fileSizeThresholds: {
    smallFile: number; // 小文件阈值（直接加载）
    largeFile: number; // 大文件阈值（必须流式处理）
    warningSize: number; // 警告阈值
  };

  // 缓存配置
  cache: {
    enabled: boolean;
    maxEntries: number;
    maxTotalSize: number; // 缓存的最大总大小
  };

  // 预览配置
  preview: {
    maxPreviewSize: number; // 预览的最大文件大小
    maxPreviewFiles: number; // 最多预览的文件数量
  };

  // 存储特定优化
  storageOptimizations: {
    webdav: {
      useRangeRequests: boolean;
      chunkSize: number;
    };
    oss: {
      useRangeRequests: boolean;
      chunkSize: number;
      enableMultipart: boolean;
    };
    local: {
      useMemoryMapping: boolean;
      readBufferSize: number;
    };
  };
}

export const defaultCompressionConfig: CompressionOptimizationConfig = {
  streaming: {
    enabled: true,
    maxChunkSize: 64 * 1024, // 64KB
    concurrentChunks: 3,
  },

  fileSizeThresholds: {
    smallFile: 1 * 1024 * 1024, // 1MB
    largeFile: 50 * 1024 * 1024, // 50MB
    warningSize: 100 * 1024 * 1024, // 100MB
  },

  cache: {
    enabled: true,
    maxEntries: 50,
    maxTotalSize: 100 * 1024 * 1024, // 100MB
  },

  preview: {
    maxPreviewSize: 1 * 1024 * 1024, // 1MB
    maxPreviewFiles: 10,
  },

  storageOptimizations: {
    webdav: {
      useRangeRequests: true,
      chunkSize: 64 * 1024, // 64KB
    },
    oss: {
      useRangeRequests: true,
      chunkSize: 64 * 1024, // 64KB
      enableMultipart: false, // 暂时禁用，因为增加复杂性
    },
    local: {
      useMemoryMapping: false, // 暂时禁用，使用标准IO
      readBufferSize: 64 * 1024, // 64KB
    },
  },
};

/**
 * 性能优化管理器
 */
class CompressionOptimizationManager {
  private config: CompressionOptimizationConfig;

  constructor(config: CompressionOptimizationConfig = defaultCompressionConfig) {
    this.config = { ...config };
  }

  /**
   * 根据文件大小和存储类型决定处理策略
   */
  getProcessingStrategy(fileSize: number, storageType: string): {
    shouldUseStreaming: boolean;
    chunkSize: number;
    showWarning: boolean;
    strategy: 'direct' | 'streaming' | 'chunked';
  } {
    const isLargeFile = fileSize > this.config.fileSizeThresholds.largeFile;
    const isSmallFile = fileSize < this.config.fileSizeThresholds.smallFile;
    const showWarning = fileSize > this.config.fileSizeThresholds.warningSize;

    let strategy: 'direct' | 'streaming' | 'chunked';
    let chunkSize: number;

    if (isSmallFile && !this.config.streaming.enabled) {
      strategy = 'direct';
      chunkSize = fileSize;
    } else if (isLargeFile) {
      strategy = 'chunked';
      chunkSize = this.getOptimalChunkSize(storageType);
    } else {
      strategy = 'streaming';
      chunkSize = this.getOptimalChunkSize(storageType);
    }

    return {
      shouldUseStreaming: strategy !== 'direct',
      chunkSize,
      showWarning,
      strategy,
    };
  }

  /**
   * 获取存储类型的最佳块大小
   */
  getOptimalChunkSize(storageType: string): number {
    switch (storageType.toLowerCase()) {
      case 'webdav':
        return this.config.storageOptimizations.webdav.chunkSize;
      case 'oss':
        return this.config.storageOptimizations.oss.chunkSize;
      case 'local':
        return this.config.storageOptimizations.local.readBufferSize;
      default:
        return this.config.streaming.maxChunkSize;
    }
  }

  /**
   * 检查是否应该使用Range请求
   */
  shouldUseRangeRequests(storageType: string): boolean {
    switch (storageType.toLowerCase()) {
      case 'webdav':
        return this.config.storageOptimizations.webdav.useRangeRequests;
      case 'oss':
        return this.config.storageOptimizations.oss.useRangeRequests;
      case 'local':
        return true; // 本地文件总是支持范围读取
      default:
        return false;
    }
  }

  /**
   * 获取预览配置
   */
  getPreviewConfig() {
    return this.config.preview;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<CompressionOptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 获取当前配置
   */
  getConfig(): CompressionOptimizationConfig {
    return { ...this.config };
  }

  /**
   * 重置为默认配置
   */
  resetToDefault(): void {
    this.config = { ...defaultCompressionConfig };
  }
}

// 全局优化管理器实例
export const compressionOptimizer = new CompressionOptimizationManager();

/**
 * 格式化文件大小为人类可读的格式
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 记录性能优化相关的日志
 */
export function logOptimizationInfo(
  operation: string,
  storageType: string,
  fileSize: number,
  strategy: ReturnType<CompressionOptimizationManager['getProcessingStrategy']>
): void {
  console.log(
    `[压缩文件优化] ${operation} - ${storageType}:`,
    {
      fileSize: formatFileSize(fileSize),
      strategy: strategy.strategy,
      chunkSize: formatFileSize(strategy.chunkSize),
      streaming: strategy.shouldUseStreaming,
      warning: strategy.showWarning ? '文件较大，可能需要更长时间' : undefined,
    }
  );
}
