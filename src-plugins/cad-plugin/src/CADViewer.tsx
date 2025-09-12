import { useRef, useEffect, useState, useCallback, FC } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { AcApDocManager, AcApSettingManager } from '@mlightcad/cad-simple-viewer';
import { AcDbOpenDatabaseOptions } from '@mlightcad/data-model';
import { cadModuleManager } from './utils/cadModuleManager';
import { PluginViewerProps } from './plugin-types';

interface CADViewerState {
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  loadedFileKey: string | null;
  loadingProgress: number;
  loadingStage: string;
}

export const CADViewer: FC<PluginViewerProps> = ({
  file,
  content,
  fileAccessor,
  isLargeFile,
  onError,
  t
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<CADViewerState>({
    isLoading: false,
    error: null,
    isInitialized: false,
    loadedFileKey: null,
    loadingProgress: 0,
    loadingStage: 'Initializing...'
  });

  // 基于 mlight-lee/cad-viewer 的高DPI设置方法
  const setupHighDPICanvas = (canvas: HTMLCanvasElement) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    // 限制设备像素比，避免过高的内存消耗 (参考 mlight-lee 项目)
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    // 设置CSS显示尺寸
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    // 设置实际画布分辨率 (高DPI支持)
    canvas.width = rect.width * pixelRatio;
    canvas.height = rect.height * pixelRatio;

    console.log('High DPI Canvas setup (mlight-lee style):', {
      displaySize: { width: rect.width, height: rect.height },
      canvasSize: { width: canvas.width, height: canvas.height },
      devicePixelRatio: window.devicePixelRatio,
      usedPixelRatio: pixelRatio
    });
  };

  // 优化的转换器注册
  const registerConverters = async () => {
    try {
      setState(prev => ({
        ...prev,
        loadingStage: 'Loading DWG converter...',
        loadingProgress: 10
      }));

      // 调用 cadModuleManager 的获取转换器方法
      await cadModuleManager.getDwgConverter();

      setState(prev => ({
        ...prev,
        loadingProgress: 30
      }));

      console.log('CAD converters initialized successfully');
    } catch (error) {
      console.warn('Failed to initialize CAD converters:', error);
    }
  };

  // 初始化 CAD 查看器
  const initializeViewer = useCallback(async () => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      console.log('Container not ready, waiting...');
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        loadingStage: 'Initializing viewer...',
        loadingProgress: 0
      }));

      // 设置高DPI画布尺寸
      setupHighDPICanvas(canvas);

      setState(prev => ({
        ...prev,
        loadingProgress: 5
      }));

      // 注册转换器
      await registerConverters();

      setState(prev => ({
        ...prev,
        loadingStage: 'Creating document manager...',
        loadingProgress: 40
      }));

      // 创建文档管理器实例
      AcApDocManager.createInstance(canvas);

      // 尝试设置渲染器的像素比（如果可以访问到内部渲染器）
      try {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const docMgr = AcApDocManager.instance as any;

        if (docMgr?.currentView?.renderer?.internalRenderer) {
          docMgr.currentView.renderer.internalRenderer.setPixelRatio(pixelRatio);
          console.log(`Set WebGL renderer pixel ratio to ${pixelRatio}`);
        }
      } catch (error) {
        console.warn('Could not set renderer pixel ratio:', error);
      }

      setState(prev => ({
        ...prev,
        loadingStage: 'Loading default fonts...',
        loadingProgress: 60
      }));

      // 加载默认字体
      await AcApDocManager.instance.loadDefaultFonts();

      setState(prev => ({
        ...prev,
        loadingStage: 'Configuring settings...',
        loadingProgress: 80
      }));

      // 配置设置
      if (AcApSettingManager.instance) {
        AcApSettingManager.instance.isShowCommandLine = false;
        AcApSettingManager.instance.isShowToolbar = false;
        AcApSettingManager.instance.isShowStats = false;
        AcApSettingManager.instance.isShowCoordinate = true;
      }

      setState(prev => ({
        ...prev,
        isInitialized: true,
        isLoading: false,
        loadingProgress: 100,
        loadingStage: 'Ready'
      }));

      console.log('CAD Simple Viewer initialized successfully');
    } catch (error) {
      const errorMsg = t?.('cad.initError') || 'CAD viewer initialization failed';
      setState(prev => ({
        ...prev,
        error: errorMsg,
        isLoading: false,
        loadingProgress: 0,
        loadingStage: 'Error'
      }));
      onError?.((error as Error).message);
      console.error('Failed to initialize CAD viewer:', error);
    }
  }, []);

  // 读取文件内容
  const readFileContent = async (fileData: ArrayBuffer | string): Promise<string | ArrayBuffer> => {
    if (typeof fileData === 'string') {
      return fileData;
    }

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.dxf')) {
      try {
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(fileData);
      } catch (error) {
        // 尝试其他常见编码
        console.warn('UTF-8 decoding failed, trying GBK...', error);
        try {
          const decoder = new TextDecoder('gbk');
          return decoder.decode(fileData);
        } catch (gbkError) {
          console.warn('GBK decoding failed, trying GB2312...', gbkError);
          try {
            const decoder = new TextDecoder('gb2312');
            return decoder.decode(fileData);
          } catch (gb2312Error) {
            console.error('All encoding attempts failed, using UTF-8 with replacement', gb2312Error);
            const decoder = new TextDecoder('utf-8', { fatal: false });
            return decoder.decode(fileData);
          }
        }
      }
    } else if (fileName.endsWith('.dwg')) {
      return fileData;
    }

    throw new Error(t?.('cad.unsupportedFile') || 'Unsupported file type');
  };

  // 加载 CAD 文件
  const loadFile = useCallback(async () => {
    if (!AcApDocManager.instance) {
      return;
    }

    // 计算当前文件的去重键
    const currentFileKey = `${file.path}:${file.size}`;
    
    // 如果已经加载了相同的文件，跳过
    if (state.loadedFileKey === currentFileKey) {
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        loadingStage: 'Preparing file...',
        loadingProgress: 0
      }));

      // 验证文件类型
      const fileName = file.name.toLowerCase();
      const supportedExtensions = ['.dxf', '.dwg', '.step', '.stp', '.iges', '.igs'];
      const isSupported = supportedExtensions.some(ext => fileName.endsWith(ext));
      if (!isSupported) {
        throw new Error(t?.('cad.unsupportedFile') || 'Unsupported file type');
      }

      setState(prev => ({
        ...prev,
        loadingStage: 'Loading file content...',
        loadingProgress: 20
      }));

      // 优先使用传入的 content，没有则自己获取
      let fileContent: string | ArrayBuffer;

      if (content) {
        if (typeof content === 'string') {
          fileContent = content;
        } else if (content instanceof ArrayBuffer) {
          fileContent = await readFileContent(content);
        } else {
          const arrayBuffer = await fileAccessor.getFullContent();
          fileContent = await readFileContent(arrayBuffer);
        }
      } else {
        const arrayBuffer = await fileAccessor.getFullContent();
        fileContent = await readFileContent(arrayBuffer);
      }

      setState(prev => ({
        ...prev,
        loadingStage: 'Parsing CAD data...',
        loadingProgress: 60
      }));

      // 设置数据库选项
      const options: AcDbOpenDatabaseOptions = {
        minimumChunkSize: isLargeFile ? 5000 : 1000,
        readOnly: true
      };

      setState(prev => ({
        ...prev,
        loadingStage: 'Rendering drawing...',
        loadingProgress: 80
      }));

      // 打开文档
      const success = await AcApDocManager.instance.openDocument(
        file.name,
        fileContent,
        options
      );

      if (success) {
        setState(prev => ({
          ...prev,
          loadedFileKey: currentFileKey,
          error: null,
          isLoading: false,
          loadingProgress: 100,
          loadingStage: 'Complete'
        }));
        console.log(`Successfully loaded: ${file.name}`);

        // 等待一帧后启用平移模式和缩放适应
        requestAnimationFrame(() => {
          enablePanMode();

          // 执行缩放适应命令
          if (AcApDocManager.instance) {
            AcApDocManager.instance.sendStringToExecute('zoom e');
            console.log('Zoom extents applied');
          }
        });
      } else {
        throw new Error(`Failed to load: ${file.name}`);
      }
    } catch (error) {
      const errorMsg = t?.('cad.loadError', { error: (error as Error).message }) || `Failed to load: ${(error as Error).message}`;
      setState(prev => ({
        ...prev,
        error: errorMsg,
        isLoading: false,
        loadingProgress: 0,
        loadingStage: 'Error'
      }));
      onError?.((error as Error).message);
      console.error('Error loading CAD file:', error);
    }
  }, [file.name, file.path, file.size, content, fileAccessor, isLargeFile, state.loadedFileKey]); // 添加必要的依赖

  // 设置平移模式 - 基于 mlight-lee 官方实现
  const enablePanMode = () => {
    try {
      if (AcApDocManager.instance && state.loadedFileKey) {
        console.log('Enabling pan mode...');

        // 执行官方 pan 命令
        AcApDocManager.instance.sendStringToExecute('pan');

        // 直接设置视图模式为 PAN
        const docMgr = AcApDocManager.instance as any;
        const currentView = docMgr?.currentView || docMgr?.curView || docMgr?.activeView;

        if (currentView) {
          currentView.mode = 1; // AcEdViewMode.PAN = 1
          console.log('Pan mode enabled successfully');
        }
      }
    } catch (error) {
      console.warn('Failed to enable pan mode:', error);
    }
  };

  // 初始化
  useEffect(() => {
    if (!canvasRef.current) return;

    const timeoutId = setTimeout(() => initializeViewer(), 100);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    // 计算当前文件的去重键
    const currentFileKey = `${file.path}:${file.size}`;
    
    // 当初始化完成、不在加载中、且文件键不同时，加载文件
    if (state.isInitialized && !state.isLoading && state.loadedFileKey !== currentFileKey) {
      loadFile();
    }
  }, [state.isInitialized, state.isLoading, file.path, file.size, loadFile]);

  useEffect(() => {
    if (state.loadedFileKey) {
      // 延迟配置，确保 CAD 系统完全初始化
      const configureControls = () => {
        try {
          const docMgr = AcApDocManager.instance as any;
          const currentView = docMgr?.currentView || docMgr?.curView || docMgr?.activeView;

          if (currentView) {
            // 设置视图模式为 PAN
            currentView.mode = 1; // AcEdViewMode.PAN = 1

            // 配置相机控制器支持左键拖拽
            const controls = currentView.cameraControls || currentView._cameraControls;
            if (controls) {
              controls.enableDamping = false;
              controls.autoRotate = false;
              controls.enableRotate = false;
              controls.zoomSpeed = 5;
              controls.mouseButtons = { LEFT: 2 }; // THREE.MOUSE.PAN
              controls.update();
              console.log('Camera controls configured for PAN mode');
              return true;
            }
          }
          return false;
        } catch (error) {
          console.warn('Could not configure camera controls:', error);
          return false;
        }
      };

      // 立即尝试，失败则延迟重试
      if (!configureControls()) {
        const retryTimeouts = [100, 500, 1000, 2000];
        retryTimeouts.forEach((delay) => {
          setTimeout(() => {
            if (configureControls()) {
              console.log(`Pan mode configured after ${delay}ms delay`);
            }
          }, delay);
        });
      }
    }
  }, [state.loadedFileKey]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || !state.isInitialized) return;

    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        setupHighDPICanvas(canvas);
        console.log('Canvas resized with high DPI support');
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [state.isInitialized]);

  // 渲染错误状态
  if (state.error) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-8"
      >
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          {t?.('cad.loadFailedTitle') || 'CAD File Loading Failed'}
        </h3>
        <p className="text-gray-600 dark:text-gray-400 text-center max-w-md">
          {state.error}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      style={{ minHeight: '400px' }}
    >
      {/* 增强的加载指示器 */}
      {state.isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-20">
          <div className="flex flex-col items-center p-8 bg-white dark:bg-gray-800 rounded-xl shadow-2xl min-w-80">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t?.('cad.loading') || 'Loading CAD file...'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
              {state.loadingStage}
            </p>

            {/* 进度条 */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${state.loadingProgress}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {state.loadingProgress}%
            </div>
          </div>
        </div>
      )}

      {/* CAD 画布 */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{
          background: '#2c2c2c', // CAD软件标准深色背景
          cursor: state.isLoading ? 'wait' : 'grab',
          touchAction: 'none', // 防止移动端滚动干扰
          userSelect: 'none', // 禁用文本选择
          WebkitUserSelect: 'none', // Safari
          MozUserSelect: 'none', // Firefox
          msUserSelect: 'none', // IE/Edge
          outline: 'none' // 移除焦点轮廓
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();

          if (e.target instanceof HTMLCanvasElement) {
            if (e.button === 0 || e.button === 1) { // 左键或中键
              e.target.style.cursor = 'grabbing';
            }
          }
        }}
        onMouseUp={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.target instanceof HTMLCanvasElement) {
            e.target.style.cursor = 'grab';
          }
        }}
        onMouseMove={(e) => {
          if (e.buttons > 0 && e.target instanceof HTMLCanvasElement) {
            e.target.style.cursor = 'grabbing';
          }
        }}
        onMouseLeave={(e) => {
          if (e.target instanceof HTMLCanvasElement) {
            e.target.style.cursor = 'grab';
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        tabIndex={0}
      />
    </div>
  );
};
