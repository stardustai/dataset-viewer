import { Palette, FileImage, Layers } from 'lucide-react';
import { SketchViewer } from './SketchViewer';
import { createPlugin, PluginInitializeContext } from '@dataset-viewer/sdk';
import { resources } from './i18n';

const plugin = createPlugin({
  metadata: {
    id: 'sketch',
    name: 'Sketch & PSD Viewer',
    description: 'Read-only viewer for Sketch design files and Photoshop PSD files with high-fidelity rendering',
    author: 'StardustAI',
    supportedExtensions: ['.sketch', '.psd'],
    mimeTypes: {
      '.sketch': 'application/vnd.sketch',
      '.psd': 'image/vnd.adobe.photoshop',
    },
    icon: <Palette style={{ color: '#db2777' }} />,
    iconMapping: {
      '.sketch': <FileImage style={{ color: '#db2777' }} />,
      '.psd': <Layers className="text-blue-600" />,
    },
    category: 'viewer' as const,
    minAppVersion: '1.5.0',
  },
  component: SketchViewer,
  i18nResources: resources,
  initialize: async (context: PluginInitializeContext) => {
    console.log('🎨 Sketch Plugin initializing...');

    // 设置插件基础路径
    if (context.pluginBasePath) {
      console.log('✅ Sketch Plugin base path set:', context.pluginBasePath);
    }

    console.log('✅ Sketch Plugin initialized');
  },
  cleanup: async () => {
    console.log('🧹 Sketch Plugin cleaning up...');

    // 清理可能的资源
    console.log('✅ Sketch Plugin cleaned up');
  },
});

export default plugin;
