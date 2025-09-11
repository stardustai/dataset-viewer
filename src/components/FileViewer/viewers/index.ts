// Viewer components exports
import { lazy } from 'react';

export { ArchiveViewer } from './ArchiveViewer';
export { AV1VideoPlayer } from './AV1VideoPlayer';
export { ImageRenderer } from './ImageRenderer';
export { MediaViewer } from './MediaViewer';
export { UniversalDataTableViewer } from './UniversalDataTableViewer';
export { default as VirtualizedTextViewer } from './VirtualizedTextViewer';
// 同步加载的轻量组件
export { WordViewer } from './WordViewer';

// 异步加载的重型组件（包含大量依赖的组件）
export const PresentationViewer = lazy(() =>
  import('./PresentationViewer').then(module => ({ default: module.PresentationViewer }))
);
export const PointCloudViewer = lazy(() =>
  import('./PointCloudViewer').then(module => ({ default: module.PointCloudViewer }))
);
