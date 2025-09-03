import { StorageAdapter } from '../StorageClient';
import { ConnectionConfig } from '../types';

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

    // 从端点 URL 中提取主机名，而不是从 oss:// URL
    if (!config.url) {
      throw new Error('OSS endpoint URL is required');
    }

    // 从 HTTP/HTTPS 端点 URL 中提取主机名
    let hostname = '';
    try {
      const parsedUrl = new URL(config.url);
      hostname = parsedUrl.hostname;
    } catch (error) {
      throw new Error('Invalid OSS endpoint URL format');
    }

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
      url: endpoint, // 使用计算出的正确端点
      endpoint,
      bucket: config.bucket, // 保留原始的 bucket 字段（包含路径），让后端解析
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

    // 获取实际的桶名（不包含路径前缀）
    const actualBucket = connection.bucket.split('/')[0];

    // 处理路径前缀 - 从原始 bucket 配置中提取
    let objectKey = path.replace(/^\/+/, '');

    // 从 bucket 字段中提取路径前缀
    const bucketParts = connection.bucket.split('/');
    const pathPrefix = bucketParts.length > 1 ? bucketParts.slice(1).join('/') + '/' : '';

    if (pathPrefix && objectKey) {
      objectKey = pathPrefix + objectKey;
    } else if (pathPrefix) {
      objectKey = pathPrefix.replace(/\/+$/, '');
    }

    if (objectKey) {
      return `oss://${actualBucket}/${objectKey}`;
    } else {
      return `oss://${actualBucket}`;
    }
  },

  generateConnectionName: (config: ConnectionConfig) => {
    if (config.name) return config.name;

    const bucket = config.bucket || 'Unknown';
    const cleanBucket = bucket.split('/')[0]; // 只显示 bucket 名称，不包含路径
    return `OSS (${cleanBucket})`;
  },
};
