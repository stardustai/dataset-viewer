import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut, RotateCcw, GalleryHorizontal } from 'lucide-react';
import { StorageServiceManager } from '../../services/storage';
import { LoadingDisplay, ErrorDisplay, UnsupportedFormatDisplay } from '../common/StatusDisplay';
import { formatFileSize } from '../../utils/fileUtils';
import AV1VideoPlayer from './AV1VideoPlayer';
import { Dav1dDecoderService } from '../../services/dav1dDecoder';

// 将 MIME 类型映射移到组件外部，避免重复创建
const MIME_TYPES: { [key: string]: string } = {
  // Images
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'bmp': 'image/bmp',
  'ico': 'image/x-icon',
  // PDF
  'pdf': 'application/pdf',
  // Video
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'ogv': 'video/ogg',
  'avi': 'video/x-msvideo',
  'mov': 'video/quicktime',
  'wmv': 'video/x-ms-wmv',
  'flv': 'video/x-flv',
  'mkv': 'video/x-matroska',
  'm4v': 'video/mp4',
  // Audio
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'oga': 'audio/ogg',
  'aac': 'audio/aac',
  'flac': 'audio/flac'
};

const getMimeType = (filename: string): string => {
  const ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
};

// 检测是否为 AV1 视频文件
const detectAV1Video = (fileName: string, data?: Uint8Array): boolean => {
  const ext = fileName.toLowerCase();
  
  // 检查文件扩展名
  if (ext.endsWith('.ivf') || ext.endsWith('.av1')) {
    return true;
  }
  
  // 检查文件数据
  if (data && data.length >= 32) {
    // IVF 文件头: "DKIF" (0x46494B44)
    const header = new TextDecoder().decode(data.slice(0, 4));
    if (header === 'DKIF') {
      return true;
    }
    
    // 检查 MP4 文件中的 AV1 编码
    if (header === 'ftyp' || (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70)) {
      const searchLength = Math.min(data.length, 1024);
      const searchData = new TextDecoder('latin1').decode(data.slice(0, searchLength));
      
      // 检查是否包含 AV1 相关的编解码器标识
      return searchData.includes('av01') || searchData.includes('AV01');
    }
  }
  
  return false;
};

