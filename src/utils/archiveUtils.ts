import type { ArchiveEntry, StorageFile } from '../types';
import { getMimeType } from './fileTypes';

/**
 * 将压缩文件条目转换为StorageFile格式
 */
function archiveEntryToStorageFile(entry: ArchiveEntry): StorageFile {
  const pathParts = entry.path.split('/');
  const filename = pathParts[pathParts.length - 1] || entry.path;

  return {
    filename: entry.path,
    basename: filename,
    lastmod: entry.modified_time || new Date().toISOString(),
    size: entry.size,
    type: entry.is_dir ? 'directory' : 'file',
    mime: entry.is_dir ? null : getMimeType(entry.path),
    etag: null,
  };
}

/**
 * 构建压缩文件的虚拟文件系统树
 */
export function buildArchiveFileTree(entries: ArchiveEntry[]): Map<string, StorageFile[]> {
  const tree = new Map<string, StorageFile[]>();

  // 首先收集所有目录路径
  const directories = new Set<string>();

  entries.forEach(entry => {
    const pathParts = entry.path.split('/').filter(Boolean);

    // 为每个路径级别创建目录条目
    for (let i = 0; i < pathParts.length - (entry.is_dir ? 0 : 1); i++) {
      const dirPath = pathParts.slice(0, i + 1).join('/');
      directories.add(dirPath);
    }
  });

  // 为每个目录创建虚拟目录条目
  directories.forEach(dirPath => {
    const pathParts = dirPath.split('/');
    const dirName = pathParts[pathParts.length - 1];
    const parentPath = pathParts.slice(0, -1).join('/');

    if (!tree.has(parentPath)) {
      tree.set(parentPath, []);
    }

    // 检查是否已经存在该目录条目
    const existingFiles = tree.get(parentPath)!;
    const exists = existingFiles.some(
      file => file.filename === dirPath && file.type === 'directory'
    );

    if (!exists) {
      existingFiles.push({
        filename: dirPath,
        basename: dirName,
        lastmod: new Date().toISOString(),
        size: '0',
        type: 'directory',
        mime: null,
        etag: null,
      });
    }
  });

  // 添加文件条目
  entries.forEach(entry => {
    if (!entry.is_dir) {
      const pathParts = entry.path.split('/').filter(Boolean);
      const parentPath = pathParts.slice(0, -1).join('/');

      if (!tree.has(parentPath)) {
        tree.set(parentPath, []);
      }

      tree.get(parentPath)!.push(archiveEntryToStorageFile(entry));
    }
  });

  // 对每个目录的文件进行排序（目录在前，然后按名称排序）
  tree.forEach(files => {
    files.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.basename.localeCompare(b.basename);
    });
  });

  return tree;
}

/**
 * 获取指定路径下的文件列表
 */
export function getFilesAtPath(tree: Map<string, StorageFile[]>, path: string): StorageFile[] {
  return tree.get(path) || [];
}
