import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';
import { StorageServiceManager } from '../../services/storage';
import { LoadingDisplay, ErrorDisplay, UnsupportedFormatDisplay } from '../common/StatusDisplay';

interface MediaViewerProps {
  filePath: string;
  fileName: string;
  fileType: 'image' | 'pdf' | 'video' | 'audio';
  fileSize: number;
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  filePath,
  fileName,
  fileType,
  fileSize
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false); // 是否显示进度条

  useEffect(() => {
    loadMediaContent();
    return () => {
      // Cleanup blob URL when component unmounts
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
    };
  }, [filePath]);

  const loadMediaContent = async () => {
    setLoading(true);
    setError('');
    setLoadingProgress(0);
    setShowProgress(false);

    // 设置一个延迟显示进度条，避免快速加载时闪烁
    const showProgressTimer = setTimeout(() => {
      setShowProgress(true);
    }, 300); // 300ms后才显示进度条

    let progressInterval: NodeJS.Timeout | null = null;

    try {
      // 模拟进度更新，因为 Tauri 的 HTTP 请求目前不支持实时进度
      progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 90) {
            if (progressInterval) clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 20;
        });
      }, 200);

      // Get file content as blob
      const response = await StorageServiceManager.getFileBlob(filePath);

      // 完成下载，设置进度为100%
      if (progressInterval) clearInterval(progressInterval);
      clearTimeout(showProgressTimer); // 清除进度条显示定时器
      setLoadingProgress(100);

      // 处理媒体文件
      const blob = new Blob([response], { type: getMimeType(fileName) });
      const url = URL.createObjectURL(blob);
      setMediaUrl(url);
    } catch (err) {
      console.error('Failed to load media:', err);
      setError(t('viewer.load.error'));
      setLoadingProgress(0);
      setShowProgress(false);
      // 清理定时器
      if (progressInterval) clearInterval(progressInterval);
      clearTimeout(showProgressTimer);
    } finally {
      setLoading(false);
    }
  };

  const getMimeType = (filename: string): string => {
    const ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
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
    return mimeTypes[ext] || 'application/octet-stream';
  };

  const downloadFile = async () => {
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
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(500, prev + 25));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(25, prev - 25));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const resetView = () => {
    setZoom(100);
    setRotation(0);
  };



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

  const showImageControls = fileType === 'image';

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
                <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
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
