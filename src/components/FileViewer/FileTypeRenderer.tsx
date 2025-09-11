import type React from 'react';
import { useTranslation } from 'react-i18next';
import { StorageServiceManager } from '../../services/storage';
import type { StorageClient } from '../../services/storage/types';
import type { StorageFile } from '../../types';
import { UnsupportedFormatDisplay } from '../common';
import { LazyComponentWrapper } from './common';
import {
  ArchiveViewer,
  MediaViewer,
  PointCloudViewer,
  PresentationViewer,
  UniversalDataTableViewer,
  WordViewer,
} from './viewers';

interface FileTypeRendererProps {
  file: StorageFile;
  filePath: string;
  fileType: string;
  storageClient?: StorageClient;
  hasAssociatedFiles?: boolean;
  fileInfo: {
    fileType: string;
    isWord: boolean;
    isPresentation: boolean;
    isMedia: boolean;
    isArchive: boolean;
    isData: boolean;
    isSpreadsheet: boolean;
    isPointCloud: boolean;
  };
  setPresentationMetadata: (
    metadata: { slideCount: number; size: { width: number; height: number } } | null
  ) => void;
  setDataMetadata: (
    metadata: {
      numRows: number;
      numColumns: number;
      fileType?: string;
      extensions?: Record<string, unknown>;
    } | null
  ) => void;
  loadFileContent?: (forceLoad?: boolean) => Promise<void>;
  onOpenAsText: () => void;
}

export const FileTypeRenderer: React.FC<FileTypeRendererProps> = ({
  file,
  filePath,
  fileType,
  storageClient,
  hasAssociatedFiles,
  fileInfo,
  setPresentationMetadata,
  setDataMetadata,
  onOpenAsText,
}) => {
  const { t } = useTranslation();

  if (fileInfo.isWord) {
    return (
      <LazyComponentWrapper<{
        filePath: string;
        fileName: string;
        fileSize: number;
        className?: string;
      }>
        component={WordViewer}
        props={{
          filePath,
          fileName: file.basename,
          fileSize: Number(file.size),
        }}
      />
    );
  }

  if (fileInfo.isPresentation) {
    return (
      <LazyComponentWrapper<{
        filePath: string;
        fileName: string;
        fileSize: number;
        className?: string;
        onMetadataLoaded?: (metadata: {
          slideCount: number;
          size: { width: number; height: number };
          fileSize: number;
        }) => void;
      }>
        component={PresentationViewer}
        props={{
          filePath,
          fileName: file.basename,
          fileSize: Number(file.size),
          onMetadataLoaded: setPresentationMetadata,
        }}
      />
    );
  }

  if (fileInfo.isMedia) {
    return (
      <LazyComponentWrapper<{
        filePath: string;
        fileName: string;
        fileType: 'image' | 'pdf' | 'video' | 'audio';
        fileSize: number;
        hasAssociatedFiles?: boolean;
        previewContent?: Uint8Array;
      }>
        component={MediaViewer}
        props={{
          filePath,
          fileName: file.basename,
          fileType: fileType as 'image' | 'pdf' | 'video' | 'audio',
          fileSize: Number(file.size),
          hasAssociatedFiles,
        }}
      />
    );
  }

  if (fileInfo.isSpreadsheet) {
    return (
      <LazyComponentWrapper
        component={UniversalDataTableViewer}
        props={{
          filePath,
          fileName: file.basename,
          fileSize: Number(file.size),
          fileType:
            file.basename.toLowerCase().endsWith('.xlsx') ||
            file.basename.toLowerCase().endsWith('.xls')
              ? 'xlsx'
              : file.basename.toLowerCase().endsWith('.ods')
                ? 'ods'
                : 'csv',
          onMetadataLoaded: setDataMetadata,
        }}
      />
    );
  }

  if (fileInfo.isData) {
    return (
      <LazyComponentWrapper
        component={UniversalDataTableViewer}
        props={{
          filePath,
          fileName: file.basename,
          fileSize: Number(file.size),
          fileType:
            file.basename.toLowerCase().endsWith('.parquet') ||
            file.basename.toLowerCase().endsWith('.pqt')
              ? 'parquet'
              : file.basename.toLowerCase().endsWith('.orc')
                ? 'orc'
                : 'csv',
          onMetadataLoaded: setDataMetadata,
        }}
      />
    );
  }

  if (fileInfo.isArchive) {
    return (
      <LazyComponentWrapper<{ url: string; filename: string; storageClient?: StorageClient }>
        component={ArchiveViewer}
        props={{
          url: StorageServiceManager.getFileUrl(filePath),
          filename: file.basename,
          storageClient,
        }}
      />
    );
  }

  if (fileInfo.isPointCloud) {
    return (
      <LazyComponentWrapper<{ filePath: string; onMetadataLoaded?: (metadata: any) => void }>
        component={PointCloudViewer}
        props={{
          filePath,
          onMetadataLoaded: setDataMetadata,
        }}
        loadingText={t('loading.pointCloud', '正在加载点云渲染器...')}
        fallbackHeight="h-64"
      />
    );
  }

  return (
    <UnsupportedFormatDisplay
      message={t('viewer.unsupported.format')}
      secondaryMessage={t('viewer.download.to.view')}
      onOpenAsText={onOpenAsText}
    />
  );
};
