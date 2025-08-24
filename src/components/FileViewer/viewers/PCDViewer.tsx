import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import * as dat from 'dat.gui';
import { 
  RotateCcw, 
  Info, 
  Settings
} from 'lucide-react';
import { LoadingDisplay, ErrorDisplay } from '../../common/StatusDisplay';
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
  fileName?: string; // Make optional since not used
  fileSize?: number; // Make optional since not used
}

export const PCDViewer: React.FC<PCDViewerProps> = ({ 
  filePath 
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
  const [showMetadata, setShowMetadata] = useState(false);
  
  // 默认渲染设置
  const [settings, setSettings] = useState<RenderSettings>({
    pointSize: 0.8, // 减小默认点大小
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

  // 解析二进制格式的PCD数据
  const parseBinaryData = useCallback(async (_headerContent: string, header: PCDHeader): Promise<PCDPoint[]> => {
    try {
      // 获取二进制数据
      const arrayBuffer = await StorageServiceManager.getFileArrayBuffer(filePath);
      const binaryData = new Uint8Array(arrayBuffer);
      
      // 找到数据开始位置
      const headerText = new TextDecoder().decode(binaryData.slice(0, 8192)); // 使用前8KB查找头部结束
      const headerEndIndex = headerText.indexOf('DATA binary\n') + 12; // 12 = length of "DATA binary\n"
      
      if (headerEndIndex === 11) { // -1 + 12
        throw new Error('Could not find binary data section');
      }
      
      // 计算每个点的字节大小
      let pointSize = 0;
      header.fields.forEach((_field, index) => {
        pointSize += header.size[index];
      });
      
      const points: PCDPoint[] = [];
      const maxPoints = Math.min(header.points, settings.maxPointsToRender);
      const dataStart = headerEndIndex;
      
      for (let i = 0; i < maxPoints; i++) {
        const pointOffset = dataStart + (i * pointSize);
        if (pointOffset + pointSize > binaryData.length) break;
        
        const point: PCDPoint = { x: 0, y: 0, z: 0 };
        let fieldOffset = pointOffset;
        
        header.fields.forEach((field, fieldIndex) => {
          const size = header.size[fieldIndex];
          const type = header.type[fieldIndex];
          
          let value: number;
          
          // 根据类型解析数值
          if (type === 'F') { // Float
            if (size === 4) {
              const view = new DataView(binaryData.buffer, binaryData.byteOffset + fieldOffset, 4);
              value = view.getFloat32(0, true); // little endian
            } else if (size === 8) {
              const view = new DataView(binaryData.buffer, binaryData.byteOffset + fieldOffset, 8);
              value = view.getFloat64(0, true); // little endian
            } else {
              value = 0;
            }
          } else if (type === 'I') { // Signed Integer
            if (size === 1) {
              value = new Int8Array(binaryData.buffer, binaryData.byteOffset + fieldOffset, 1)[0];
            } else if (size === 2) {
              const view = new DataView(binaryData.buffer, binaryData.byteOffset + fieldOffset, 2);
              value = view.getInt16(0, true);
            } else if (size === 4) {
              const view = new DataView(binaryData.buffer, binaryData.byteOffset + fieldOffset, 4);
              value = view.getInt32(0, true);
            } else {
              value = 0;
            }
          } else if (type === 'U') { // Unsigned Integer
            if (size === 1) {
              value = new Uint8Array(binaryData.buffer, binaryData.byteOffset + fieldOffset, 1)[0];
            } else if (size === 2) {
              const view = new DataView(binaryData.buffer, binaryData.byteOffset + fieldOffset, 2);
              value = view.getUint16(0, true);
            } else if (size === 4) {
              const view = new DataView(binaryData.buffer, binaryData.byteOffset + fieldOffset, 4);
              value = view.getUint32(0, true);
            } else {
              value = 0;
            }
          } else {
            value = 0;
          }
          
          // 将值分配给相应字段
          switch (field.toLowerCase()) {
            case 'x': point.x = value; break;
            case 'y': point.y = value; break;
            case 'z': point.z = value; break;
            case 'rgb': point.rgb = value; break;
            case 'r': point.r = value; break;
            case 'g': point.g = value; break;
            case 'b': point.b = value; break;
            case 'intensity': point.intensity = value; break;
            default: point[field] = value;
          }
          
          fieldOffset += size;
        });
        
        points.push(point);
      }
      
      return points;
    } catch (error) {
      console.error('Error parsing binary PCD data:', error);
      throw new Error(t('pcd.error.binaryParseFailed', '解析二进制PCD数据失败'));
    }
  }, [filePath, settings.maxPointsToRender, t]);

  // 解析二进制压缩格式（简化实现，实际压缩格式更复杂）
  const parseBinaryCompressedData = useCallback(async (headerContent: string, header: PCDHeader): Promise<PCDPoint[]> => {
    // 对于压缩格式，我们先尝试解析为普通二进制
    // 实际的压缩解析需要更复杂的实现
    console.warn('Binary compressed format detected, falling back to binary parsing');
    return parseBinaryData(headerContent, header);
  }, [parseBinaryData]);

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

  // 加载PCD文件（优化版，支持大文件分块加载）
  const loadPCDFile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 获取文件大小
      const fileSize = await StorageServiceManager.getFileSize(filePath);
      
      // 首先获取文件的一小部分来解析头部（增大到8KB以确保包含完整头部）
      const headerContent = await StorageServiceManager.getFileContent(filePath, 0, Math.min(8192, fileSize));
      const pcdHeader = parsePCDHeader(headerContent.content);

      let points: PCDPoint[];

      // 如果是二进制格式，使用对应的解析函数
      if (pcdHeader.data === 'binary') {
        // 获取完整文件内容进行二进制解析
        points = await parseBinaryData(headerContent.content, pcdHeader);
      } else if (pcdHeader.data === 'binary_compressed') {
        // 获取完整文件内容进行二进制压缩解析
        points = await parseBinaryCompressedData(headerContent.content, pcdHeader);
      } else {
        // ASCII format - handle both large and small files
        // 对于大文件（>10MB），使用分块加载策略
        if (fileSize > 10 * 1024 * 1024) {
          // 大文件：实现智能采样，只加载部分数据以保证性能
          const maxSampleSize = 1024 * 1024; // 每次最多读取1MB
          let currentPosition = headerContent.content.indexOf('DATA ascii\n') + 11;
          let sampledPoints: PCDPoint[] = [];
          const samplingRate = Math.ceil(pcdHeader.points / settings.maxPointsToRender);

          while (currentPosition < fileSize && sampledPoints.length < settings.maxPointsToRender) {
            const chunkSize = Math.min(maxSampleSize, fileSize - currentPosition);
            const chunkContent = await StorageServiceManager.getFileContent(filePath, currentPosition, chunkSize);
            
            const chunkLines = chunkContent.content.split('\n');
            let processedInChunk = 0;
            
            for (let i = 0; i < chunkLines.length && sampledPoints.length < settings.maxPointsToRender; i += samplingRate) {
              const line = chunkLines[i]?.trim();
              if (!line) continue;
              
              const values = line.split(/\s+/).map(Number);
              if (values.length < pcdHeader.fields.length) continue;
              
              const point: PCDPoint = { x: 0, y: 0, z: 0 };
              pcdHeader.fields.forEach((field, index) => {
                const value = values[index];
                if (isNaN(value)) return;
                
                switch (field.toLowerCase()) {
                  case 'x': point.x = value; break;
                  case 'y': point.y = value; break;
                  case 'z': point.z = value; break;
                  case 'rgb': point.rgb = value; break;
                  case 'r': point.r = value; break;
                  case 'g': point.g = value; break;
                  case 'b': point.b = value; break;
                  case 'intensity': point.intensity = value; break;
                  default: point[field] = value;
                }
              });
              
              sampledPoints.push(point);
              processedInChunk++;
            }

            currentPosition += chunkSize;
            
            // 如果这个块处理的点数很少，可能到了文件末尾
            if (processedInChunk < 10) break;
          }
          
          points = sampledPoints;
        } else {
          // 小文件：加载完整内容
          const fullContent = await StorageServiceManager.getFileContent(filePath);
          points = parseASCIIData(fullContent.content, pcdHeader);
        }
      }
      
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
  }, [filePath, parsePCDHeader, parseASCIIData, parseBinaryData, parseBinaryCompressedData, calculateStats, settings.maxPointsToRender, settings.colorMode, t]);

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

  // 相机控制
  const resetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current || !stats) return;
    
    cameraRef.current.up.set(0, 0, 1); // 确保相机上方向为Z轴
    const distance = stats.scale * 1.5;
    cameraRef.current.position.set(distance, distance, distance);
    controlsRef.current.target.set(stats.center.x, stats.center.y, stats.center.z);
    controlsRef.current.update();
  }, [stats]);

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
    guiContainer.style.zIndex = '100';
    guiContainer.style.fontSize = '12px';
    
    mountRef.current.appendChild(guiContainer);
    guiRef.current = gui;
    
    // 渲染设置文件夹
    const renderFolder = gui.addFolder('Render Settings');
    renderFolder.add(settings, 'pointSize', 0.5, 10, 0.5).name('Point Size').onChange(() => {
      if (pointsRef.current && pointsRef.current.material) {
        (pointsRef.current.material as THREE.PointsMaterial).size = settings.pointSize;
        (pointsRef.current.material as THREE.PointsMaterial).needsUpdate = true;
      }
    });
    
    renderFolder.add(settings, 'colorMode', ['rgb', 'intensity', 'height', 'uniform']).name('Color Mode').onChange(() => {
      // Re-initialize the scene to update colors
      if (pcdData && stats) {
        initializeThreeJS();
      }
    });
    
    renderFolder.addColor(settings, 'uniformColor').name('Uniform Color').onChange(() => {
      if (settings.colorMode === 'uniform' && pcdData && stats) {
        initializeThreeJS();
      }
    });
    
    renderFolder.add(settings, 'showAxes').name('Show Axes').onChange(() => {
      if (pcdData && stats) {
        initializeThreeJS();
      }
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
    
    // 性能设置文件夹
    const performanceFolder = gui.addFolder('Performance');
    performanceFolder.add(settings, 'maxPointsToRender', 1000, 500000, 1000).name('Max Points').onChange(() => {
      loadPCDFile(); // Reload with new limit
    });
    
    renderFolder.open();
    animationFolder.open();
    
    return gui;
  }, [settings, pcdData, stats, initializeThreeJS, loadPCDFile]);

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
      {/* 简化工具栏 - 只保留必要控件 */}
      <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowMetadata(!showMetadata)}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title={showMetadata ? t('pcd.hideMetadata', '隐藏元数据') : t('pcd.showMetadata', '显示元数据')}
          >
            <Info className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              if (guiRef.current) {
                guiRef.current.destroy();
                guiRef.current = null;
              } else {
                setupGUI();
              }
            }}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title={t('pcd.settings', '设置')}
          >
            <Settings className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />

          <button
            onClick={resetCamera}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title={t('pcd.resetView', '重置视图')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3D视图区域 - 全屏显示 */}
      <div 
        ref={mountRef} 
        className="flex-1 relative bg-gray-900"
        style={{ minHeight: '400px' }}
      >
        {/* 元数据覆盖层 */}
        {showMetadata && stats && (
          <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white p-4 rounded-lg z-20 max-w-xs">
            <h4 className="text-sm font-semibold mb-3 flex items-center">
              <Info className="w-4 h-4 mr-2" />
              {t('pcd.metadata', '点云元数据')}
            </h4>
            
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-300">{t('pcd.pointCount', '点数量')}:</span>
                <span className="font-mono text-white">{stats.pointCount.toLocaleString()}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-300">{t('pcd.hasColor', '包含颜色')}:</span>
                <span className="text-white">
                  {stats.hasColor ? t('common.yes', '是') : t('common.no', '否')}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-300">{t('pcd.hasIntensity', '包含强度')}:</span>
                <span className="text-white">
                  {stats.hasIntensity ? t('common.yes', '是') : t('common.no', '否')}
                </span>
              </div>
              
              <div className="pt-2 border-t border-gray-600">
                <div className="text-gray-300 mb-1">{t('pcd.bounds', '边界')}:</div>
                <div className="font-mono text-xs space-y-1 text-white">
                  <div>X: {stats.bounds.min.x.toFixed(3)} ~ {stats.bounds.max.x.toFixed(3)}</div>
                  <div>Y: {stats.bounds.min.y.toFixed(3)} ~ {stats.bounds.max.y.toFixed(3)}</div>
                  <div>Z: {stats.bounds.min.z.toFixed(3)} ~ {stats.bounds.max.z.toFixed(3)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 鼠标操作提示 */}
        <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded pointer-events-none z-10">
          {t('pcd.mouseHint', '鼠标拖拽旋转，滚轮缩放，右键平移')}
        </div>

        {/* 性能提示 */}
        {stats && stats.pointCount > settings.maxPointsToRender && (
          <div className="absolute bottom-4 left-4 bg-yellow-500 bg-opacity-90 text-black text-sm px-3 py-2 rounded-lg z-10">
            <div className="font-semibold">{t('pcd.performanceWarning', '性能提醒')}</div>
            <div className="text-xs mt-1">
              {t('pcd.pointsLimited', `仅显示前 ${settings.maxPointsToRender.toLocaleString()} 个点 (共 ${stats.pointCount.toLocaleString()} 个)`)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};