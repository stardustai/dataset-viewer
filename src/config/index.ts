import { WebDAVFile } from '../types';

export interface StreamingConfig {
  chunkSize: number;
  maxInitialLoad: number;
  prefetchNextChunk: boolean;
  enableCompression: boolean;
}

export interface AppConfig {
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

export const defaultConfig: AppConfig = {
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

// File size thresholds
export const FILE_SIZE_THRESHOLDS = {
  SMALL: 1024 * 1024, // 1MB
  MEDIUM: 1024 * 1024 * 50, // 50MB
  LARGE: 1024 * 1024 * 100, // 100MB
  HUGE: 1024 * 1024 * 500, // 500MB
};

// Supported text file extensions
export const TEXT_FILE_EXTENSIONS = [
  '.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.csv',
  '.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.sass',
  '.html', '.htm', '.php', '.py', '.java', '.c', '.cpp',
  '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.pl', '.sh',
  '.bat', '.ps1', '.sql', '.log', '.ini', '.conf', '.cfg',
  '.toml', '.properties', '.env', '.gitignore', '.dockerfile',
  '.vue', '.svelte', '.dart', '.kt', '.swift', '.m', '.mm',
];

// MIME types for text files
export const TEXT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/json',
  'text/xml',
  'application/xml',
  'text/yaml',
  'text/x-yaml',
  'application/yaml',
  'text/csv',
  'application/javascript',
  'text/javascript',
  'text/css',
  'text/html',
  'application/x-php',
  'text/x-python',
  'text/x-java',
  'text/x-c',
  'text/x-c++',
  'text/x-csharp',
  'text/x-go',
  'text/x-rust',
  'text/x-ruby',
  'text/x-perl',
  'text/x-shellscript',
  'application/x-sql',
];

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

  isTextFile(file: WebDAVFile): boolean {
    // Check by extension
    const ext = file.filename.toLowerCase().substring(file.filename.lastIndexOf('.'));
    if (TEXT_FILE_EXTENSIONS.includes(ext)) {
      return true;
    }

    // Check by MIME type
    if (file.mime && TEXT_MIME_TYPES.includes(file.mime.toLowerCase())) {
      return true;
    }

    return false;
  }

  getFileSizeCategory(size: number): 'small' | 'medium' | 'large' | 'huge' {
    if (size <= FILE_SIZE_THRESHOLDS.SMALL) return 'small';
    if (size <= FILE_SIZE_THRESHOLDS.MEDIUM) return 'medium';
    if (size <= FILE_SIZE_THRESHOLDS.LARGE) return 'large';
    return 'huge';
  }

  getOptimalChunkSize(fileSize: number): number {
    const category = this.getFileSizeCategory(fileSize);

    switch (category) {
      case 'small':
        return fileSize; // Load entirely
      case 'medium':
        return 1024 * 1024 * 2; // 2MB chunks
      case 'large':
        return 1024 * 1024 * 5; // 5MB chunks
      case 'huge':
        return 1024 * 1024 * 10; // 10MB chunks
      default:
        return this.config.streaming.chunkSize;
    }
  }
}

export const configManager = ConfigManager.getInstance();
