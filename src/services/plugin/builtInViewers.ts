/**
 * 内置查看器注册
 * 将所有内置组件注册为"插件"，统一在打开方式菜单中展示
 */

import { BuiltInViewer, pluginFramework } from './pluginFramework';
import {
  WordViewer,
  PresentationViewer,
  MediaViewer,
  UniversalDataTableViewer,
  ArchiveViewer,
  PointCloudViewer,
} from '../../components/FileViewer/viewers';
import { getExtensionsByType, getMediaExtensions } from '../../utils/fileTypes';

/**
 * 注册所有内置查看器
 */
export function registerBuiltInViewers(): void {
  const viewers: BuiltInViewer[] = [
    {
      id: 'builtin:text',
      name: 'viewer.builtin',
      supportedExtensions: getExtensionsByType('text'),
      component: null as any, // 文本查看器在 FileViewerContent 中特殊处理，不需要组件
      priority: 10,
    },
    {
      id: 'builtin:markdown',
      name: 'viewer.builtin',
      supportedExtensions: getExtensionsByType('markdown'),
      component: null as any, // Markdown 查看器在 FileViewerContent 中特殊处理，不需要组件
      priority: 10,
    },
    {
      id: 'builtin:word',
      name: 'viewer.builtin',
      supportedExtensions: getExtensionsByType('word'),
      component: WordViewer,
      priority: 10,
    },
    {
      id: 'builtin:presentation',
      name: 'viewer.builtin',
      supportedExtensions: getExtensionsByType('presentation'),
      component: PresentationViewer,
      priority: 10,
    },
    {
      id: 'builtin:media',
      name: 'viewer.builtin',
      supportedExtensions: getMediaExtensions(),
      component: MediaViewer,
      priority: 10,
    },
    {
      id: 'builtin:spreadsheet',
      name: 'viewer.builtin',
      supportedExtensions: getExtensionsByType('spreadsheet'),
      component: UniversalDataTableViewer,
      priority: 10,
    },
    {
      id: 'builtin:data',
      name: 'viewer.builtin',
      supportedExtensions: getExtensionsByType('data'),
      component: UniversalDataTableViewer,
      priority: 10,
    },
    {
      id: 'builtin:archive',
      name: 'viewer.builtin',
      supportedExtensions: getExtensionsByType('archive'),
      component: ArchiveViewer,
      priority: 10,
    },
    {
      id: 'builtin:pointcloud',
      name: 'viewer.builtin',
      supportedExtensions: getExtensionsByType('pointcloud'),
      component: PointCloudViewer,
      priority: 10,
    },
  ];

  // 注册所有内置查看器
  viewers.forEach(viewer => {
    pluginFramework.registerBuiltInViewer(viewer);
  });
}
