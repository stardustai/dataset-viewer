// 导航历史和滚动位置管理服务

interface ScrollPosition {
  scrollTop: number;
  scrollLeft: number;
  timestamp: number;
}

interface NavigationHistory {
  path: string;
  timestamp: number;
  scrollPosition?: ScrollPosition;
}

interface DirectoryCache {
  path: string;
  files: any[]; // WebDAVFile[]
  timestamp: number;
  lastAccess: number;
}

class NavigationHistoryService {
  private static instance: NavigationHistoryService;
  private readonly STORAGE_KEY = 'webdav_navigation_history';
  private readonly SCROLL_STORAGE_KEY = 'webdav_scroll_positions';
  private readonly CACHE_STORAGE_KEY = 'webdav_directory_cache';
  private readonly MAX_HISTORY_SIZE = 50;
  private readonly MAX_SCROLL_CACHE_SIZE = 100;
  private readonly MAX_DIRECTORY_CACHE_SIZE = 20; // 最多缓存20个目录
  private readonly CACHE_EXPIRY_TIME = 5 * 60 * 1000; // 5分钟过期

  static getInstance(): NavigationHistoryService {
    if (!NavigationHistoryService.instance) {
      NavigationHistoryService.instance = new NavigationHistoryService();
    }
    return NavigationHistoryService.instance;
  }

