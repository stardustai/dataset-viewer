import { Code, Eye, Move, Percent } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { useSyntaxHighlighting } from '../../../hooks/useSyntaxHighlighting';
import { getLanguageFromFileName, isLanguageSupported } from '../../../utils/syntaxHighlighter';

interface NavigationControlsProps {
  showPercentInput: boolean;
  setShowPercentInput: (show: boolean) => void;
  percentValue: string;
  setPercentValue: (value: string) => void;
  onPercentageJump: () => void;
  onPercentKeyPress: (e: React.KeyboardEvent) => void;
  isLargeFile: boolean;
  isMarkdown?: boolean;
  onMarkdownPreview?: () => void;
  fileName?: string;
}

export const NavigationControls: React.FC<NavigationControlsProps> = ({
  showPercentInput,
  setShowPercentInput,
  percentValue,
  setPercentValue,
  onPercentageJump,
  onPercentKeyPress,
  isLargeFile,
  isMarkdown,
  onMarkdownPreview,
  fileName,
}) => {
  const { t } = useTranslation();
  const { enabled: syntaxHighlightingEnabled, toggleSyntaxHighlighting } = useSyntaxHighlighting();

  // 检查是否支持语法高亮
  const detectedLanguage = getLanguageFromFileName(fileName || '');
  const canHighlight = isLanguageSupported(detectedLanguage);

  return (
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
            onChange={e => setPercentValue(e.target.value)}
            onKeyDown={onPercentKeyPress}
            placeholder="0-100"
            className="w-16 lg:w-20 px-2 lg:px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            autoFocus
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
          <button
            onClick={onPercentageJump}
            className="px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors border border-gray-300 dark:border-gray-600"
            title={t('viewer.jump')}
          >
            <Move className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      )}

      {/* Markdown preview button */}
      {isMarkdown && onMarkdownPreview && (
        <button
          onClick={onMarkdownPreview}
          className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          title={t('markdown.preview')}
        >
          <Eye className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
      )}

      {/* Syntax highlighting toggle */}
      {canHighlight && (
        <button
          onClick={() => toggleSyntaxHighlighting(!syntaxHighlightingEnabled)}
          className={`px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors border border-gray-300 dark:border-gray-600 ${
            syntaxHighlightingEnabled
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'bg-white dark:bg-gray-800'
          }`}
          title={
            syntaxHighlightingEnabled
              ? t('syntax.highlighting.disable') + ` (${detectedLanguage})`
              : t('syntax.highlighting.enable') + ` (${detectedLanguage})`
          }
        >
          <Code className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
