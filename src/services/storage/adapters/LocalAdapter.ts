import type { StorageAdapter } from '../StorageClient';
import type { ConnectionConfig } from '../types';

/**
 * 本地文件系统存储适配器
 * 处理本地文件系统特有的逻辑
 */
export const localStorageAdapter: StorageAdapter = {
  protocol: 'local',
  displayName: 'Local Files',
  defaultSortOptions: null, // 使用前端排序
  defaultPageSize: null, // 不分页
  supportsSearch: true,
  supportsCustomRootDisplay: false,

  preprocessConnection: (config: ConnectionConfig) => {
    // 将 rootPath 转换为 url 字段供后端使用
    if (config.rootPath && !config.url) {
      return {
        ...config,
        url: config.rootPath,
      };
    }
    return config;
  },

  buildProtocolUrl: (path: string, connection: any) => {
    if (!connection?.rootPath) {
      throw new Error('Local storage not connected');
    }

    let rootPath = connection.rootPath;

    // 标准化根路径：移除末尾斜杠，统一使用正斜杠
    rootPath = rootPath.replace(/\/+$/, '').replace(/\\/g, '/');

    // 如果是空路径，返回根路径
    if (!path || path === '' || path === '/') {
      return `local://${rootPath}`;
    }

    // 统一标准化路径：所有反斜杠转为正斜杠，移除所有前导斜杠
    let normalizedPath = path.replace(/\\/g, '/').replace(/^\/+/, '');

    let finalPath: string;

    // 除了 ~ 开头的路径，其他都处理为绝对路径
    if (normalizedPath.startsWith('~')) {
      // ~ 开头的路径保持原样
      finalPath = normalizedPath;
    } else if (/^[a-zA-Z]:\//.test(normalizedPath)) {
      // Windows 绝对路径（如 C:/path 或 D:/path），直接使用
      finalPath = normalizedPath;
    } else if (
      normalizedPath.includes('/') &&
      !normalizedPath.startsWith(rootPath.replace(/\\/g, '/'))
    ) {
      // 包含路径分隔符的，可能是相对路径，与根路径拼接
      const fullPath = `${rootPath}/${normalizedPath}`;
      finalPath = fullPath.replace(/\/+/g, '/');
    } else {
      // 单个文件名或已经包含根路径的，与根路径拼接
      const fullPath = `${rootPath}/${normalizedPath}`;
      finalPath = fullPath.replace(/\/+/g, '/');
    }

    // 清理路径：移除 Windows 路径的前导斜杠（如 /C:/path 变为 C:/path）
    // Unix 路径保留前导斜杠以便后端处理
    if (/^\/[a-zA-Z]:\//.test(finalPath)) {
      finalPath = finalPath.substring(1);
    }

    // 对于 Unix 绝对路径（以 / 开头），移除开头的 / 避免 local:/// 三斜杠
    // 后端会自动为需要的路径补回 /
    if (finalPath.startsWith('/') && !/^[a-zA-Z]:\//.test(finalPath)) {
      finalPath = finalPath.substring(1);
    }

    return `local://${finalPath}`;
  },

  generateConnectionName: (config: ConnectionConfig) => {
    if (config.name) return config.name;

    const rootPath = config.url || config.rootPath || '';
    const folderName = rootPath.split('/').pop() || rootPath;
    return `Local (${folderName})`;
  },

  postConnect: (_connection: any, config: ConnectionConfig) => {
    const rootPath = config.url || config.rootPath!;

    return {
      rootPath,
      connected: true,
      displayPath: rootPath.split('/').pop() || rootPath,
    };
  },

  // === 新增的标准方法实现 ===

  getDefaultConfig: () => {
    // 获取最近使用的本地路径作为默认值
    const connections =
      typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('stored_connections') || '[]')
        : [];
    const localConnections = connections.filter((conn: any) => conn.config?.type === 'local');

    if (localConnections.length > 0) {
      // 按最后连接时间排序
      const sorted = localConnections.sort((a: any, b: any) => {
        const aTime = new Date(a.lastConnected || 0).getTime();
        const bTime = new Date(b.lastConnected || 0).getTime();
        return bTime - aTime;
      });

      const defaultPath = sorted[0].config.rootPath || sorted[0].config.url || '';
      if (defaultPath) {
        return { rootPath: defaultPath };
      }
    }

    return {};
  },

  buildConnectionConfig: (formData: Record<string, any>, existingConnection?: any) => {
    const rootPath = formData.rootPath?.trim() || formData.url?.trim();

    const config: ConnectionConfig = {
      type: 'local',
      url: rootPath,
      rootPath: rootPath,
      name: existingConnection
        ? existingConnection.name
        : `Local (${rootPath?.split('/').pop() || 'unknown'})`,
    };

    return config;
  },

  extractFormData: (config: ConnectionConfig) => ({
    rootPath: config.rootPath || config.url || '',
  }),
};
