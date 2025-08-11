import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Search,
  Download,
  Loader2,
  ChevronUp,
  ChevronDown,
  X,
  Move,
  Percent,
  Copy
} from 'lucide-react';
import { StorageFile, SearchResult } from '../../types';
import { StorageServiceManager } from '../../services/storage';
import { VirtualizedTextViewer } from './VirtualizedTextViewer';
import { MarkdownViewer } from './MarkdownViewer';
import { WordViewer } from './WordViewer';
import { PresentationViewer } from './PresentationViewer';
import { MediaViewer } from './MediaViewer';
import { UniversalDataTableViewer } from './UniversalDataTableViewer';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { getFileType, isTextFile, isMarkdownFile, isWordFile, isPresentationFile, isMediaFile, isArchiveFile, isDataFile, isSpreadsheetFile } from '../../utils/fileTypes';
import { FileIcon } from '../../utils/fileIcons';
import { ArchiveViewer } from './ArchiveViewer';
import { LoadingDisplay, ErrorDisplay, UnsupportedFormatDisplay } from '../common';
import { copyToClipboard, showCopyToast } from '../../utils/clipboard';
import { configManager } from '../../config';
import { formatFileSize } from '../../utils/fileUtils';
import { androidBackHandler } from '../../services/androidBackHandler';

// Import VirtualizedTextViewerRef type
interface VirtualizedTextViewerRef {
  scrollToLine: (lineNumber: number, column?: number) => void;
  scrollToPercentage: (percentage: number) => void;
  jumpToFilePosition: (filePosition: number) => void;
}

interface FileViewerProps {
  file: StorageFile;
  filePath: string;
  storageClient?: any;
  onBack: () => void;
}

