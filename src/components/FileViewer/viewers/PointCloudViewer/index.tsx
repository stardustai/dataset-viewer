import type { FC } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStorageStore } from '../../../../stores/storageStore';
import { ErrorDisplay } from '../../../common/StatusDisplay';
import { PointCloudRenderer } from './PointCloudRenderer';
import { PointCloudToolbar } from './PointCloudToolbar';
import type { ColorMode, PointCloudStats, LoadingProgress } from './types';

interface PointCloudViewerProps {
  filePath: string;
  onMetadataLoaded?: (metadata: any) => void;
  previewContent?: Uint8Array;
}

export const PointCloudViewer: FC<PointCloudViewerProps> = ({
  filePath,
  onMetadataLoaded,
  previewContent,
}) => {
  const { t } = useTranslation();
  const { downloadFile } = useStorageStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PointCloudRenderer | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PointCloudStats | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>('height');
  const [pointSize, setPointSize] = useState(0.1);

  // 加载点云文件
  const loadPointCloud = useCallback(async () => {
    if (!containerRef.current) {
      return;
    }

    try {
      setError(null);

      // 开始显示加载进度（不确定进度动画）
      setLoadingProgress({
        percentage: 0,
        pointsProcessed: 0,
        stage: 'loading',
        isIndeterminate: true,
      });

      let arrayBuffer: ArrayBuffer;
      if (previewContent) {
        arrayBuffer =
          previewContent.buffer instanceof ArrayBuffer
            ? previewContent.buffer.slice(
                previewContent.byteOffset,
                previewContent.byteOffset + previewContent.byteLength
              )
            : new ArrayBuffer(previewContent.byteLength);
        if (!(previewContent.buffer instanceof ArrayBuffer)) {
          new Uint8Array(arrayBuffer).set(previewContent);
        }
      } else {
        const blob = await downloadFile(filePath);
        arrayBuffer = await blob.arrayBuffer();
      }

      const fileExtension = filePath.split('.').pop()?.toLowerCase();
      if (!fileExtension || !['pcd', 'ply', 'xyz', 'pts'].includes(fileExtension)) {
        throw new Error(`Unsupported file format: ${fileExtension}`);
      }

      // 清理旧的渲染器
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }

      // 初始化新的渲染器
      const renderer = new PointCloudRenderer(containerRef.current);
      rendererRef.current = renderer;

      // 设置进度回调
      renderer.onProgress = progress => {
        setLoadingProgress(progress);
      };

      // 加载点云数据
      const pointCloudStats = await renderer.loadPointCloud(arrayBuffer, fileExtension);
      setStats(pointCloudStats);
      setLoadingProgress(null);

      // 调用元数据回调
      onMetadataLoaded?.({
        numRows: pointCloudStats.pointCount,
        numColumns: pointCloudStats.hasColor ? 6 : 3,
        fileType: fileExtension.toUpperCase(),
        extensions: {
          pointCount: pointCloudStats.pointCount,
          hasColor: pointCloudStats.hasColor,
          hasIntensity: pointCloudStats.hasIntensity,
          bounds: pointCloudStats.bounds,
          center: pointCloudStats.center,
          scale: pointCloudStats.scale,
        },
      });
    } catch (err) {
      console.error('Failed to load point cloud:', err);
      setError(err instanceof Error ? err.message : t('pcd.error.loadFailed'));
    }
  }, [filePath, previewContent, downloadFile, t, onMetadataLoaded]);

  // 初始化 - 等待容器准备好
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadPointCloud();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, [loadPointCloud]);

  if (error) {
    return <ErrorDisplay message={error} onRetry={loadPointCloud} />;
  }

  // 切换颜色模式
  const handleColorModeChange = useCallback(
    (mode: ColorMode) => {
      if (!rendererRef.current || !stats) return;

      setColorMode(mode);
      rendererRef.current.setColorMode(mode);
    },
    [stats]
  );

  // 调整点大小
  const handlePointSizeChange = useCallback((size: number) => {
    setPointSize(size);
    rendererRef.current?.setPointSize(size);
  }, []);

  return (
    <div className="relative w-full h-full bg-gray-900">
      <div ref={containerRef} className="w-full h-full" />
      <PointCloudToolbar
        hasRgbData={stats?.hasColor ?? false}
        hasIntensityData={stats?.hasIntensity ?? false}
        colorMode={colorMode}
        onColorModeChange={handleColorModeChange}
        pointSize={pointSize}
        onPointSizeChange={handlePointSizeChange}
        loadingProgress={loadingProgress}
      />
    </div>
  );
};
