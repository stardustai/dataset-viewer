import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  createFoldingProvider,
  type FoldableRange,
  type FoldingProvider,
} from '../../../utils/folding';

// 折叠指示器组件
interface FoldingIndicatorProps {
  /** 是否已折叠 */
  isCollapsed: boolean;
  /** 切换折叠状态的回调 */
  onToggle: () => void;
}

export const FoldingIndicator: React.FC<FoldingIndicatorProps> = ({ isCollapsed, onToggle }) => {
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
      {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
    </button>
  );
};

// 折叠逻辑管理 Hook - 按需计算版本
export interface UseFoldingLogicProps {
  lines: string[];
  fileName: string;
  visibleRange?: { start: number; end: number }; // 当前可见范围
}

export interface UseFoldingLogicResult {
  supportsFolding: boolean;
  foldableRanges: FoldableRange[];
  collapsedRanges: Set<string>;
  visibleLines: { line: string; originalIndex: number }[];
  getFoldableRangeAtLine: (lineIndex: number) => FoldableRange | null;
  toggleFoldingRange: (rangeId: string) => void;
  isRangeCollapsed: (rangeId: string) => boolean;
}

export const useFoldingLogic = ({
  lines,
  fileName,
  visibleRange,
}: UseFoldingLogicProps): UseFoldingLogicResult => {
  // 只保存已折叠的区间ID
  const [collapsedRanges, setCollapsedRanges] = useState<Set<string>>(new Set());
  const [provider, setProvider] = useState<FoldingProvider | null>(null);
  const [foldableRanges, setFoldableRanges] = useState<FoldableRange[]>([]);

  // 支持折叠检测
  const supportsFolding = Boolean(
    fileName &&
      ['json', 'jsonl', 'xml', 'svg', 'html', 'htm', 'yaml', 'yml'].includes(
        fileName.split('.').pop()?.toLowerCase() || ''
      )
  );

  // 计算内容哈希以避免不必要的更新
  const contentHash = useMemo(() => {
    if (lines.length === 0) return '';
    // 简单哈希：首行 + 长度 + 末行
    return `${lines[0] || ''}-${lines.length}-${lines[lines.length - 1] || ''}`;
  }, [lines]);

  // Initialize the folding provider when content changes
  useEffect(() => {
    if (supportsFolding && lines.length > 0) {
      const content = lines.join('\n');
      const newProvider = createFoldingProvider(fileName, content);
      setProvider(newProvider);
    } else {
      setProvider(null);
    }
  }, [supportsFolding, contentHash, fileName]); // 使用 contentHash 而不是 lines

  // 按需计算当前可见范围内的折叠区间
  useEffect(() => {
    if (!provider || !supportsFolding || lines.length === 0) {
      setFoldableRanges([]);
      return;
    }

    const startLine = visibleRange?.start || 0;
    const endLine = visibleRange?.end || lines.length - 1;

    const ranges = provider.getFoldingRangesInRange(lines, startLine, endLine);
    setFoldableRanges(ranges);
  }, [provider, supportsFolding, visibleRange?.start, visibleRange?.end, lines.length]); // 分别依赖具体属性

  // 计算可见行（考虑折叠状态）
  const visibleLines = useMemo(() => {
    if (!supportsFolding || collapsedRanges.size === 0) {
      return lines.map((line, index) => ({ line, originalIndex: index }));
    }

    // 构建折叠行的集合
    const collapsedLinesSet = new Set<number>();
    for (const rangeId of collapsedRanges) {
      const range = foldableRanges.find(r => r.id === rangeId);
      if (range) {
        for (let i = range.startLine + 1; i <= range.endLine; i++) {
          collapsedLinesSet.add(i);
        }
      }
    }

    // 过滤掉折叠的行
    const result: { line: string; originalIndex: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!collapsedLinesSet.has(i)) {
        result.push({ line: lines[i], originalIndex: i });
      }
    }
    return result;
  }, [lines, collapsedRanges, foldableRanges, supportsFolding]);

  // 获取指定行的折叠范围（按需计算）
  const getFoldableRangeAtLine = useCallback(
    (lineIndex: number) => {
      if (!provider || !supportsFolding) return null;

      // 首先从当前已计算的范围中查找
      const existingRange = foldableRanges.find(range => range.startLine === lineIndex);
      if (existingRange) {
        return existingRange;
      }

      // 如果不在当前范围内，使用 provider 计算
      try {
        const range = provider.getFoldingRangeAt(lines, lineIndex);
        return range;
      } catch (error) {
        console.warn('Error parsing folding range at line', lineIndex, error);
        return null;
      }
    },
    [provider, supportsFolding, foldableRanges, lines]
  );

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
  const isRangeCollapsed = useCallback(
    (rangeId: string) => {
      return collapsedRanges.has(rangeId);
    },
    [collapsedRanges]
  );

  // 当文件改变时清除状态
  useEffect(() => {
    setCollapsedRanges(new Set());
  }, [fileName]);

  return {
    supportsFolding,
    foldableRanges,
    collapsedRanges,
    visibleLines,
    getFoldableRangeAtLine,
    toggleFoldingRange,
    isRangeCollapsed,
  };
};
