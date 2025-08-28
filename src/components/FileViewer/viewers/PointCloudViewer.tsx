import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { PCDLoader, PLYLoader, XYZLoader } from 'three-stdlib';
import * as dat from 'dat.gui';
import { LoadingDisplay, ErrorDisplay } from '../../common/StatusDisplay';
import { StorageServiceManager } from '../../../services/storage';

// 点云数据点接口
interface PCDPoint {
  x: number;
  y: number;
  z: number;
  rgb?: number;
  r?: number;
  g?: number;
  b?: number;
  intensity?: number;
  [key: string]: any;
}

// 点云统计信息接口
interface PCDStats {
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

// 渲染设置接口
interface RenderSettings {
  pointSize: number;
  colorMode: 'rgb' | 'intensity' | 'height' | 'uniform';
  uniformColor: string;
  showAxes: boolean;
  backgroundColor: string;
  maxPointsToRender: number;
  autoRotate: boolean;
  rotationSpeed: number;
}

interface PointCloudViewerProps {
  filePath: string;
  onMetadataLoaded?: (metadata: any) => void;
  previewContent?: Uint8Array; // 可选的预加载内容，用于压缩包内文件
}

// 高性能 LOD（Level of Detail）优化函数
const applyLODOptimization = (points: THREE.Points): THREE.Points => {
  const geometry = points.geometry;
  const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute | null;

  if (!positionAttr) return points;

  const pointCount = positionAttr.count;

  // 性能优化阈值配置
  const MAX_POINTS = 500000; // 50万点为性能上限
  const PERFORMANCE_POINTS = 100000; // 10万点以下保持全分辨率

  // 如果点数少于性能阈值，直接返回
  if (pointCount <= PERFORMANCE_POINTS) {
    return points;
  }

  // 计算采样率
  const samplingRate = Math.min(1, MAX_POINTS / pointCount);
  const targetCount = Math.floor(pointCount * samplingRate);

  // 使用系统性采样而非随机采样，保持点云结构
  const step = Math.floor(pointCount / targetCount);
  const positions = positionAttr.array as Float32Array;
  const colors = colorAttr?.array as Float32Array;

  // 预分配优化后的数据数组
  const newPositions = new Float32Array(targetCount * 3);
  const newColors = colors ? new Float32Array(targetCount * 3) : null;

  // 系统性采样 - 更均匀的点分布
  let writeIndex = 0;
  for (let i = 0; i < pointCount && writeIndex < targetCount; i += step) {
    const readPos = i * 3;
    const writePos = writeIndex * 3;

    newPositions[writePos] = positions[readPos];
    newPositions[writePos + 1] = positions[readPos + 1];
    newPositions[writePos + 2] = positions[readPos + 2];

    if (colors && newColors) {
      newColors[writePos] = colors[readPos];
      newColors[writePos + 1] = colors[readPos + 1];
      newColors[writePos + 2] = colors[readPos + 2];
    }

    writeIndex++;
  }

  // 创建优化后的几何体
  const optimizedGeometry = new THREE.BufferGeometry();
  optimizedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));

  if (newColors) {
    optimizedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(newColors, 3));
  }

  // 性能提示
  if (process.env.NODE_ENV === 'development') {
    console.info(`LOD optimization: ${pointCount} → ${targetCount} points (${(samplingRate * 100).toFixed(1)}%)`);
  }

  return new THREE.Points(optimizedGeometry, points.material);
};

// 统一的点云材质创建函数
const createPointCloudMaterial = (
  hasVertexColors: boolean = true,
  size: number = 0.01
): THREE.PointsMaterial => {
  return new THREE.PointsMaterial({
    size: size,
    sizeAttenuation: false, // 固定为 false，保持点大小不随距离变化
    vertexColors: hasVertexColors,
    transparent: false, // 关闭透明以提升性能
    alphaTest: 0.1 // 设置alpha测试阈值
  });
};

