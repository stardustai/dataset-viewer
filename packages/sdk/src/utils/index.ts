import { PluginBundle, PluginMetadata, PluginInitializeContext } from '../types';

/**
 * 插件构建选项
 */
export interface CreatePluginOptions {
  /** 插件元数据 */
  metadata: PluginMetadata;
  /** 插件组件 */
  component: React.ComponentType<any>;
  /** 初始化函数 */
  initialize?: (context: PluginInitializeContext) => Promise<void>;
  /** 清理函数 */
  cleanup?: () => Promise<void>;
  /** 国际化资源 */
  i18nResources?: {
    [language: string]: {
      translation: Record<string, string>;
    };
  };
}

/**
 * 创建插件包的辅助函数
 * @param options 插件配置选项
 * @returns 标准的插件包对象
 */
export function createPlugin(options: CreatePluginOptions): PluginBundle {
  const { metadata, component, initialize, cleanup, i18nResources } = options;

  // 验证必需字段
  if (!metadata.id) {
    throw new Error('Plugin metadata.id is required');
  }
  if (!metadata.name) {
    throw new Error('Plugin metadata.name is required');
  }
  if (!metadata.version) {
    throw new Error('Plugin metadata.version is required');
  }
  if (!metadata.supportedExtensions || metadata.supportedExtensions.length === 0) {
    throw new Error('Plugin metadata.supportedExtensions is required and must not be empty');
  }

  // 标准化扩展名格式（确保以.开头）
  const normalizedExtensions = metadata.supportedExtensions.map(ext =>
    ext.startsWith('.') ? ext : `.${ext}`
  );

  return {
    metadata: {
      ...metadata,
      supportedExtensions: normalizedExtensions,
    },
    component,
    initialize,
    cleanup,
    i18nResources,
  };
}

/**
 * 验证插件元数据的完整性
 * @param metadata 插件元数据
 * @returns 验证结果和错误信息
 */
export function validatePluginMetadata(metadata: PluginMetadata): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 必需字段检查
  if (!metadata.id) errors.push('id is required');
  if (!metadata.name) errors.push('name is required');
  if (!metadata.version) errors.push('version is required');
  if (!metadata.description) errors.push('description is required');
  if (!metadata.author) errors.push('author is required');
  if (!metadata.category) errors.push('category is required');
  if (!metadata.minAppVersion) errors.push('minAppVersion is required');

  // 扩展名检查
  if (!metadata.supportedExtensions || metadata.supportedExtensions.length === 0) {
    errors.push('supportedExtensions is required and must not be empty');
  } else {
    // 检查扩展名格式
    metadata.supportedExtensions.forEach((ext, index) => {
      if (typeof ext !== 'string') {
        errors.push(`supportedExtensions[${index}] must be a string`);
      } else if (!ext.match(/^\.[a-zA-Z0-9]+$/)) {
        errors.push(`supportedExtensions[${index}] must be a valid file extension (e.g., '.txt', '.pdf')`);
      }
    });
  }

  // ID格式检查
  if (metadata.id && !metadata.id.match(/^[a-z][a-z0-9\-]*$/)) {
    errors.push('id must be lowercase and can only contain letters, numbers, and hyphens');
  }

  // 版本格式检查（简单的语义版本检查）
  if (metadata.version && !metadata.version.match(/^\d+\.\d+\.\d+/)) {
    errors.push('version must follow semantic versioning (e.g., "1.0.0")');
  }

  // 分类检查
  const validCategories = ['viewer', 'editor', 'converter', 'analyzer'];
  if (metadata.category && !validCategories.includes(metadata.category)) {
    errors.push(`category must be one of: ${validCategories.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 从包名推导插件ID
 * @param packageName npm包名
 * @returns 插件ID
 */
export function getPluginIdFromPackageName(packageName: string): string {
  // 处理scoped包名，如 @dataset-viewer/plugin-cad -> cad
  if (packageName.startsWith('@dataset-viewer/plugin-')) {
    return packageName.replace('@dataset-viewer/plugin-', '');
  }

  // 处理普通包名，如 dataset-viewer-plugin-cad -> cad
  if (packageName.startsWith('dataset-viewer-plugin-')) {
    return packageName.replace('dataset-viewer-plugin-', '');
  }

  // 如果是其他格式，直接返回包名
  return packageName;
}

/**
 * 检查文件是否被插件支持
 * @param filename 文件名
 * @param supportedExtensions 支持的扩展名列表
 * @returns 是否支持
 */
export function isFileSupported(filename: string, supportedExtensions: string[]): boolean {
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  return supportedExtensions.some(supportedExt =>
    supportedExt.toLowerCase() === ext
  );
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化的文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * 检查是否为大文件
 * @param fileSize 文件大小（字节）
 * @param threshold 阈值（字节），默认10MB
 * @returns 是否为大文件
 */
export function isLargeFile(fileSize: number, threshold = 10 * 1024 * 1024): boolean {
  return fileSize > threshold;
}