  /**
   * 记录用户访问的目录
   */
  addToHistory(path: string): void {
    try {
      const history = this.getHistory();
      const timestamp = Date.now();

      // 移除重复的路径（如果存在）
      const filteredHistory = history.filter(item => item.path !== path);

      // 添加新记录到开头
      const newHistory: NavigationHistory[] = [
        { path, timestamp },
        ...filteredHistory
      ].slice(0, this.MAX_HISTORY_SIZE);

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(newHistory));
    } catch (error) {
      console.warn('Failed to save navigation history:', error);
    }
  }

  /**
   * 获取导航历史
   */
  getHistory(): NavigationHistory[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];

      const history = JSON.parse(stored) as NavigationHistory[];
      // 验证数据格式
      return history.filter(item =>
        item &&
        typeof item.path === 'string' &&
        typeof item.timestamp === 'number'
      );
    } catch (error) {
      console.warn('Failed to load navigation history:', error);
      return [];
    }
  }

  /**
   * 获取最后访问的目录
   */
  getLastVisitedPath(): string {
    const history = this.getHistory();
    return history.length > 0 ? history[0].path : '';
  }

  /**
   * 清除导航历史
   */
  clearHistory(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear navigation history:', error);
    }
  }

  /**
   * 保存目录的滚动位置
   */
  saveScrollPosition(path: string, scrollTop: number, scrollLeft: number = 0): void {
    try {
      const scrollPositions = this.getScrollPositions();
      const timestamp = Date.now();

      scrollPositions[path] = {
        scrollTop,
        scrollLeft,
        timestamp
      };

      // 限制缓存大小，移除最旧的记录
      const entries = Object.entries(scrollPositions);
      if (entries.length > this.MAX_SCROLL_CACHE_SIZE) {
        // 按时间戳排序，保留最新的记录
        entries.sort(([, a], [, b]) => b.timestamp - a.timestamp);
        const limitedEntries = entries.slice(0, this.MAX_SCROLL_CACHE_SIZE);

        const newScrollPositions: Record<string, ScrollPosition> = {};
        limitedEntries.forEach(([key, value]) => {
          newScrollPositions[key] = value;
        });

        localStorage.setItem(this.SCROLL_STORAGE_KEY, JSON.stringify(newScrollPositions));
      } else {
        localStorage.setItem(this.SCROLL_STORAGE_KEY, JSON.stringify(scrollPositions));
      }
    } catch (error) {
      console.warn('Failed to save scroll position:', error);
    }
  }

  /**
   * 获取目录的滚动位置
   */
  getScrollPosition(path: string): ScrollPosition | null {
    try {
      const scrollPositions = this.getScrollPositions();
      const position = scrollPositions[path];

      if (!position) return null;

      // 检查记录是否过期（7天）
      const EXPIRY_TIME = 7 * 24 * 60 * 60 * 1000; // 7天
      if (Date.now() - position.timestamp > EXPIRY_TIME) {
        // 删除过期记录
        delete scrollPositions[path];
        localStorage.setItem(this.SCROLL_STORAGE_KEY, JSON.stringify(scrollPositions));
        return null;
      }

      return position;
    } catch (error) {
      console.warn('Failed to load scroll position:', error);
      return null;
    }
  }

  /**
   * 获取所有滚动位置
   */
  private getScrollPositions(): Record<string, ScrollPosition> {
    try {
      const stored = localStorage.getItem(this.SCROLL_STORAGE_KEY);
      if (!stored) return {};

      const positions = JSON.parse(stored);
      // 验证数据格式
      const validPositions: Record<string, ScrollPosition> = {};
      Object.entries(positions).forEach(([path, position]: [string, any]) => {
        if (
          position &&
          typeof position.scrollTop === 'number' &&
          typeof position.scrollLeft === 'number' &&
          typeof position.timestamp === 'number'
        ) {
          validPositions[path] = position;
        }
      });

      return validPositions;
    } catch (error) {
      console.warn('Failed to load scroll positions:', error);
      return {};
    }
  }

  /**
   * 清除滚动位置缓存
   */
  clearScrollPositions(): void {
    try {
      localStorage.removeItem(this.SCROLL_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear scroll positions:', error);
    }
  }

  /**
   * 清除特定路径的滚动位置
   */
  clearScrollPosition(path: string): void {
    try {
      const scrollPositions = this.getScrollPositions();
      delete scrollPositions[path];
      localStorage.setItem(this.SCROLL_STORAGE_KEY, JSON.stringify(scrollPositions));
    } catch (error) {
      console.warn('Failed to clear scroll position for path:', path, error);
    }
  }

  /**
   * 获取常用目录（按访问频率排序）
   */
  getFrequentDirectories(limit: number = 10): { path: string; count: number; lastVisit: number }[] {
    try {
      const history = this.getHistory();
      const pathCounts: Record<string, { count: number; lastVisit: number }> = {};

      // 统计访问频率
      history.forEach(item => {
        if (!pathCounts[item.path]) {
          pathCounts[item.path] = { count: 0, lastVisit: 0 };
        }
        pathCounts[item.path].count++;
        pathCounts[item.path].lastVisit = Math.max(pathCounts[item.path].lastVisit, item.timestamp);
      });

      // 转换为数组并排序
      return Object.entries(pathCounts)
        .map(([path, data]) => ({ path, ...data }))
        .sort((a, b) => {
          // 先按访问次数排序，再按最后访问时间排序
          if (a.count !== b.count) {
            return b.count - a.count;
          }
          return b.lastVisit - a.lastVisit;
        })
        .slice(0, limit);
    } catch (error) {
      console.warn('Failed to get frequent directories:', error);
      return [];
    }
  }

  /**
   * 缓存目录数据
   */
  cacheDirectory(path: string, files: any[]): void {
    try {
      const cache = this.getDirectoryCache();
      const timestamp = Date.now();

      cache[path] = {
        path,
        files,
        timestamp,
        lastAccess: timestamp
      };

      // 限制缓存大小，移除最旧的记录
      const entries = Object.entries(cache);
      if (entries.length > this.MAX_DIRECTORY_CACHE_SIZE) {
        // 按最后访问时间排序，保留最新的记录
        entries.sort(([, a], [, b]) => b.lastAccess - a.lastAccess);
        const limitedEntries = entries.slice(0, this.MAX_DIRECTORY_CACHE_SIZE);

        const newCache: Record<string, DirectoryCache> = {};
        limitedEntries.forEach(([key, value]) => {
          newCache[key] = value;
        });

        localStorage.setItem(this.CACHE_STORAGE_KEY, JSON.stringify(newCache));
      } else {
        localStorage.setItem(this.CACHE_STORAGE_KEY, JSON.stringify(cache));
      }
    } catch (error) {
      console.warn('Failed to cache directory:', error);
    }
  }

  /**
   * 获取缓存的目录数据
   */
  getCachedDirectory(path: string): any[] | null {
    try {
      const cache = this.getDirectoryCache();
      const cached = cache[path];

      if (!cached) return null;

      // 检查缓存是否过期
      if (Date.now() - cached.timestamp > this.CACHE_EXPIRY_TIME) {
        // 删除过期缓存
        delete cache[path];
        localStorage.setItem(this.CACHE_STORAGE_KEY, JSON.stringify(cache));
        return null;
      }

      // 更新最后访问时间
      cached.lastAccess = Date.now();
      cache[path] = cached;
      localStorage.setItem(this.CACHE_STORAGE_KEY, JSON.stringify(cache));

      return cached.files;
    } catch (error) {
      console.warn('Failed to get cached directory:', error);
      return null;
    }
  }

  /**
   * 获取目录缓存
   */
  private getDirectoryCache(): Record<string, DirectoryCache> {
    try {
      const stored = localStorage.getItem(this.CACHE_STORAGE_KEY);
      if (!stored) return {};

      const cache = JSON.parse(stored) as Record<string, DirectoryCache>;
      // 验证数据格式
      const validCache: Record<string, DirectoryCache> = {};
      Object.entries(cache).forEach(([key, value]) => {
        if (value &&
            typeof value.path === 'string' &&
            Array.isArray(value.files) &&
            typeof value.timestamp === 'number' &&
            typeof value.lastAccess === 'number') {
          validCache[key] = value;
        }
      });
      return validCache;
    } catch (error) {
      console.warn('Failed to load directory cache:', error);
      return {};
    }
  }

  /**
   * 清除目录缓存
   */
  clearDirectoryCache(): void {
    try {
      localStorage.removeItem(this.CACHE_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear directory cache:', error);
    }
  }

  /**
   * 清除特定路径的缓存
   */
  clearCachedDirectory(path: string): void {
    try {
      const cache = this.getDirectoryCache();
      delete cache[path];
      localStorage.setItem(this.CACHE_STORAGE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('Failed to clear cached directory:', error);
    }
  }
}

export const navigationHistoryService = NavigationHistoryService.getInstance();
