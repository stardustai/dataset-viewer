import type React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { FoldableRange } from '../../../../utils/folding';
import { FoldingIndicator } from '../CodeFoldingControls';

interface SearchResult {
  line: number;
  column: number;
  text: string;
  match: string;
}

interface TextViewerLineProps {
  line: string;
  originalLineIndex: number;
  startLineNumber: number;
  searchRegex: RegExp | null;
  searchResults: SearchResult[];
  currentSearchIndex: number;
  shouldHighlight: boolean;
  highlightedLines: Map<number, string>;
  expandedLongLines: Set<number>;
  setExpandedLongLines: React.Dispatch<React.SetStateAction<Set<number>>>;
  foldableRange: FoldableRange | null;
  collapsedRanges: Set<string>;
  toggleFoldingRange: (id: string) => void;
  supportsFolding: boolean;
}

const LONG_LINE_THRESHOLD = 300;
const TRUNCATE_LENGTH = 200;
const MAX_LINE_LENGTH = 10000;

export const TextViewerLine: React.FC<TextViewerLineProps> = ({
  line,
  originalLineIndex,
  startLineNumber,
  searchRegex,
  searchResults,
  currentSearchIndex,
  shouldHighlight,
  highlightedLines,
  expandedLongLines,
  setExpandedLongLines,
  foldableRange,
  collapsedRanges,
  toggleFoldingRange,
  supportsFolding,
}) => {
  const { t } = useTranslation();
  const currentLineNumber = startLineNumber + originalLineIndex;
  const isLongLine = line.length > LONG_LINE_THRESHOLD;
  const isExpanded = expandedLongLines.has(originalLineIndex);
  const isRangeCollapsed = foldableRange ? collapsedRanges.has(foldableRange.id) : false;

  // 搜索结果映射
  const searchResultsMap = new Map(searchResults.map(result => [result.line, true]));

  // 对于超长行，如果未展开则截断显示
  let displayLine = line;
  let showExpandButton = false;

  if (isLongLine && !isExpanded && line.length > TRUNCATE_LENGTH) {
    displayLine = line.substring(0, TRUNCATE_LENGTH) + '...';
    showExpandButton = true;
  }

  // 获取语法高亮的内容
  let processedLine = displayLine;
  if (
    shouldHighlight &&
    highlightedLines.has(originalLineIndex) &&
    (line.length < MAX_LINE_LENGTH || isExpanded)
  ) {
    const highlighted = highlightedLines.get(originalLineIndex);
    if (highlighted && highlighted !== line) {
      processedLine = highlighted;
    }
  }

  const handleExpandToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedLongLines(prev => {
        const newSet = new Set(prev);
        if (isExpanded) {
          newSet.delete(originalLineIndex);
        } else {
          newSet.add(originalLineIndex);
        }
        return newSet;
      });
    },
    [isExpanded, originalLineIndex, setExpandedLongLines]
  );

  // 渲染搜索高亮
  const renderSearchHighlight = useCallback(
    (text: string) => {
      if (!searchRegex) return text;

      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;

      searchRegex.lastIndex = 0;
      while ((match = searchRegex.exec(text)) !== null) {
        // 添加匹配前的文本
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index));
        }

        // 检查这个匹配是否是当前活跃的匹配
        const currentActiveResult =
          currentSearchIndex >= 0 ? searchResults[currentSearchIndex] : null;
        const isActiveMatch =
          currentActiveResult &&
          currentActiveResult.line === currentLineNumber &&
          currentActiveResult.column === match.index + 1;

        parts.push(
          <mark
            key={`match-${match.index}`}
            className={isActiveMatch ? 'search-highlight-active' : 'search-highlight'}
          >
            {match[0]}
          </mark>
        );

        lastIndex = match.index + match[0].length;

        // 防止无限循环
        if (match.index === searchRegex.lastIndex) {
          searchRegex.lastIndex++;
        }
      }

      // 添加最后剩余的文本
      if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
      }

      return parts;
    },
    [searchRegex, currentSearchIndex, searchResults, currentLineNumber]
  );

  // 如果没有搜索词，直接返回
  if (!searchRegex) {
    return (
      <div className="flex items-center">
        <span className={shouldHighlight && processedLine !== displayLine ? 'contents' : ''}>
          {shouldHighlight && processedLine !== displayLine ? (
            <span dangerouslySetInnerHTML={{ __html: processedLine }} />
          ) : (
            processedLine
          )}
        </span>
        {/* 代码折叠指示器 */}
        {foldableRange && supportsFolding && (
          <div className="flex items-center">
            <FoldingIndicator
              isCollapsed={isRangeCollapsed}
              onToggle={() => toggleFoldingRange(foldableRange.id)}
            />
            {/* 显示折叠摘要信息 */}
            {isRangeCollapsed && (
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 italic">
                {foldableRange.summary}
              </span>
            )}
            {/* 大节点指示器 */}
            {!isRangeCollapsed && foldableRange.endLine - foldableRange.startLine > 100 && (
              <span className="ml-2 px-1 text-xs bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300 rounded">
                {t('large.node', 'Large Node')} (
                {foldableRange.endLine - foldableRange.startLine + 1} lines)
              </span>
            )}
          </div>
        )}
        {showExpandButton && (
          <button
            className="ml-2 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            onClick={handleExpandToggle}
          >
            {isExpanded ? t('collapse.long.line') : t('expand.long.line')}
          </button>
        )}
      </div>
    );
  }

  // 使用Map快速查找，避免线性搜索
  if (!searchResultsMap.has(currentLineNumber)) {
    return (
      <div className="flex items-center">
        <span className={shouldHighlight && processedLine !== displayLine ? 'contents' : ''}>
          {shouldHighlight && processedLine !== displayLine ? (
            <span dangerouslySetInnerHTML={{ __html: processedLine }} />
          ) : (
            processedLine
          )}
        </span>
        {/* 代码折叠指示器 */}
        {foldableRange && supportsFolding && (
          <div className="flex items-center">
            <FoldingIndicator
              isCollapsed={isRangeCollapsed}
              onToggle={() => toggleFoldingRange(foldableRange.id)}
            />
            {/* 显示折叠摘要信息 */}
            {isRangeCollapsed && (
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 italic">
                {foldableRange.summary}
              </span>
            )}
            {/* 大节点指示器 */}
            {!isRangeCollapsed && foldableRange.endLine - foldableRange.startLine > 100 && (
              <span className="ml-2 px-1 text-xs bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300 rounded">
                {t('large.node', 'Large Node')} (
                {foldableRange.endLine - foldableRange.startLine + 1} lines)
              </span>
            )}
          </div>
        )}
        {showExpandButton && (
          <button
            className="ml-2 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            onClick={handleExpandToggle}
          >
            {isExpanded ? t('collapse.long.line') : t('expand.long.line')}
          </button>
        )}
      </div>
    );
  }

  const searchDisplayLine = isLongLine && !isExpanded ? displayLine : line;

  // 对于已经语法高亮的代码，处理搜索高亮
  if (
    shouldHighlight &&
    processedLine !== displayLine &&
    searchDisplayLine.length < MAX_LINE_LENGTH
  ) {
    // 对于已经语法高亮的代码，创建一个临时元素来提取纯文本
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = processedLine;
    const textContent = tempDiv.textContent || tempDiv.innerText || '';

    // 如果纯文本中没有搜索匹配，直接返回语法高亮版本
    searchRegex.lastIndex = 0;
    if (!searchRegex.test(textContent)) {
      return (
        <div className="flex items-center">
          <span dangerouslySetInnerHTML={{ __html: processedLine }} />
          {/* 代码折叠指示器 */}
          {foldableRange && supportsFolding && (
            <div className="flex items-center">
              <FoldingIndicator
                isCollapsed={isRangeCollapsed}
                onToggle={() => toggleFoldingRange(foldableRange.id)}
              />
              {/* 显示折叠摘要信息 */}
              {isRangeCollapsed && (
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 italic">
                  {foldableRange.summary}
                </span>
              )}
              {/* 大节点指示器 */}
              {!isRangeCollapsed && foldableRange.endLine - foldableRange.startLine > 100 && (
                <span className="ml-2 px-1 text-xs bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300 rounded">
                  {t('large.node', 'Large Node')} (
                  {foldableRange.endLine - foldableRange.startLine + 1} lines)
                </span>
              )}
            </div>
          )}
          {showExpandButton && (
            <button
              className="ml-2 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              onClick={handleExpandToggle}
            >
              {isExpanded ? t('collapse.long.line') : t('expand.long.line')}
            </button>
          )}
        </div>
      );
    }
  }

  // 普通文本或有搜索匹配时的高亮处理
  return (
    <div className="flex items-center">
      <span>{renderSearchHighlight(searchDisplayLine)}</span>
      {/* 代码折叠指示器 */}
      {foldableRange && supportsFolding && (
        <div className="flex items-center">
          <FoldingIndicator
            isCollapsed={isRangeCollapsed}
            onToggle={() => toggleFoldingRange(foldableRange.id)}
          />
          {/* 显示折叠摘要信息 */}
          {isRangeCollapsed && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 italic">
              {foldableRange.summary}
            </span>
          )}
          {/* 大节点指示器 */}
          {!isRangeCollapsed && foldableRange.endLine - foldableRange.startLine > 100 && (
            <span className="ml-2 px-1 text-xs bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300 rounded">
              {t('large.node', 'Large Node')} ({foldableRange.endLine - foldableRange.startLine + 1}{' '}
              lines)
            </span>
          )}
        </div>
      )}
      {showExpandButton && (
        <button
          className="ml-2 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          onClick={handleExpandToggle}
        >
          {isExpanded ? t('collapse.long.line') : t('expand.long.line')}
        </button>
      )}
    </div>
  );
};