// 高性能的点云异常值检测和清理函数
const validateAndCleanPointCloud = (points: THREE.Points): THREE.Points => {
  const geometry = points.geometry;
  const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colorAttribute = geometry.getAttribute('color') as THREE.BufferAttribute | null;

  if (!positionAttribute) {
    return points;
  }

  const positions = positionAttribute.array as Float32Array;
  const colors = colorAttribute ? (colorAttribute.array as Float32Array) : null;
  const pointCount = positionAttribute.count;

  // 使用预分配的数组和位运算优化性能
  const validMask = new Uint8Array(pointCount);
  let validCount = 0;
  let anomalyFlags = 0; // 使用位掩码记录异常类型

  // 单次遍历检测所有异常，避免多次循环
  for (let i = 0; i < pointCount; i++) {
    const idx3 = i * 3;
    const x = positions[idx3];
    const y = positions[idx3 + 1];
    const z = positions[idx3 + 2];

    // 使用位运算和快速异常检测
    const hasNaN = (x !== x) || (y !== y) || (z !== z); // NaN检测：NaN !== NaN
    const hasInfinity = !isFinite(x) || !isFinite(y) || !isFinite(z);
    const hasExtreme = (Math.abs(x) > 1e6) || (Math.abs(y) > 1e6) || (Math.abs(z) > 1e6);

    if (hasNaN || hasInfinity || hasExtreme) {
      validMask[i] = 0;
      anomalyFlags |= (hasNaN ? 1 : 0) | (hasInfinity ? 2 : 0) | (hasExtreme ? 4 : 0);
    } else {
      validMask[i] = 1;
      validCount++;
    }
  }

  // 如果没有异常值，直接返回原始点云
  if (anomalyFlags === 0) {
    return points;
  }

  // 如果异常值比例过高，可能是数据格式问题，返回原始数据
  const anomalyRate = (pointCount - validCount) / pointCount;
  if (anomalyRate > 0.5) {
    console.warn(`High anomaly rate detected: ${(anomalyRate * 100).toFixed(1)}%, skipping cleaning`);
    return points;
  }

  // 预分配清理后的数据数组
  const validPositions = new Float32Array(validCount * 3);
  const validColors = colors ? new Float32Array(validCount * 3) : null;

  // 高效的数据复制，避免多次查找
  let writeIdx = 0;
  for (let readIdx = 0; readIdx < pointCount; readIdx++) {
    if (validMask[readIdx]) {
      const readPos = readIdx * 3;
      const writePos = writeIdx * 3;

      // 批量复制位置数据
      validPositions[writePos] = positions[readPos];
      validPositions[writePos + 1] = positions[readPos + 1];
      validPositions[writePos + 2] = positions[readPos + 2];

      // 处理颜色数据
      if (colors && validColors) {
        const r = colors[readPos];
        const g = colors[readPos + 1];
        const b = colors[readPos + 2];

        // 使用三元运算符优化颜色验证
        validColors[writePos] = (r === r && isFinite(r)) ? Math.max(0, Math.min(1, r)) : 1;
        validColors[writePos + 1] = (g === g && isFinite(g)) ? Math.max(0, Math.min(1, g)) : 1;
        validColors[writePos + 2] = (b === b && isFinite(b)) ? Math.max(0, Math.min(1, b)) : 1;
      }

      writeIdx++;
    }
  }

  // 创建清理后的几何体
  const cleanGeometry = new THREE.BufferGeometry();
  cleanGeometry.setAttribute('position', new THREE.Float32BufferAttribute(validPositions, 3));

  if (validColors) {
    cleanGeometry.setAttribute('color', new THREE.Float32BufferAttribute(validColors, 3));
  }

  // 仅在开发模式下输出详细统计信息
  if (process.env.NODE_ENV === 'development') {
    const removedCount = pointCount - validCount;
    console.warn('Point cloud cleaned:', {
      original: pointCount,
      valid: validCount,
      removed: removedCount,
      rate: `${(removedCount / pointCount * 100).toFixed(1)}%`
    });
  }

  // 创建新的点云对象
  return new THREE.Points(cleanGeometry, points.material);
};
// 高性能PTS文件解析器
const parsePtsFile = (text: string): THREE.BufferGeometry => {
  const lines = text.split('\n');
  const lineCount = lines.length;

  // 预分配数组以避免频繁扩容
  const positions = new Float32Array(lineCount * 3);
  const colors = new Float32Array(lineCount * 3);

  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < lineCount; i++) {
    const line = lines[i].trim();
    if (line === '') continue;

    // 使用更高效的字符串分割
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    // 直接解析和验证，减少函数调用
    const x = +parts[0]; // 使用一元操作符代替 parseFloat
    const y = +parts[1];
    const z = +parts[2];

    // 快速异常值检测
    if ((x === x) && (y === y) && (z === z) && // NaN检测
        isFinite(x) && isFinite(y) && isFinite(z) &&
        Math.abs(x) < 1e6 && Math.abs(y) < 1e6 && Math.abs(z) < 1e6) {

      const idx3 = validCount * 3;
      positions[idx3] = x;
      positions[idx3 + 1] = y;
      positions[idx3 + 2] = z;

      // 处理颜色信息
      if (parts.length >= 6) {
        let r = +parts[3];
        let g = +parts[4];
        let b = +parts[5];

        // 快速颜色验证和归一化
        if ((r === r) && (g === g) && (b === b) && isFinite(r) && isFinite(g) && isFinite(b)) {
          // 自动检测颜色范围并归一化
          if (r > 1 || g > 1 || b > 1) {
            r *= 0.003921569; // 1/255，比除法更快
            g *= 0.003921569;
            b *= 0.003921569;
          }
          colors[idx3] = Math.max(0, Math.min(1, r));
          colors[idx3 + 1] = Math.max(0, Math.min(1, g));
          colors[idx3 + 2] = Math.max(0, Math.min(1, b));
        } else {
          // 默认灰色
          colors[idx3] = colors[idx3 + 1] = colors[idx3 + 2] = 0.5;
        }
      } else {
        // 默认灰色
        colors[idx3] = colors[idx3 + 1] = colors[idx3 + 2] = 0.5;
      }

      validCount++;
    } else {
      invalidCount++;
    }
  }

  // 仅在开发模式和存在无效点时输出警告
  if (process.env.NODE_ENV === 'development' && invalidCount > 0) {
    console.warn(`PTS parsing: ${validCount} valid, ${invalidCount} invalid points (${(invalidCount / (validCount + invalidCount) * 100).toFixed(1)}% filtered)`);
  }

  // 创建正确大小的数组
  const finalPositions = positions.subarray(0, validCount * 3);
  const finalColors = colors.subarray(0, validCount * 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(finalPositions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(finalColors, 3));

  return geometry;
};

