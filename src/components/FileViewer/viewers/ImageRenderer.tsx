import { Eye, EyeOff, GalleryHorizontal, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { FC } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFileArrayBuffer } from '../../../utils/fileDataUtils';

interface ImageRendererProps {
  mediaUrl: string;
  fileName: string;
  filePath: string;
  hasAssociatedFiles?: boolean;
}

interface YoloAnnotation {
  classId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ImageRenderer: FC<ImageRendererProps> = ({
  mediaUrl,
  fileName,
  filePath,
  hasAssociatedFiles,
}) => {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [showYolo, setShowYolo] = useState(() => {
    const saved = localStorage.getItem('imageRenderer.showYolo');
    return saved ? JSON.parse(saved) : false;
  });
  const [yoloAnnotations, setYoloAnnotations] = useState<YoloAnnotation[]>([]);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Zoom controls
  const handleZoomIn = () => setZoom(prev => Math.min(500, prev + 25));
  const handleZoomOut = () => setZoom(prev => Math.max(25, prev - 25));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const resetView = () => {
    setZoom(100);
    setRotation(0);
  };

  const toggleYolo = () => {
    const newShowYolo = !showYolo;
    setShowYolo(newShowYolo);
    localStorage.setItem('imageRenderer.showYolo', JSON.stringify(newShowYolo));
  };

  const loadYoloAnnotations = useCallback(async () => {
    // Early returns for cases where we don't need to load annotations
    if (!showYolo || hasAssociatedFiles === false) {
      setYoloAnnotations([]);
      return;
    }

    try {
      const txtPath = filePath.replace(/\.[^.]+$/, '.txt');
      const arrayBuffer = await getFileArrayBuffer(txtPath);
      const text = new TextDecoder().decode(arrayBuffer);

      const annotations = text
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5) {
            return {
              classId: parseInt(parts[0]),
              x: parseFloat(parts[1]),
              y: parseFloat(parts[2]),
              width: parseFloat(parts[3]),
              height: parseFloat(parts[4]),
            };
          }
          return null;
        })
        .filter(Boolean) as YoloAnnotation[];

      setYoloAnnotations(annotations);
    } catch (error) {
      console.warn('Failed to load YOLO annotations:', error);
      setYoloAnnotations([]);
    }
  }, [filePath, showYolo, hasAssociatedFiles]);

  // Get color for different YOLO class IDs
  const getClassColor = (classId: number) => {
    const colors = [
      { border: 'border-red-500', bg: 'bg-red-500', label: 'bg-red-500', center: 'bg-red-600' },
      { border: 'border-blue-500', bg: 'bg-blue-500', label: 'bg-blue-500', center: 'bg-blue-600' },
      {
        border: 'border-green-500',
        bg: 'bg-green-500',
        label: 'bg-green-500',
        center: 'bg-green-600',
      },
      {
        border: 'border-yellow-500',
        bg: 'bg-yellow-500',
        label: 'bg-yellow-500',
        center: 'bg-yellow-600',
      },
      {
        border: 'border-purple-500',
        bg: 'bg-purple-500',
        label: 'bg-purple-500',
        center: 'bg-purple-600',
      },
      { border: 'border-pink-500', bg: 'bg-pink-500', label: 'bg-pink-500', center: 'bg-pink-600' },
      {
        border: 'border-indigo-500',
        bg: 'bg-indigo-500',
        label: 'bg-indigo-500',
        center: 'bg-indigo-600',
      },
      {
        border: 'border-orange-500',
        bg: 'bg-orange-500',
        label: 'bg-orange-500',
        center: 'bg-orange-600',
      },
      { border: 'border-teal-500', bg: 'bg-teal-500', label: 'bg-teal-500', center: 'bg-teal-600' },
      { border: 'border-cyan-500', bg: 'bg-cyan-500', label: 'bg-cyan-500', center: 'bg-cyan-600' },
    ];
    return colors[classId % colors.length];
  };

  const handleImageLoad = () => {
    if (imageRef.current) {
      setImageSize({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight,
      });
    }
  };

  // Calculate actual image display size and position when using object-contain
  const getImageDisplaySize = () => {
    if (!containerRef.current || !imageSize.width || !imageSize.height) {
      return { width: 0, height: 0, left: 0, top: 0 };
    }

    const container = containerRef.current;
    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;
    const imageAspectRatio = imageSize.width / imageSize.height;
    const containerAspectRatio = containerWidth / containerHeight;

    if (imageAspectRatio > containerAspectRatio) {
      // Image is wider than container, fit by width
      const displayWidth = containerWidth;
      const displayHeight = containerWidth / imageAspectRatio;
      return {
        width: displayWidth,
        height: displayHeight,
        left: 0,
        top: (containerHeight - displayHeight) / 2,
      };
    } else {
      // Image is taller than container, fit by height
      const displayWidth = containerHeight * imageAspectRatio;
      const displayHeight = containerHeight;
      return {
        width: displayWidth,
        height: displayHeight,
        left: (containerWidth - displayWidth) / 2,
        top: 0,
      };
    }
  };
  useEffect(() => {
    loadYoloAnnotations();
  }, [loadYoloAnnotations]);

  return (
    <>
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleZoomOut}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={t('viewer.zoom.out')}
            >
              <ZoomOut className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>

            <span className="text-sm text-gray-600 dark:text-gray-300 min-w-[60px] text-center">
              {zoom}%
            </span>

            <button
              onClick={handleZoomIn}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={t('viewer.zoom.in')}
            >
              <ZoomIn className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>

            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2" />

            <button
              onClick={handleRotate}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={t('viewer.rotate')}
            >
              <RotateCcw className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>

            <button
              onClick={resetView}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={t('viewer.reset')}
            >
              <GalleryHorizontal className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>

            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2" />

            <button
              onClick={toggleYolo}
              className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors ${
                showYolo ? 'bg-blue-100 dark:bg-blue-900/30' : ''
              }`}
              title={showYolo ? 'Hide YOLO annotations' : 'Show YOLO annotations'}
            >
              {showYolo ? (
                <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              ) : (
                <EyeOff className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex justify-center items-center p-8 overflow-auto bg-white dark:bg-gray-900">
        <div
          ref={containerRef}
          className="relative w-full h-full transition-transform duration-200"
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: 'center',
          }}
        >
          <img
            ref={imageRef}
            src={mediaUrl}
            alt={fileName}
            className="w-full h-full object-contain"
            onLoad={handleImageLoad}
          />

          {/* YOLO Annotations */}
          {showYolo &&
            yoloAnnotations.length > 0 &&
            imageSize.width > 0 &&
            (() => {
              const imageDisplaySize = getImageDisplaySize();
              if (imageDisplaySize.width === 0) return null;

              return (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${imageDisplaySize.left}px`,
                    top: `${imageDisplaySize.top}px`,
                    width: `${imageDisplaySize.width}px`,
                    height: `${imageDisplaySize.height}px`,
                  }}
                >
                  {yoloAnnotations.map((annotation, index) => {
                    // YOLO format: x,y are center coordinates, width,height are relative to image size
                    // All values are normalized (0-1), convert to percentage for CSS
                    const centerXPercent = annotation.x * 100;
                    const centerYPercent = annotation.y * 100;
                    const widthPercent = annotation.width * 100;
                    const heightPercent = annotation.height * 100;

                    // Calculate top-left corner position from center coordinates
                    const leftPercent = centerXPercent - widthPercent / 2;
                    const topPercent = centerYPercent - heightPercent / 2;

                    // Get color scheme for this class
                    const colorScheme = getClassColor(annotation.classId);

                    return (
                      <div
                        key={index}
                        className={`absolute border-2 ${colorScheme.border} ${colorScheme.bg}/20 hover:${colorScheme.bg}/30 transition-colors`}
                        style={{
                          left: `${leftPercent}%`,
                          top: `${topPercent}%`,
                          width: `${widthPercent}%`,
                          height: `${heightPercent}%`,
                          minWidth: '2px',
                          minHeight: '2px',
                        }}
                      >
                        {/* Class label */}
                        <div
                          className={`absolute -top-7 left-0 ${colorScheme.label} text-white text-xs px-2 py-1 rounded-sm shadow-md whitespace-nowrap z-10`}
                        >
                          Class {annotation.classId}
                        </div>

                        {/* Center point indicator */}
                        <div
                          className={`absolute w-1 h-1 ${colorScheme.center} rounded-full`}
                          style={{
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })()}
        </div>
      </div>
    </>
  );
};
