import { StorageClient } from './StorageClient';
import { ConnectionConfig, StorageClientType } from './types';

/**
 * 存储客户端工厂 - 简化版
 * 统一使用 StorageClient 处理所有存储类型
 */
export class StorageClientFactory {
  private static instances: Map<string, StorageClient> = new Map();

  /**
   * 创建存储客户端实例 - 统一使用 StorageClient
   */
  static createClient(type: StorageClientType): StorageClient {
    return new StorageClient(type);
  }

  /**
   * 获取或创建存储客户端实例（单例模式）
   */
  static getInstance(type: StorageClientType, key?: string): StorageClient {
    const instanceKey = key || type;

    if (!this.instances.has(instanceKey)) {
      this.instances.set(instanceKey, this.createClient(type));
    }

    return this.instances.get(instanceKey)!;
  }

  /**
   * 连接到存储服务
   */
  static async connectToStorage(config: ConnectionConfig, key?: string): Promise<StorageClient> {
    const client = this.getInstance(config.type, key);

    try {
      const connected = await client.connect(config);

      if (!connected) {
        throw new Error(`Failed to connect to ${config.type} storage`);
      }

      return client;
    } catch (error) {
      // 重新抛出错误，保持原始错误信息
      throw error;
    }
  }

  /**
   * 断开连接并清理实例
   */
  static disconnect(key?: string): void {
    if (key) {
      const client = this.instances.get(key);
      if (client) {
        client.disconnect();
        this.instances.delete(key);
      }
    } else {
      // 断开所有连接
      for (const [key, client] of this.instances) {
        client.disconnect();
        this.instances.delete(key);
      }
    }
  }

  /**
   * 获取所有活跃的连接
   */
  static getActiveConnections(): Array<{ key: string; client: StorageClient }> {
    return Array.from(this.instances.entries()).map(([key, client]) => ({
      key,
      client,
    }));
  }

  /**
   * 检查是否支持指定的存储类型
   */
  static isSupportedType(type: string): type is StorageClientType {
    return ['webdav', 'local', 'oss', 'huggingface', 'ssh', 'smb'].includes(type);
  }

  /**
   * 生成连接名称
   */
  static generateConnectionName(config: ConnectionConfig): string {
    try {
      const client = this.createClient(config.type);
      return client.generateConnectionName(config);
    } catch (error) {
      // 如果出错，回退到简单的名称生成
      console.warn('Failed to generate connection name:', error);
      return config.type.toUpperCase();
    }
  }
}
