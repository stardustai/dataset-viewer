import React, { useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Folder, FileText, Home, ArrowLeft } from 'lucide-react';
import { ArchiveEntry } from '../../types';
import { useTranslation } from 'react-i18next';
import { BreadcrumbNavigation } from '../common';

// 文件大小格式化工具函数
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 构建文件树结构
interface TreeNode {
  entry: ArchiveEntry;
  children: TreeNode[];
  name: string;
}

const buildFileTree = (entries: ArchiveEntry[]): TreeNode[] => {
  const tree: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // 首先创建所有节点
  entries.forEach(entry => {
    const node: TreeNode = {
      entry,
      children: [],
      name: entry.path.split('/').pop() || entry.path
    };
    nodeMap.set(entry.path, node);
  });

  // 然后建立父子关系
  entries.forEach(entry => {
    const node = nodeMap.get(entry.path)!;
    const pathParts = entry.path.split('/');
    
    if (pathParts.length === 1) {
      // 根级别文件/文件夹
      tree.push(node);
    } else {
      // 查找父目录
      const parentPath = pathParts.slice(0, -1).join('/');
      const parentNode = nodeMap.get(parentPath);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        // 如果找不到父目录，可能是压缩包结构不完整，放到根级别
        tree.push(node);
      }
    }
  });

  return tree;
};

interface ArchiveTreeListProps {
  entries: ArchiveEntry[];
  onSelectEntry: (entry: ArchiveEntry) => void;
  selectedPath?: string;
  searchTerm: string;
  height?: number;
}

export const ArchiveTreeList: React.FC<ArchiveTreeListProps> = ({
  entries,
  onSelectEntry,
  selectedPath,
  searchTerm,
  height = 400
}) => {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState<string>('');
  const parentRef = React.useRef<HTMLDivElement>(null);

  // 获取当前路径下的文件和文件夹
  const currentEntries = useMemo(() => {
    let filtered = entries;

    // 如果有搜索词，显示所有匹配的条目
    if (searchTerm) {
      filtered = entries.filter(entry =>
        entry.path.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } else {
      // 否则只显示当前路径下的直接子项
      if (currentPath === '') {
        // 根目录：显示不包含斜杠的文件，或者第一级目录
        filtered = entries.filter(entry => {
          const pathParts = entry.path.split('/');
          return pathParts.length === 1 || (pathParts.length === 2 && entry.path.endsWith('/'));
        });
      } else {
        // 子目录：显示以当前路径开头的直接子项
        const prefix = currentPath.endsWith('/') ? currentPath : currentPath + '/';
        filtered = entries.filter(entry => {
          if (!entry.path.startsWith(prefix)) return false;
          const relativePath = entry.path.substring(prefix.length);
          const pathParts = relativePath.split('/');
          return pathParts.length === 1 || (pathParts.length === 2 && entry.path.endsWith('/'));
        });
      }
    }

    // 排序：目录优先，然后按名称排序
    return filtered.sort((a, b) => {
      if (a.is_dir !== b.is_dir) {
        return a.is_dir ? -1 : 1;
      }
      return a.path.localeCompare(b.path);
    });
  }, [entries, currentPath, searchTerm]);

  // 处理文件夹点击
  const handleEntryClick = (entry: ArchiveEntry) => {
    if (entry.is_dir) {
      // 如果是文件夹，进入该文件夹
      const newPath = entry.path.endsWith('/') ? entry.path.slice(0, -1) : entry.path;
      setCurrentPath(newPath);
    } else {
      // 如果是文件，选择该文件进行预览
      onSelectEntry(entry);
    }
  };

  // 返回上级目录
  const goUp = () => {
    if (currentPath === '') return;
    const pathParts = currentPath.split('/');
    pathParts.pop();
    setCurrentPath(pathParts.join('/'));
  };

  // 返回根目录
  const goHome = () => {
    setCurrentPath('');
  };

  // 获取当前路径的面包屑
  const getBreadcrumbs = () => {
    if (currentPath === '') return [];
    return currentPath.split('/');
  };

  // 导航到特定路径
  const navigateToPath = (index: number) => {
    const pathParts = currentPath.split('/');
    const newPath = pathParts.slice(0, index + 1).join('/');
    setCurrentPath(newPath);
  };

  const virtualizer = useVirtualizer({
    count: currentEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 5,
  });

  return (
    <div className="flex flex-col h-full">
      {/* 导航栏 */}
      {!searchTerm && (
        <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            onClick={goHome}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            title={t('go.to.root')}
          >
            <Home size={16} className="text-gray-600 dark:text-gray-400" />
          </button>
          
          {currentPath !== '' && (
            <button
              onClick={goUp}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              title={t('go.up')}
            >
              <ArrowLeft size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}

          {/* 面包屑导航 */}
          <BreadcrumbNavigation
             currentPath={currentPath}
             onNavigateHome={goHome}
             onNavigateToSegment={navigateToPath}
             showBackButton={false}
             showCopyButton={false}
             compact={true}
             homeLabel={t('archive.root')}
           />
        </div>
      )}

      {/* 文件列表 */}
      <div
        ref={parentRef}
        style={{ height: `${height - (searchTerm ? 0 : 50)}px`, overflow: 'auto' }}
        className="flex-1"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const entry = currentEntries[virtualItem.index];
            const isSelected = entry.path === selectedPath;

            // 获取显示名称
            const getDisplayName = () => {
              if (searchTerm) {
                // 搜索模式下显示完整路径
                return entry.path;
              } else {
                // 正常模式下显示文件/文件夹名称
                const path = entry.path.endsWith('/') ? entry.path.slice(0, -1) : entry.path;
                const parts = path.split('/');
                return parts[parts.length - 1] || entry.path;
              }
            };

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className={`flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                  isSelected ? 'bg-blue-100 dark:bg-blue-900' : ''
                }`}
                onClick={() => handleEntryClick(entry)}
              >
                {entry.is_dir ? (
                  <Folder size={16} className="text-blue-500" />
                ) : (
                  <FileText size={16} className="text-gray-500" />
                )}
                <span className="flex-1 truncate" title={entry.path}>
                  {getDisplayName()}
                </span>
                <span className="text-sm text-gray-500">
                  {entry.is_dir ? '' : formatFileSize(entry.size)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};