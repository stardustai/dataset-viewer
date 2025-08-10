import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import mammoth from 'mammoth';
import { LoadingDisplay, ErrorDisplay } from '../common/StatusDisplay';
import { StorageServiceManager } from '../../services/storage';

interface WordViewerProps {
  filePath: string;
  fileName: string;
  fileSize: number;
  className?: string;
}

// 使用 mammoth 提取 DOCX 文档内容
const extractTextFromDocx = async (arrayBuffer: ArrayBuffer): Promise<{ html: string; text: string }> => {
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const textResult = await mammoth.extractRawText({ arrayBuffer });
    return {
      html: result.value,
      text: textResult.value
    };
  } catch (error) {
    console.error('Error extracting content from DOCX:', error);
    throw new Error('解析 Word 文档时出错。请下载文件以查看完整内容。');
  }
};

// 简单的 RTF 文本提取
const extractTextFromRtf = (content: string, t: (key: string) => string): string => {
  try {
    // 移除 RTF 控制字符和格式代码
    let text = content
      .replace(/\{\\[^}]*\}/g, '') // 移除 RTF 控制组
      .replace(/\\[a-z]+\d*\s?/gi, '') // 移除 RTF 控制词
      .replace(/\{|\}/g, '') // 移除大括号
      .replace(/\\'/g, "'") // 处理转义的单引号
      .replace(/\s+/g, ' ') // 合并多个空格
      .trim();
    
    return text || t('word.rtf.extract.failed');
  } catch (error) {
    console.error('Error extracting text from RTF:', error);
    return t('word.rtf.parse.error');
  }
};

export const WordViewer: React.FC<WordViewerProps> = ({
  filePath,
  fileName,
  className = ''
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [textContent, setTextContent] = useState<string>('');

  // 使用 useMemo 缓存文件类型判断
  const { isDocx, isDoc, isRtf } = useMemo(() => {
    const ext = fileName.toLowerCase().split('.').pop();
    return {
      isDocx: ext === 'docx',
      isDoc: ext === 'doc',
      isRtf: ext === 'rtf'
    };
  }, [fileName]);

  useEffect(() => {
    const loadDocument = async () => {
      setLoading(true);
      setError('');
      
      try {
        if (isDocx) {
          // 对于 DOCX 文件，需要获取二进制数据
          const arrayBuffer = await StorageServiceManager.getFileArrayBuffer(filePath);
          const result = await extractTextFromDocx(arrayBuffer);
          setHtmlContent(result.html);
          setTextContent(result.text);
        } else if (isRtf) {
          // 对于 RTF 文件，可以作为文本读取
          const fileContent = await StorageServiceManager.getFileContent(filePath);
          const text = extractTextFromRtf(fileContent.content, t);
          setTextContent(text);
          setHtmlContent('');
        } else if (isDoc) {
          // 对于老版本的 DOC 文件，显示不支持的消息
          setTextContent(t('word.doc.legacy.message'));
          setHtmlContent('');
        } else {
          setError(t('word.unsupported.format'));
        }
      } catch (err) {
        console.error('Error loading document:', err);
        setError(err instanceof Error ? err.message : t('word.load.failed'));
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [filePath, isDocx, isDoc, isRtf]);



  if (loading) {
    return (
      <LoadingDisplay
        message={t('loading.file', { filename: fileName })}
        className={className}
      />
    );
  }

  if (error) {
    return (
      <ErrorDisplay
        message={error}
        className={className}
      />
    );
  }

  return (
    <div className={`h-full overflow-auto bg-white dark:bg-gray-900 ${className}`}>
      {isDoc ? (
        // DOC 文件的特殊提示
        <div className="p-6 text-center">
          <div className="max-w-md mx-auto">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              {t('word.doc.legacy.title')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
              {textContent}
            </p>
          </div>
        </div>
      ) : htmlContent ? (
        // 渲染的 HTML 内容（DOCX）
        <div 
          className="prose prose-gray dark:prose-invert max-w-none p-6"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      ) : (
        // 纯文本内容（RTF 或其他）
        <div className="p-6">
          <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed font-sans">
            {textContent}
          </pre>
        </div>
      )}
    </div>
  );
};