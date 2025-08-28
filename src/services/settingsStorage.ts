/**
 * 应用设置持久化存储服务
 * 管理用户偏好设置和应用配置
 */

export interface AppSettings {
  // 自动更新检查设置
  autoCheckUpdates: boolean;
  // 主题设置
  theme: 'light' | 'dark' | 'system';
  // 是否使用纯黑色背景
  usePureBlackBg: boolean;
  // 语言设置
  language: 'zh' | 'en';
  // 其他设置可以在这里添加
  // autoSave?: boolean;
}

class SettingsStorageService {
  private readonly STORAGE_KEY = 'app-settings';

  // 默认设置
  private readonly defaultSettings: AppSettings = {
    autoCheckUpdates: true,
    theme: 'system',
    usePureBlackBg: false,
    language: 'zh',
  };

  /**
   * 获取所有设置
   */
  getSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsedSettings = JSON.parse(stored);
        // 合并默认设置，确保新增的设置项有默认值
        return { ...this.defaultSettings, ...parsedSettings };
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
    }

    return this.defaultSettings;
  }

  /**
   * 保存所有设置
   */
  saveSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
      console.log('Settings saved successfully:', settings);
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }

  /**
   * 更新单个设置
   */
  updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    const currentSettings = this.getSettings();
    const updatedSettings = { ...currentSettings, [key]: value };
    this.saveSettings(updatedSettings);
  }

  /**
   * 获取单个设置值
   */
  getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    const settings = this.getSettings();
    return settings[key];
  }

  /**
   * 重置设置为默认值
   */
  resetSettings(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('Settings reset to defaults');
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  }

  /**
   * 清除所有设置（用于清理缓存时）
   */
  clearSettings(): void {
    this.resetSettings();
  }
}

// 导出单例实例
export const settingsStorage = new SettingsStorageService();
