/**
 * 性能监控工具
 * 用于监控压缩文件处理的性能，特别是流式处理的效果
 */

export interface PerformanceMetrics {
  operation: string;
  storageType: string;
  fileSize: number;
  duration: number;
  bytesTransferred?: number;
  isStreaming: boolean;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 100; // 保留最近100个指标

  /**
   * 开始监控一个操作
   */
  startOperation(operation: string, storageType: string): PerformanceTimer {
    return new PerformanceTimer(operation, storageType, this);
  }

  /**
   * 记录性能指标
   */
  recordMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);

    // 保持指标数量在限制内
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // 如果不是流式处理且文件较大，发出警告
    if (!metrics.isStreaming && metrics.fileSize > 50 * 1024 * 1024) { // 50MB
      console.warn(
        `[性能警告] 非流式处理大文件:`,
        {
          operation: metrics.operation,
          storageType: metrics.storageType,
          fileSize: `${(metrics.fileSize / 1024 / 1024).toFixed(2)}MB`,
          duration: `${metrics.duration}ms`,
        }
      );
    }

    // 记录性能信息
    console.log(
      `[性能监控] ${metrics.operation} - ${metrics.storageType}:`,
      {
        fileSize: `${(metrics.fileSize / 1024 / 1024).toFixed(2)}MB`,
        duration: `${metrics.duration}ms`,
        isStreaming: metrics.isStreaming,
        bytesTransferred: metrics.bytesTransferred
          ? `${(metrics.bytesTransferred / 1024 / 1024).toFixed(2)}MB`
          : 'N/A',
      }
    );
  }

  /**
   * 获取最近的性能指标
   */
  getRecentMetrics(count: number = 10): PerformanceMetrics[] {
    return this.metrics.slice(-count);
  }

  /**
   * 获取按存储类型分组的平均性能
   */
  getAveragePerformance(): Record<string, {
    avgDuration: number;
    avgFileSize: number;
    streamingPercentage: number;
    totalOperations: number;
  }> {
    const grouped = this.metrics.reduce((acc, metric) => {
      if (!acc[metric.storageType]) {
        acc[metric.storageType] = [];
      }
      acc[metric.storageType].push(metric);
      return acc;
    }, {} as Record<string, PerformanceMetrics[]>);

    const result: Record<string, any> = {};

    for (const [storageType, metrics] of Object.entries(grouped)) {
      const streamingCount = metrics.filter(m => m.isStreaming).length;

      result[storageType] = {
        avgDuration: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length,
        avgFileSize: metrics.reduce((sum, m) => sum + m.fileSize, 0) / metrics.length,
        streamingPercentage: (streamingCount / metrics.length) * 100,
        totalOperations: metrics.length,
      };
    }

    return result;
  }

  /**
   * 清空指标
   */
  clearMetrics(): void {
    this.metrics = [];
  }
}

export class PerformanceTimer {
  private startTime: number;
  private operation: string;
  private storageType: string;
  private monitor: PerformanceMonitor;

  constructor(operation: string, storageType: string, monitor: PerformanceMonitor) {
    this.startTime = performance.now();
    this.operation = operation;
    this.storageType = storageType;
    this.monitor = monitor;
  }

  /**
   * 结束计时并记录指标
   */
  end(fileSize: number, options: {
    bytesTransferred?: number;
    isStreaming?: boolean;
  } = {}): void {
    const duration = performance.now() - this.startTime;

    this.monitor.recordMetrics({
      operation: this.operation,
      storageType: this.storageType,
      fileSize,
      duration,
      bytesTransferred: options.bytesTransferred,
      isStreaming: options.isStreaming ?? true, // 默认假设是流式的
      timestamp: Date.now(),
    });
  }
}

// 全局性能监控实例
export const performanceMonitor = new PerformanceMonitor();

/**
 * 装饰器函数，用于监控存储操作的性能
 */
export function monitorPerformance(operation: string) {
  return function(_target: any, _propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function(this: any, ...args: any[]) {
      const storageType = this.protocol || 'unknown';
      const timer = performanceMonitor.startOperation(operation, storageType);

      try {
        const result = await method.apply(this, args);

        // 更健壮的文件大小推断逻辑
        let fileSize = 0;
        let isStreaming = true;

        // 根据操作类型推断文件大小的位置
        if (operation.includes('analyze') && result?.totalCompressedSize) {
          fileSize = result.totalCompressedSize;
        } else if (operation.includes('preview') && result?.total_size) {
          fileSize = result.total_size;
        } else if (args.length > 0) {
          // 尝试从参数中获取文件大小信息
          const fileSizeArg = args.find(arg => typeof arg === 'number' && arg > 0);
          if (fileSizeArg) {
            fileSize = fileSizeArg;
          } else if (typeof args[0] === 'string' && typeof this.getFileSize === 'function') {
            // 如果有文件路径参数且存在获取文件大小的方法
            try {
              fileSize = await this.getFileSize(args[0]) || 0;
            } catch {
              fileSize = 0;
            }
          }
        }

        timer.end(fileSize, { isStreaming });
        return result;
      } catch (error) {
        timer.end(0, { isStreaming: false });
        throw error;
      }
    };

    return descriptor;
  };
}