// 计算点的颜色值
const calculatePointColor = (
  point: PCDPoint,
  colorMode: string,
  uniformColor: string,
  stats: PCDStats
): { r: number; g: number; b: number } => {
  let r = 1, g = 1, b = 1;

  switch (colorMode) {
    case 'rgb':
      if (point.rgb !== undefined) {
        // 解析RGB值（通常是一个32位整数）
        const rgb = Math.floor(point.rgb);
        r = ((rgb >> 16) & 0xff) / 255;
        g = ((rgb >> 8) & 0xff) / 255;
        b = (rgb & 0xff) / 255;
      } else if (point.r !== undefined && point.g !== undefined && point.b !== undefined) {
        r = point.r / 255;
        g = point.g / 255;
        b = point.b / 255;
      }
      break;

    case 'intensity':
      if (point.intensity !== undefined) {
        const intensity = Math.max(0, Math.min(1, point.intensity / 255));
        r = g = b = intensity;
      }
      break;

    case 'height':
      const normalizedHeight = (point.z - stats.bounds.min.z) / (stats.bounds.max.z - stats.bounds.min.z);
      // 使用更自然的渐变色：蓝色(低) -> 绿色(中) -> 红色(高)
      if (normalizedHeight < 0.5) {
        // 从蓝色到绿色
        const t = normalizedHeight * 2;
        r = t * 0.2;
        g = 0.4 + t * 0.6;
        b = 1.0 - t * 0.8;
      } else {
        // 从绿色到红色
        const t = (normalizedHeight - 0.5) * 2;
        r = 0.2 + t * 0.8;
        g = 1.0 - t * 0.4;
        b = 0.2 - t * 0.2;
      }
      break;

    case 'uniform':
      const color = new THREE.Color(uniformColor);
      r = color.r;
      g = color.g;
      b = color.b;
      break;
  }

  return { r, g, b };
};

