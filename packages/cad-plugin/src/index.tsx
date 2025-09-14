import { Layers, Box, FileImage, Shapes } from 'lucide-react';
import { CADViewer } from './CADViewer';
import { createPlugin } from '@dataset-viewer/sdk';
import { resources } from './i18n';
import { cadModuleManager } from './utils/cadModuleManager';

const plugin = createPlugin({
  metadata: {
    id: 'cad',
    name: 'CAD Viewer',
    version: '1.0.0',
    description: 'Viewer for CAD files including DWG, DXF, STEP, and IGES formats',
    author: 'StardustAI',
    supportedExtensions: ['.dwg', '.dxf', '.step', '.stp', '.iges', '.igs'],
    mimeTypes: {
      '.dwg': 'application/x-dwg',
      '.dxf': 'application/x-dxf',
      '.step': 'application/step',
      '.stp': 'application/step',
      '.iges': 'application/iges',
      '.igs': 'application/iges',
    },
    icon: <Layers className="text-purple-600" />,
    iconMapping: {
      '.dwg': <FileImage className="text-blue-600" />,
      '.dxf': <Shapes className="text-green-600" />,
      '.step': <Box className="text-orange-600" />,
      '.stp': <Box className="text-orange-600" />,
      '.iges': <Layers className="text-purple-600" />,
      '.igs': <Layers className="text-purple-600" />,
    },
    category: 'viewer' as const,
    minAppVersion: '1.0.0',
  },
  component: CADViewer,
  i18nResources: resources,
  initialize: async () => {
    console.log('🔧 CAD Plugin initializing...');

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
