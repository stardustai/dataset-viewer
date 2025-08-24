// Viewer components exports
import { lazy } from 'react';

// 同步加载的轻量组件
export { WordViewer } from './WordViewer';
export { MediaViewer } from './MediaViewer';
export { ArchiveViewer } from './ArchiveViewer';
export { VirtualizedTextViewer } from './VirtualizedTextViewer';
export { UniversalDataTableViewer } from './UniversalDataTableViewer';
export { AV1VideoPlayer } from './AV1VideoPlayer';
export { ImageRenderer } from './ImageRenderer';

// 异步加载的重型组件（包含大量依赖的组件）
export const PresentationViewer = lazy(() => import('./PresentationViewer').then(module => ({ default: module.PresentationViewer })));
export const PCDViewer = lazy(() => import('./PCDViewer').then(module => ({ default: module.PointCloudViewer })));
