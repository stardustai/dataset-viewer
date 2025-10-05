export interface PointCloudStats {
  pointCount: number;
  hasColor: boolean;
  hasIntensity: boolean;
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  center: { x: number; y: number; z: number };
  scale: number;
}

export type ColorMode = 'rgb' | 'height' | 'intensity';

export interface LoadingProgress {
  percentage: number;
  pointsProcessed: number;
  stage: 'loading' | 'parsing' | 'optimizing';
  isIndeterminate?: boolean; // 是否为不确定进度（动画模式）
}
