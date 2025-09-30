/**
 * 默认插件关联存储服务
 * 管理用户选择的文件扩展名与插件的默认关联
 */

export interface PluginAssociation {
  extension: string; // 文件扩展名（如 ".dwg"）
  pluginId: string; // 默认插件ID
}

class DefaultPluginAssociationService {
  private readonly STORAGE_KEY = 'default-plugin-associations';

  /**
   * 获取所有默认插件关联
   */
  getAssociations(): Map<string, string> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PluginAssociation[];
        return new Map(parsed.map(item => [item.extension.toLowerCase(), item.pluginId]));
      }
    } catch (error) {
      console.warn('Failed to load plugin associations from localStorage:', error);
    }
    return new Map();
  }

  /**
   * 保存所有默认插件关联
   */
  private saveAssociations(associations: Map<string, string>): void {
    try {
      const array: PluginAssociation[] = Array.from(associations.entries()).map(
        ([extension, pluginId]) => ({
          extension,
          pluginId,
        })
      );
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(array));
      console.log('Plugin associations saved successfully');
    } catch (error) {
      console.error('Failed to save plugin associations to localStorage:', error);
    }
  }

  /**
   * 为文件扩展名设置默认插件
   */
  setDefaultPlugin(extension: string, pluginId: string): void {
    const associations = this.getAssociations();
    const normalizedExt = extension.toLowerCase();

    associations.set(normalizedExt, pluginId);
    this.saveAssociations(associations);

    console.log(`Set default plugin for ${normalizedExt}: ${pluginId}`);
  }

  /**
   * 获取文件扩展名的默认插件ID
   */
  getDefaultPlugin(extension: string): string | null {
    const associations = this.getAssociations();
    const normalizedExt = extension.toLowerCase();
    return associations.get(normalizedExt) || null;
  }

  /**
   * 移除文件扩展名的默认插件关联
   */
  removeDefaultPlugin(extension: string): void {
    const associations = this.getAssociations();
    const normalizedExt = extension.toLowerCase();

    if (associations.delete(normalizedExt)) {
      this.saveAssociations(associations);
      console.log(`Removed default plugin for ${normalizedExt}`);
    }
  }

  /**
   * 清除所有默认插件关联
   */
  clearAllAssociations(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('All plugin associations cleared');
    } catch (error) {
      console.error('Failed to clear plugin associations:', error);
    }
  }

  /**
   * 从文件名获取扩展名
   */
  getExtensionFromFilename(filename: string): string | null {
    const match = filename.match(/(\.[^.]+)$/);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * 根据文件名获取默认插件ID
   */
  getDefaultPluginForFile(filename: string): string | null {
    const extension = this.getExtensionFromFilename(filename);
    if (!extension) return null;
    return this.getDefaultPlugin(extension);
  }
}

// 导出单例实例
export const defaultPluginAssociationService = new DefaultPluginAssociationService();
