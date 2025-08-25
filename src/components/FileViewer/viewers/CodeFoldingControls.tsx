import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  parseFoldingRanges,
  type FoldableRange
} from '../../../utils/codeFolding';

// 折叠指示器组件
interface FoldingIndicatorProps {
  /** 是否已折叠 */
  isCollapsed: boolean;
  /** 切换折叠状态的回调 */
  onToggle: () => void;
}

export const FoldingIndicator: React.FC<FoldingIndicatorProps> = ({
  isCollapsed,
  onToggle
}) => {
  const { t } = useTranslation();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center justify-center w-4 h-4 ml-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
      title={isCollapsed ? t('unfold.range') : t('fold.range')}
    >
      {isCollapsed ? (
        <ChevronRight className="w-3 h-3" />
      ) : (
        <ChevronDown className="w-3 h-3" />
      )}
    </button>
  );
};

// 折叠逻辑管理 Hook
export interface UseFoldingLogicProps {
  lines: string[];
  fileName: string;
}

export interface UseFoldingLogicResult {
  supportsFolding: boolean;
  foldableRanges: FoldableRange[];
  collapsedRanges: Set<string>;
  foldingRangeMap: Map<number, FoldableRange>;
  visibleLines: { line: string; originalIndex: number }[];
  getFoldableRangeAtLine: (lineIndex: number) => FoldableRange | null;
  toggleFoldingRange: (rangeId: string) => void;
  isRangeCollapsed: (rangeId: string) => boolean;
}

export const useFoldingLogic = ({
  lines,
  fileName
}: UseFoldingLogicProps): UseFoldingLogicResult => {
  const [foldableRanges, setFoldableRanges] = useState<FoldableRange[]>([]);
  const [collapsedRanges, setCollapsedRanges] = useState<Set<string>>(new Set());
  const [foldingRangeMap, setFoldingRangeMap] = useState<Map<number, FoldableRange>>(new Map());

  // 支持折叠检测
  const supportsFolding = Boolean(fileName && ['json', 'jsonl', 'xml', 'svg', 'html', 'htm', 'yaml', 'yml']
    .includes(fileName.split('.').pop()?.toLowerCase() || ''));

  // 折叠解析逻辑
  useEffect(() => {
    if (!supportsFolding) {
      setFoldableRanges([]);
      setCollapsedRanges(new Set());
      setFoldingRangeMap(new Map());
      return;
    }

    // 异步处理大文件性能优化
    const parseTimeout = setTimeout(() => {
      try {
        const ranges = parseFoldingRanges(lines, fileName);
        setFoldableRanges(ranges);

        // 构建行号到折叠范围的映射，实现 O(1) 查找
        const rangeMap = new Map<number, FoldableRange>();
        ranges.forEach(range => {
          rangeMap.set(range.startLine, range);
        });
        setFoldingRangeMap(rangeMap);
      } catch (error) {
        console.warn('Failed to parse folding ranges:', error);
        setFoldableRanges([]);
        setFoldingRangeMap(new Map());
      }
    }, 0);

    return () => clearTimeout(parseTimeout);
  }, [fileName, supportsFolding, lines]);

  // 计算可见行
  const visibleLines = useMemo(() => {
    // 如果不支持折叠或没有折叠区间，直接返回所有行
    if (!supportsFolding || collapsedRanges.size === 0 || foldableRanges.length === 0) {
      return lines.map((line, index) => ({ line, originalIndex: index }));
    }

    // 为大文件优化：预计算折叠行的集合，避免重复计算
    const collapsedLinesSet = new Set<number>();
    for (const rangeId of collapsedRanges) {
      const range = foldableRanges.find(r => r.id === rangeId);
      if (range) {
        for (let i = range.startLine + 1; i <= range.endLine; i++) {
          collapsedLinesSet.add(i);
        }
      }
    }

    // 高效过滤：只遍历一次，避免重复计算
    const result: { line: string; originalIndex: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!collapsedLinesSet.has(i)) {
        result.push({ line: lines[i], originalIndex: i });
      }
    }
    return result;
  }, [lines, collapsedRanges, foldableRanges, supportsFolding]);

  // 获取指定行的折叠范围
  const getFoldableRangeAtLine = useCallback((lineIndex: number) => {
    return supportsFolding ? foldingRangeMap.get(lineIndex) || null : null;
  }, [supportsFolding, foldingRangeMap]);

  // 切换折叠状态
  const toggleFoldingRange = useCallback((rangeId: string) => {
    setCollapsedRanges(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rangeId)) {
        newSet.delete(rangeId);
      } else {
        newSet.add(rangeId);
      }
      return newSet;
    });
  }, []);

  // 检查范围是否已折叠
  const isRangeCollapsed = useCallback((rangeId: string) => {
    return collapsedRanges.has(rangeId);
  }, [collapsedRanges]);

  return {
    supportsFolding,
    foldableRanges,
    collapsedRanges,
    foldingRangeMap,
    visibleLines,
    getFoldableRangeAtLine,
    toggleFoldingRange,
    isRangeCollapsed
  };
};

