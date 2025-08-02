// 安卓返回按钮处理服务
import { listen } from '@tauri-apps/api/event';
import { platform } from '@tauri-apps/plugin-os';

type BackHandler = () => boolean | Promise<boolean>;

class AndroidBackHandlerService {
  private static instance: AndroidBackHandlerService;
  private handlers: BackHandler[] = [];
  private isListening = false;

  static getInstance(): AndroidBackHandlerService {
    if (!AndroidBackHandlerService.instance) {
      AndroidBackHandlerService.instance = new AndroidBackHandlerService();
    }
    return AndroidBackHandlerService.instance;
  }

  /**
   * 初始化安卓返回按钮监听
   */
  async initialize(): Promise<void> {
    if (this.isListening) return;

    try {
      // 监听来自 Tauri 后端的安卓返回按钮事件
      await listen('android-back-button', async () => {
        await this.handleBackButton();
      });
      
      this.isListening = true;
      console.log('Android back button handler initialized');
    } catch (error) {
      console.error('Failed to initialize Android back button handler:', error);
    }
  }

  /**
   * 添加返回按钮处理器
   * @param handler 返回按钮处理函数，返回 true 表示已处理，false 表示继续传递
   */
  addHandler(handler: BackHandler): void {
    this.handlers.push(handler);
  }

  /**
   * 移除返回按钮处理器
   */
  removeHandler(handler: BackHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index > -1) {
      this.handlers.splice(index, 1);
    }
  }

  /**
   * 清除所有处理器
   */
  clearHandlers(): void {
    this.handlers = [];
  }

  /**
   * 处理返回按钮事件
   */
  private async handleBackButton(): Promise<void> {
    // 从最后添加的处理器开始执行（栈式处理）
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      const handler = this.handlers[i];
      try {
        const handled = await handler();
        if (handled) {
          // 如果处理器返回 true，停止传递事件
          return;
        }
      } catch (error) {
        console.error('Error in back button handler:', error);
      }
    }

    // 如果没有处理器处理事件，执行默认行为（退出应用）
    this.exitApp();
  }

  /**
   * 退出应用
   */
  private async exitApp(): Promise<void> {
    try {
      // 在 Tauri 中退出应用
      const { exit } = await import('@tauri-apps/plugin-process');
      await exit(0);
    } catch (error) {
      console.error('Failed to exit app:', error);
      // 备用方案：关闭窗口
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const window = getCurrentWindow();
        await window.close();
      } catch (closeError) {
        console.error('Failed to close window:', closeError);
      }
    }
  }

  /**
   * 检查是否在安卓平台
   */
  static isAndroid(): boolean {
    try {
      return platform() === 'android';
    } catch (error) {
      console.error('Failed to detect platform:', error);
      return false;
    }
  }
}

export const androidBackHandler = AndroidBackHandlerService.getInstance();
export { AndroidBackHandlerService };
export type { BackHandler };