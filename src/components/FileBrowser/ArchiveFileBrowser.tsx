import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Home,
  ChevronUp,
  ChevronDown,
  Search,
  X,
  Copy
} from 'lucide-react';
import { StorageFile, ArchiveInfo } from '../../types';
import { VirtualizedFileList } from './VirtualizedFileList';
import { LoadingDisplay, NoSearchResultsDisplay, EmptyDisplay, ErrorDisplay, BreadcrumbNavigation } from '../common';
import { copyToClipboard, showCopyToast } from '../../utils/clipboard';
import { buildArchiveFileTree, getFilesAtPath } from '../../utils/archiveUtils';

interface ArchiveFileBrowserProps {
  archiveInfo: ArchiveInfo;
  onFileSelect: (entry: any, path: string) => void;
  onBack: () => void;
  archiveFileName: string;
  loading?: boolean;
  error?: string;
}

export const ArchiveFileBrowser: React.FC<ArchiveFileBrowserProps> = ({
  archiveInfo,
  onFileSelect,
  onBack,
  archiveFileName,
  loading = false,
  error
}) => {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'name' | 'size' | 'modified'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // 构建虚拟文件系统树
  const fileTree = useMemo(() => {
    return buildArchiveFileTree(archiveInfo.entries);
  }, [archiveInfo.entries]);

  // 获取当前路径下的文件
  const currentFiles = useMemo(() => {
    return getFilesAtPath(fileTree, currentPath);
  }, [fileTree, currentPath]);

  // 过滤和排序文件
  const filteredAndSortedFiles = useMemo(() => {
    let filtered = currentFiles;

    // 搜索过滤
    if (searchTerm) {
      filtered = filtered.filter(file =>
        file.basename.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // 排序
    return [...filtered].sort((a, b) => {
      // 目录总是在文件前面
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }

      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.basename.localeCompare(b.basename);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'modified':
          comparison = new Date(a.lastmod).getTime() - new Date(b.lastmod).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [currentFiles, searchTerm, sortField, sortDirection]);

  const handleItemClick = (file: StorageFile) => {
    if (file.type === 'directory') {
      setCurrentPath(file.filename);
    } else {
      // 找到对应的ArchiveEntry
      const entry = archiveInfo.entries.find(e => e.path === file.filename);
      if (entry) {
        onFileSelect(entry, file.filename);
      }
    }
  };

  const navigateToSegment = (index: number) => {
    const segments = currentPath === '' ? [] : currentPath.split('/').filter(Boolean);
    const newPath = segments.slice(0, index + 1).join('/');
    setCurrentPath(newPath);
  };

  const navigateToHome = () => {
    setCurrentPath('');
  };

  const navigateBack = () => {
    const segments = currentPath === '' ? [] : currentPath.split('/').filter(Boolean);
    if (segments.length > 0) {
      const newPath = segments.slice(0, -1).join('/');
      setCurrentPath(newPath);
    } else {
      onBack();
    }
  };

  const handleSort = (field: 'name' | 'size' | 'modified') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <LoadingDisplay message={t('loading.analyzing.archive')} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <ErrorDisplay
          message={error}
          onRetry={onBack}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 导航栏 */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between">
          <BreadcrumbNavigation
            currentPath={currentPath}
            onNavigateHome={navigateToHome}
            onNavigateBack={navigateBack}
            onNavigateToSegment={navigateToSegment}
            homeLabel={t('archive.root')}
          />

          {/* 搜索框 */}
          <div className="relative ml-4 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('search.in.file')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-8 py-2 w-64 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                >
                  <X className="w-3 h-3 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* 内容区域 */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          {/* 表头 */}
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-3">
            <div className="flex items-center">
              <div className="flex-1 pr-2 lg:pr-4">
                <div
                  className="flex items-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                  onClick={() => handleSort('name')}
                >
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('name')}
                  </span>
                  {sortField === 'name' && (
                    sortDirection === 'asc' ?
                      <ChevronUp className="ml-1 w-3 h-3" /> :
                      <ChevronDown className="ml-1 w-3 h-3" />
                  )}
                </div>
              </div>
              <div className="w-16 sm:w-20 lg:w-24 text-right pr-2 lg:pr-4">
                <div
                  className="flex items-center justify-end cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                  onClick={() => handleSort('size')}
                >
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('size')}
                  </span>
                  {sortField === 'size' && (
                    sortDirection === 'asc' ?
                      <ChevronUp className="ml-1 w-3 h-3" /> :
                      <ChevronDown className="ml-1 w-3 h-3" />
                  )}
                </div>
              </div>
              <div className="w-24 sm:w-32 lg:w-48 text-right">
                <div
                  className="flex items-center justify-end cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                  onClick={() => handleSort('modified')}
                >
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('modified')}
                  </span>
                  {sortField === 'modified' && (
                    sortDirection === 'asc' ?
                      <ChevronUp className="ml-1 w-3 h-3" /> :
                      <ChevronDown className="ml-1 w-3 h-3" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 文件列表 */}
          {filteredAndSortedFiles.length > 0 ? (
            searchTerm && filteredAndSortedFiles.length === 0 ? (
              <NoSearchResultsDisplay
                searchTerm={searchTerm}
                onClearSearch={() => setSearchTerm('')}
              />
            ) : (
              <div className="bg-white dark:bg-gray-800 flex-1">
                <VirtualizedFileList
                  files={filteredAndSortedFiles}
                  onFileClick={handleItemClick}
                  showHidden={true}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  height={400} // 固定高度，实际使用时可以动态计算
                  searchTerm={searchTerm}
                />
              </div>
            )
          ) : (
            <EmptyDisplay message={t('archive.empty')} />
          )}
        </div>
      </main>
    </div>
  );
};