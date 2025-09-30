import { StorageAdapter } from '../StorageClient';
import { ConnectionConfig } from '../types';

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

    // 标准化根路径：移除末尾斜杠
    rootPath = rootPath.replace(/\/+$/, '');

    // 如果是空路径，返回根路径
    if (!path || path === '' || path === '/') {
      return `local://${rootPath}`;
    }

    let finalPath: string;

    // 如果已经是绝对路径（Linux/macOS、Windows 盘符、UNC）、或 ~ 开头，直接使用
    const isWindowsAbs = /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\');
    if (path.startsWith('/') || path.startsWith('~') || isWindowsAbs) {
      finalPath = path.replace(/\\/g, '/');
    } else {
      // 对于相对路径，与根路径拼接
      const cleanPath = path.replace(/^\/+/, '');
      const fullPath = `${rootPath}/${cleanPath}`;
      // 清理多余的斜杠
      finalPath = fullPath.replace(/\/+/g, '/');
    }

    // 如果是绝对路径(以 / 开头),移除开头的 / 以避免 local:/// 三斜杠
    // 后端会自动补回 /
    if (finalPath.startsWith('/')) {
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
