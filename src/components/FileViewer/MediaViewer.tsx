import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut, RotateCcw, GalleryHorizontal } from 'lucide-react';
import { StorageServiceManager } from '../../services/storage';
import { LoadingDisplay, ErrorDisplay, UnsupportedFormatDisplay } from '../common/StatusDisplay';
import { formatFileSize } from '../../utils/fileUtils';
import { getFileUrl, getFileArrayBuffer, getFileHeader, getMimeType } from '../../utils/fileDataUtils';
import AV1VideoPlayer from './AV1VideoPlayer';
import { Dav1dDecoderService } from '../../services/dav1dDecoder';



// AV1 视频播放器包装组件，处理按需加载
const AV1VideoPlayerWrapper: React.FC<{
  filePath: string;
  fileName?: string;
  onError?: (error: string) => void;
}> = ({ filePath, fileName, onError }) => {
  const { t } = useTranslation();
  const [videoData, setVideoData] = useState<Uint8Array | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载视频数据
  const loadVideoData = useCallback(async () => {
    if (videoData || isLoading) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const arrayBuffer = await getFileArrayBuffer(filePath);
      const data = new Uint8Array(arrayBuffer);
      setVideoData(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t('av1.player.error.load');
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [filePath, videoData, isLoading, t, onError]);

  // 组件挂载时开始加载
  useEffect(() => {
    loadVideoData();
  }, [loadVideoData]);

  if (error) {
    return (
      <div className="h-full">
        <ErrorDisplay
          message={error}
          onRetry={loadVideoData}
          className="h-full"
        />
      </div>
    );
  }

  if (isLoading || !videoData) {
    return (
      <LoadingDisplay
        message={t('av1.player.loading')}
        className="h-full"
      />
    );
  }

  return (
    <AV1VideoPlayer
      videoData={videoData}
      fileName={fileName}
      onError={onError}
    />
  );
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

  const [isAV1Video, setIsAV1Video] = useState(false);
  const [useWasmDecoder, setUseWasmDecoder] = useState(false);
  const [videoPlaybackFailed, setVideoPlaybackFailed] = useState(false);

  const loadMediaContent = useCallback(async () => {
    setLoading(true);
    setError('');
    setLoadingProgress(0);
    setShowProgress(false);

    // 清理之前的 mediaUrl
    setMediaUrl(prevUrl => {
      if (prevUrl && prevUrl.startsWith('blob:')) {
        URL.revokeObjectURL(prevUrl);
      }
      return '';
    });

    // 设置一个延迟显示进度条，避免快速加载时闪烁
    const showProgressTimer = setTimeout(() => {
      setShowProgress(true);
    }, 300);

    const cleanup = () => {
      clearTimeout(showProgressTimer);
    };

    try {
      let mediaUrl: string;
      
      // 如果有预览内容，使用二进制数据创建 blob URL
      if (previewContent) {
        clearTimeout(showProgressTimer);
        setLoadingProgress(100);
        
        // 检测是否为 AV1 视频
        const isAV1 = detectAV1Video(fileName, previewContent);
        setIsAV1Video(isAV1);
        
        if (isAV1) {
          const needsWasmDecoder = !Dav1dDecoderService.supportsNativeAV1();
          setUseWasmDecoder(needsWasmDecoder);
          
          if (!needsWasmDecoder) {
            const blob = new Blob([previewContent], { type: 'video/mp4' });
            mediaUrl = URL.createObjectURL(blob);
          } else {
            mediaUrl = '';
          }
        } else {
          const blob = new Blob([previewContent], { type: getMimeType(fileName) });
          mediaUrl = URL.createObjectURL(blob);
        }
      } else {
        // 重置视频播放失败状态
        setVideoPlaybackFailed(false);
        
        // 对于视频文件，预先检测是否为 AV1 格式
         if (fileType === 'video') {
           try {
             // 只获取文件头部数据进行高效 AV1 检测（2KB）
             const headerData = await getFileHeader(filePath, 2048);
             
             const isAV1 = detectAV1Video(fileName, headerData);
             setIsAV1Video(isAV1);
             
             if (isAV1) {
               const needsWasmDecoder = !Dav1dDecoderService.supportsNativeAV1();
               setUseWasmDecoder(needsWasmDecoder);
               
               if (needsWasmDecoder) {
                  // 对于需要 WASM 解码器的 AV1 视频，不需要 mediaUrl
                  mediaUrl = '';
                } else {
                  // 对于原生支持的 AV1 视频，使用普通的文件 URL
                  mediaUrl = await getFileUrl(filePath);
                }
              } else {
                // 不是 AV1 视频，使用普通的文件 URL
                setUseWasmDecoder(false);
                mediaUrl = await getFileUrl(filePath);
              }
           } catch (err) {
             console.warn('Failed to pre-detect AV1 video, falling back to normal loading:', err);
             // 检测失败时回退到普通加载方式
              setIsAV1Video(false);
              setUseWasmDecoder(false);
              mediaUrl = await getFileUrl(filePath);
           }
        } else {
          // 非视频文件，使用普通的文件 URL
          setIsAV1Video(false);
          setUseWasmDecoder(false);
          mediaUrl = await getFileUrl(filePath);
        }
        
        cleanup();
        setLoadingProgress(100);
      }
      
      setMediaUrl(mediaUrl);
    } catch (err) {
      console.error('Failed to load media:', err);
      setError(t('viewer.load.error'));
      setLoadingProgress(0);
      setShowProgress(false);
      cleanup();
    } finally {
      setLoading(false);
    }
  }, [filePath, fileName, previewContent, t]);

  // 处理视频播放失败的回调函数
  const handleVideoPlaybackError = useCallback(async () => {
    if (fileType === 'video' && !videoPlaybackFailed) {
      setVideoPlaybackFailed(true);
      
      try {
        // 获取视频数据用于检测 AV1 编码
        const arrayBuffer = await getFileArrayBuffer(filePath);
        const videoData = new Uint8Array(arrayBuffer);
        
        // 检测是否为 AV1 视频
        const isAV1 = detectAV1Video(fileName, videoData);
        setIsAV1Video(isAV1);
        
        if (isAV1) {
          const needsWasmDecoder = !Dav1dDecoderService.supportsNativeAV1();
          setUseWasmDecoder(needsWasmDecoder);
        } else {
          // 不是 AV1 视频，显示通用错误
          setError(t('viewer.video.playback.error'));
        }
      } catch (err) {
        console.error('Failed to handle video playback error:', err);
        setError(t('viewer.video.playback.error'));
      }
    }
  }, [fileType, videoPlaybackFailed, fileName, filePath, t]);

  const downloadFile = useCallback(async () => {
    try {
      const downloadUrl = await StorageServiceManager.getDownloadUrl(filePath);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
  }, [loadMediaContent]);

  // 单独处理 mediaUrl 的清理
  useEffect(() => {
    return () => {
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
    };
  }, [mediaUrl]);

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
        if (isAV1Video && useWasmDecoder) {
          return (
            <AV1VideoPlayerWrapper
              filePath={filePath}
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
                handleVideoPlaybackError();
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
