import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { PCDLoader } from 'three-stdlib';
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

interface PCDViewerProps {
  filePath: string;
  fileName?: string; // Make optional since not used
  fileSize?: number; // Make optional since not used
  onMetadataLoaded?: (metadata: any) => void;
}

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

export const PCDViewer: React.FC<PCDViewerProps> = ({
  filePath,
  onMetadataLoaded
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

  // 加载PCD文件（优化版，支持大文件分块加载）
  const loadPCDFile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('开始加载PCD文件:', filePath);

      // 获取存储服务并读取整个PCD文件
      const arrayBuffer = await StorageServiceManager.getFileArrayBuffer(filePath);
      console.log('PCD文件大小:', arrayBuffer.byteLength);

      // 使用PCDLoader解析PCD文件
      const loader = new PCDLoader();

      // PCDLoader期望的是ArrayBuffer，我们需要将其转换为适当的格式
      // 创建一个Blob URL来让PCDLoader可以加载
      const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      try {
        // 使用PCDLoader加载点云数据
        const points = await new Promise<THREE.Points>((resolve, reject) => {
          loader.load(
            url,
            (loadedPoints) => {
              resolve(loadedPoints);
            },
            undefined,
            (error) => {
              reject(error);
            }
          );
        });

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
          fileType: 'PCD',
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
      setError(err instanceof Error ? err.message : t('pcd.error.loadFailed', '加载PCD文件失败'));
    } finally {
      setLoading(false);
    }
  }, [filePath, extractPointCloudStats, settings.colorMode, t, onMetadataLoaded]);

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
      axesHelper.name = 'axesHelper'; // 设置名称以便后续查找和移除
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
      sizeAttenuation: false
    });

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

  // 优化的颜色更新函数，避免完全重新渲染
  const updatePointColors = useCallback(() => {
    if (!pointsRef.current || !pcdData || !stats) return;

    const geometry = pointsRef.current.geometry;
    const colors = geometry.attributes.color;

    pcdData.forEach((point, index) => {
      let r = 1, g = 1, b = 1;

      switch (settings.colorMode) {
        case 'rgb':
          if (point.rgb !== undefined) {
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
          const color = new THREE.Color(settings.uniformColor);
          r = color.r;
          g = color.g;
          b = color.b;
          break;
      }

      colors.setXYZ(index, r, g, b);
    });

    colors.needsUpdate = true;
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

    // 性能设置文件夹 - 暂时隐藏，因为已经去掉最大点数限制
    // const performanceFolder = gui.addFolder('Performance');
    // performanceFolder.add(settings, 'maxPointsToRender', 1000, 500000, 1000).name('Max Points').onChange(() => {
    //   loadPCDFile(); // Reload with new limit
    // });

    // 默认展开所有调试面板文件夹
    renderFolder.open();
    animationFolder.open();
    // performanceFolder.open();

    return gui;
  }, [settings, pcdData, stats, loadPCDFile, updatePointColors, updateAxes]);

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
      if (guiRef.current) {
        guiRef.current.destroy();
      }
    };
  }, [loadPCDFile]);

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
    return <LoadingDisplay message={t('pcd.loading', '正在加载点云数据...')} />;
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
          {t('pcd.mouseHint', '鼠标拖拽旋转，滚轮缩放，右键平移')}
        </div>

        {/* 性能提示 - 现在显示总点数信息 */}
        {stats && stats.pointCount > 100000 && (
          <div className="absolute bottom-4 left-4 bg-blue-500 bg-opacity-90 text-white text-sm px-3 py-2 rounded-lg z-10">
            <div className="font-semibold">{t('pcd.pointCloudInfo', '点云信息')}</div>
            <div className="text-xs mt-1">
              {t('pcd.totalPoints', `正在渲染 ${stats.pointCount.toLocaleString()} 个点`)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
