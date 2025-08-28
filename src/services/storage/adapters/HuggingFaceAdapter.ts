import type { StorageAdapter } from '../StorageClient';
import type { ConnectionConfig } from '../types';

/**
 * HuggingFace 存储适配器
 * 处理 HuggingFace Hub 特有的逻辑
 */
export const huggingfaceStorageAdapter: StorageAdapter = {
  protocol: 'huggingface',
  displayName: 'Hugging Face Hub',
  defaultSortOptions: { sortBy: 'size', sortOrder: 'desc' }, // 按大小降序
  defaultPageSize: 20, // 小分页提高响应速度
  supportsSearch: true,
  supportsCustomRootDisplay: true,

  preprocessPath: (path: string, _connection: any, config?: ConnectionConfig) => {
    const org = config?.organization;
    if (org && (!path || path === '' || path === '/')) {
      return org;
    }
    return path;
  },

  buildProtocolUrl: (path: string, _connection: any, config?: ConnectionConfig) => {
    const org = config?.organization;

    // 处理空路径或根路径
    if (!path || path === '/' || path === '') {
      if (org) {
        return `huggingface://${org}`;
      }
      return 'huggingface://';
    }

    // 解析 HuggingFace 路径格式
    const pathInfo = parseHuggingFacePath(path);
    if (!pathInfo) {
      if (org && !path.includes('/') && !path.includes(':')) {
        // 如果指定了组织且路径不包含分隔符，自动添加组织前缀
        return `huggingface://${org}:${path}`;
      }
      return `huggingface://${path}`;
    }

    if (!pathInfo.filePath) {
      // 数据集根目录
      return `huggingface://${pathInfo.fullDatasetId}`;
    }

    // 完整的数据集文件路径
    return `huggingface://${pathInfo.fullDatasetId}/${pathInfo.filePath}`;
  },

  generateConnectionName: (config: ConnectionConfig) => {
    if (config.name) return config.name;
    return config.organization ? `HF (${config.organization})` : 'Hugging Face Hub';
  },

  getRootDisplayInfo: (_connection: any, config?: ConnectionConfig) => {
    const org = config?.organization;
    if (org) {
      return {
        showWelcome: true,
        customMessage: `Browse datasets from ${org} organization on Hugging Face Hub`,
      };
    }

    return {
      showWelcome: true,
      customMessage: 'Browse popular datasets from Hugging Face Hub',
    };
  },

  postConnect: (_connection: any, config: ConnectionConfig) => {
    return {
      organization: config.organization,
      apiToken: config.apiToken,
      connected: true,
    };
  },
};

/**
 * HuggingFace 路径信息
 */
interface HuggingFacePathInfo {
  owner: string;
  dataset: string;
  filePath?: string;
  fullDatasetId: string; // owner:dataset
}

/**
 * 解析 HuggingFace 路径
 * 格式：{owner}:{dataset}/{file_path}
 */
function parseHuggingFacePath(path: string): HuggingFacePathInfo | null {
  if (!path || path === '/' || path === '') {
    return null;
  }

  // 移除开头的斜杠并分割路径
  const normalizedPath = path.replace(/^\/+/, '');
  const segments = normalizedPath.split('/').filter(s => s.length > 0);

  if (segments.length === 0) {
    return null;
  }

  const datasetIdPart = segments[0];

  // 必须使用 : 分隔符
  if (!datasetIdPart.includes(':')) {
    return null;
  }

  const datasetParts = datasetIdPart.split(':');
  if (datasetParts.length !== 2) {
    return null;
  }

  const [owner, dataset] = datasetParts;

  if (!owner || !dataset) {
    return null;
  }

  // 剩余部分是文件路径
  const filePath = segments.length > 1 ? segments.slice(1).join('/') : undefined;

  return {
    owner,
    dataset,
    filePath,
    fullDatasetId: `${owner}:${dataset}`,
  };
}
