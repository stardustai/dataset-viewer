import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { 
  RotateCcw, 
  ZoomIn, 
  ZoomOut, 
  Info, 
  Eye, 
  EyeOff,
  Settings,
  Play,
  Pause
} from 'lucide-react';
import { LoadingDisplay, ErrorDisplay } from '../../common/StatusDisplay';
import { formatFileSize } from '../../../utils/fileUtils';
import { StorageServiceManager } from '../../../services/storage';

// PCD文件头信息接口
interface PCDHeader {
  version: string;
  fields: string[];
  size: number[];
  type: string[];
  count: number[];
  width: number;
  height: number;
  viewpoint: number[];
  points: number;
  data: 'ascii' | 'binary' | 'binary_compressed';
}

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

interface PCDViewerProps {
  filePath: string;
  fileName: string;
  fileSize: number;
}

export const PCDViewer: React.FC<PCDViewerProps> = ({ 
  filePath, 
  fileName, 
  fileSize 
}) => {
  const { t } = useTranslation();
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const animationRef = useRef<number>();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pcdData, setPcdData] = useState<PCDPoint[] | null>(null);
  const [stats, setStats] = useState<PCDStats | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(true);
  
  // 默认渲染设置
  const [settings, setSettings] = useState<RenderSettings>({
    pointSize: 2.0,
    colorMode: 'rgb',
    uniformColor: '#ffffff',
    showAxes: true,
    backgroundColor: '#1a1a1a',
    maxPointsToRender: 100000, // 最多渲染10万个点，性能考虑
    autoRotate: false,
    rotationSpeed: 0.5
  });

  // 解析PCD文件头部
  const parsePCDHeader = useCallback((content: string): PCDHeader => {
    const lines = content.split('\n');
    const header: any = {
      fields: [],
      size: [],
      type: [],
      count: [],
      viewpoint: [0, 0, 0, 1, 0, 0, 0]
    };
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('VERSION')) {
        header.version = trimmed.split(' ')[1];
      } else if (trimmed.startsWith('FIELDS')) {
        header.fields = trimmed.split(' ').slice(1);
      } else if (trimmed.startsWith('SIZE')) {
        header.size = trimmed.split(' ').slice(1).map(Number);
      } else if (trimmed.startsWith('TYPE')) {
        header.type = trimmed.split(' ').slice(1);
      } else if (trimmed.startsWith('COUNT')) {
        header.count = trimmed.split(' ').slice(1).map(Number);
      } else if (trimmed.startsWith('WIDTH')) {
        header.width = parseInt(trimmed.split(' ')[1]);
      } else if (trimmed.startsWith('HEIGHT')) {
        header.height = parseInt(trimmed.split(' ')[1]);
      } else if (trimmed.startsWith('VIEWPOINT')) {
        header.viewpoint = trimmed.split(' ').slice(1).map(Number);
      } else if (trimmed.startsWith('POINTS')) {
        header.points = parseInt(trimmed.split(' ')[1]);
      } else if (trimmed.startsWith('DATA')) {
        header.data = trimmed.split(' ')[1] as 'ascii' | 'binary' | 'binary_compressed';
        break; // DATA行后面就是实际数据了
      }
    }
    
    return header as PCDHeader;
  }, []);

  // 解析ASCII格式的PCD数据
  const parseASCIIData = useCallback((content: string, header: PCDHeader): PCDPoint[] => {
    const lines = content.split('\n');
    const dataStartIndex = lines.findIndex(line => line.trim().startsWith('DATA')) + 1;
    const points: PCDPoint[] = [];
    
    for (let i = dataStartIndex; i < lines.length && points.length < settings.maxPointsToRender; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(/\s+/).map(Number);
      if (values.length < header.fields.length) continue;
      
      const point: PCDPoint = { x: 0, y: 0, z: 0 };
      
      header.fields.forEach((field, index) => {
        const value = values[index];
        if (isNaN(value)) return;
        
        switch (field.toLowerCase()) {
          case 'x':
            point.x = value;
            break;
          case 'y':
            point.y = value;
            break;
          case 'z':
            point.z = value;
            break;
          case 'rgb':
            point.rgb = value;
            break;
          case 'r':
            point.r = value;
            break;
          case 'g':
            point.g = value;
            break;
          case 'b':
            point.b = value;
            break;
          case 'intensity':
            point.intensity = value;
            break;
          default:
            point[field] = value;
        }
      });
      
      points.push(point);
    }
    
    return points;
  }, [settings.maxPointsToRender]);

  // 计算点云统计信息
  const calculateStats = useCallback((points: PCDPoint[]): PCDStats => {
    if (points.length === 0) {
      return {
        pointCount: 0,
        hasColor: false,
        hasIntensity: false,
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
        center: { x: 0, y: 0, z: 0 },
        scale: 1
      };
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let hasColor = false;
    let hasIntensity = false;

    points.forEach(point => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      minZ = Math.min(minZ, point.z);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      maxZ = Math.max(maxZ, point.z);
      
      if (point.rgb !== undefined || (point.r !== undefined && point.g !== undefined && point.b !== undefined)) {
        hasColor = true;
      }
      if (point.intensity !== undefined) {
        hasIntensity = true;
      }
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    const scaleX = maxX - minX;
    const scaleY = maxY - minY;
    const scaleZ = maxZ - minZ;
    const scale = Math.max(scaleX, scaleY, scaleZ);

    return {
      pointCount: points.length,
      hasColor,
      hasIntensity,
      bounds: {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ }
      },
      center: { x: centerX, y: centerY, z: centerZ },
      scale
    };
  }, []);

  // 加载PCD文件
  const loadPCDFile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 首先获取文件的一小部分来解析头部
      const headerContent = await StorageServiceManager.getFileContent(filePath, 0, 4096);
      const pcdHeader = parsePCDHeader(headerContent.content);

      // 如果是二进制格式，暂时不支持
      if (pcdHeader.data !== 'ascii') {
        throw new Error(t('pcd.error.binaryNotSupported', '当前暂不支持二进制格式的PCD文件'));
      }

      // 加载完整文件内容（对于大文件应该实现分块加载）
      const fullContent = await StorageServiceManager.getFileContent(filePath);
      const points = parseASCIIData(fullContent.content, pcdHeader);
      
      if (points.length === 0) {
        throw new Error(t('pcd.error.noValidPoints', '未找到有效的点云数据'));
      }

      setPcdData(points);
      
      const pointStats = calculateStats(points);
      setStats(pointStats);

      // 如果有颜色信息，默认使用RGB模式
      if (pointStats.hasColor && settings.colorMode === 'uniform') {
        setSettings(prev => ({ ...prev, colorMode: 'rgb' }));
      }

    } catch (err) {
      console.error('Failed to load PCD file:', err);
      setError(err instanceof Error ? err.message : t('pcd.error.loadFailed', '加载PCD文件失败'));
    } finally {
      setLoading(false);
    }
  }, [filePath, parsePCDHeader, parseASCIIData, calculateStats, settings.colorMode, t]);

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
    
    // 设置相机位置
    const distance = stats.scale * 1.5;
    camera.position.set(distance, distance, distance);
    camera.lookAt(stats.center.x, stats.center.y, stats.center.z);
    cameraRef.current = camera;

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制像素比以提升性能
    rendererRef.current = renderer;

    // 清空容器并添加渲染器
    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    // 添加坐标轴（如果启用）
    if (settings.showAxes) {
      const axesHelper = new THREE.AxesHelper(stats.scale * 0.5);
      axesHelper.position.set(stats.center.x, stats.center.y, stats.center.z);
      scene.add(axesHelper);
    }

    // 创建点云几何体
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pcdData.length * 3);
    const colors = new Float32Array(pcdData.length * 3);

    pcdData.forEach((point, index) => {
      // 位置
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;

      // 颜色
      let r = 1, g = 1, b = 1;
      
      switch (settings.colorMode) {
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
          r = normalizedHeight;
          g = 1 - normalizedHeight;
          b = 0.5;
          break;
        
        case 'uniform':
          const color = new THREE.Color(settings.uniformColor);
          r = color.r;
          g = color.g;
          b = color.b;
          break;
      }

      colors[index * 3] = r;
      colors[index * 3 + 1] = g;
      colors[index * 3 + 2] = b;
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // 创建点云材质
    const material = new THREE.PointsMaterial({
      size: settings.pointSize,
      vertexColors: true,
      sizeAttenuation: true
    });

    // 创建点云对象
    const points = new THREE.Points(geometry, material);
    pointsRef.current = points;
    scene.add(points);

    // 添加光照
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(distance, distance, distance);
    scene.add(directionalLight);

    // 添加相机控制
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(stats.center.x, stats.center.y, stats.center.z);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = stats.scale * 0.1;
    controls.maxDistance = stats.scale * 10;
    controls.maxPolarAngle = Math.PI;
    controlsRef.current = controls;

  }, [pcdData, stats, settings]);

  // 渲染循环
  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    // 更新相机控制
    if (controlsRef.current) {
      controlsRef.current.update();
    }

    // 自动旋转
    if (settings.autoRotate && pointsRef.current) {
      pointsRef.current.rotation.y += settings.rotationSpeed * 0.01;
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationRef.current = requestAnimationFrame(animate);
  }, [settings.autoRotate, settings.rotationSpeed]);

  // 相机控制
  const resetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current || !stats) return;
    
    const distance = stats.scale * 1.5;
    cameraRef.current.position.set(distance, distance, distance);
    controlsRef.current.target.set(stats.center.x, stats.center.y, stats.center.z);
    controlsRef.current.update();
  }, [stats]);

  const zoomIn = useCallback(() => {
    if (!controlsRef.current) return;
    controlsRef.current.dollyIn(0.9);
    controlsRef.current.update();
  }, []);

  const zoomOut = useCallback(() => {
    if (!controlsRef.current) return;
    controlsRef.current.dollyOut(1.1);
    controlsRef.current.update();
  }, []);

  // 处理窗口大小变化
  const handleResize = useCallback(() => {
    if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(width, height);
  }, []);

  // 初始化和清理
  useEffect(() => {
    loadPCDFile();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [loadPCDFile]);

  useEffect(() => {
    if (pcdData && stats && !loading && !error) {
      initializeThreeJS();
      animate();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [pcdData, stats, loading, error, initializeThreeJS, animate]);

  useEffect(() => {
    // 重新初始化场景当设置改变时
    if (pcdData && stats && !loading && !error) {
      initializeThreeJS();
    }
  }, [settings, pcdData, stats, loading, error, initializeThreeJS]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // 渲染加载状态
  if (loading) {
    return <LoadingDisplay message={t('pcd.loading', '正在加载点云数据...')} />;
  }

  // 渲染错误状态
  if (error) {
    return <ErrorDisplay message={error} />;
  }

  // 主渲染
  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* 工具栏 */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {fileName}
          </h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatFileSize(fileSize)}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title={showStats ? t('pcd.hideStats', '隐藏统计') : t('pcd.showStats', '显示统计')}
          >
            {showStats ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title={t('pcd.settings', '设置')}
          >
            <Settings className="w-5 h-5" />
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />

          <button
            onClick={() => setSettings(prev => ({ ...prev, autoRotate: !prev.autoRotate }))}
            className={`p-2 rounded-lg ${
              settings.autoRotate 
                ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900' 
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title={settings.autoRotate ? t('pcd.stopRotation', '停止旋转') : t('pcd.startRotation', '开始旋转')}
          >
            {settings.autoRotate ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          <button
            onClick={resetCamera}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title={t('pcd.resetView', '重置视图')}
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          
          <button
            onClick={zoomIn}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title={t('pcd.zoomIn', '放大')}
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          
          <button
            onClick={zoomOut}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title={t('pcd.zoomOut', '缩小')}
          >
            <ZoomOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 侧边栏 */}
        {(showStats || showSettings) && (
          <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
            {/* 统计信息 */}
            {showStats && stats && (
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                  <Info className="w-4 h-4 mr-2" />
                  {t('pcd.statistics', '统计信息')}
                </h4>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('pcd.pointCount', '点数量')}:</span>
                    <span className="font-mono text-gray-900 dark:text-white">{stats.pointCount.toLocaleString()}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('pcd.hasColor', '包含颜色')}:</span>
                    <span className="text-gray-900 dark:text-white">
                      {stats.hasColor ? t('common.yes', '是') : t('common.no', '否')}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('pcd.hasIntensity', '包含强度')}:</span>
                    <span className="text-gray-900 dark:text-white">
                      {stats.hasIntensity ? t('common.yes', '是') : t('common.no', '否')}
                    </span>
                  </div>
                  
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-gray-600 dark:text-gray-400 mb-1">{t('pcd.bounds', '边界')}:</div>
                    <div className="font-mono text-xs space-y-1 text-gray-900 dark:text-white">
                      <div>X: {stats.bounds.min.x.toFixed(3)} ~ {stats.bounds.max.x.toFixed(3)}</div>
                      <div>Y: {stats.bounds.min.y.toFixed(3)} ~ {stats.bounds.max.y.toFixed(3)}</div>
                      <div>Z: {stats.bounds.min.z.toFixed(3)} ~ {stats.bounds.max.z.toFixed(3)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 设置面板 */}
            {showSettings && (
              <div className="p-4 flex-1 overflow-y-auto">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  {t('pcd.renderSettings', '渲染设置')}
                </h4>
                
                <div className="space-y-4">
                  {/* 点大小 */}
                  <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                      {t('pcd.pointSize', '点大小')}: {settings.pointSize}
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={settings.pointSize}
                      onChange={(e) => setSettings(prev => ({ ...prev, pointSize: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  {/* 颜色模式 */}
                  <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                      {t('pcd.colorMode', '颜色模式')}
                    </label>
                    <select
                      value={settings.colorMode}
                      onChange={(e) => setSettings(prev => ({ ...prev, colorMode: e.target.value as any }))}
                      className="w-full px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="rgb">{t('pcd.colorMode.rgb', 'RGB颜色')}</option>
                      <option value="intensity">{t('pcd.colorMode.intensity', '强度')}</option>
                      <option value="height">{t('pcd.colorMode.height', '高度')}</option>
                      <option value="uniform">{t('pcd.colorMode.uniform', '单一颜色')}</option>
                    </select>
                  </div>

                  {/* 单一颜色选择器 */}
                  {settings.colorMode === 'uniform' && (
                    <div>
                      <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                        {t('pcd.uniformColor', '颜色')}
                      </label>
                      <input
                        type="color"
                        value={settings.uniformColor}
                        onChange={(e) => setSettings(prev => ({ ...prev, uniformColor: e.target.value }))}
                        className="w-full h-8 border border-gray-300 dark:border-gray-600 rounded-lg"
                      />
                    </div>
                  )}

                  {/* 显示坐标轴 */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showAxes"
                      checked={settings.showAxes}
                      onChange={(e) => setSettings(prev => ({ ...prev, showAxes: e.target.checked }))}
                      className="mr-2"
                    />
                    <label htmlFor="showAxes" className="text-sm text-gray-700 dark:text-gray-300">
                      {t('pcd.showAxes', '显示坐标轴')}
                    </label>
                  </div>

                  {/* 旋转速度 */}
                  <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                      {t('pcd.rotationSpeed', '旋转速度')}: {settings.rotationSpeed}
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.1"
                      value={settings.rotationSpeed}
                      onChange={(e) => setSettings(prev => ({ ...prev, rotationSpeed: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3D视图区域 */}
        <div 
          ref={mountRef} 
          className="flex-1 relative bg-gray-900"
          style={{ minHeight: '400px' }}
        >
          {/* 鼠标操作提示 */}
          <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded pointer-events-none">
            {t('pcd.mouseHint', '鼠标拖拽旋转，滚轮缩放')}
          </div>

          {/* 性能提示 */}
          {stats && stats.pointCount > settings.maxPointsToRender && (
            <div className="absolute bottom-4 left-4 bg-yellow-500 bg-opacity-90 text-black text-sm px-3 py-2 rounded-lg">
              <div className="font-semibold">{t('pcd.performanceWarning', '性能提醒')}</div>
              <div className="text-xs mt-1">
                {t('pcd.pointsLimited', `仅显示前 ${settings.maxPointsToRender.toLocaleString()} 个点 (共 ${stats.pointCount.toLocaleString()} 个)`)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};