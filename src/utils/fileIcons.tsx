import React from 'react';
import {
  Folder,
  FileText,
  File,
  Image,
  Film,
  Music,
  FileImage,
  FileSpreadsheet,
  Archive,
  Database,
  FileType2,
  BookOpen,
  Presentation,
  Box,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FileType } from './fileTypes';

interface FileIconConfig {
  icon: LucideIcon;
  color: string;
}

const FILE_ICON_CONFIG: Record<FileType | 'directory', FileIconConfig> = {
  directory: { icon: Folder, color: 'text-blue-500' },
  image: { icon: Image, color: 'text-blue-500' },
  video: { icon: Film, color: 'text-purple-500' },
  audio: { icon: Music, color: 'text-pink-500' },
  pdf: { icon: FileImage, color: 'text-red-500' },
  text: { icon: FileText, color: 'text-gray-500 dark:text-gray-400' },
  markdown: { icon: BookOpen, color: 'text-indigo-500' },
  word: { icon: FileType2, color: 'text-blue-600' },
  presentation: { icon: Presentation, color: 'text-orange-600' },
  spreadsheet: { icon: FileSpreadsheet, color: 'text-emerald-500' },
  archive: { icon: Archive, color: 'text-orange-500' },
  data: { icon: Database, color: 'text-cyan-500' },
  pointcloud: { icon: Box, color: 'text-violet-500' },
  unknown: { icon: File, color: 'text-gray-400 dark:text-gray-500' },
};

interface FileIconProps {
  fileType: FileType | 'directory' | string; // 允许插件定义的任意字符串类型
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  filename?: string; // 添加filename属性用于插件图标查询
}

export const FileIcon: React.FC<FileIconProps> = ({
  fileType,
  size = 'md',
  className = '',
  filename,
}) => {
  // 如果提供了文件名，尝试从插件获取图标
  const [pluginIcon, setPluginIcon] = React.useState<string | React.ReactNode | null>(null);

  React.useEffect(() => {
    if (filename) {
      const loadPluginIcon = async () => {
        try {
          const { pluginManager } = await import('../services/plugin/pluginManager');
          const plugin = pluginManager.findViewerForFile(filename);
          if (plugin && plugin.getFileIcon) {
            const iconName = plugin.getFileIcon();
            if (iconName) {
              setPluginIcon(iconName);
              return;
            }
          }
        } catch (error) {
          // 插件图标加载失败，使用默认图标
          console.log('Plugin icon loading error:', error);
        }
        setPluginIcon(null);
      };
      loadPluginIcon();
    }
  }, [filename]);

  // 如果有插件图标
  if (pluginIcon) {
    // 如果是 React 节点，直接返回
    if (React.isValidElement(pluginIcon)) {
      return <div className={`flex-shrink-0 ${className}`}>{pluginIcon}</div>;
    }

    // 如果是字符串（表情符号），显示为文本
    if (typeof pluginIcon === 'string' && pluginIcon.length <= 4) {
      const sizeClasses = {
        sm: 'text-base',
        md: 'text-lg',
        lg: 'text-xl lg:text-2xl',
      };

      return (
        <span
          className={`${sizeClasses[size]} flex-shrink-0 ${className}`}
          role="img"
          aria-label="file icon"
        >
          {pluginIcon}
        </span>
      );
    }
  }

  // 使用默认图标
  const config =
    FILE_ICON_CONFIG[fileType as keyof typeof FILE_ICON_CONFIG] || FILE_ICON_CONFIG.unknown;
  const IconComponent = config.icon;

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-5 h-5 lg:w-6 lg:h-6',
  };

  const baseClassName = `${sizeClasses[size]} ${config.color} flex-shrink-0`;
  const finalClassName = className ? `${baseClassName} ${className}` : baseClassName;

  return <IconComponent className={finalClassName} />;
};
