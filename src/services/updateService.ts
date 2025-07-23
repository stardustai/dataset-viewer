import { fetch } from '@tauri-apps/plugin-http';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { UpdateConfig, UpdateCheckResult, ReleaseInfo } from '../types';

const CONFIG_URL = 'https://raw.githubusercontent.com/stardustai/webdav-viewer/main/docs/config.json';

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
    if (!force && this.cachedResult && (now - this.lastCheckTime) < this.checkInterval) {
      return this.cachedResult;
    }

    try {
      // 获取当前版本
      const currentVersion = await getVersion();

      // 获取远程配置
      const response = await fetch(CONFIG_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch update config: ${response.status}`);
      }

      const config: UpdateConfig = await response.json();
      const latestVersion = config.version;

      // 比较版本
      const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0;

      let downloadInfo: ReleaseInfo | null = null;
      if (hasUpdate) {
        downloadInfo = await this.getDownloadInfo(config);
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
   * 获取当前平台的下载信息
   */
  private async getDownloadInfo(config: UpdateConfig): Promise<ReleaseInfo | null> {
    try {
      // 使用用户代理字符串和其他浏览器 API 检测平台
      const userAgent = navigator.userAgent.toLowerCase();
      const platform = navigator.platform.toLowerCase();

      let platformKey: keyof UpdateConfig['releases'];

      if (userAgent.includes('mac') || platform.includes('mac')) {
        // 检测 Apple Silicon：检查硬件并发数和特定的用户代理特征
        // 这是一个启发式方法，不是 100% 准确，但在大多数情况下有效
        const isLikelyAppleSilicon = navigator.hardwareConcurrency >= 8;
        platformKey = isLikelyAppleSilicon ? 'macos-arm64' : 'macos-x64';
      } else if (userAgent.includes('win') || platform.includes('win')) {
        platformKey = 'windows';
      } else if (userAgent.includes('linux') || platform.includes('linux')) {
        platformKey = 'linux';
      } else {
        // 默认使用第一个可用的平台
        const availablePlatforms = Object.keys(config.releases) as Array<keyof UpdateConfig['releases']>;
        const firstAvailable = availablePlatforms.find(key => config.releases[key] !== null);
        platformKey = firstAvailable || 'windows';
      }

      return config.releases[platformKey];
    } catch (error) {
      console.error('Failed to get platform info:', error);
      // 如果检测失败，尝试返回一个默认选项
      const availablePlatforms = Object.keys(config.releases) as Array<keyof UpdateConfig['releases']>;
      const firstAvailable = availablePlatforms.find(key => config.releases[key] !== null);
      return firstAvailable ? config.releases[firstAvailable] : null;
    }
  }  /**
   * 比较版本号
   * @param version1 版本1
   * @param version2 版本2
   * @returns 正数表示 version1 > version2，负数表示 version1 < version2，0表示相等
   */
  private compareVersions(version1: string, version2: string): number {
    const v1 = this.parseVersion(version1);
    const v2 = this.parseVersion(version2);

    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const num1 = v1[i] || 0;
      const num2 = v2[i] || 0;

      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }

    return 0;
  }

  /**
   * 解析版本号为数字数组
   */
  private parseVersion(version: string): number[] {
    return version
      .replace(/^v/, '') // 移除 v 前缀
      .split('.')
      .map(part => {
        const num = parseInt(part.replace(/\D/g, ''), 10);
        return isNaN(num) ? 0 : num;
      });
  }

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
    await openUrl('https://github.com/stardustai/webdav-viewer/releases/latest');
  }
}

export const updateService = new UpdateService();
export default updateService;
