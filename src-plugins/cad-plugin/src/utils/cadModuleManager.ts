/**
 * CAD 模块管理器
 * 负责预加载和缓存 CAD 相关模块，优化性能
 */

import { AcDbLibreDwgConverter } from '@mlightcad/libredwg-converter';
import { AcDbDatabaseConverterManager, AcDbFileType } from '@mlightcad/data-model';

type LoadingState = 'idle' | 'loading' | 'ready' | 'error';

interface ModuleCache {
  libredwgModule: any | null;
  converter: AcDbLibreDwgConverter | null;
  state: LoadingState;
  error: Error | null;
  lastAttempt: number | null;
}

class CADModuleManager {
  private static instance: CADModuleManager;
  private cache: ModuleCache = {
    libredwgModule: null,
    converter: null,
    state: 'idle',
    error: null,
    lastAttempt: null
  };

  private modulePromise: Promise<any> | null = null;
  private readonly RETRY_DELAY = 5000; // 5秒后可重试

  static getInstance(): CADModuleManager {
    if (!CADModuleManager.instance) {
      CADModuleManager.instance = new CADModuleManager();
    }
    return CADModuleManager.instance;
  }

  /**
   * 预加载 LibreDWG 模块
   */
  async preloadLibreDwgModule(): Promise<any> {
    // 如果已经成功加载，直接返回
    if (this.cache.state === 'ready' && this.cache.libredwgModule) {
      return this.cache.libredwgModule;
    }

    // 如果有错误且在重试延迟期内，抛出错误
    if (this.cache.state === 'error') {
      const now = Date.now();
      if (this.cache.lastAttempt && now - this.cache.lastAttempt < this.RETRY_DELAY) {
        throw this.cache.error;
      }
      // 超过重试延迟，重置状态允许重试
      this.cache.state = 'idle';
      this.cache.error = null;
    }

    // 如果正在加载，返回现有的Promise
    if (this.cache.state === 'loading' && this.modulePromise) {
      return this.modulePromise;
    }

    // 开始新的加载流程
    this.cache.state = 'loading';
    this.cache.error = null;
    this.cache.lastAttempt = Date.now();

    try {
      console.log('🔄 开始预加载 LibreDWG 模块...');

      this.modulePromise = import('@mlightcad/libredwg-web').then(async (instance) => {
        const module = await instance.createModule();
        this.cache.libredwgModule = module;
        this.cache.state = 'ready';
        console.log('✅ LibreDWG 模块预加载完成');
        return module;
      });

      return await this.modulePromise;
    } catch (error) {
      this.cache.error = error as Error;
      this.cache.state = 'error';
      this.modulePromise = null;
      console.error('❌ LibreDWG 模块预加载失败:', error);
      throw error;
    }
  }

  /**
   * 获取或创建 DWG 转换器
   */
  async getDwgConverter(): Promise<AcDbLibreDwgConverter> {
    if (this.cache.converter && this.cache.state === 'ready') {
      return this.cache.converter;
    }

    try {
      const module = await this.preloadLibreDwgModule();

      if (!this.cache.converter) {
        this.cache.converter = new AcDbLibreDwgConverter(module);

        // 注册转换器到数据库转换器管理器
        try {
          AcDbDatabaseConverterManager.instance.register(
            AcDbFileType.DWG,
            this.cache.converter as any // 类型兼容性处理
          );
          console.log('✅ DWG 转换器创建并注册成功');
        } catch (regError) {
          console.warn('⚠️ 转换器注册失败，但不影响使用:', regError);
        }
      }

      return this.cache.converter;
    } catch (error) {
      console.error('❌ 创建 DWG 转换器失败:', error);
      throw error;
    }
  }

  /**
   * 检查是否正在加载
   */
  isLoading(): boolean {
    return this.cache.state === 'loading';
  }

  /**
   * 获取当前状态
   */
  getState(): LoadingState {
    return this.cache.state;
  }

  /**
   * 获取错误信息
   */
  getError(): Error | null {
    return this.cache.error;
  }

  /**
   * 检查模块是否已准备就绪
   */
  isModuleReady(): boolean {
    return this.cache.state === 'ready' && !!this.cache.libredwgModule;
  }

  /**
   * 强制重试加载（忽略重试延迟）
   */
  async forceRetry(): Promise<any> {
    this.cache.state = 'idle';
    this.cache.error = null;
    this.cache.lastAttempt = null;
    this.modulePromise = null;
    return this.preloadLibreDwgModule();
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache = {
      libredwgModule: null,
      converter: null,
      state: 'idle',
      error: null,
      lastAttempt: null
    };
    this.modulePromise = null;
  }

  /**
   * 启动预加载（可在应用启动时调用）
   * 这是一个非阻塞的后台加载方法
   */
  startPreloading(): Promise<any> {
    // 如果已经在加载或已加载完成，不重复启动
    if (this.cache.state === 'loading' || this.cache.state === 'ready') {
      console.log('📦 CAD模块预加载已在进行中或已完成');
      return this.modulePromise || Promise.resolve(this.cache.libredwgModule);
    }

    console.log('🚀 启动CAD模块后台预加载...');

    // 异步预加载，不阻塞主线程
    const preloadPromise = this.preloadLibreDwgModule().catch((error) => {
      console.warn('⚠️ 背景预加载 LibreDWG 模块失败:', error);
      // 不抛出错误，让后续使用时再处理
    });

    return preloadPromise;
  }

  /**
   * 获取预加载进度信息
   */
  getLoadingProgress(): {
    state: LoadingState;
    ready: boolean;
    error: Error | null;
    canRetry: boolean;
  } {
    const now = Date.now();
    const canRetry = this.cache.state !== 'loading' &&
      (!this.cache.lastAttempt || now - this.cache.lastAttempt >= this.RETRY_DELAY);

    return {
      state: this.cache.state,
      ready: this.cache.state === 'ready',
      error: this.cache.error,
      canRetry
    };
  }
}

export const cadModuleManager = CADModuleManager.getInstance();