interface MediaViewerProps {
  filePath: string;
  fileName: string;
  fileType: 'image' | 'pdf' | 'video' | 'audio';
  fileSize: number;
  previewContent?: Uint8Array; // 可选的预览内容，避免重复请求
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  filePath,
  fileName,
  fileType,
  fileSize,
  previewContent
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false); // 是否显示进度条
  const [videoData, setVideoData] = useState<Uint8Array | null>(null);
  const [isAV1Video, setIsAV1Video] = useState(false);
  const [useWasmDecoder, setUseWasmDecoder] = useState(false);

  const loadMediaContent = useCallback(async () => {
    setLoading(true);
    setError('');
    setLoadingProgress(0);
    setShowProgress(false);

    // 设置一个延迟显示进度条，避免快速加载时闪烁
    const showProgressTimer = setTimeout(() => {
      setShowProgress(true);
    }, 300);

    let progressInterval: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (progressInterval) clearInterval(progressInterval);
      clearTimeout(showProgressTimer);
    };

    try {
      let response: Uint8Array;
      
      // 如果有预览内容，直接使用，避免重复请求
      if (previewContent) {
        response = previewContent;
        clearTimeout(showProgressTimer);
        setLoadingProgress(100);
      } else {
        // 模拟进度更新
        progressInterval = setInterval(() => {
          setLoadingProgress(prev => {
            if (prev >= 90) {
              if (progressInterval) clearInterval(progressInterval);
              return prev;
            }
            return prev + Math.random() * 20;
          });
        }, 200);

        const arrayBuffer = await StorageServiceManager.getFileBlob(filePath);
        response = new Uint8Array(arrayBuffer);

        cleanup();
        setLoadingProgress(100);
      }

      // 检测是否为 AV1 视频
      const isAV1 = detectAV1Video(fileName, response);
      setIsAV1Video(isAV1);
      
      if (isAV1) {
        setVideoData(response);
        const needsWasmDecoder = !Dav1dDecoderService.supportsNativeAV1();
        setUseWasmDecoder(needsWasmDecoder);
        
        if (!needsWasmDecoder) {
          const blob = new Blob([response], { type: 'video/mp4' });
          const url = URL.createObjectURL(blob);
          setMediaUrl(url);
        }
      } else {
        const blob = new Blob([response], { type: getMimeType(fileName) });
        const url = URL.createObjectURL(blob);
        setMediaUrl(url);
      }
    } catch (err) {
      console.error('Failed to load media:', err);
      setError(t('viewer.load.error'));
      setLoadingProgress(0);
      setShowProgress(false);
      cleanup();
    } finally {
      setLoading(false);
    }
  }, [filePath, fileName, previewContent]);

  const downloadFile = useCallback(async () => {
    try {
      const response = await StorageServiceManager.getFileBlob(filePath);
      const blob = new Blob([response], { type: getMimeType(fileName) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download file:', err);
    }
  }, [filePath, fileName]);

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

  const showImageControls = useMemo(() => fileType === 'image', [fileType]);

  useEffect(() => {
    loadMediaContent();
    return () => {
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
    };
  }, [mediaUrl, loadMediaContent]);

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-800">
        {showProgress && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 h-1">
            <div
              className="bg-indigo-600 h-1 transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
        )}
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800">
          <LoadingDisplay
            message={`${t('loading')} ${fileName}`}
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800">
        <ErrorDisplay message={error} />
      </div>
    );
  }

  const renderContent = () => {
    switch (fileType) {
      case 'image':
        return (
          <div className="flex justify-center items-center h-full p-4 overflow-auto">
            <img
              src={mediaUrl}
              alt={fileName}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'center'
              }}
            />
          </div>
        );

      case 'pdf':
        return (
          <div className="h-full w-full bg-gray-100 dark:bg-gray-800">
            {/* 尝试使用 iframe 显示 PDF */}
            <iframe
              src={`${mediaUrl}#toolbar=1&navpanes=1&scrollbar=1&page=1&view=FitH`}
              width="100%"
              height="100%"
              className="border-0"
              title={fileName}
              onError={() => {
                setError(t('viewer.pdf.not.supported'));
              }}
            />
            {/* 如果 iframe 失败，显示下载选项 */}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-800">
                <div className="text-center">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-red-600 dark:text-red-400 text-2xl">📄</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">{t('viewer.pdf.not.supported')}</p>
                  <button
                    onClick={downloadFile}
                    className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors whitespace-nowrap"
                  >
                    {t('viewer.download')}
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case 'video':
        // AV1 视频且需要使用 WASM 解码器
        if (isAV1Video && useWasmDecoder && videoData) {
          return (
            <AV1VideoPlayer
              videoData={videoData}
              fileName={fileName}
              onError={(error) => setError(error)}
            />
          );
        }
        
        // 普通视频或原生支持的 AV1 视频
        return (
          <div className="flex justify-center items-center h-full p-4 bg-black">
            <video
              src={mediaUrl}
              controls
              autoPlay
              preload="metadata"
              className="max-w-full max-h-full rounded-lg shadow-lg"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
              onError={(e) => {
                console.error('Video playback error:', e);
                setError(t('viewer.video.playback.error'));
              }}
              onCanPlay={(e) => {
                // 视频有足够数据可以播放时自动开始播放
                const videoElement = e.target as HTMLVideoElement;
                videoElement.play().catch((err) => {
                  console.warn('Auto-play was prevented by browser policy:', err);
                });
              }}
            >
              <p className="text-white text-center">
                {t('viewer.video.not.supported')}
                <br />
                <button
                  onClick={downloadFile}
                  className="mt-2 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors whitespace-nowrap"
                >
                  {t('viewer.download')}
                </button>
              </p>
            </video>
          </div>
        );

      case 'audio':
        return (
          <div className="flex justify-center items-center h-full p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-indigo-600 dark:text-indigo-400 text-2xl">🎵</span>
                </div>
                <h3
                  className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate max-w-xs mx-auto"
                  title={fileName}
                >
                  {fileName}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{formatFileSize(fileSize)}</p>
              </div>
              <audio
                src={mediaUrl}
                controls
                autoPlay
                className="w-full"
                onCanPlay={(e) => {
                  // 音频有足够数据可以播放时自动开始播放
                  const audioElement = e.target as HTMLAudioElement;
                  audioElement.play().catch((err) => {
                    console.warn('Auto-play was prevented by browser policy:', err);
                  });
                }}
              >
                {t('viewer.audio.not.supported')}
              </audio>
            </div>
          </div>
        );



      default:
        return (
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800">
            <UnsupportedFormatDisplay />
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-800">
      {/* Controls */}
      {showImageControls && (
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
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
};
