/**
 * CAD 模块管理器
 * 负责预加载和缓存 CAD 相关模块，优化性能
 */

import { AcDbLibreDwgConverter } from '@mlightcad/libredwg-converter';
import { AcDbDatabaseConverterManager, AcDbFileType } from '@mlightcad/data-model';

interface ModuleCache {
  libredwgModule: any | null;
  converter: AcDbLibreDwgConverter | null;
  isLoading: boolean;
  error: Error | null;
}

class CADModuleManager {
  private static instance: CADModuleManager;
  private cache: ModuleCache = {
    libredwgModule: null,
    converter: null,
    isLoading: false,
    error: null
  };

  private modulePromise: Promise<any> | null = null;

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
    if (this.cache.libredwgModule) {
      return this.cache.libredwgModule;
    }

    if (this.cache.error) {
      throw this.cache.error;
    }

    if (this.modulePromise) {
      return this.modulePromise;
    }

    this.cache.isLoading = true;
    this.cache.error = null;

    try {
      console.log('开始预加载 LibreDWG 模块...');

      this.modulePromise = import('@mlightcad/libredwg-web').then(async (instance) => {
        const module = await instance.createModule();
        this.cache.libredwgModule = module;
        this.cache.isLoading = false;
        console.log('LibreDWG 模块预加载完成');
        return module;
      });

      return await this.modulePromise;
    } catch (error) {
      this.cache.error = error as Error;
      this.cache.isLoading = false;
      this.modulePromise = null;
      console.error('LibreDWG 模块预加载失败:', error);
      throw error;
    }
  }

  /**
   * 获取或创建 DWG 转换器
   */
  async getDwgConverter(): Promise<AcDbLibreDwgConverter> {
    if (this.cache.converter) {
      return this.cache.converter;
    }

    try {
      const module = await this.preloadLibreDwgModule();
      this.cache.converter = new AcDbLibreDwgConverter(module);

      // 注册转换器
      AcDbDatabaseConverterManager.instance.register(
        AcDbFileType.DWG,
        this.cache.converter
      );

      console.log('DWG 转换器创建并注册成功');
      return this.cache.converter;
    } catch (error) {
      console.error('创建 DWG 转换器失败:', error);
      throw error;
    }
  }

  /**
   * 检查是否正在加载
   */
  isLoading(): boolean {
    return this.cache.isLoading;
  }

  /**
   * 获取错误信息
   */
  getError(): Error | null {
    return this.cache.error;
  }

  /**
   * 检查模块是否已预加载
   */
  isModuleReady(): boolean {
    return !!this.cache.libredwgModule && !this.cache.isLoading && !this.cache.error;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache = {
      libredwgModule: null,
      converter: null,
      isLoading: false,
      error: null
    };
    this.modulePromise = null;
  }

  /**
   * 启动预加载（可在应用启动时调用）
   */
  startPreloading(): void {
    // 异步预加载，不阻塞主线程
    this.preloadLibreDwgModule().catch((error) => {
      console.warn('背景预加载 LibreDWG 模块失败:', error);
    });
  }
}

export const cadModuleManager = CADModuleManager.getInstance();
