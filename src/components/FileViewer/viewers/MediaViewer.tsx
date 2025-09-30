import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dav1dDecoderService } from '../../../services/dav1dDecoder';
import {
  getFileArrayBuffer,
  getFileHeader,
  getFileUrl,
  getMimeType,
} from '../../../utils/fileDataUtils';
import { formatFileSize } from '../../../utils/typeUtils';
import { ErrorDisplay, LoadingDisplay, UnsupportedFormatDisplay } from '../../common/StatusDisplay';
import { AV1VideoPlayer } from './AV1VideoPlayer';
import { ImageRenderer } from './ImageRenderer';

// AV1 视频播放器包装组件，处理按需加载
const AV1VideoPlayerWrapper: FC<{
  filePath: string;
  fileName?: string;
  onError?: (error: string) => void;
}> = ({ filePath, fileName, onError }) => {
  const { t } = useTranslation();
  const [videoData, setVideoData] = useState<Uint8Array | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载视频数据（AV1 确定需要 WASM 解码，直接获取完整数据）
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
        <ErrorDisplay message={error} onRetry={loadVideoData} className="h-full" />
      </div>
    );
  }

  if (isLoading || !videoData) {
    return <LoadingDisplay message={t('av1.player.loading')} className="h-full" />;
  }

  return <AV1VideoPlayer videoData={videoData} fileName={fileName} onError={onError} />;
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
    if (
      header === 'ftyp' ||
      (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70)
    ) {
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
  hasAssociatedFiles?: boolean;
  previewContent?: Uint8Array; // 可选的预览内容，避免重复请求
}

