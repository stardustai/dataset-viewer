import DOMPurify from 'dompurify';
import { AlertCircle, Presentation } from 'lucide-react';
import { parse } from 'pptxtojson';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StorageServiceManager } from '../../../services/storage';
import { ErrorDisplay, LoadingDisplay } from '../../common/StatusDisplay';

interface PresentationMetadata {
  slideCount: number;
  size: { width: number; height: number };
  fileSize: number;
}

interface PresentationViewerProps {
  filePath: string;
  fileName: string;
  fileSize: number;
  className?: string;
  onMetadataLoaded?: (metadata: PresentationMetadata) => void;
}

// 使用 pptxtojson 库的类型定义
type PptxToJsonData = Awaited<ReturnType<typeof parse>>;
type PresentationData = PptxToJsonData;
type Slide = PresentationData['slides'][0];

// 填充类型定义
interface FillColor {
  type: 'color';
  value: string;
}

interface FillImage {
  type: 'image';
  value?: {
    picBase64?: string;
  };
}

type Fill = FillColor | FillImage;

// 表格边框类型
interface TableBorders {
  top?: { width?: number; color?: string };
  bottom?: { width?: number; color?: string };
  left?: { width?: number; color?: string };
  right?: { width?: number; color?: string };
}

// 表格单元格对象类型
interface TableCellObject {
  text?: string;
  content?: string;
  fillColor?: string;
  merged?: boolean;
  isMerged?: boolean;
  skip?: boolean;
  hidden?: boolean;
  rowspan?: number;
  rowSpan?: number;
  rows?: number;
  mergeDown?: number;
  colspan?: number;
  colSpan?: number;
  cols?: number;
  mergeRight?: number;
}

// 表格单元格类型
type TableCell = string | number | boolean | null | undefined | TableCellObject;

// 辅助类型用于渲染
interface RenderableElement {
  type: string;
  left: number;
  top: number;
  width: number;
  height: number;
  content?: string;
  src?: string;
  fill?: Fill;
  borderColor?: string;
  borderWidth?: number;
  rotate?: number;
  name?: string;
  shapType?: string;
  // 表格特有属性
  data?: TableCell[][];
  borders?: TableBorders;
  rowHeights?: number[];
  colWidths?: number[];
}

