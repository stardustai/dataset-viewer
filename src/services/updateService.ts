import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import * as semver from 'semver';
import type { ReleaseInfo, UpdateCheckResult } from '../types';

const GITHUB_API_URL = 'https://api.github.com/repos/stardustai/dataset-viewer/releases/latest';

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  assets: GitHubAsset[];
  html_url: string;
}

class UpdateService {
  private lastCheckTime: number = 0;
  private checkInterval: number = 24 * 60 * 60 * 1000; // 24 小时
  private cachedResult: UpdateCheckResult | null = null;

  /**
   * 检查是否有可用更新
   */
  async checkForUpdates(force: boolean = false): Promise<UpdateCheckResult> {
    const now = Date.now();

    // 如果不是强制检查且在检查间隔内，返回缓存结果
    if (!force && this.cachedResult && now - this.lastCheckTime < this.checkInterval) {
      return this.cachedResult;
    }

    try {
      // 获取当前版本
      const currentVersion = await getVersion();

      // 获取 GitHub 最新发布信息
      const response = await fetch(GITHUB_API_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch GitHub release info: ${response.status}`);
      }

      const release: GitHubRelease = await response.json();
      const latestVersion = release.tag_name.replace(/^v/, ''); // 移除 v 前缀

      // 比较版本 - 使用 semver 库正确处理语义化版本号
      let hasUpdate = false;
      try {
        // 验证版本号格式并比较
        if (semver.valid(latestVersion) && semver.valid(currentVersion)) {
          hasUpdate = semver.gt(latestVersion, currentVersion);
        } else {
          // 如果版本号格式不标准，尝试清理后再比较
          const cleanLatest = semver.coerce(latestVersion);
          const cleanCurrent = semver.coerce(currentVersion);
          if (cleanLatest && cleanCurrent) {
            hasUpdate = semver.gt(cleanLatest, cleanCurrent);
          }
        }
      } catch (error) {
        console.warn('Failed to compare versions with semver, using fallback:', error);
        // 回退到简单的字符串比较
        hasUpdate = latestVersion !== currentVersion;
      }

      let downloadInfo: ReleaseInfo | null = null;
      if (hasUpdate) {
        downloadInfo = this.getDownloadInfoFromAssets(release.assets);
      }

      const result: UpdateCheckResult = {
        hasUpdate,
        currentVersion,
        latestVersion,
        downloadUrl: downloadInfo?.downloadUrl,
        filename: downloadInfo?.filename,
        fileSize: downloadInfo?.fileSize,
      };

      this.cachedResult = result;
      this.lastCheckTime = now;

      return result;
    } catch (error) {
      console.error('Failed to check for updates:', error);

      // 返回默认结果
      const currentVersion = await getVersion().catch(() => '0.0.0');
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
      };
    }
  }

  /**
   * 从 GitHub Assets 中获取当前平台的下载信息
   */
  private getDownloadInfoFromAssets(assets: GitHubAsset[]): ReleaseInfo | null {
    try {
      // 使用用户代理字符串和其他浏览器 API 检测平台
      const userAgent = navigator.userAgent.toLowerCase();
      const platform = navigator.platform.toLowerCase();

      let platformPatterns: string[];

      if (userAgent.includes('mac') || platform.includes('mac')) {
        // 检测 Apple Silicon：检查硬件并发数和特定的用户代理特征
        // 这是一个启发式方法，不是 100% 准确，但在大多数情况下有效
        const isLikelyAppleSilicon = navigator.hardwareConcurrency >= 8;
        if (isLikelyAppleSilicon) {
          platformPatterns = ['arm64', 'aarch64', 'universal'];
        } else {
          platformPatterns = ['x64', 'x86_64', 'intel', 'universal'];
        }
      } else if (userAgent.includes('win') || platform.includes('win')) {
        platformPatterns = ['windows', 'win', 'x64', 'x86_64'];
      } else if (userAgent.includes('linux') || platform.includes('linux')) {
        platformPatterns = ['linux', 'x64', 'x86_64'];
      } else {
        // 默认尝试通用的模式
        platformPatterns = ['x64', 'x86_64', 'universal'];
      }

      // 查找匹配的 asset
      for (const pattern of platformPatterns) {
        const asset = assets.find(
          asset =>
            asset.name.toLowerCase().includes(pattern.toLowerCase()) &&
            (asset.name.endsWith('.dmg') ||
              asset.name.endsWith('.exe') ||
              asset.name.endsWith('.AppImage') ||
              asset.name.endsWith('.deb') ||
              asset.name.endsWith('.rpm') ||
              asset.name.endsWith('.tar.gz'))
        );

        if (asset) {
          return {
            downloadUrl: asset.browser_download_url,
            filename: asset.name,
            fileSize: this.formatFileSize(asset.size),
          };
        }
      }

      // 如果没有找到匹配的，返回第一个可执行文件
      const fallbackAsset = assets.find(
        asset =>
          asset.name.endsWith('.dmg') ||
          asset.name.endsWith('.exe') ||
          asset.name.endsWith('.AppImage') ||
          asset.name.endsWith('.deb') ||
          asset.name.endsWith('.rpm') ||
          asset.name.endsWith('.tar.gz')
      );

      if (fallbackAsset) {
        return {
          downloadUrl: fallbackAsset.browser_download_url,
          filename: fallbackAsset.name,
          fileSize: this.formatFileSize(fallbackAsset.size),
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to get platform info from assets:', error);
      return null;
    }
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  // 版本比较逻辑已迁移到使用 semver 库，无需自定义实现

  /**
   * 设置检查间隔
   */
  setCheckInterval(intervalMs: number): void {
    this.checkInterval = intervalMs;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedResult = null;
    this.lastCheckTime = 0;
  }

  /**
   * 打开下载页面
   */
  async openDownloadPage(): Promise<void> {
    await openUrl('https://stardustai.github.io/dataset-viewer');
  }
}

export const updateService = new UpdateService();
