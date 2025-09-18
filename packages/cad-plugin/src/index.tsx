import { Layers, FileImage, Shapes } from 'lucide-react';
import { CADViewer } from './CADViewer';
import { createPlugin, PluginInitializeContext } from '@dataset-viewer/sdk';
import { resources } from './i18n';
import { cadModuleManager, CADModuleManager } from './utils/cadModuleManager';

const plugin = createPlugin({
  metadata: {
    id: 'cad',
    name: 'CAD Viewer',
    description: 'Viewer for CAD files including DWG and DXF formats',
    author: 'StardustAI',
    supportedExtensions: ['.dwg', '.dxf'],
    mimeTypes: {
      '.dwg': 'application/x-dwg',
      '.dxf': 'application/x-dxf',
    },
    icon: <Layers className="text-purple-600" />,
    iconMapping: {
      '.dwg': <FileImage className="text-blue-600" />,
      '.dxf': <Shapes className="text-green-600" />,
    },
    category: 'viewer' as const,
    minAppVersion: '1.5.0',
  },
  component: CADViewer,
  i18nResources: resources,
  initialize: async (context: PluginInitializeContext) => {
    console.log('🔧 CAD Plugin initializing...');

    // 设置插件基础路径到模块管理器
    if (context.pluginBasePath) {
      CADModuleManager.setPluginBasePath(context.pluginBasePath);
      console.log('✅ Plugin base path set:', context.pluginBasePath);
    }

    // 启动CAD模块后台预加载
    cadModuleManager.startPreloading();

    console.log('✅ CAD Plugin initialized');
  },
  cleanup: async () => {
    console.log('🧹 CAD Plugin cleaning up...');

    // 清理CAD模块缓存
    cadModuleManager.clearCache();

    console.log('✅ CAD Plugin cleaned up');
  },
});

export default plugin;
