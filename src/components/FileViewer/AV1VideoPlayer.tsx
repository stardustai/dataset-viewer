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
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 480, height: 270 });
  
  // 使用ref管理播放状态，避免state依赖问题
  const playStateRef = useRef({
    frameCount: 0,
    totalFrames: 0,
    isPlaying: false,
    frameRate: 15,
    currentTime: 0
  });
  
  // 用于触发UI更新的状态
  const [uiUpdateTrigger, setUiUpdateTrigger] = useState(0);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoPlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDecoderReady = useRef(false);
  const startTime = useRef<number>(0);
  const offscreenCanvasRef = useRef<OffscreenCanvas | null>(null); // 复用的离屏画布

  // 触发UI更新的辅助函数
  const triggerUIUpdate = useCallback(() => {
    setUiUpdateTrigger(prev => prev + 1);
  }, []);

  // 计算保持宽高比的画布尺寸
  const calculateCanvasSize = useCallback((videoWidth: number, videoHeight: number) => {
    // 获取容器的实际尺寸
    let maxWidth = 800;
    let maxHeight = 600;
    
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const containerStyle = window.getComputedStyle(containerRef.current);
      const paddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
      const paddingY = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);
      
      // 使用实际的容器尺寸减去padding
      maxWidth = Math.max(200, containerRect.width - paddingX - 16); // 额外减去一些边距
      maxHeight = Math.max(150, containerRect.height - paddingY - 16);
    }
    
    const aspectRatio = videoWidth / videoHeight;
    
    let canvasWidth = videoWidth;
    let canvasHeight = videoHeight;
    
    // 如果视频尺寸超过最大限制，按比例缩放
    if (canvasWidth > maxWidth) {
      canvasWidth = maxWidth;
      canvasHeight = canvasWidth / aspectRatio;
    }
    
    if (canvasHeight > maxHeight) {
      canvasHeight = maxHeight;
      canvasWidth = canvasHeight * aspectRatio;
    }
    
    return {
      width: Math.round(canvasWidth),
      height: Math.round(canvasHeight)
    };
  }, []);

  // 渲染帧函数
  const renderFrame = useCallback((frame: DecodedFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 如果是第一帧，设置视频尺寸并计算画布大小
    if (!videoDimensions || videoDimensions.width !== frame.width || videoDimensions.height !== frame.height) {
      const newDimensions = { width: frame.width, height: frame.height };
      setVideoDimensions(newDimensions);
      const newCanvasSize = calculateCanvasSize(frame.width, frame.height);
      setCanvasSize(newCanvasSize);
      
      // 更新canvas实际尺寸
      canvas.width = newCanvasSize.width;
      canvas.height = newCanvasSize.height;
    }

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

      // 使用复用的OffscreenCanvas进行缩放绘制
      if (!offscreenCanvasRef.current || 
          offscreenCanvasRef.current.width !== frame.width || 
          offscreenCanvasRef.current.height !== frame.height) {
        offscreenCanvasRef.current = new OffscreenCanvas(frame.width, frame.height);
      }
      
      const offscreenCtx = offscreenCanvasRef.current.getContext('2d');
      if (offscreenCtx) {
        offscreenCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(offscreenCanvasRef.current, 0, 0, canvas.width, canvas.height);
      }
    } catch (error) {
      console.error(t('av1.player.error.decode'), error);
    }
  }, [videoDimensions, canvasSize, calculateCanvasSize]);

  // 停止播放
  const stopPlayback = useCallback(() => {
    playStateRef.current.isPlaying = false;
    if (playIntervalRef.current) {
      clearTimeout(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    triggerUIUpdate();
  }, [triggerUIUpdate]);

  // 初始化解码器
  const initializeDecoder = useCallback(async () => {
    try {
      await dav1dDecoderService.initialize();
      await dav1dDecoderService.setupDecoder(videoData);
      
      // 获取实际帧率
      const actualFrameRate = dav1dDecoderService.getFrameRate();
      if (actualFrameRate > 0) {
        playStateRef.current.frameRate = actualFrameRate;
      }
      
      isDecoderReady.current = true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('av1.player.error.init');
      setError(errorMsg);
      throw error;
    }
  }, [videoData]);

  // 播放控制
  const togglePlayback = useCallback(async () => {
    if (playStateRef.current.isPlaying) {
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
      if (playStateRef.current.totalFrames > 0 && playStateRef.current.frameCount >= playStateRef.current.totalFrames) {
        dav1dDecoderService.resetPlayback();
        playStateRef.current.frameCount = 0;
        startTime.current = Date.now();
      } else {
        // 从当前位置继续播放
        startTime.current = Date.now() - (playStateRef.current.frameCount / playStateRef.current.frameRate) * 1000;
      }
      
      playStateRef.current.isPlaying = true;
      triggerUIUpdate();

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
            playStateRef.current.frameCount += 1;
            
            // 检查是否到达最后一帧
            if (playStateRef.current.totalFrames > 0 && playStateRef.current.frameCount >= playStateRef.current.totalFrames) {
              // 播放结束，停止播放
              stopPlayback();
              return;
            }
            
            triggerUIUpdate();
            const frameInterval = 1000 / playStateRef.current.frameRate;
            playIntervalRef.current = setTimeout(playLoop, frameInterval);
          } else {
            // 没有更多帧，播放结束
            stopPlayback();
          }
        } catch (error) {
          stopPlayback();
          setError(t('av1.player.error.decode'));
        }
      };

      const frameInterval = 1000 / playStateRef.current.frameRate;
      playIntervalRef.current = setTimeout(playLoop, frameInterval);
    } catch (error) {
      setError(t('av1.player.error.decode'));
    }
  }, [stopPlayback, initializeDecoder, renderFrame, triggerUIUpdate]);

  // 重置播放器
  const resetPlayer = useCallback(async () => {
    try {
      stopPlayback();
      playStateRef.current.frameCount = 0;
      playStateRef.current.currentTime = 0;
      playStateRef.current.totalFrames = 0;
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
      
      triggerUIUpdate();
    } catch (error) {
      console.error(t('av1.player.error.decode'), error);
    }
  }, [stopPlayback, triggerUIUpdate]);

  // 进度条点击跳转
  const handleProgressClick = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDecoderReady.current) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const progressWidth = rect.width;
    const clickRatio = clickX / progressWidth;
    
    try {
      const totalFrames = dav1dDecoderService.getTotalFrames();
      if (totalFrames > 0) {
        const targetFrame = Math.floor(clickRatio * totalFrames);
        await dav1dDecoderService.seekToFrame(targetFrame);
        playStateRef.current.frameCount = targetFrame;
        
        // 如果正在播放，更新开始时间
        if (playStateRef.current.isPlaying) {
          startTime.current = Date.now() - (targetFrame / playStateRef.current.frameRate) * 1000;
        }
        
        triggerUIUpdate();
      }
    } catch (error) {
      setError(t('av1.player.error.seek'));
    }
  }, [triggerUIUpdate]);

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
      playStateRef.current.totalFrames = total;
      
      // 渲染第一帧
      const frame = await dav1dDecoderService.getNextFrame();
      if (frame) {
        renderFrame(frame);
        playStateRef.current.frameCount = 1;
        playStateRef.current.currentTime = 1 / playStateRef.current.frameRate;
        triggerUIUpdate();

        autoPlayTimeoutRef.current = setTimeout(() => togglePlayback(), 200)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('av1.player.error.decode');
      setError(errorMsg);
    }
  }, [initializeDecoder, renderFrame, getTotalFrames, triggerUIUpdate, togglePlayback]);

  // 组件初始化
  useEffect(() => {
    setError(null);
    playStateRef.current.frameCount = 0;
    playStateRef.current.currentTime = 0;
    playStateRef.current.totalFrames = 0;
    startTime.current = 0;
    
    // 自动渲染第一帧
    renderFirstFrame();
    
    return () => {
      if (playIntervalRef.current) {
        clearTimeout(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      if (autoPlayTimeoutRef.current) {
        clearTimeout(autoPlayTimeoutRef.current);
        autoPlayTimeoutRef.current = null;
      }
      dav1dDecoderService.cleanup();
    };
  }, [videoData]);
  
  // 触发UI更新的依赖
  useEffect(() => {}, [uiUpdateTrigger]);

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
  // 使用uiUpdateTrigger确保UI响应playStateRef变化
  const { frameCount, totalFrames, frameRate, isPlaying } = playStateRef.current;
  const progress = totalFrames > 0 ? Math.min((frameCount / totalFrames) * 100, 100) : 0;
  const estimatedDuration = totalFrames > 0 ? totalFrames / frameRate : 0;
  const currentTimeInSeconds = frameCount / frameRate; // 使用实际帧率

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 视频画布区域 */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center p-4">
        <div className="relative bg-black rounded-lg shadow-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
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