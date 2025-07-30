import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { dav1dDecoderService } from '../../services/dav1dDecoder';
import { ErrorDisplay } from '../common/StatusDisplay';

interface AV1VideoPlayerProps {
  videoData: Uint8Array;
  fileName?: string;
  onError?: (error: string) => void;
}

interface DecodedFrame {
  width: number;
  height: number;
  data: Uint8Array;
}

const AV1VideoPlayer: React.FC<AV1VideoPlayerProps> = ({ videoData }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isDecoderReady = useRef(false);
  const startTime = useRef<number>(0);

  // 渲染帧函数
  const renderFrame = useCallback((frame: DecodedFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置canvas尺寸
    canvas.width = 480;
    canvas.height = 270;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      // 检查是否为BMP格式数据
      if (frame.data[0] === 0x42 && frame.data[1] === 0x4D) {
        // BMP格式：创建blob并使用Image对象
        const blob = new Blob([frame.data], { type: 'image/bmp' });
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(blob);
        return;
      }

      // 其他格式：创建ImageData
      const imageData = ctx.createImageData(frame.width, frame.height);
      
      if (frame.data.length === frame.width * frame.height * 4) {
        // RGBA格式
        imageData.data.set(frame.data);
      } else if (frame.data.length === frame.width * frame.height * 3) {
        // RGB格式转RGBA
        const rgbaData = new Uint8ClampedArray(frame.width * frame.height * 4);
        for (let i = 0; i < frame.width * frame.height; i++) {
          const idx = i * 3;
          const rgbaIdx = i * 4;
          rgbaData[rgbaIdx] = frame.data[idx];     // R
          rgbaData[rgbaIdx + 1] = frame.data[idx + 1]; // G
          rgbaData[rgbaIdx + 2] = frame.data[idx + 2]; // B
          rgbaData[rgbaIdx + 3] = 255; // A
        }
        imageData.data.set(rgbaData);
      } else {
        // 灰度格式
        const rgbaData = new Uint8ClampedArray(frame.width * frame.height * 4);
        for (let i = 0; i < frame.width * frame.height; i++) {
          const y = frame.data[i] || 0;
          const rgbaIdx = i * 4;
          rgbaData[rgbaIdx] = y;
          rgbaData[rgbaIdx + 1] = y;
          rgbaData[rgbaIdx + 2] = y;
          rgbaData[rgbaIdx + 3] = 255;
        }
        imageData.data.set(rgbaData);
      }

      // 创建临时canvas并缩放绘制
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCanvas.width = frame.width;
        tempCanvas.height = frame.height;
        tempCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
      }
    } catch (error) {
      console.error(t('av1.player.error.decode'), error);
    }
  }, []);

  // 停止播放
  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playIntervalRef.current) {
      clearTimeout(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  }, []);

  // 初始化解码器
  const initializeDecoder = useCallback(async () => {
    try {
      await dav1dDecoderService.initialize();
      await dav1dDecoderService.setupDecoder(videoData);
      isDecoderReady.current = true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('av1.player.error.init');
      setError(errorMsg);
      throw error;
    }
  }, [videoData]);

  // 播放控制
  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    try {
      setError(null);
      
      // 确保解码器已初始化
      if (!isDecoderReady.current) {
        await initializeDecoder();
      }

      // 再次检查解码器是否真正准备好
      if (!isDecoderReady.current) {
        throw new Error(t('av1.player.error.init'));
      }

      // 检查是否在最后一帧，如果是则从头开始
      if (totalFrames > 0 && frameCount >= totalFrames) {
        dav1dDecoderService.resetPlayback();
        setFrameCount(0);
        startTime.current = Date.now();
      } else {
        // 从当前位置继续播放
        startTime.current = Date.now() - (frameCount / 15) * 1000; // 根据当前帧计算开始时间
      }
      
      setIsPlaying(true);

      // 播放循环
      const playLoop = async () => {
        if (playIntervalRef.current === null) {
          return;
        }
        
        if (!isDecoderReady.current || !dav1dDecoderService.isDataReady()) {
          stopPlayback();
          setError(t('av1.player.error.decode'));
          return;
        }
        
        try {
          const frame = await dav1dDecoderService.getNextFrame();
          if (frame) {
            renderFrame(frame);
            setFrameCount(prev => {
              const newCount = prev + 1;
              // 检查是否到达最后一帧
              if (totalFrames > 0 && newCount > totalFrames) {
                // 播放结束，停止播放
                stopPlayback();
                return newCount;
              }
              return newCount;
            });
            
            playIntervalRef.current = setTimeout(playLoop, 67); // ~15fps
          } else {
            // 没有更多帧，播放结束
            stopPlayback();
          }
        } catch (error) {
          stopPlayback();
          setError(t('av1.player.error.decode'));
        }
      };

      playIntervalRef.current = setTimeout(playLoop, 67);
    } catch (error) {
      setError(t('av1.player.error.decode'));
    }
  }, [isPlaying, stopPlayback, initializeDecoder, renderFrame, currentTime, videoData]);

  // 重置播放器
  const resetPlayer = useCallback(async () => {
    try {
      stopPlayback();
      setFrameCount(0);
      setCurrentTime(0);
      setError(null);
      startTime.current = 0;
      
      // 清理解码器
      isDecoderReady.current = false;
      dav1dDecoderService.cleanup();

      // 清空画布
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    } catch (error) {
      console.error(t('av1.player.error.decode'), error);
    }
  }, [stopPlayback]);

  // 进度条点击跳转
  const handleProgressClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (totalFrames === 0 || !isDecoderReady.current) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const progressPercent = clickX / rect.width;
    const targetFrame = Math.floor(progressPercent * totalFrames);
    
    // 跳转到目标帧
    dav1dDecoderService.seekToFrame(targetFrame);
    setFrameCount(targetFrame);
    
    // 如果正在播放，需要重新渲染当前帧
    if (!isPlaying) {
      // 暂停状态下，渲染跳转后的帧
      dav1dDecoderService.getNextFrame().then(frame => {
        if (frame) {
          renderFrame(frame);
        }
      }).catch(error => {
        console.error(t('av1.player.error.decode'), error);
      });
    }
  }, [totalFrames, isPlaying, renderFrame]);



  // 获取总帧数
  const getTotalFrames = useCallback(() => {
    try {
      // 确保解码器已初始化且数据已准备
      if (!isDecoderReady.current || !dav1dDecoderService.isDataReady()) {
        return 0; // 数据未准备时返回0
      }
      return dav1dDecoderService.getTotalFrames();
    } catch (error) {
      return 0;
    }
  }, []);

  // 渲染第一帧
  const renderFirstFrame = useCallback(async () => {
    try {
      // 重置状态
      isDecoderReady.current = false;
      
      // 初始化解码器
      await initializeDecoder();
      
      // 等待数据准备完成后设置总帧数
      await new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟确保数据准备完成
      const total = getTotalFrames();
      setTotalFrames(total);
      
      // 渲染第一帧
      const frame = await dav1dDecoderService.getNextFrame();
      if (frame) {
        renderFrame(frame);
        setFrameCount(1);
        
        // 自动开始循环播放
        setTimeout(async () => {
          try {
            setError(null);
            
            // 确保解码器已初始化
            if (!isDecoderReady.current) {
              throw new Error(t('av1.player.error.init'));
            }
            
            setIsPlaying(true);
            setFrameCount(1); // 保持当前帧计数，因为已经渲染了第一帧
            startTime.current = Date.now();

            // 不需要重新设置解码器，直接从当前位置继续播放

            // 播放循环
            const playLoop = async () => {
              if (playIntervalRef.current === null) {
                return;
              }
              
              // 检查解码器状态和数据准备情况
              if (!isDecoderReady.current || !dav1dDecoderService.isDataReady()) {
                setIsPlaying(false);
                setError(t('av1.player.error.decode'));
                return;
              }
              
              try {
                const frame = await dav1dDecoderService.getNextFrame();
                if (frame) {
                  renderFrame(frame);
                  setFrameCount(prev => {
                    const newCount = prev + 1;
                    // 检查是否到达最后一帧
                    if (totalFrames > 0 && newCount > totalFrames) {
                      // 播放结束，停止播放
                      setIsPlaying(false);
                      return newCount;
                    }
                    return newCount;
                  });
                  
                  playIntervalRef.current = setTimeout(playLoop, 67);
                } else {
                  // 没有更多帧，播放结束
                  setIsPlaying(false);
                }
              } catch (error) {
                setIsPlaying(false);
                setError(t('av1.player.error.decode'));
              }
            };

            playIntervalRef.current = setTimeout(playLoop, 67);
          } catch (error) {
            setError(t('av1.player.error.decode'));
          }
        }, 1000);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('av1.player.error.decode');
      setError(errorMsg);
    }
  }, [initializeDecoder, renderFrame, getTotalFrames, videoData]);

  // 组件初始化
  useEffect(() => {
    setError(null);
    setFrameCount(0);
    setCurrentTime(0);
    setTotalFrames(0);
    startTime.current = 0;
    
    // 自动渲染第一帧
    renderFirstFrame();
    
    return () => {
      if (playIntervalRef.current) {
        clearTimeout(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      dav1dDecoderService.cleanup();
    };
  }, [videoData, renderFirstFrame]);

  if (error) {
    return (
      <div className="h-full">
        <ErrorDisplay
          message={error}
          onRetry={resetPlayer}
          className="h-full"
        />
      </div>
    );
  }

  // 时间格式化函数
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 计算进度（基于当前播放的帧数和总帧数）
  const progress = totalFrames > 0 ? Math.min((frameCount / totalFrames) * 100, 100) : 0;
  const estimatedDuration = totalFrames > 0 ? totalFrames / 15 : 0;
  const currentTimeInSeconds = frameCount / 15; // 假设15fps

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 视频画布区域 */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative bg-black rounded-lg shadow-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            width={480}
            height={270}
            className="block"
            style={{ imageRendering: 'pixelated' }}
          />
          

        </div>
      </div>

      {/* 控制栏 */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
        {/* 播放控制和进度条 */}
        <div className="flex items-center gap-4">
          {/* 播放/暂停按钮 */}
          <button
            onClick={togglePlayback}
            className="flex items-center justify-center w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors shadow-lg flex-shrink-0"
            title={isPlaying ? t('av1.player.pause') : t('av1.player.play')}
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>
          
          {/* 进度条区域 */}
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>{frameCount} / {totalFrames || '?'}</span>
              <span>{formatTime(currentTimeInSeconds)} / {formatTime(estimatedDuration)}</span>
            </div>
            <div 
              className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              onClick={handleProgressClick}
            >
              <div 
                className="bg-blue-600 h-2 rounded-full pointer-events-none"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AV1VideoPlayer;