// 渲染单个幻灯片元素
const renderSlideElement = (
  element: RenderableElement,
  key: string,
  t: (key: string) => string
) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${element.left}pt`,
    top: `${element.top}pt`,
    width: `${element.width}pt`,
    height: `${element.height}pt`,
    transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
  };

  // 添加边框样式
  if (element.borderColor && element.borderWidth) {
    style.border = `${element.borderWidth}px solid ${element.borderColor}`;
  }

  // 添加背景填充
  if (element.fill) {
    if (element.fill.type === 'color') {
      style.backgroundColor = element.fill.value;
    } else if (element.fill.type === 'image' && element.fill.value?.picBase64) {
      style.backgroundImage = `url(${element.fill.value.picBase64})`;
      style.backgroundSize = 'cover';
      style.backgroundPosition = 'center';
    }
  }

  switch (element.type) {
    case 'text':
      return (
        <div
          key={key}
          style={style}
          className="overflow-visible text-black [&_*]:text-black"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(element.content || '') }}
        />
      );

    case 'image':
      return (
        <img
          key={key}
          src={element.src}
          alt={element.name || 'Slide image'}
          style={style}
          className="object-contain"
        />
      );

    case 'shape':
      return (
        <div key={key} style={style} className="flex items-center justify-center overflow-visible">
          {element.content && (
            <div
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(element.content) }}
              className="text-center text-black [&_*]:text-black"
            />
          )}
        </div>
      );

    case 'table':
      // 如果有content属性，使用HTML渲染
      if (element.content) {
        // 尝试解码HTML实体
        const decodeHtml = (html: string) => {
          const txt = document.createElement('textarea');
          txt.innerHTML = html;
          return txt.value;
        };

        const decodedContent = decodeHtml(element.content);

        return (
          <div key={key} style={style} className="overflow-visible">
            <div
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(decodedContent) }}
              className="w-full [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_th]:bg-gray-100 [&_th]:text-sm [&_td]:text-sm [&_*]:text-black"
            />
          </div>
        );
      }

      // 如果有data属性，使用表格数据渲染
      if (element.data && Array.isArray(element.data)) {
        return (
          <div key={key} style={style} className="overflow-visible">
            <table className="w-full border-collapse border border-gray-200">
              <tbody>
                {element.data.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row
                      .map((cell, cellIndex) => {
                        // 检查各种可能的合并标识
                        if (
                          cell &&
                          typeof cell === 'object' &&
                          (cell.merged || cell.isMerged || cell.skip || cell.hidden)
                        ) {
                          return null;
                        }

                        const cellContent = cell
                          ? typeof cell === 'object'
                            ? cell.text || cell.content || ''
                            : String(cell)
                          : '';
                        const cellStyle: React.CSSProperties = {
                          height: element.rowHeights?.[rowIndex]
                            ? `${element.rowHeights[rowIndex]}pt`
                            : 'auto',
                          width: element.colWidths?.[cellIndex]
                            ? `${element.colWidths[cellIndex]}pt`
                            : 'auto',
                          backgroundColor:
                            (cell && typeof cell === 'object' ? cell.fillColor : null) ||
                            'transparent',
                        };

                        // 获取合并属性 - 尝试多种可能的属性名
                        const rowSpan =
                          cell && typeof cell === 'object'
                            ? cell.rowspan || cell.rowSpan || cell.rows || cell.mergeDown || 1
                            : 1;
                        const colSpan =
                          cell && typeof cell === 'object'
                            ? cell.colspan || cell.colSpan || cell.cols || cell.mergeRight || 1
                            : 1;

                        return (
                          <td
                            key={cellIndex}
                            className="border border-gray-200 p-2 text-sm text-black [&_*]:text-black"
                            style={cellStyle}
                            rowSpan={rowSpan}
                            colSpan={colSpan}
                          >
                            <div
                              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(cellContent) }}
                            />
                          </td>
                        );
                      })
                      .filter(Boolean)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      // 如果没有数据，显示占位符
      return (
        <div
          key={key}
          style={style}
          className="overflow-visible border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500"
        >
          {t('presentation.table.no.data')}
        </div>
      );

    default:
      return (
        <div
          key={key}
          style={style}
          className="border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500"
        >
          {element.type}
        </div>
      );
  }
};

// 渲染单个幻灯片
const SlideRenderer: React.FC<{
  slide: Slide;
  slideSize: { width: number; height: number };
  t: (key: string) => string;
}> = ({ slide, slideSize, t }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5); // 设置一个合理的初始缩放值，避免初始渲染时的突然变化

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;

      const container = containerRef.current.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const availableWidth = containerRect.width - 64; // 减去 padding
      const availableHeight = containerRect.height - 120; // 垂直方向留更多间距

      // 计算缩放比例，确保幻灯片完全适应容器
      const scaleX = availableWidth / slideSize.width;
      const scaleY = availableHeight / slideSize.height;
      const newScale = Math.min(scaleX, scaleY, 1); // 最大不超过原始大小

      setScale(newScale);
    };

    // 使用 setTimeout 确保 DOM 完全渲染后再计算缩放
    const timer = setTimeout(updateScale, 0);
    window.addEventListener('resize', updateScale);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateScale);
    };
  }, [slideSize]);

  // 处理幻灯片背景
  let backgroundColor = '#ffffff';
  let backgroundImage = '';

  if (slide.fill) {
    if (slide.fill.type === 'color') {
      backgroundColor = slide.fill.value as string;
    } else if (slide.fill.type === 'image' && slide.fill.value?.picBase64) {
      backgroundImage = `url(${slide.fill.value.picBase64})`;
    }
  }

  const slideStyle: React.CSSProperties = {
    position: 'relative',
    width: `${slideSize.width}pt`,
    height: `${slideSize.height}pt`,
    backgroundColor,
    backgroundImage,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    transform: `scale(${scale})`,
    transformOrigin: 'center center',
    opacity: scale === 0.5 ? 0 : 1, // 初始状态时隐藏，避免闪烁
    transition: 'opacity 0.1s ease-in-out', // 添加透明度过渡
  };

  return (
    <div ref={containerRef} style={slideStyle} className="mx-auto">
      {/* 渲染布局元素 */}
      {slide.layoutElements?.map((element, index) =>
        renderSlideElement(element as RenderableElement, `layout-${index}`, t)
      )}

      {/* 渲染幻灯片元素 */}
      {slide.elements.map((element, index) =>
        renderSlideElement(element as RenderableElement, `element-${index}`, t)
      )}
    </div>
  );
};

export const PresentationViewer: React.FC<PresentationViewerProps> = ({
  filePath,
  fileName,
  fileSize,
  className = '',
  onMetadataLoaded,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [presentationData, setPresentationData] = useState<PresentationData | null>(null);

  useEffect(() => {
    const loadPresentation = async () => {
      try {
        setLoading(true);
        setError('');

        // 获取文件内容
        const arrayBuffer = await StorageServiceManager.getFileArrayBuffer(filePath);

        // 使用 pptxtojson 解析 PPTX 文件
        const data = await parse(arrayBuffer);
        setPresentationData(data);

        // 通知父组件 metadata 已加载
        if (onMetadataLoaded && data) {
          onMetadataLoaded({
            slideCount: data.slides.length,
            size: data.size,
            fileSize,
          });
        }
      } catch (err) {
        console.error('Error loading presentation:', err);
        setError(err instanceof Error ? err.message : t('presentation.load.error'));
      } finally {
        setLoading(false);
      }
    };

    loadPresentation();
  }, [filePath, t]);

  if (loading) {
    return (
      <LoadingDisplay
        message={t('loading.presentation', { filename: fileName })}
        className={className}
      />
    );
  }

  if (error) {
    return <ErrorDisplay message={error} className={className} />;
  }

  if (!presentationData || presentationData.slides.length === 0) {
    return (
      <div
        className={`flex flex-col flex-1 overflow-hidden bg-white dark:bg-gray-900 ${className}`}
      >
        <div className="flex items-center justify-center p-8 h-full">
          <div className="text-center max-w-md">
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <Presentation className="w-10 h-10 text-gray-600 dark:text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {t('presentation.preview.title')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t('presentation.preview.description')}
            </p>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-left">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                    {t('presentation.preview.limitation.title')}
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {t('presentation.preview.limitation.description')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col flex-1 overflow-hidden bg-white dark:bg-gray-900 ${className}`}>
      {/* 主要内容区域 - 所有幻灯片平铺显示 */}
      <div className="flex-1 overflow-auto p-8 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-6xl mx-auto space-y-16">
          {presentationData.slides.map((slide, index) => (
            <div key={index} className="">
              {/* 幻灯片内容 */}
              <div className="flex justify-center mb-4">
                <SlideRenderer slide={slide} slideSize={presentationData.size} t={t} />
              </div>

              {/* 页码 */}
              <div className="text-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">{index + 1}</span>
              </div>

              {/* 幻灯片备注 */}
              {slide.note && (
                <div className="mt-6 max-w-4xl mx-auto">
                  <h3 className="text-md font-medium text-gray-900 dark:text-white mb-2">
                    {t('presentation.speaker.notes')}
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-gray-700 dark:text-gray-300 text-sm">{slide.note}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PresentationViewer;
