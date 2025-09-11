import { useCallback, useEffect, useState } from 'react';
import { useSyntaxHighlighting } from '../../../../hooks/useSyntaxHighlighting';
import { useTheme } from '../../../../hooks/useTheme';
import {
  getLanguageFromFileName,
  highlightLine,
  isLanguageSupported,
} from '../../../../utils/syntaxHighlighter';

// Virtual item 接口定义
interface VirtualItem {
  index: number;
  start: number;
  size: number;
  end: number;
  key: string | number;
}

interface UseTextViewerHighlightingProps {
  fileName?: string;
  lines: string[];
}

const MAX_LINE_LENGTH = 10000;

export const useTextViewerHighlighting = ({ fileName, lines }: UseTextViewerHighlightingProps) => {
  const { isDark } = useTheme();
  const { enabled: syntaxHighlightingEnabled } = useSyntaxHighlighting();
  const [highlightedLines, setHighlightedLines] = useState<Map<number, string>>(new Map());
  const [isHighlighting, setIsHighlighting] = useState(false);

  const detectedLanguage =
    syntaxHighlightingEnabled && fileName ? getLanguageFromFileName(fileName) : 'text';
  const shouldHighlight = syntaxHighlightingEnabled && isLanguageSupported(detectedLanguage);

  // 内容变化时清空高亮缓存
  useEffect(() => {
    setHighlightedLines(new Map());
  }, [lines.length, detectedLanguage, isDark]);

  const highlightVisibleLines = useCallback(
    async (virtualItems: VirtualItem[]) => {
      if (!shouldHighlight || isHighlighting) return;

      setIsHighlighting(true);
      const lineIndexesToHighlight: number[] = [];

      // 找出需要高亮但尚未缓存的行，并跳过超长行
      virtualItems.forEach(item => {
        const lineLength = lines[item.index]?.length || 0;
        if (!highlightedLines.has(item.index) && lineLength < MAX_LINE_LENGTH) {
          lineIndexesToHighlight.push(item.index);
        }
      });

      if (lineIndexesToHighlight.length === 0) {
        setIsHighlighting(false);
        return;
      }

      try {
        const linesToHighlight = lineIndexesToHighlight.map(index => lines[index] || '');
        const results = await Promise.all(
          linesToHighlight.map(line =>
            highlightLine(line, detectedLanguage, isDark ? 'dark' : 'light')
          )
        );

        setHighlightedLines(prev => {
          const newMap = new Map(prev);
          lineIndexesToHighlight.forEach((lineIndex, i) => {
            newMap.set(lineIndex, results[i]);
          });
          return newMap;
        });
      } catch (error) {
        console.error('Error highlighting lines:', error);
      } finally {
        setIsHighlighting(false);
      }
    },
    [shouldHighlight, isHighlighting, highlightedLines, lines, detectedLanguage, isDark]
  );

  return {
    shouldHighlight,
    highlightedLines,
    isHighlighting,
    detectedLanguage,
    highlightVisibleLines,
  };
};
