import { useRef, useEffect, useState, useCallback } from 'react';
import type { FC, RefObject } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { AcApDocManager, AcApSettingManager } from '@mlightcad/cad-simple-viewer';
import { AcDbOpenDatabaseOptions } from '@mlightcad/data-model';
import { cadModuleManager } from './utils/cadModuleManager';
import { PluginViewerProps } from '@dataset-viewer/sdk';

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
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

  // 等待容器准备就绪的辅助函数
  const waitForContainerReady = (ref: RefObject<HTMLDivElement | null>) =>
    new Promise<void>((resolve) => {
      const ready = () => ref.current && ref.current.offsetWidth > 0 && ref.current.offsetHeight > 0;
      if (ready()) return resolve();

      const ro = new ResizeObserver(() => {
        if (ready()) {
          ro.disconnect();
          resolve();
        }
      });

      if (ref.current) ro.observe(ref.current);

      // 兜底超时，避免卡死
      setTimeout(() => {
        ro.disconnect();
        resolve();
      }, 2000);
    });

  // 初始化步骤1: 设置画布
  const initializeCanvas = async () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      throw new Error('Canvas or container not available');
    }

    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      console.log('Container not ready, waiting for ResizeObserver...');
      await waitForContainerReady(containerRef);
    }

    setupHighDPICanvas(canvas);
    return { canvas, container };
  };

  // 初始化步骤2: 准备CAD模块
  const prepareCADModules = async () => {
    setState(prev => ({
      ...prev,
      loadingStage: 'Preparing CAD modules...',
      loadingProgress: 20
    }));

    // 获取DWG转换器（这会触发模块加载如果还没完成）
    await cadModuleManager.getDwgConverter();

    setState(prev => ({
      ...prev,
      loadingProgress: 40
    }));
  };

  // 初始化步骤3: 创建文档管理器
  const initializeDocumentManager = (canvas: HTMLCanvasElement) => {
    setState(prev => ({
      ...prev,
      loadingStage: 'Creating document manager...',
      loadingProgress: 60
    }));

    // 创建文档管理器实例
    AcApDocManager.createInstance(canvas);

    // 尝试设置渲染器的像素比
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
      loadingProgress: 70
    }));
  };

  // 初始化步骤4: 加载字体和配置
  const configureViewer = async () => {
    setState(prev => ({
      ...prev,
      loadingStage: 'Loading fonts and configuring...',
      loadingProgress: 80
    }));

    // 加载默认字体
    await AcApDocManager.instance.loadDefaultFonts();

    // 配置设置
    if (AcApSettingManager.instance) {
      AcApSettingManager.instance.isShowCommandLine = false;
      AcApSettingManager.instance.isShowToolbar = false;
      AcApSettingManager.instance.isShowStats = false;
      AcApSettingManager.instance.isShowCoordinate = true;
    }

    setState(prev => ({
      ...prev,
      loadingProgress: 100
    }));
  };

  // 主初始化方法 - 清晰的步骤序列
  const initializeViewer = useCallback(async () => {
    try {
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        loadingStage: 'Starting initialization...',
        loadingProgress: 0
      }));

      // 步骤1: 初始化画布
      const { canvas } = await initializeCanvas();

      setState(prev => ({
        ...prev,
        loadingProgress: 10
      }));

      // 步骤2: 准备CAD模块
      await prepareCADModules();

      // 步骤3: 创建文档管理器
      initializeDocumentManager(canvas);

      // 步骤4: 配置查看器
      await configureViewer();

      // 完成初始化
      setState(prev => ({
        ...prev,
        isInitialized: true,
        isLoading: false,
        loadingStage: 'Ready'
      }));

      console.log('✅ CAD Simple Viewer initialized successfully');
    } catch (error) {
      const errorMsg = t('cad.initError') || 'CAD viewer initialization failed';
      setState(prev => ({
        ...prev,
        error: errorMsg,
        isLoading: false,
        loadingProgress: 0,
        loadingStage: 'Error'
      }));
      onError?.((error as Error).message);
      console.error('❌ Failed to initialize CAD viewer:', error);
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
        // 先用严格 UTF-8，非法序列才抛错
        return new TextDecoder('utf-8', { fatal: true }).decode(fileData);
      } catch (utf8Err) {
        try {
          // 首选标准的中文编码全集
          return new TextDecoder('gb18030').decode(fileData);
        } catch {
          try {
            return new TextDecoder('gbk').decode(fileData);
          } catch {
            console.error('All encoding attempts failed, using UTF-8 (replacement)');
            return new TextDecoder('utf-8').decode(fileData);
          }
        }
      }
    } else if (fileName.endsWith('.dwg')) {
      // DWG 文件使用二进制格式
      return fileData;
    }

    throw new Error(t('cad.unsupportedFile') || 'Unsupported file type');
  };

  // 加载 CAD 文件 - 简化的逻辑
  const loadFile = useCallback(async () => {
    // 基础检查
    if (!AcApDocManager.instance) {
      console.warn('Document manager not ready yet');
      return;
    }

    // 计算当前文件的唯一标识
    const currentFileKey = `${file.path}:${file.size}`;

    // 避免重复加载相同文件
    if (state.loadedFileKey === currentFileKey) {
      console.log('File already loaded, skipping');
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        loadingStage: 'Validating file...',
        loadingProgress: 0
      }));

      // 验证文件类型
      const fileName = file.name.toLowerCase();
      const supportedExtensions = ['.dxf', '.dwg'];
      const isSupported = supportedExtensions.some(ext => fileName.endsWith(ext));

      if (!isSupported) {
        throw new Error(t('cad.unsupportedFile') || 'Unsupported file type');
      }

      setState(prev => ({
        ...prev,
        loadingStage: 'Reading file content...',
        loadingProgress: 20
      }));

      // 读取文件内容
      let fileContent: string | ArrayBuffer;
      if (content) {
        fileContent = typeof content === 'string' ? content : await readFileContent(content);
      } else {
        const arrayBuffer = await fileAccessor.getFullContent();
        fileContent = await readFileContent(arrayBuffer);
      }

      setState(prev => ({
        ...prev,
        loadingStage: 'Opening CAD document...',
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

      if (!success) {
        throw new Error(`Failed to open document: ${file.name}`);
      }

      // 成功加载
      setState(prev => ({
        ...prev,
        loadedFileKey: currentFileKey,
        error: null,
        isLoading: false,
        loadingProgress: 100,
        loadingStage: 'Complete'
      }));

      console.log(`✅ Successfully loaded: ${file.name}`);

      // 设置视图控制
      requestAnimationFrame(() => {
        enablePanMode();
        // 执行缩放适应命令
        if (AcApDocManager.instance) {
          AcApDocManager.instance.sendStringToExecute('zoom e');
          console.log('Zoom extents applied');
        }
      });

    } catch (error) {
      const errorMsg = t('cad.loadError', { error: (error as Error).message }) ||
        `Failed to load: ${(error as Error).message}`;

      setState(prev => ({
        ...prev,
        error: errorMsg,
        isLoading: false,
        loadingProgress: 0,
        loadingStage: 'Error'
      }));

      onError?.((error as Error).message);
      console.error('❌ Error loading CAD file:', error);
    }
  }, [file.name, file.path, file.size, content, fileAccessor, isLargeFile, state.loadedFileKey, t, onError]);

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

  // 初始化effect - 只在组件挂载时运行
  useEffect(() => {
    if (!canvasRef.current) return;

    const timeoutId = setTimeout(() => {
      initializeViewer().catch(error => {
        console.error('Viewer initialization failed:', error);
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, []); // 只依赖组件挂载

  // 文件加载effect - 当初始化完成且文件信息变化时运行
  useEffect(() => {
    const currentFileKey = `${file.path}:${file.size}`;

    if (state.isInitialized &&
        !state.isLoading &&
        state.loadedFileKey !== currentFileKey) {
      loadFile().catch(error => {
        console.error('File loading failed:', error);
      });
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
        const timers: NodeJS.Timeout[] = [];
        retryTimeouts.forEach((delay) => {
          const timer = setTimeout(() => {
            if (configureControls()) {
              console.log(`Pan mode configured after ${delay}ms delay`);
              // 清理剩余的计时器
              timers.forEach(t => t !== timer && clearTimeout(t));
            }
          }, delay);
          timers.push(timer);
        });

        // 返回清理函数，直接清理本次创建的timers
        return () => {
          timers.forEach(timer => clearTimeout(timer));
        };
      }
    }
  }, [state.loadedFileKey]); // 移除 retryTimers 依赖，避免无限循环

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
          {t('cad.loadFailedTitle') || 'CAD File Loading Failed'}
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
          <div className="flex flex-col items-center p-8 bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-96 max-w-sm">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2 text-center">
              {t('cad.loading') || 'Loading CAD file...'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center h-10 flex items-center justify-center">
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
