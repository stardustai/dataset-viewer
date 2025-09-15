# @dataset-viewer/sdk

Dataset Viewer Plugin SDK - 为插件开发者提供类型定义、工具函数和开发辅助工具。

## 📦 安装

```bash
npm install @dataset-viewer/sdk
# 或
pnpm add @dataset-viewer/sdk
# 或
yarn add @dataset-viewer/sdk
```

## 🚀 快速开始

### 创建一个简单的插件

```typescript
import { createPlugin, PluginLogger } from '@dataset-viewer/sdk';
import type { PluginViewerProps } from '@dataset-viewer/sdk';

// 创建插件组件
const TextViewer: React.FC<PluginViewerProps> = ({ file, fileAccessor }) => {
  const [content, setContent] = useState<string>('');
  const logger = new PluginLogger('text-viewer');

  useEffect(() => {
    const loadContent = async () => {
      try {
        logger.time('load-content');
        const text = await fileAccessor.getTextContent();
        setContent(text);
        logger.timeEnd('load-content');
      } catch (error) {
        logger.error('Failed to load content:', error);
      }
    };

    loadContent();
  }, [file.path]);

  return (
    <div className="p-4">
      <pre className="whitespace-pre-wrap">{content}</pre>
    </div>
  );
};

// 创建插件包
const plugin = createPlugin({
  metadata: {
    id: 'text-viewer',
    name: 'Text Viewer',
    version: '1.0.0',
    description: 'Simple text file viewer',
    author: 'Your Name',
    supportedExtensions: ['.txt', '.md', '.log'],
    mimeTypes: {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.log': 'text/plain',
    },
    category: 'viewer',
    minAppVersion: '1.0.0',
  },
  component: TextViewer,
  initialize: async () => {
    console.log('Text viewer plugin initialized');
  },
  cleanup: async () => {
    console.log('Text viewer plugin cleaned up');
  },
});

export default plugin;
```

## 📚 API 文档

### 类型定义

#### PluginBundle
插件包的完整定义，包含元数据、组件和生命周期函数。

#### PluginMetadata
插件元数据，描述插件的基本信息：
- `id`: 插件唯一标识符
- `name`: 插件显示名称
- `version`: 插件版本
- `supportedExtensions`: 支持的文件扩展名
- `category`: 插件分类 ('viewer' | 'editor' | 'converter' | 'analyzer')

#### PluginViewerProps
插件组件接收的属性：
- `file`: 文件信息 (name, size, path)
- `content`: 预加载的文件内容（可选）
- `fileAccessor`: 文件访问器
- `isLargeFile`: 是否为大文件
- `onError`: 错误处理回调
- `onLoadingChange`: 加载状态变化回调

### 工具函数

#### createPlugin(options)
创建标准的插件包，自动验证和标准化配置。

```typescript
const plugin = createPlugin({
  metadata: { /* ... */ },
  component: YourComponent,
  initialize: async () => { /* ... */ },
  cleanup: async () => { /* ... */ },
});
```

#### validatePluginMetadata(metadata)
验证插件元数据的完整性和正确性。

```typescript
const { valid, errors } = validatePluginMetadata(metadata);
if (!valid) {
  console.error('Validation errors:', errors);
}
```

#### isFileSupported(filename, extensions)
检查文件是否被插件支持。

```typescript
if (isFileSupported('document.pdf', ['.pdf', '.doc'])) {
  // 处理文件
}
```

### 开发工具

#### PluginLogger
提供统一的日志输出格式，支持开发模式下的调试。

```typescript
const logger = new PluginLogger('my-plugin');
logger.info('Plugin loaded');
logger.error('Error occurred:', error);
logger.time('operation');
// ... do something
logger.timeEnd('operation');
```

#### readFileContent(props, encoding?)
统一的文件内容读取函数，自动处理不同的内容来源。

```typescript
const content = await readFileContent(props, 'utf-8');
```

#### detectFileType(filename)
检测文件类型和分类。

```typescript
const { extension, mimeType, category } = detectFileType('document.pdf');
// { extension: '.pdf', mimeType: 'application/pdf', category: 'document' }
```

## 🛠️ 开发最佳实践

### 1. 错误处理
```typescript
import { handlePluginError, PluginLogger } from '@dataset-viewer/sdk';

const logger = new PluginLogger('my-plugin');

try {
  // 插件逻辑
} catch (error) {
  handlePluginError(error, onError, logger);
}
```

### 2. 性能监控
```typescript
import { measurePerformance, PluginLogger } from '@dataset-viewer/sdk';

const logger = new PluginLogger('my-plugin');

const result = await measurePerformance(
  async () => {
    // 耗时操作
    return await loadLargeFile();
  },
  'Load large file',
  logger
);
```

### 3. 加载状态管理
```typescript
import { createLoadingManager } from '@dataset-viewer/sdk';

const loadingManager = createLoadingManager(onLoadingChange);

loadingManager.setLoading(true);
// 执行操作
loadingManager.setLoading(false);
```

## 📋 插件开发检查清单

- [ ] 插件ID与包名一致
- [ ] 支持的文件扩展名正确配置
- [ ] 实现了错误处理
- [ ] 添加了加载状态指示
- [ ] 支持大文件处理
- [ ] 响应式设计兼容
- [ ] 国际化支持（可选）
- [ ] 性能监控（开发模式）

## 🔗 相关链接

- [Dataset Viewer 官方文档](https://github.com/stardustai/dataset-viewer)
- [插件开发指南](https://github.com/stardustai/dataset-viewer/blob/main/docs/plugin-development.md)
- [示例插件](https://github.com/stardustai/dataset-viewer/tree/main/src-plugins)

## 📝 许可证

MIT
