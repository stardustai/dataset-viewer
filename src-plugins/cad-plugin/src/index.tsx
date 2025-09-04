import { Layers } from 'lucide-react';
import { CADViewer } from './CADViewer';
import type { PluginBundle } from './plugin-types';
import { resources } from './i18n';

const pluginBundle: PluginBundle = {
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
    official: true,
    category: 'viewer' as const,
    minAppVersion: '1.0.0',
  },
  component: CADViewer,
  i18nResources: resources,
  initialize: async () => {
    console.log('CAD Plugin initialized');
  },
  cleanup: async () => {
    console.log('CAD Plugin cleaned up');
  },
};

export default pluginBundle;
