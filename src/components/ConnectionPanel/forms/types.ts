import { StoredConnection } from '../../../services/connectionStorage';

/**
 * 统一的连接表单 Props 接口
 */
export interface UnifiedConnectionFormProps {
  /** 连接配置对象 */
  config: Record<string, any>;
  /** 配置更新回调 */
  onChange: (config: Record<string, any>) => void;
  /** 连接中状态 */
  connecting: boolean;
  /** 错误信息 */
  error?: string;
  /** 连接回调 */
  onConnect: () => void;
  /** 密码是否来自存储 */
  isPasswordFromStorage?: boolean;
  /** 选中的存储连接（用于某些特殊表单） */
  selectedConnection?: StoredConnection | null;
}