// 从THREE.Points中提取点云统计信息
const extractPointCloudStats = (points: THREE.Points): PCDStats => {
  const geometry = points.geometry;
  const positionAttribute = geometry.getAttribute('position');
  const colorAttribute = geometry.getAttribute('color');

  if (!positionAttribute) {
    return {
      pointCount: 0,
      hasColor: false,
      hasIntensity: false,
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
      center: { x: 0, y: 0, z: 0 },
      scale: 1
    };
  }

  const pointCount = positionAttribute.count;
  const hasColor = !!colorAttribute;

  // 计算边界框
  geometry.computeBoundingBox();

  // 使用统计过滤来处理离群点
  const positions = positionAttribute.array as Float32Array;
  const xValues: number[] = [];
  const yValues: number[] = [];
  const zValues: number[] = [];

  for (let i = 0; i < pointCount; i++) {
    xValues.push(positions[i * 3]);
    yValues.push(positions[i * 3 + 1]);
    zValues.push(positions[i * 3 + 2]);
  }

  // 使用95%分位数来过滤离群点
  const getFilteredBounds = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const len = sorted.length;
    const lowerIndex = Math.floor(len * 0.025);
    const upperIndex = Math.floor(len * 0.975);
    return {
      min: sorted[lowerIndex],
      max: sorted[upperIndex]
    };
  };

  const xBounds = getFilteredBounds(xValues);
  const yBounds = getFilteredBounds(yValues);
  const zBounds = getFilteredBounds(zValues);

  const centerX = (xBounds.min + xBounds.max) / 2;
  const centerY = (yBounds.min + yBounds.max) / 2;
  const centerZ = (zBounds.min + zBounds.max) / 2;

  const scaleX = xBounds.max - xBounds.min;
  const scaleY = yBounds.max - yBounds.min;
  const scaleZ = zBounds.max - zBounds.min;
  const scale = Math.max(scaleX, scaleY, scaleZ);

  return {
    pointCount,
    hasColor,
    hasIntensity: false, // PCDLoader doesn't expose intensity directly
    bounds: {
      min: { x: xBounds.min, y: yBounds.min, z: zBounds.min },
      max: { x: xBounds.max, y: yBounds.max, z: zBounds.max }
    },
    center: { x: centerX, y: centerY, z: centerZ },
    scale
  };
};

