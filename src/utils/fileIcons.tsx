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
  Database
} from 'lucide-react';
import { FileType } from './fileTypes';

interface FileIconConfig {
  icon: React.ComponentType<any>;
  color: string;
}

const FILE_ICON_CONFIG: Record<FileType | 'directory', FileIconConfig> = {
  directory: { icon: Folder, color: 'text-blue-500' },
  image: { icon: Image, color: 'text-blue-500' },
  video: { icon: Film, color: 'text-purple-500' },
  audio: { icon: Music, color: 'text-pink-500' },
  pdf: { icon: FileImage, color: 'text-red-500' },
  text: { icon: FileText, color: 'text-green-500' },
  spreadsheet: { icon: FileSpreadsheet, color: 'text-emerald-500' },
  archive: { icon: Archive, color: 'text-orange-500' },
  data: { icon: Database, color: 'text-cyan-500' },
  unknown: { icon: File, color: 'text-gray-500' }
};

interface FileIconProps {
  fileType: FileType | 'directory';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const FileIcon: React.FC<FileIconProps> = ({ 
  fileType, 
  size = 'md', 
  className = '' 
}) => {
  const config = FILE_ICON_CONFIG[fileType] || FILE_ICON_CONFIG.unknown;
  const IconComponent = config.icon;
  
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-5 h-5 lg:w-6 lg:h-6'
  };
  
  const baseClassName = `${sizeClasses[size]} ${config.color} flex-shrink-0`;
  const finalClassName = className ? `${baseClassName} ${className}` : baseClassName;
  
  return <IconComponent className={finalClassName} />;
};

// 获取文件图标配置的工具函数
export const getFileIconConfig = (fileType: FileType | 'directory') => {
  return FILE_ICON_CONFIG[fileType] || FILE_ICON_CONFIG.unknown;
};
