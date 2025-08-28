import type { StorageAdapter } from '../StorageClient';
import type { ConnectionConfig } from '../types';

/**
 * OSS 存储适配器
 * 处理 OSS 对象存储服务特有的逻辑
 */
export const ossStorageAdapter: StorageAdapter = {
  protocol: 'oss',
  displayName: 'Object Storage Service',
  defaultSortOptions: null, // 使用前端排序
  defaultPageSize: 100, // 大分页提高效率
  supportsSearch: false,
  supportsCustomRootDisplay: false,

  preprocessConnection: (config: ConnectionConfig) => {
    // OSS 特有的配置解析和验证
    if (!config.username || !config.password) {
      throw new Error('OSS requires accessKey (username) and secretKey (password)');
    }

    // 解析 bucket 和路径前缀
    let bucket = config.bucket || '';
    let pathPrefix = '';

    if (bucket.includes('/')) {
      const parts = bucket.split('/');
      bucket = parts[0];
      pathPrefix = parts.slice(1).join('/');
      if (pathPrefix && !pathPrefix.endsWith('/')) {
        pathPrefix += '/';
      }
    }

    if (!bucket) {
      throw new Error('OSS bucket is required');
    }

    // 从 oss:// URL 构建正确的虚拟主机风格端点
    if (!config.url || !config.url.startsWith('oss://')) {
      throw new Error('OSS requires a valid oss:// URL');
    }

    // 解析 oss:// URL: oss://hostname/bucket
    const ossUrl = config.url.replace('oss://', '');
    const [hostname] = ossUrl.split('/');

    // 根据云服务商平台构建正确的虚拟主机风格端点
    let endpoint = '';
    let region = config.region;

    if (hostname.includes('oss-') && hostname.includes('aliyuncs.com')) {
      // 阿里云 OSS - 直接使用主机名，不需要额外的 region 处理
      region = region || 'cn-hangzhou'; // 阿里云默认区域
      endpoint = `https://${bucket}.${hostname}`;
    } else if (hostname.includes('amazonaws.com')) {
      // AWS S3
      region = region || 'us-east-1'; // AWS 默认区域
      endpoint =
        region === 'us-east-1'
          ? `https://${bucket}.s3.amazonaws.com`
          : `https://${bucket}.s3.${region}.amazonaws.com`;
    } else if (hostname.includes('myqcloud.com')) {
      // 腾讯云 COS
      region = region || 'ap-beijing'; // 腾讯云默认区域
      endpoint = `https://${bucket}.cos.${region}.myqcloud.com`;
    } else if (hostname.includes('myhuaweicloud.com')) {
      // 华为云 OBS
      region = region || 'cn-north-1'; // 华为云默认区域
      endpoint = `https://${bucket}.obs.${region}.myhuaweicloud.com`;
    } else {
      // MinIO 或其他自定义平台，使用路径风格
      endpoint = `https://${hostname}`;
    }

    return {
      url: endpoint, // 标准化后的正确 URL
      endpoint,
      bucket,
      pathPrefix,
      accessKey: config.username,
      secretKey: config.password,
      region,
    };
  },

  buildProtocolUrl: (path: string, connection: any) => {
    if (!connection?.bucket) {
      throw new Error('Not connected to OSS');
    }

    // 处理路径前缀
    let objectKey = path.replace(/^\/+/, '');
    if (connection.pathPrefix && objectKey) {
      objectKey = connection.pathPrefix + objectKey;
    } else if (connection.pathPrefix) {
      objectKey = connection.pathPrefix.replace(/\/+$/, '');
    }

    const cleanBucket = connection.bucket.replace(/\/+$/, '');

    if (objectKey) {
      return `oss://${cleanBucket}/${objectKey}`;
    } else {
      return `oss://${cleanBucket}`;
    }
  },

  generateConnectionName: (config: ConnectionConfig) => {
    if (config.name) return config.name;

    const bucket = config.bucket || 'Unknown';
    const cleanBucket = bucket.split('/')[0]; // 只显示 bucket 名称，不包含路径
    return `OSS (${cleanBucket})`;
  },
};
