import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut, RotateCcw, GalleryHorizontal, Eye, EyeOff } from 'lucide-react';
import { getFileArrayBuffer } from '../../utils/fileDataUtils';

interface ImageRendererProps {
  mediaUrl: string;
  fileName: string;
  filePath: string;
}

interface YoloAnnotation {
  classId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ImageRenderer: React.FC<ImageRendererProps> = ({
  mediaUrl,
  fileName,
  filePath
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

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(500, prev + 25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(25, prev - 25));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const resetView = useCallback(() => {
    setZoom(100);
    setRotation(0);
  }, []);

  const toggleYolo = useCallback(() => {
    const newShowYolo = !showYolo;
    setShowYolo(newShowYolo);
    localStorage.setItem('imageRenderer.showYolo', JSON.stringify(newShowYolo));
  }, [showYolo]);

  const loadYoloAnnotations = useCallback(async () => {
    if (!showYolo) {
      setYoloAnnotations([]);
      return;
    }

    try {
      // 获取同名txt文件路径
      const txtPath = filePath.replace(/\.[^.]+$/, '.txt');
      const arrayBuffer = await getFileArrayBuffer(txtPath);
      const text = new TextDecoder().decode(arrayBuffer);
      
      const annotations: YoloAnnotation[] = [];
      const lines = text.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          annotations.push({
            classId: parseInt(parts[0]),
            x: parseFloat(parts[1]),
            y: parseFloat(parts[2]),
            width: parseFloat(parts[3]),
            height: parseFloat(parts[4])
          });
        }
      }
      
      setYoloAnnotations(annotations);
    } catch (error) {
      console.warn('Failed to load YOLO annotations:', error);
      setYoloAnnotations([]);
    }
  }, [filePath, showYolo]);

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setImageSize({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight
      });
    }
  }, []);

  useEffect(() => {
    loadYoloAnnotations();
  }, [loadYoloAnnotations]);

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-800">
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
          className="relative transition-transform duration-200"
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: 'center'
          }}
        >
          <img
            ref={imageRef}
            src={mediaUrl}
            alt={fileName}
            className="max-w-[calc(100vw-64px)] max-h-[calc(100vh-200px)] object-contain block"
            onLoad={handleImageLoad}
          />
            
          {/* YOLO Annotations */}
          {showYolo && yoloAnnotations.length > 0 && imageSize.width > 0 && (
            <div className="absolute inset-0 pointer-events-none">
              {yoloAnnotations.map((annotation, index) => {
                // Convert YOLO format (center x, center y, width, height) to pixel coordinates
                const imgElement = imageRef.current;
                if (!imgElement) return null;
                
                const displayWidth = imgElement.offsetWidth;
                const displayHeight = imgElement.offsetHeight;
                
                const centerX = annotation.x * displayWidth;
                const centerY = annotation.y * displayHeight;
                const boxWidth = annotation.width * displayWidth;
                const boxHeight = annotation.height * displayHeight;
                
                const left = centerX - boxWidth / 2;
                const top = centerY - boxHeight / 2;
                
                return (
                  <div
                    key={index}
                    className="absolute border-2 border-red-500 bg-red-500/10"
                    style={{
                      left: `${left}px`,
                      top: `${top}px`,
                      width: `${boxWidth}px`,
                      height: `${boxHeight}px`
                    }}
                  >
                    <div className="absolute -top-6 left-0 bg-red-500 text-white text-xs px-1 py-0.5 rounded">
                      {annotation.classId}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};