export const MediaViewer: FC<MediaViewerProps> = ({
  filePath,
  fileName,
  fileType,
  fileSize,
  hasAssociatedFiles,
  previewContent,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false); // 是否显示进度条
  const [progressInterval, setProgressInterval] = useState<NodeJS.Timeout | null>(null); // 进度条模拟定时器

  const [isAV1Video, setIsAV1Video] = useState(false);
  const [useWasmDecoder, setUseWasmDecoder] = useState(false);
  const [videoPlaybackFailed, setVideoPlaybackFailed] = useState(false);

  // 启动缓慢的进度模拟 (从当前进度到目标进度)
  const startSlowProgress = useCallback(
    (startProgress: number, targetProgress: number, durationMs: number = 5000) => {
      // 清除之前的定时器
      if (progressInterval) {
        clearInterval(progressInterval);
      }

      const increment = (targetProgress - startProgress) / (durationMs / 100); // 每100ms的增量
      let currentProgress = startProgress;

      const interval = setInterval(() => {
        currentProgress += increment;
        if (currentProgress >= targetProgress) {
          currentProgress = targetProgress;
          clearInterval(interval);
          setProgressInterval(null);
        }
        setLoadingProgress(Math.min(currentProgress, targetProgress));
      }, 100);

      setProgressInterval(interval);
    },
    [progressInterval]
  );

  // 清除进度定时器
  const clearProgressInterval = useCallback(() => {
    if (progressInterval) {
      clearInterval(progressInterval);
      setProgressInterval(null);
    }
  }, [progressInterval]);

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
      // 不要在cleanup中重置showProgress，因为可能还在使用
    };

    try {
      let mediaUrl: string;

      // 如果有预览内容，使用二进制数据创建 blob URL
      if (previewContent) {
        // 立即显示进度条并设置为100%
        setShowProgress(true);
        setLoadingProgress(100);
        clearTimeout(showProgressTimer);

        // 检测是否为 AV1 视频
        const isAV1 = detectAV1Video(fileName, previewContent);
        setIsAV1Video(isAV1);

        if (isAV1) {
          const needsWasmDecoder = !Dav1dDecoderService.supportsNativeAV1();
          setUseWasmDecoder(needsWasmDecoder);

          if (!needsWasmDecoder) {
            const blob = new Blob([new Uint8Array(previewContent)], { type: 'video/mp4' });
            mediaUrl = URL.createObjectURL(blob);
          } else {
            mediaUrl = '';
          }
        } else {
          const blob = new Blob([new Uint8Array(previewContent)], { type: getMimeType(fileName) });
          mediaUrl = URL.createObjectURL(blob);
        }
      } else {
        // 显示进度条并开始加载
        setShowProgress(true);
        setLoadingProgress(25);

        // 重置视频播放失败状态
        setVideoPlaybackFailed(false);

        // 对于视频文件，预先检测是否为 AV1 格式
        if (fileType === 'video') {
          try {
            // 只获取文件头部数据进行高效 AV1 检测（2KB）
            setLoadingProgress(50);
            const headerData = await getFileHeader(filePath, 2048);

            const isAV1 = detectAV1Video(fileName, headerData);
            setIsAV1Video(isAV1);

            setLoadingProgress(75);

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
          setLoadingProgress(50);
          setIsAV1Video(false);
          setUseWasmDecoder(false);
          mediaUrl = await getFileUrl(filePath);
        }

        cleanup();
        // 对于视频和音频，获取URL后只到90%，然后开始缓慢增长等待媒体可播放
        if (fileType === 'video' || fileType === 'audio') {
          setLoadingProgress(90);
          // 启动从90%到98%的缓慢进度，让用户知道还在加载
          startSlowProgress(90, 98, 8000); // 8秒内从90%缓慢到98%
        } else {
          setLoadingProgress(100);
        }
      }

      setMediaUrl(mediaUrl);
    } catch (err) {
      console.error('Failed to load media:', err);
      setError(t('viewer.load.error'));
      setLoadingProgress(0);
      setShowProgress(false);
      clearProgressInterval(); // 清理进度定时器
      cleanup();
    } finally {
      setLoading(false);
      // 对于非媒体文件，延迟隐藏进度条
      if (fileType !== 'video' && fileType !== 'audio') {
        setTimeout(() => {
          setShowProgress(false);
        }, 200);
      }
      // 视频和音频的进度条将在onCanPlay时处理
    }
  }, [filePath, fileName, previewContent, fileType, t]);

  // 处理视频播放失败的回调函数 - 优先URL播放，失败后用完整数据播放
  const handleVideoPlaybackError = useCallback(async () => {
    if (fileType === 'video' && !videoPlaybackFailed) {
      setVideoPlaybackFailed(true);

      try {
        // 先尝试检测是否为AV1视频
        let isAV1 = false;
        let needsWasmDecoder = false;

        try {
          const headerData = await getFileHeader(filePath, 2048);
          isAV1 = detectAV1Video(fileName, headerData);
        } catch (headerErr) {
          console.warn('Failed to get file header for AV1 detection:', headerErr);
        }

        if (isAV1) {
          needsWasmDecoder = !Dav1dDecoderService.supportsNativeAV1();
          setIsAV1Video(true);
          setUseWasmDecoder(needsWasmDecoder);

          if (needsWasmDecoder) {
            // AV1需要WASM解码器，会通过AV1VideoPlayerWrapper处理
            return;
          }
        }

        // 对于非AV1视频或原生支持的AV1，尝试用完整文件数据创建blob URL
        console.log('Video URL playback failed, trying with full file data...');
        const arrayBuffer = await getFileArrayBuffer(filePath);
        const videoData = new Uint8Array(arrayBuffer);

        // 清理之前的mediaUrl
        setMediaUrl(prevUrl => {
          if (prevUrl && prevUrl.startsWith('blob:')) {
            URL.revokeObjectURL(prevUrl);
          }
          return '';
        });

        // 创建新的blob URL用于播放
        const blob = new Blob([videoData], { type: getMimeType(fileName) });
        const blobUrl = URL.createObjectURL(blob);
        setMediaUrl(blobUrl);
      } catch (err) {
        console.error('Failed to handle video playback error:', err);
        setError(t('viewer.video.playback.error'));
      }
    }
  }, [fileType, videoPlaybackFailed, fileName, filePath, t]);

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

  // 组件卸载时清理进度定时器
  useEffect(() => {
    return () => {
      clearProgressInterval();
    };
  }, [clearProgressInterval]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-800">
        {/* Progress bar - 加载时显示 */}
        {showProgress && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 h-1">
            <div
              className="bg-indigo-600 h-1 transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
        )}
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800">
          <LoadingDisplay message={`${t('loading')} ${fileName}`} />
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
          </div>
        );

      case 'video':
        // AV1 视频且需要使用 WASM 解码器
        if (isAV1Video && useWasmDecoder) {
          return (
            <AV1VideoPlayerWrapper
              filePath={filePath}
              fileName={fileName}
              onError={error => setError(error)}
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
              onError={e => {
                console.error('Video playback error:', e);
                handleVideoPlaybackError();
              }}
              onCanPlay={e => {
                // 视频可以播放时，清除缓慢进度定时器，直接到达100%并隐藏
                clearProgressInterval();
                setLoadingProgress(100);
                setTimeout(() => {
                  setShowProgress(false);
                }, 300);

                // 视频有足够数据可以播放时自动开始播放
                const videoElement = e.target as HTMLVideoElement;
                videoElement.play().catch(err => {
                  console.warn('Auto-play was prevented by browser policy:', err);
                });
              }}
            >
              {t('viewer.video.not.supported')}
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
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {formatFileSize(fileSize)}
                </p>
              </div>
              <audio
                src={mediaUrl}
                controls
                autoPlay
                className="w-full"
                onCanPlay={e => {
                  // 音频可以播放时，清除缓慢进度定时器，直接到达100%并隐藏
                  clearProgressInterval();
                  setLoadingProgress(100);
                  setTimeout(() => {
                    setShowProgress(false);
                  }, 300);

                  // 音频有足够数据可以播放时自动开始播放
                  const audioElement = e.target as HTMLAudioElement;
                  audioElement.play().catch(err => {
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

  // 对于图片类型，直接返回ImageRenderer
  if (fileType === 'image') {
    return (
      <ImageRenderer
        mediaUrl={mediaUrl}
        fileName={fileName}
        filePath={filePath}
        hasAssociatedFiles={hasAssociatedFiles}
      />
    );
  }

  // 对于其他类型，使用原有的布局
  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-gray-50 dark:bg-gray-800">
      {/* Progress bar - 显示进度时就显示 */}
      {showProgress && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 h-1">
          <div
            className="bg-indigo-600 h-1 transition-all duration-300"
            style={{ width: `${loadingProgress}%` }}
          />
        </div>
      )}
      {/* Content */}
      {renderContent()}
    </div>
  );
};
