/**
 * 统一路径处理工具
 * 为不同存储类型提供一致的路径处理方法
 */

import { StorageClientType } from '../services/storage/types';

/**
 * 路径信息基础接口
 */
export interface PathInfo {
  normalizedPath: string;
  segments: string[];
  isRoot: boolean;
}

/**
 * HuggingFace 路径信息
 */
export interface HuggingFacePathInfo extends PathInfo {
  owner: string;
  dataset: string;
  filePath?: string;
  fullDatasetId: string; // owner/dataset
  urlSafeDatasetId: string; // owner:dataset (用于内部路径表示)
}

/**
 * OSS 路径信息
 */
export interface OSSPathInfo extends PathInfo {
  bucket: string;
  objectKey: string;
  prefix?: string;
}

/**
 * 统一路径处理器
 */
export class PathProcessor {
  /**
   * 标准化路径格式
   */
  static normalizePath(path: string): string {
    if (!path) return '';

    let cleanPath = path.trim();
    // 移除开头的斜杠
    while (cleanPath.startsWith('/')) {
      cleanPath = cleanPath.substring(1);
    }

    return cleanPath;
  }

  /**
   * 解析通用路径信息
   */
  static parseBasicPath(path: string): PathInfo {
    const normalizedPath = this.normalizePath(path);
    const segments = normalizedPath ? normalizedPath.split('/').filter(s => s.length > 0) : [];

    return {
      normalizedPath,
      segments,
      isRoot: normalizedPath === ''
    };
  }

  /**
   * 解析 HuggingFace 路径
   * 格式：{owner}:{dataset}/{file_path}
   */
  static parseHuggingFacePath(path: string): HuggingFacePathInfo | null {
    const basicInfo = this.parseBasicPath(path);

    if (basicInfo.isRoot || basicInfo.segments.length === 0) {
      return null;
    }

    const datasetIdPart = basicInfo.segments[0];

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
    const filePath = basicInfo.segments.length > 1 ? basicInfo.segments.slice(1).join('/') : undefined;

    return {
      ...basicInfo,
      owner,
      dataset,
      filePath,
      fullDatasetId: `${owner}/${dataset}`,
      urlSafeDatasetId: `${owner}:${dataset}`
    };
  }

  /**
   * 解析 OSS 路径
   * 格式：[bucket/]object_key
   */
  static parseOSSPath(path: string, defaultBucket?: string): OSSPathInfo | null {
    const basicInfo = this.parseBasicPath(path);

    if (basicInfo.isRoot) {
      return null;
    }

    let bucket: string;
    let objectKey: string;

    if (defaultBucket) {
      // 如果指定了默认 bucket，整个路径都是 objectKey
      bucket = defaultBucket;
      objectKey = basicInfo.normalizedPath;
    } else {
      // 第一段是 bucket，剩余是 objectKey
      if (basicInfo.segments.length === 0) {
        return null;
      }

      bucket = basicInfo.segments[0];
      objectKey = basicInfo.segments.length > 1 ? basicInfo.segments.slice(1).join('/') : '';
    }

    return {
      ...basicInfo,
      bucket,
      objectKey,
      prefix: objectKey ? undefined : ''
    };
  }

  /**
   * 构建文件导航路径
   * @param storageType 存储类型
   * @param currentPath 当前路径
   * @param fileName 文件名（filename 字段）
   */
  static buildNavigationPath(storageType: StorageClientType, currentPath: string, fileName: string): string {
    const normalizedCurrent = this.normalizePath(currentPath);

    switch (storageType) {
      case 'huggingface':
        // HuggingFace 使用特殊的路径格式
        return normalizedCurrent ? `${normalizedCurrent}/${fileName}` : fileName;

      case 'oss':
      case 'webdav':
      case 'local':
      default:
        // 标准路径拼接
        return normalizedCurrent ? `${normalizedCurrent}/${fileName}` : fileName;
    }
  }

  /**
   * 构建文件显示路径
   * @param storageType 存储类型（预留用于特殊处理）
   * @param currentPath 当前路径
   * @param baseName 文件基础名（basename 字段）
   */
  static buildDisplayPath(storageType: StorageClientType, currentPath: string, baseName: string): string {
    const normalizedCurrent = this.normalizePath(currentPath);

    // 显示路径通常使用 basename，格式相对统一
    // 未来可以根据 storageType 做特殊处理
    return normalizedCurrent ? `${normalizedCurrent}/${baseName}` : baseName;
  }

  /**
   * 提取路径的父级路径
   */
  static getParentPath(path: string): string {
    const basicInfo = this.parseBasicPath(path);

    if (basicInfo.isRoot || basicInfo.segments.length <= 1) {
      return '';
    }

    return basicInfo.segments.slice(0, -1).join('/');
  }

  /**
   * 检查路径是否为根路径
   */
  static isRootPath(path: string): boolean {
    return this.parseBasicPath(path).isRoot;
  }
}

// 为了向后兼容，保留原来的函数
export const parseHuggingFacePath = PathProcessor.parseHuggingFacePath;
