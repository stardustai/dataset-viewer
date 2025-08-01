interface StreamingConfig {
  chunkSize: number;
  maxInitialLoad: number;
  prefetchNextChunk: boolean;
  enableCompression: boolean;
}

interface AppConfig {
  streaming: StreamingConfig;
  ui: {
    virtualScrolling: boolean;
    debounceSearchMs: number;
    maxSearchResults: number;
  };
  webdav: {
    requestTimeout: number;
    retryAttempts: number;
    enableCache: boolean;
  };
}

const defaultConfig: AppConfig = {
  streaming: {
    chunkSize: 1024 * 1024, // 1MB chunks
    maxInitialLoad: 1024 * 1024, // 1MB initial load
    prefetchNextChunk: true,
    enableCompression: false,
  },
  ui: {
    virtualScrolling: true,
    debounceSearchMs: 300,
    maxSearchResults: 1000,
  },
  webdav: {
    requestTimeout: 30000, // 30 seconds
    retryAttempts: 3,
    enableCache: true,
  },
};

export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    this.config = { ...defaultConfig };
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  getConfig(): AppConfig {
    return this.config;
  }

  updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

export const configManager = ConfigManager.getInstance();