export const FileViewer: React.FC<FileViewerProps> = ({ file, filePath, storageClient, onBack }) => {
  const { t } = useTranslation();
  const config = configManager.getConfig();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isLargeFile, setIsLargeFile] = useState(false);
  const [loadedChunks, setLoadedChunks] = useState<number>(1);
  const [totalSize, setTotalSize] = useState(0);
  const [showPercentInput, setShowPercentInput] = useState(false);
  const [percentValue, setPercentValue] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [autoLoadTriggered, setAutoLoadTriggered] = useState(false);
  const [currentFilePosition, setCurrentFilePosition] = useState(0); // 当前加载内容在文件中的起始位置
  const [loadedContentSize, setLoadedContentSize] = useState(0); // 当前已加载内容的大小
  const [fullFileSearchMode, setFullFileSearchMode] = useState(false); // 是否启用全文件搜索模式
  const [fullFileSearchResults, setFullFileSearchResults] = useState<Array<{ line: number; column: number; text: string; match: string; filePosition: number }>>([]);
  const [fullFileSearchLoading, setFullFileSearchLoading] = useState(false);
  const [navigatingToResult, setNavigatingToResult] = useState(false); // 是否正在导航到搜索结果
  const [searchResultsLimited, setSearchResultsLimited] = useState(false); // 搜索结果是否被限制
  const [fullFileSearchLimited, setFullFileSearchLimited] = useState(false); // 全文件搜索结果是否被限制
  const [baselineStartLineNumber, setBaselineStartLineNumber] = useState<number | null>(null); // 跳转后的基准起始行号
  const [dataMetadata, setDataMetadata] = useState<any>(null); // 数据文件元数据
  const [presentationMetadata, setPresentationMetadata] = useState<any>(null); // 演示文稿元数据

  // Determine file type
  const fileType = getFileType(file.basename);
  const isMedia = isMediaFile(file.basename);
  const isText = isTextFile(file.basename);
  const isMarkdown = isMarkdownFile(file.basename);
  const isWord = isWordFile(file.basename);
  const isPresentation = isPresentationFile(file.basename);
  const isArchive = isArchiveFile(file.basename);
  const isData = isDataFile(file.basename);
  const isSpreadsheet = isSpreadsheetFile(file.basename);

  const loadFileContent = useCallback(async () => {
    // Only load content for text and markdown files
    if (!isText && !isMarkdown && !isArchive && !isData) {
      setLoading(false);
      return;
    }

    // For data files (like Parquet), don't load content here
    // ParquetViewer will handle its own loading
    if (isData) {
      setLoading(false);
      return;
    }

    // For archive files, no need to load content as ArchiveViewer handles it
    if (isArchive) {
      setLoading(false);
      return;
    }

    // For word files, no need to load content here as WordViewer handles it
    if (isWord) {
      setLoading(false);
      return;
    }

    // For presentation files, no need to load content here as PresentationViewer handles it
    if (isPresentation) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const fileSize = await StorageServiceManager.getFileSize(filePath);
      setTotalSize(fileSize);

      if (fileSize > config.streaming.maxInitialLoad) {
        // Large file - load in chunks
        setIsLargeFile(true);
        const initialContent = await StorageServiceManager.getFileContent(filePath, 0, config.streaming.maxInitialLoad);
        setContent(initialContent.content);
        setCurrentFilePosition(0);
        setLoadedContentSize(initialContent.content.length);
        setLoadedChunks(1);
        setBaselineStartLineNumber(null); // 重置基准值
      } else {
        // Small file - load entirely
        const fileContent = await StorageServiceManager.getFileContent(filePath);
        setContent(fileContent.content);
        setCurrentFilePosition(0);
        setLoadedContentSize(fileContent.content.length);
        setIsLargeFile(false);
        setBaselineStartLineNumber(null); // 重置基准值
      }
    } catch (err) {
      setError('Failed to load file content');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filePath, isText, isMarkdown]);

  const loadMoreContent = useCallback(async () => {
    if (!isLargeFile || loadingMore) return;

    setLoadingMore(true);
    try {
      // 从当前位置加载更多内容
      const nextPosition = currentFilePosition + loadedContentSize;
      if (nextPosition >= totalSize) {
        // 已经到达文件末尾
        setLoadingMore(false);
        return;
      }

      const remainingSize = totalSize - nextPosition;
      const chunkSize = Math.min(config.streaming.chunkSize, remainingSize);

      const additionalContent = await StorageServiceManager.getFileContent(filePath, nextPosition, chunkSize);
      setContent(prev => prev + additionalContent.content);
      setLoadedContentSize(prev => prev + additionalContent.content.length);
      setLoadedChunks(prev => prev + 1);
    } catch (err) {
      console.error('Failed to load more content:', err);
      setError('Failed to load more content');
    } finally {
      setLoadingMore(false);
    }
  }, [filePath, loadingMore, isLargeFile, currentFilePosition, loadedContentSize, totalSize]);

  // 自动加载更多内容的回调
  const handleScrollToBottom = useCallback(async () => {
    // 在搜索模式下不自动加载更多内容
    if (searchTerm.trim() || searchResults.length > 0) return;

    if (!isLargeFile || loadingMore || autoLoadTriggered) return;

    // 检查是否已经到达文件末尾
    const currentEndPosition = currentFilePosition + loadedContentSize;
    if (currentEndPosition >= totalSize) return; // 已经加载完成

    setAutoLoadTriggered(true);
    await loadMoreContent();

    // 延迟重置触发状态，避免连续触发
    setTimeout(() => {
      setAutoLoadTriggered(false);
    }, 1000);
  }, [searchTerm, searchResults, isLargeFile, loadingMore, autoLoadTriggered, currentFilePosition, loadedContentSize, totalSize, loadMoreContent]);

  // 计算当前内容的起始行号（用于大文件模式）
  const calculateStartLineNumber = useCallback(() => {
    if (!isLargeFile || currentFilePosition === 0) {
      // 重置基准值
      if (baselineStartLineNumber !== null) {
        setBaselineStartLineNumber(null);
      }
      return 1;
    }

    // 如果有基准起始行号（跳转后），使用基准值保持一致性
    if (baselineStartLineNumber !== null) {
      return baselineStartLineNumber;
    }

    // 基于已加载内容估算平均行长度
    const loadedLines = content.split('\n').length;
    const avgBytesPerLine = loadedContentSize / loadedLines;

    // 根据文件位置估算起始行号
    const estimatedLineNumber = Math.floor(currentFilePosition / avgBytesPerLine) + 1;
    return Math.max(1, estimatedLineNumber);
  }, [isLargeFile, currentFilePosition, content, loadedContentSize, baselineStartLineNumber]);

  // 根据百分比跳转到文件的任意位置
  const jumpToFilePercentage = useCallback(async (percentage: number) => {
    if (!isLargeFile || percentage < 0 || percentage > 100) return;

    setLoading(true);
    setError('');

    try {
      // 计算目标文件位置
      const targetPosition = Math.floor((totalSize * percentage) / 100);

      // 为了确保我们能看到完整的行，我们向前回退一些字节寻找行的开始
      const BUFFER_SIZE = 1024; // 1KB 缓冲区用于寻找行边界
      const actualStart = Math.max(0, targetPosition - BUFFER_SIZE);

      // 加载目标位置周围的内容
      const CHUNK_SIZE_FOR_JUMP = 1024 * 1024 * 2; // 2MB 用于跳转时的显示
      const endPosition = Math.min(totalSize, actualStart + CHUNK_SIZE_FOR_JUMP);

      const jumpContent = await StorageServiceManager.getFileContent(filePath, actualStart, endPosition - actualStart);

      // 如果我们从文件中间开始，尝试找到第一个完整行的开始
      let processedContent = jumpContent.content;
      let adjustedPosition = actualStart;

      if (actualStart > 0) {
        const firstNewlineIndex = processedContent.indexOf('\n');
        if (firstNewlineIndex !== -1) {
          processedContent = processedContent.substring(firstNewlineIndex + 1);
          adjustedPosition = actualStart + firstNewlineIndex + 1;
        }
      }

      setContent(processedContent);
      setCurrentFilePosition(adjustedPosition);
      setLoadedContentSize(processedContent.length);

      // 重置块计数，因为我们现在在文件的不同位置
      setLoadedChunks(1);

      // 计算并设置基准起始行号（基于跳转位置）
      const loadedLines = processedContent.split('\n').length;
      const avgBytesPerLine = processedContent.length / loadedLines;
      const estimatedStartLine = Math.floor(adjustedPosition / avgBytesPerLine) + 1;
      setBaselineStartLineNumber(Math.max(1, estimatedStartLine));

    } catch (err) {
      setError('Failed to jump to file position');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isLargeFile, totalSize, filePath]);

  // 全文件搜索功能（基于采样）
  const performFullFileSearch = useCallback(async (searchTerm: string): Promise<Array<{ line: number; column: number; text: string; match: string; filePosition: number }>> => {
    if (!isLargeFile) {
      // 对于小文件，直接搜索已加载的内容
      const results: Array<{ line: number; column: number; text: string; match: string; filePosition: number }> = [];
      const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const lines = content.split('\n');

      lines.forEach((line, lineIndex) => {
        let match;
        regex.lastIndex = 0;
        while ((match = regex.exec(line)) !== null) {
          results.push({
            line: lineIndex + 1,
            column: match.index + 1,
            text: line,
            match: match[0],
            filePosition: 0 // 小文件从开头开始
          });
        }
      });

      return results;
    }

    // 对于大文件，使用采样搜索
    setFullFileSearchLoading(true);
    try {
      const results: Array<{ line: number; column: number; text: string; match: string; filePosition: number }> = [];
      const sampleSize = 1024 * 512; // 512KB 采样块大小
      const maxSamples = 50; // 最多采样50个块
      const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      // 计算采样间隔
      const samplingInterval = Math.max(Math.floor(totalSize / maxSamples), sampleSize);

      let currentSamplePosition = 0;
      let approximateLineNumber = 1;

      while (currentSamplePosition < totalSize && results.length < 500) { // 增加全文件搜索结果限制到500
        const endPosition = Math.min(currentSamplePosition + sampleSize, totalSize);

        try {
          const sampleContent = await StorageServiceManager.getFileContent(filePath, currentSamplePosition, endPosition - currentSamplePosition);
          const sampleLines = sampleContent.content.split('\n');

          sampleLines.forEach((line, lineIndex) => {
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(line)) !== null) {
              results.push({
                line: approximateLineNumber + lineIndex,
                column: match.index + 1,
                text: line,
                match: match[0],
                filePosition: currentSamplePosition
              });
            }
          });

          // 估算行号增量（基于当前样本的行数和平均行长度）
          const avgBytesPerLine = sampleContent.content.length / sampleLines.length;
          approximateLineNumber += Math.floor(samplingInterval / avgBytesPerLine);

        } catch (err) {
          console.warn('Failed to sample at position', currentSamplePosition, err);
        }

        currentSamplePosition += samplingInterval;
      }

      // 检查是否因为结果数量达到限制而停止
      const isLimited = results.length >= 500 && currentSamplePosition < totalSize;
      setFullFileSearchLimited(isLimited);

      return results;
    } catch (err) {
      console.error('Full file search failed:', err);
      return [];
    } finally {
      setFullFileSearchLoading(false);
    }
  }, [isLargeFile, content, totalSize, filePath]);

  // 处理全文件搜索结果导航
  const navigateToFullFileSearchResult = useCallback(async (result: { line: number; column: number; text: string; match: string; filePosition: number }) => {
    if (!isLargeFile) {
      // 小文件直接滚动到行和列
      if (textViewerRef.current) {
        textViewerRef.current.scrollToLine(result.line, result.column);
      }
      return;
    }

    // 大文件需要跳转到文件位置
    try {
      setNavigatingToResult(true); // 设置导航标志
      setLoading(true);

      // 跳转到搜索结果附近的文件位置
      const chunkSize = config.streaming.chunkSize;
      const targetPosition = Math.max(0, result.filePosition - chunkSize / 2); // 在结果前加载一些内容
      const endPosition = Math.min(targetPosition + chunkSize * 2, totalSize); // 加载2倍chunk大小的内容

      const newContent = await StorageServiceManager.getFileContent(filePath, targetPosition, endPosition - targetPosition);

      setContent(newContent.content);
      setCurrentFilePosition(targetPosition);
      setLoadedContentSize(newContent.content.length);

      // 计算新的起始行号
      const avgBytesPerLine = 50; // 估算值
      const estimatedStartLine = Math.floor(targetPosition / avgBytesPerLine) + 1;

      // 设置基准起始行号（基于搜索结果导航位置）
      setBaselineStartLineNumber(Math.max(1, estimatedStartLine));

      // 等待内容更新后，滚动到目标行
      setTimeout(() => {
        if (textViewerRef.current) {
          const targetLineInNewContent = Math.max(1, result.line - estimatedStartLine + 1);
          textViewerRef.current.scrollToLine(targetLineInNewContent, result.column);
        }
        // 导航完成后重置标志
        setTimeout(() => {
          setNavigatingToResult(false);
        }, 500);
      }, 100);

    } catch (err) {
      console.error('Failed to navigate to search result:', err);
      setError('Failed to navigate to search result');
      setNavigatingToResult(false);
    } finally {
      setLoading(false);
    }
  }, [isLargeFile, filePath, totalSize]);

  const textViewerRef = useRef<VirtualizedTextViewerRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreSectionRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  const handleSearchResults = useCallback((results: SearchResult[], isLimited?: boolean) => {
    // 确保总是重置loading状态
    setSearchLoading(false);

    // 如果正在导航到搜索结果，不要重置搜索索引
    if (navigatingToResult) {
      setSearchResults(results);
      setSearchResultsLimited(isLimited || false);
      return;
    }

    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);
    setSearchResultsLimited(isLimited || false);
  }, [navigatingToResult]);

  const performSearch = useCallback(async (term: string) => {
    if (!term.trim() || term.trim().length < 2) {
      // 清空搜索结果，要求至少2个字符才开始搜索
      setSearchResults([]);
      setFullFileSearchResults([]);
      setCurrentSearchIndex(-1);
      setSearchLoading(false);
      setFullFileSearchLoading(false);
      setSearchResultsLimited(false);
      setFullFileSearchLimited(false);
      return;
    }

    if (fullFileSearchMode) {
      // 执行全文件搜索
      setFullFileSearchLoading(true);
      setSearchLoading(false); // 确保普通搜索loading状态关闭
      try {
        const results = await performFullFileSearch(term);
        setFullFileSearchResults(results);
        setCurrentSearchIndex(results.length > 0 ? 0 : -1);
      } catch (err) {
        console.error('Full file search failed:', err);
        setFullFileSearchResults([]);
        setCurrentSearchIndex(-1);
      } finally {
        setFullFileSearchLoading(false);
      }
    } else {
      // 执行当前内容搜索 - 这里只需要设置loading，实际搜索由VirtualizedTextViewer处理
      setSearchLoading(true);
      setFullFileSearchLoading(false); // 确保全文件搜索loading状态关闭

      // 添加超时保护，防止loading状态永远不被重置
      setTimeout(() => {
        // 如果750ms后loading状态仍然为true，强制重置（500ms FileViewer防抖 + 200ms VirtualizedTextViewer防抖 + 50ms缓冲）
        setSearchLoading(false);
      }, 750);

      // 注意：实际搜索逻辑在VirtualizedTextViewer的useEffect中处理，会调用handleSearchResults
    }
  }, [fullFileSearchMode, performFullFileSearch]);

  const navigateToResult = useCallback((index: number) => {
    const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
    if (index < 0 || index >= currentResults.length) return;

    setCurrentSearchIndex(index);
    const result = currentResults[index];

    if (fullFileSearchMode && 'filePosition' in result) {
      // 全文件搜索结果导航
      navigateToFullFileSearchResult(result as { line: number; column: number; text: string; match: string; filePosition: number });
    } else {
      // 当前内容搜索结果导航
      if (textViewerRef.current) {
        textViewerRef.current.scrollToLine(result.line, result.column);
      }
    }
  }, [fullFileSearchMode, fullFileSearchResults, searchResults, navigateToFullFileSearchResult]);

  const nextResult = () => {
    const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
    if (currentResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % currentResults.length;
    navigateToResult(nextIndex);
  };

  const prevResult = () => {
    const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
    if (currentResults.length === 0) return;
    const prevIndex = currentSearchIndex === 0 ? currentResults.length - 1 : currentSearchIndex - 1;
    navigateToResult(prevIndex);
  };

  const handlePercentageJump = () => {
    const percent = parseFloat(percentValue);
    if (!isNaN(percent) && percent >= 0 && percent <= 100) {
      if (isLargeFile) {
        // 对于大文件，跳转到文件的实际百分比位置
        jumpToFilePercentage(percent);
      } else if (textViewerRef.current) {
        // 对于小文件，使用现有的滚动逻辑
        textViewerRef.current.scrollToPercentage(percent);
      }
      setShowPercentInput(false);
      setPercentValue('');
    }
  };

  const handlePercentKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePercentageJump();
    } else if (e.key === 'Escape') {
      setShowPercentInput(false);
      setPercentValue('');
    }
  };

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 只在没有输入框获得焦点时响应快捷键
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;

      // F3 或 Ctrl+G: 下一个搜索结果
      if ((e.key === 'F3' || (e.ctrlKey && e.key === 'g')) && currentResults.length > 0) {
        e.preventDefault();
        nextResult();
      }

      // Shift+F3 或 Ctrl+Shift+G: 上一个搜索结果
      if (((e.shiftKey && e.key === 'F3') || (e.ctrlKey && e.shiftKey && e.key === 'G')) && currentResults.length > 0) {
        e.preventDefault();
        prevResult();
      }

      // Ctrl+F: 聚焦搜索框
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Escape: 清除搜索
      if (e.key === 'Escape' && searchTerm) {
        setSearchTerm('');
        setCurrentSearchIndex(-1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fullFileSearchMode, fullFileSearchResults, searchResults, nextResult, prevResult, searchTerm]);

  // 安卓返回按钮处理逻辑
  useEffect(() => {
    const handleAndroidBack = () => {
      // 如果有搜索词，清除搜索
      if (searchTerm.trim()) {
        setSearchTerm('');
        setCurrentSearchIndex(-1);
        setSearchResults([]);
        setFullFileSearchResults([]);
        return true; // 表示已处理
      }
      
      // 如果显示百分比输入框，隐藏它
      if (showPercentInput) {
        setShowPercentInput(false);
        return true; // 表示已处理
      }
      
      // 否则返回到文件浏览器
      onBack();
      return true; // 表示已处理
    };

    // 注册安卓返回按钮处理器
    androidBackHandler.addHandler(handleAndroidBack);

    // 清理函数
    return () => {
      androidBackHandler.removeHandler(handleAndroidBack);
    };
  }, [searchTerm, showPercentInput, onBack]);

  useEffect(() => {
    loadFileContent();
  }, [loadFileContent]);

  // 监听搜索词变化，触发搜索
  useEffect(() => {
    // 如果正在导航到搜索结果，不要重新执行搜索
    if (navigatingToResult) return;

    const timeoutId = setTimeout(() => {
      performSearch(searchTerm);
    }, 500); // 增加到500ms防抖，减少搜索频率

    return () => clearTimeout(timeoutId);
  }, [searchTerm, performSearch, navigatingToResult]);

  // 监听搜索模式变化，重新执行搜索
  useEffect(() => {
    // 如果正在导航到搜索结果，不要重新执行搜索
    if (navigatingToResult) return;

    if (searchTerm.trim()) {
      // 保存当前搜索索引
      const currentIndex = currentSearchIndex;
      performSearch(searchTerm);
      // 搜索完成后恢复索引（如果可能的话）
      setTimeout(() => {
        const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
        if (currentResults.length > 0 && currentIndex >= 0 && currentIndex < currentResults.length) {
          setCurrentSearchIndex(currentIndex);
        }
      }, 100);
    }
  }, [fullFileSearchMode, searchTerm, performSearch, navigatingToResult]);

  // 监听容器大小变化
  useEffect(() => {
    const updateContainerHeight = () => {
      if (mainContainerRef.current) {
        const mainRect = mainContainerRef.current.getBoundingClientRect();
        let availableHeight = mainRect.height;

        // 如果有加载更多区域，减去其高度
        if (loadMoreSectionRef.current) {
          const loadMoreRect = loadMoreSectionRef.current.getBoundingClientRect();
          availableHeight -= loadMoreRect.height;
        }

        // 确保有最小高度，避免虚拟列表出现问题
        const newHeight = Math.max(300, availableHeight);
        if (newHeight !== containerHeight) {
          setContainerHeight(newHeight);
        }
      }
    };

    // 使用 ResizeObserver 来监听容器大小变化（如果支持）
    let resizeObserver: ResizeObserver | null = null;

    if (window.ResizeObserver && mainContainerRef.current) {
      resizeObserver = new ResizeObserver(updateContainerHeight);
      resizeObserver.observe(mainContainerRef.current);
    }

    // 延迟执行以确保DOM已更新
    const timer = setTimeout(updateContainerHeight, 100);

    // 备用方案：监听窗口大小变化
    window.addEventListener('resize', updateContainerHeight);

    return () => {
      clearTimeout(timer);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateContainerHeight);
    };
  }, [isLargeFile, loadedChunks, totalSize, containerHeight]); // 当大文件状态或加载进度变化时重新计算

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, performSearch]);

  // 当内容加载完成或文件状态变化时，重新计算容器高度
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mainContainerRef.current) {
        const mainRect = mainContainerRef.current.getBoundingClientRect();
        let availableHeight = mainRect.height;

        // 如果有加载更多区域，减去其高度
        if (loadMoreSectionRef.current) {
          const loadMoreRect = loadMoreSectionRef.current.getBoundingClientRect();
          availableHeight -= loadMoreRect.height;
        }

        const newHeight = Math.max(300, availableHeight);
        if (newHeight !== containerHeight) {
          setContainerHeight(newHeight);
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [content, isLargeFile, loadedChunks, containerHeight]);



  const getFileExtension = (filename: string): string => {
    return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
  };

  const getLanguageFromExtension = (ext: string): string => {
    const languageMap: { [key: string]: string } = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
    };
    return languageMap[ext] || 'text';
  };

  const downloadFile = async () => {
    try {
      console.log('Starting download for file:', file.basename, 'Path:', filePath);

      // 统一使用带进度的下载方式
      const result = await StorageServiceManager.downloadFileWithProgress(filePath, file.basename);
      console.log('Download initiated:', result);

      // 下载进度将通过事件系统处理，这里不需要显示 alert
      // 用户可以在下载进度组件中看到状态

    } catch (err) {
      console.error('Failed to start download:', err);
      // 如果是用户取消操作，不显示错误弹窗
      const errorMessage = err instanceof Error ? err.message : (typeof err === 'string' ? err : t('error.unknown'));
      if (errorMessage !== 'download.cancelled') {
        alert(`${t('download.failed')}: ${errorMessage}`);
      }
    }
  };

  // 复制完整路径到剪贴板
  const copyFullPath = async () => {
    try {
      const connection = StorageServiceManager.getConnection();
      if (!connection) return;

      // 使用 StorageServiceManager.getFileUrl 获取正确的 URL
      // 这样可以正确处理 HuggingFace 等特殊协议
      const fullPath = StorageServiceManager.getFileUrl(filePath);

      const success = await copyToClipboard(fullPath);
      if (success) {
        showCopyToast(t('copied.to.clipboard'));
      } else {
        showCopyToast(t('copy.failed'));
      }
    } catch (err) {
      console.error('复制路径失败:', err);
      showCopyToast(t('copy.failed'));
    }
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 lg:space-x-4 min-w-0 flex-1">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
              title={t('viewer.go.back')}
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>

            <div className="flex items-center space-x-2 lg:space-x-3 min-w-0 flex-1">
              <FileIcon fileType={fileType} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1 lg:space-x-2">
                  <h1
                    className="text-base lg:text-lg font-semibold text-gray-900 dark:text-gray-100 truncate max-w-32 sm:max-w-48 lg:max-w-lg"
                    title={file.basename}
                  >
                    {file.basename}
                  </h1>
                  {/* 复制完整路径按钮 */}
                  <button
                    onClick={copyFullPath}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
                    title={t('copy.full.path')}
                  >
                    <Copy className="w-3 h-3 lg:w-4 lg:h-4 text-gray-500 dark:text-gray-400" />
                  </button>
                </div>
                <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 truncate">
                  {formatFileSize(file.size)} • {(isData || isSpreadsheet) && dataMetadata ?
                    `${dataMetadata.numRows.toLocaleString()} rows • ${dataMetadata.numColumns} columns` :
                    isPresentation && presentationMetadata ?
                    `${presentationMetadata.slideCount} slides • ${presentationMetadata.size.width} × ${presentationMetadata.size.height} pt` :
                    isText ? getLanguageFromExtension(getFileExtension(file.basename)) : fileType
                  }
                  {isLargeFile && (
                    <span className="hidden sm:inline">
                      {' • '}
                      {t('viewer.position.info', {
                        current: formatFileSize(currentFilePosition + loadedContentSize),
                        total: formatFileSize(totalSize),
                        percent: ((currentFilePosition + loadedContentSize) / totalSize * 100).toFixed(1)
                      })}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 lg:space-x-4 flex-shrink-0">
            <LanguageSwitcher />
            {/* 响应式下载按钮 */}
            <button
              onClick={downloadFile}
              className="flex items-center space-x-2 p-2 sm:px-4 sm:py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
              title={t('viewer.download')}
            >
              <Download className="w-4 h-4" />
              <span className="hidden lg:inline">{t('viewer.download')}</span>
            </button>
          </div>
        </div>

        {/* Search Bar - Only for text files */}
        {isText && (
          <div className="mt-4 flex flex-col lg:flex-row lg:items-center space-y-2 lg:space-y-0 lg:space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={fullFileSearchMode ?
                  (isLargeFile ? t('search.entire.file.large') : t('search.entire.file')) :
                  t('search.loaded.content')
                }
                className="w-full pl-10 pr-4 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between lg:justify-start space-x-2 lg:space-x-4">
              {searchLoading && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
              {fullFileSearchLoading && <Loader2 className="w-4 h-4 animate-spin text-green-600" />}

              {isLargeFile && (
                <div className="flex items-center space-x-2">
                  <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={fullFileSearchMode}
                      onChange={(e) => setFullFileSearchMode(e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 dark:bg-gray-700"
                    />
                    <span className="whitespace-nowrap">{t('search.entire.file')}</span>
                  </label>
                </div>
              )}

              {(() => {
                const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
                const isCurrentResultsLimited = fullFileSearchMode ? fullFileSearchLimited : searchResultsLimited;
                const limitText = fullFileSearchMode ? t('search.results.limited.500') : t('search.results.limited.5000');
                const limitDescription = fullFileSearchMode ? t('search.sampling.description') : t('search.too.many.results');

                return currentResults.length > 0 && (
                  <div className="flex items-center space-x-2 lg:space-x-3">
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-1 lg:space-x-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {t('viewer.search.results', {
                            current: currentSearchIndex + 1,
                            total: currentResults.length
                          })}
                        </span>
                        {currentSearchIndex >= 0 && currentResults[currentSearchIndex] && (
                          <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 rounded-full text-xs font-medium">
                            {t('line.number', { line: currentResults[currentSearchIndex].line })}
                          </span>
                        )}
                        {fullFileSearchMode && isLargeFile && (
                          <span className="hidden sm:inline text-yellow-600 dark:text-yellow-400 text-xs">{t('search.sampling')}</span>
                        )}
                        {isCurrentResultsLimited && (
                          <span className="hidden sm:inline text-orange-600 dark:text-orange-400 text-xs">{limitText}</span>
                        )}
                      </div>
                      {isCurrentResultsLimited && (
                        <span className="hidden sm:block text-xs text-orange-500 dark:text-orange-400 mt-1">
                          {limitDescription}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={prevResult}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t('viewer.previous.result')}
                        disabled={currentResults.length === 0}
                      >
                        <ChevronUp className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                      </button>
                      <button
                        onClick={nextResult}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t('viewer.next.result')}
                        disabled={currentResults.length === 0}
                      >
                        <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Navigation controls */}
              <div className="flex items-center space-x-2">
                {!showPercentInput ? (
                  <button
                    onClick={() => setShowPercentInput(true)}
                    className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                    title={isLargeFile ? t('viewer.jump.percent.large') : t('viewer.jump.percent')}
                  >
                    <Percent className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  </button>
                ) : (
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={percentValue}
                      onChange={(e) => setPercentValue(e.target.value)}
                      onKeyDown={handlePercentKeyPress}
                      placeholder="0-100"
                      className="w-16 lg:w-20 px-2 lg:px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      autoFocus
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
                    <button
                      onClick={handlePercentageJump}
                      className="px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors border border-gray-300 dark:border-gray-600"
                      title={t('viewer.jump')}
                    >
                      <Move className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

            {/* Content */}
      <main className="flex-1 overflow-hidden bg-white dark:bg-gray-800 flex flex-col">
        {loading && (
          <LoadingDisplay
            message={t('loading.file', { filename: file.basename })}
            className="flex-1"
          />
        )}

        {error && (
          <ErrorDisplay message={error} className="flex-1" />
        )}

        {!loading && !error && (
          <div ref={mainContainerRef} className="h-full flex flex-col">
            {isText ? (
              <>
                <div ref={containerRef} className="flex-1 relative">
                  <VirtualizedTextViewer
                    ref={textViewerRef}
                    content={content}
                    searchTerm={searchTerm}
                    onSearchResults={handleSearchResults}
                    onScrollToBottom={handleScrollToBottom}
                    className="h-full"
                    height={containerHeight}
                    startLineNumber={calculateStartLineNumber()}
                    currentSearchIndex={currentSearchIndex}
                    searchResults={fullFileSearchMode ? fullFileSearchResults : searchResults}
                  />
                </div>

                {/* 底部加载状态指示器 */}
                {isLargeFile && loadingMore && (
                  <div ref={loadMoreSectionRef} className="flex justify-center py-2 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                    <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('loading')}</span>
                    </div>
                  </div>
                )}
              </>
            ) : isMarkdown ? (
              <MarkdownViewer
                content={content}
                fileName={file.basename}
                className="h-full"
                onScrollToBottom={isLargeFile ? handleScrollToBottom : undefined}
                isLargeFile={isLargeFile}
                loadingMore={loadingMore}
                loadedChunks={loadedChunks}
                loadedContentSize={loadedContentSize}
              />
            ) : isWord ? (
              <WordViewer
                filePath={filePath}
                fileName={file.basename}
                fileSize={file.size}
                className="h-full"
              />
            ) : isPresentation ? (
              <PresentationViewer
                filePath={filePath}
                fileName={file.basename}
                fileSize={file.size}
                className="h-full"
                onMetadataLoaded={setPresentationMetadata}
              />
            ) : isMedia ? (
              <MediaViewer
                filePath={filePath}
                fileName={file.basename}
                fileType={fileType as 'image' | 'pdf' | 'video' | 'audio'}
                fileSize={file.size}
              />
            ) : isSpreadsheet ? (
              <UniversalDataTableViewer
                filePath={filePath}
                fileName={file.basename}
                fileSize={file.size}
                fileType={file.basename.toLowerCase().endsWith('.xlsx') || file.basename.toLowerCase().endsWith('.xls') ? 'xlsx' :
                         file.basename.toLowerCase().endsWith('.ods') ? 'ods' : 'csv'}
                onMetadataLoaded={setDataMetadata}
              />
            ) : isData ? (
              <UniversalDataTableViewer
                filePath={filePath}
                fileName={file.basename}
                fileSize={file.size}
                fileType={file.basename.toLowerCase().endsWith('.parquet') || file.basename.toLowerCase().endsWith('.pqt') ? 'parquet' : 'csv'}
                onMetadataLoaded={setDataMetadata}
              />
            ) : isArchive ? (
              <ArchiveViewer
                url={StorageServiceManager.getFileUrl(filePath)}
                headers={StorageServiceManager.getHeaders()}
                filename={file.basename}
                storageClient={storageClient}
              />
            ) : (
              <UnsupportedFormatDisplay
                message={t('viewer.unsupported.format')}
                secondaryMessage={t('viewer.download.to.view')}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
};