export const PointCloudViewer: React.FC<PointCloudViewerProps> = ({
  filePath,
  onMetadataLoaded,
  previewContent
}) => {
  const { t } = useTranslation();
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const animationRef = useRef<number>();
  const guiRef = useRef<dat.GUI | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pcdData, setPcdData] = useState<PCDPoint[] | null>(null);
  const [stats, setStats] = useState<PCDStats | null>(null);

  // 默认渲染设置
  const [settings, setSettings] = useState<RenderSettings>({
    pointSize: 1.0,
    colorMode: 'height', // 默认使用高度颜色模式，数据加载后会自动选择最佳模式
    uniformColor: '#ffffff',
    showAxes: false,
    backgroundColor: '#1a1a1a',
    maxPointsToRender: Infinity, // 渲染所有点，无限制
    autoRotate: false,
    rotationSpeed: 0.5
  });

  // 加载点云文件（支持多种格式）
  const loadPointCloudFile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('开始加载点云文件:', filePath);

      // 优先使用预加载的内容（用于压缩包内文件）
      let arrayBuffer: ArrayBuffer;
      if (previewContent) {
        console.log('使用预加载内容，大小:', previewContent.byteLength);
        arrayBuffer = previewContent.buffer instanceof ArrayBuffer 
          ? previewContent.buffer.slice(previewContent.byteOffset, previewContent.byteOffset + previewContent.byteLength)
          : new ArrayBuffer(previewContent.byteLength);
        if (!(previewContent.buffer instanceof ArrayBuffer)) {
          new Uint8Array(arrayBuffer).set(previewContent);
        }
      } else {
        // 获取存储服务并读取整个点云文件
        arrayBuffer = await StorageServiceManager.getFileArrayBuffer(filePath);
        console.log('从存储服务加载文件，大小:', arrayBuffer.byteLength);
      }

      // 根据文件扩展名选择合适的加载器
      const fileExtension = filePath.split('.').pop()?.toLowerCase();
      console.log('文件扩展名:', fileExtension);

      let points: THREE.Points;

      // 创建一个Blob URL来让加载器可以加载
      const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      try {
        if (fileExtension === 'pcd') {
          // 使用PCDLoader加载PCD文件
          const loader = new PCDLoader();
          points = await new Promise<THREE.Points>((resolve, reject) => {
            loader.load(
              url,
              (loadedPoints: THREE.Points) => {
                resolve(loadedPoints);
              },
              undefined,
              (error: any) => {
                reject(error);
              }
            );
          });
        } else if (fileExtension === 'ply') {
          // 使用PLYLoader加载PLY文件
          const loader = new PLYLoader();
          const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
            loader.load(
              url,
              (loadedGeometry: THREE.BufferGeometry) => {
                resolve(loadedGeometry);
              },
              undefined,
              (error: any) => {
                reject(error);
              }
            );
          });

          // 创建材质和点云对象
          const material = createPointCloudMaterial(!!geometry.getAttribute('color'));
          points = new THREE.Points(geometry, material);
        } else if (fileExtension === 'xyz') {
          // 使用XYZLoader加载XYZ文件
          const loader = new XYZLoader();
          const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
            loader.load(
              url,
              (loadedGeometry: THREE.BufferGeometry) => {
                resolve(loadedGeometry);
              },
              undefined,
              (error: any) => {
                reject(error);
              }
            );
          });

          // 创建材质和点云对象
          const material = createPointCloudMaterial(!!geometry.getAttribute('color'));
          points = new THREE.Points(geometry, material);
        } else if (fileExtension === 'pts') {
          // 简单的PTS文件解析（文本格式：x y z [r g b] [intensity]）
          const text = new TextDecoder().decode(arrayBuffer);
          const geometry = parsePtsFile(text);
          const material = createPointCloudMaterial(!!geometry.getAttribute('color'));
          points = new THREE.Points(geometry, material);
        } else {
          throw new Error(`不支持的点云文件格式: ${fileExtension}`);
        }

        // 清理异常值
        points = validateAndCleanPointCloud(points);

        // 应用 LOD 优化提升渲染性能
        points = applyLODOptimization(points);

        // 提取点云统计信息
        const pointStats = extractPointCloudStats(points);
        console.log('点云统计信息:', pointStats);

        // 从Points对象提取点数据用于兼容现有代码
        const geometry = points.geometry;
        const positionAttribute = geometry.getAttribute('position');
        const pcdPoints: PCDPoint[] = [];

        if (positionAttribute) {
          const positions = positionAttribute.array as Float32Array;
          const colorAttribute = geometry.getAttribute('color');
          const colors = colorAttribute ? (colorAttribute.array as Float32Array) : null;

          for (let i = 0; i < positionAttribute.count; i++) {
            const point: PCDPoint = {
              x: positions[i * 3],
              y: positions[i * 3 + 1],
              z: positions[i * 3 + 2]
            };

            if (colors) {
              point.r = Math.floor(colors[i * 3] * 255);
              point.g = Math.floor(colors[i * 3 + 1] * 255);
              point.b = Math.floor(colors[i * 3 + 2] * 255);
            }

            pcdPoints.push(point);
          }
        }

        setPcdData(pcdPoints);
        setStats(pointStats);

        // 调用元数据回调 - 使用通用格式
        onMetadataLoaded?.({
          // 通用字段
          numRows: pointStats.pointCount, // 点数作为行数
          numColumns: pointStats.hasColor ? (pointStats.hasIntensity ? 7 : 6) : (pointStats.hasIntensity ? 4 : 3), // x,y,z + 可选的r,g,b + 可选的intensity
          fileType: fileExtension?.toUpperCase() || 'Point Cloud',
          // 扩展信息 - 任何格式都可以添加自己的扩展字段
          extensions: {
            pointCount: pointStats.pointCount,
            hasColor: pointStats.hasColor,
            hasIntensity: pointStats.hasIntensity,
            bounds: pointStats.bounds,
            center: pointStats.center,
            scale: pointStats.scale
          }
        });

        // 根据数据特性选择最佳的默认颜色模式
        let bestColorMode: 'rgb' | 'intensity' | 'height' | 'uniform' = 'height'; // 默认使用高度模式

        if (pointStats.hasColor) {
          // 如果有颜色信息，优先使用RGB模式
          bestColorMode = 'rgb';
        }
        // 其他情况都使用高度模式

        // 只在当前模式不是最佳模式时才更新设置
        if (settings.colorMode !== bestColorMode) {
          setSettings(prev => ({ ...prev, colorMode: bestColorMode }));
        }

        console.log('PCD文件加载完成');
      } finally {
        // 清理blob URL
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to load PCD file:', err);
      setError(err instanceof Error ? err.message : t('pcd.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [filePath, previewContent, extractPointCloudStats, settings.colorMode, t, onMetadataLoaded]);

  // 初始化Three.js场景
  const initializeThreeJS = useCallback(() => {
    if (!mountRef.current || !pcdData || !stats) return;

    // 清理之前的场景
    if (rendererRef.current) {
      rendererRef.current.dispose();
    }
    if (controlsRef.current) {
      controlsRef.current.dispose();
    }

    // 创建场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(settings.backgroundColor);
    sceneRef.current = scene;

    // 创建相机
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      stats.scale * 10
    );

    // 设置相机位置和方向（Z轴向上）
    camera.up.set(0, 0, 1); // 设置相机上方向为Z轴
    const distance = stats.scale * 0.1; // 减小距离让点云显示更大
    // 相机位置相对于点云中心设置
    camera.position.set(
      stats.center.x + distance,
      stats.center.y + distance,
      stats.center.z + distance
    );
    camera.lookAt(stats.center.x, stats.center.y, stats.center.z);
    cameraRef.current = camera;

    // 高性能渲染器配置
    const renderer = new THREE.WebGLRenderer({
      antialias: pcdData.length < 100000, // 大数据集关闭抗锯齿以提升性能
      alpha: true,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: pcdData.length > 1000000 // 大数据集启用深度缓冲优化
    });

    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pcdData.length > 500000 ? 1 : 2)); // 根据数据量动态调整像素比

    // 启用性能优化
    renderer.sortObjects = false; // 禁用对象排序以提升性能
    renderer.info.autoReset = false; // 手动控制统计信息重置

    rendererRef.current = renderer;

    // 清空容器并添加渲染器
    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    // 添加坐标轴（如果启用）
    if (settings.showAxes) {
      const axesHelper = new THREE.AxesHelper(stats.scale * 0.5);
      axesHelper.position.set(stats.center.x, stats.center.y, stats.center.z);
      axesHelper.name = 'axesHelper'; // 设置名称以便后续查找和移除
      scene.add(axesHelper);
    }

    // 高性能点云几何体创建
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pcdData.length * 3);
    const colors = new Float32Array(pcdData.length * 3);

    // 批量处理点云数据，减少函数调用开销
    for (let index = 0; index < pcdData.length; index++) {
      const point = pcdData[index];
      const idx3 = index * 3;

      // 位置数据
      positions[idx3] = point.x;
      positions[idx3 + 1] = point.y;
      positions[idx3 + 2] = point.z;

      // 颜色数据 - 内联计算避免函数调用开销
      const { r, g, b } = calculatePointColor(point, settings.colorMode, settings.uniformColor, stats);
      colors[idx3] = r;
      colors[idx3 + 1] = g;
      colors[idx3 + 2] = b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // 根据点云大小优化材质设置
    const material = createPointCloudMaterial(true, settings.pointSize);

    // 创建点云对象
    const points = new THREE.Points(geometry, material);
    pointsRef.current = points;
    scene.add(points);

    // 添加光照
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(
      stats.center.x + distance,
      stats.center.y + distance,
      stats.center.z + distance
    );
    scene.add(directionalLight);

    // 添加相机控制
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(stats.center.x, stats.center.y, stats.center.z);
    controls.enableDamping = true;
    controls.screenSpacePanning = false;
    controls.minDistance = stats.scale * 0.05; // 减小最小距离，允许更近距离观察
    controls.maxDistance = stats.scale * 10;
    controls.maxPolarAngle = Math.PI;
    controls.autoRotate = settings.autoRotate;
    controls.autoRotateSpeed = settings.rotationSpeed;
    // 设置相机上方向为Z轴向上
    camera.up.set(0, 0, 1);
    controls.update();
    controlsRef.current = controls;

  }, [pcdData, stats, settings]);

  // 高性能渲染循环
  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    let needsRender = false;

    // 更新相机控制
    if (controlsRef.current) {
      controlsRef.current.update();
      needsRender = true;
    }

    // 自动旋转
    if (settings.autoRotate && pointsRef.current) {
      pointsRef.current.rotation.y += settings.rotationSpeed * 0.01;
      needsRender = true;
    }

    // 只在需要时渲染，减少 GPU 负载
    if (needsRender) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);

      // 定期重置渲染器统计信息
      if (Math.random() < 0.01) { // 1% 概率重置
        rendererRef.current.info.reset();
      }
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [settings.autoRotate, settings.rotationSpeed]);

  // 高性能颜色更新函数
  const updatePointColors = useCallback(() => {
    if (!pointsRef.current || !pcdData || !stats) return;

    const geometry = pointsRef.current.geometry;
    const colorAttribute = geometry.attributes.color as THREE.BufferAttribute;
    const colorArray = colorAttribute.array as Float32Array;

    // 批量处理，减少函数调用开销
    for (let index = 0; index < pcdData.length; index++) {
      const point = pcdData[index];
      const { r, g, b } = calculatePointColor(point, settings.colorMode, settings.uniformColor, stats);
      const idx3 = index * 3;

      colorArray[idx3] = r;
      colorArray[idx3 + 1] = g;
      colorArray[idx3 + 2] = b;
    }

    colorAttribute.needsUpdate = true;
  }, [pcdData, stats, settings.colorMode, settings.uniformColor]);

  // 更新坐标轴显示
  const updateAxes = useCallback(() => {
    if (!sceneRef.current || !stats) return;

    // 移除现有的坐标轴
    const existingAxes = sceneRef.current.getObjectByName('axesHelper');
    if (existingAxes) {
      sceneRef.current.remove(existingAxes);
    }

    // 如果需要显示坐标轴，添加新的
    if (settings.showAxes) {
      const axesHelper = new THREE.AxesHelper(stats.scale * 0.5);
      axesHelper.position.set(stats.center.x, stats.center.y, stats.center.z);
      axesHelper.name = 'axesHelper';
      sceneRef.current.add(axesHelper);
    }
  }, [stats, settings.showAxes]);

  // 设置 dat.GUI
  const setupGUI = useCallback(() => {
    if (guiRef.current) {
      guiRef.current.destroy();
    }

    if (!mountRef.current) return;

    // 创建GUI并将其定位在画布容器内部
    const gui = new dat.GUI({
      width: 280,
      autoPlace: false // 禁用自动定位
    });

    // 将GUI添加到画布容器内部
    const guiContainer = gui.domElement;
    guiContainer.style.position = 'absolute';
    guiContainer.style.top = '10px';
    guiContainer.style.right = '10px';
    guiContainer.style.zIndex = '1000'; // 增加z-index确保显示在最前面
    guiContainer.style.display = 'block'; // 确保显示
    guiContainer.style.visibility = 'visible'; // 确保可见

    mountRef.current.appendChild(guiContainer);
    guiRef.current = gui;

    // 渲染设置文件夹
    const renderFolder = gui.addFolder('Render Settings');
    renderFolder.add(settings, 'pointSize', 0.5, 20, 0.5).name('Point Size').onChange(() => {
      if (pointsRef.current && pointsRef.current.material) {
        (pointsRef.current.material as THREE.PointsMaterial).size = settings.pointSize;
        (pointsRef.current.material as THREE.PointsMaterial).needsUpdate = true;
      }
    });

    // 根据数据特性动态生成支持的颜色模式列表
    const supportedColorModes = ['height', 'uniform']; // 基础模式

    if (stats?.hasColor) {
      supportedColorModes.unshift('rgb'); // RGB模式放在最前面
    }

    if (stats?.hasIntensity) {
      supportedColorModes.splice(-1, 0, 'intensity'); // intensity在uniform前
    }

    renderFolder.add(settings, 'colorMode', supportedColorModes).name('Color Mode').onChange(() => {
      // 使用优化的颜色更新函数，避免完全重新渲染
      updatePointColors();
    });

    renderFolder.addColor(settings, 'uniformColor').name('Uniform Color').onChange(() => {
      if (settings.colorMode === 'uniform') {
        updatePointColors();
      }
    });

    renderFolder.add(settings, 'showAxes').name('Show Axes').onChange(() => {
      updateAxes();
    });

    renderFolder.addColor(settings, 'backgroundColor').name('Background').onChange(() => {
      if (sceneRef.current) {
        sceneRef.current.background = new THREE.Color(settings.backgroundColor);
      }
    });

    // 动画设置文件夹
    const animationFolder = gui.addFolder('Animation');
    animationFolder.add(settings, 'autoRotate').name('Auto Rotate').onChange(() => {
      if (controlsRef.current) {
        controlsRef.current.autoRotate = settings.autoRotate;
        controlsRef.current.autoRotateSpeed = settings.rotationSpeed;
      }
    });

    animationFolder.add(settings, 'rotationSpeed', 0.1, 2.0, 0.1).name('Rotation Speed').onChange(() => {
      if (controlsRef.current) {
        controlsRef.current.autoRotateSpeed = settings.rotationSpeed;
      }
    });

    // 默认展开所有调试面板文件夹
    renderFolder.open();
    animationFolder.open();

    return gui;
  }, [settings, pcdData, stats, loadPointCloudFile, updatePointColors, updateAxes]);

  // 处理窗口大小变化
  const handleResize = useCallback(() => {
    if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(width, height);
  }, []);

  // 全面的内存清理函数
  const cleanupResources = useCallback(() => {
    // 停止动画循环
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // 清理 OrbitControls
    if (controlsRef.current) {
      controlsRef.current.dispose();
    }

    // 清理几何体和材质
    if (pointsRef.current) {
      pointsRef.current.geometry.dispose();
      if (pointsRef.current.material instanceof THREE.Material) {
        pointsRef.current.material.dispose();
      }
    }

    // 清理场景中的所有对象
    if (sceneRef.current) {
      sceneRef.current.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          if (object.geometry) {
            object.geometry.dispose();
          }
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
      sceneRef.current.clear();
    }

    // 清理渲染器
    if (rendererRef.current) {
      rendererRef.current.dispose();
      if (rendererRef.current.forceContextLoss) {
        rendererRef.current.forceContextLoss();
      }
    }

    // 清理GUI
    if (guiRef.current) {
      guiRef.current.destroy();
    }

    // 清理DOM元素
    if (mountRef.current) {
      mountRef.current.innerHTML = '';
    }

    // 强制垃圾回收（仅在开发模式下）
    if (process.env.NODE_ENV === 'development' && (window as any).gc) {
      setTimeout(() => (window as any).gc(), 100);
    }
  }, []);

  // 初始化和清理
  useEffect(() => {
    loadPointCloudFile();
    return cleanupResources;
  }, [loadPointCloudFile, cleanupResources]);

  useEffect(() => {
    if (pcdData && stats && !loading && !error) {
      initializeThreeJS();
      setupGUI(); // 自动设置GUI，因为没有手动开关了
      animate();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [pcdData, stats, loading, error, initializeThreeJS, animate, setupGUI]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // 渲染加载状态
  if (loading) {
    return <LoadingDisplay message={t('pcd.loading')} />;
  }

  // 渲染错误状态
  if (error) {
    return <ErrorDisplay message={error} />;
  }

  // 主渲染
  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* 3D视图区域 - 全屏显示 */}
      <div
        ref={mountRef}
        className="flex-1 relative bg-gray-900"
        style={{ minHeight: '400px' }}
      >
        {/* 鼠标操作提示 */}
        <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded pointer-events-none z-10">
          {t('pcd.mouseHint')}
        </div>

        {/* 性能提示 - 现在显示总点数信息 */}
        {stats && stats.pointCount > 100000 && (
          <div className="absolute bottom-4 left-4 bg-blue-500 bg-opacity-90 text-white text-sm px-3 py-2 rounded-lg z-10">
            <div className="font-semibold">{t('pcd.pointCloudInfo')}</div>
            <div className="text-xs mt-1">
              {t('pcd.totalPoints').replace('{{count}}', stats.pointCount.toLocaleString())}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
