import { Server, Folder, Cloud, Bot, Network, Terminal, Settings } from 'lucide-react';
import { StorageClientType } from '../services/storage/types';

/**
 * 存储类型的图标映射配置
 */
export const storageIconMap = {
  webdav: Server,
  local: Folder,
  oss: Cloud,
  s3: Cloud,
  huggingface: Bot,
  ssh: Terminal,
  smb: Network,
} as const;

/**
 * 获取存储类型对应的图标组件
 */
export const getConnectionIcon = (
  type: StorageClientType | string,
  size = 16,
  className = 'text-gray-500 dark:text-gray-400'
) => {
  const iconProps = { size, className };
  const IconComponent = storageIconMap[type as keyof typeof storageIconMap] || Settings;

  return <IconComponent {...iconProps} />;
};
