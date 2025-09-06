import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StorageServiceManager } from '../../services/storage/StorageManager';
import { StoredConnection } from '../../services/connectionStorage';
import { ConnectionConfig, StorageClientType } from '../../services/storage/types';
import { getStorageAdapter } from '../../services/storage/StorageClient';

export default function useConnectionLogic(onConnectSuccess?: () => void) {
  const { t } = useTranslation();

  // 通用状态
  const [storageType, setStorageType] = useState<StorageClientType>('webdav');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [selectedStoredConnection, setSelectedStoredConnection] = useState<StoredConnection | null>(
    null
  );

  // 通用表单数据状态 - 替换分散的单独状态
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // 兼容性状态 - 保留现有API，但内部映射到formData
  const url = formData.url || '';
  const username = formData.username || '';
  const password = formData.password || '';
  const isPasswordFromStorage = formData.isPasswordFromStorage || false;
  const smbShare = formData.share || '';
  const smbDomain = formData.domain || '';
  const sshPort = formData.port || 22;
  const sshPrivateKeyPath = formData.privateKeyPath || '';
  const sshPassphrase = formData.passphrase || '';
  const sshRemotePath = formData.remotePath || '/';
  const defaultLocalPath = formData.rootPath || '';

  // 兼容性设置函数
  const setUrl = (value: string) => updateFormData('url', value);
  const setUsername = (value: string) => updateFormData('username', value);
  const setPassword = (value: string) => {
    updateFormData('password', value);
    updateFormData('isPasswordFromStorage', false);
  };
  const setIsPasswordFromStorage = (value: boolean) =>
    updateFormData('isPasswordFromStorage', value);
  const setSmbShare = (value: string) => updateFormData('share', value);
  const setSmbDomain = (value: string) => updateFormData('domain', value);
  const setSshPort = (value: number) => updateFormData('port', value);
  const setSshPrivateKeyPath = (value: string) => updateFormData('privateKeyPath', value);
  const setSshPassphrase = (value: string) => updateFormData('passphrase', value);
  const setSshRemotePath = (value: string) => updateFormData('remotePath', value);
  const setDefaultLocalPath = (value: string) => updateFormData('rootPath', value);

  // 更新表单数据的辅助函数
  const updateFormData = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setError(''); // 清除错误
    setValidationErrors([]); // 清除验证错误
  };

  // 初始化表单数据
  const initializeFormData = (type: StorageClientType) => {
    const adapter = getStorageAdapter(type);
    const defaultConfig = adapter.getDefaultConfig?.() || {};
    setFormData(defaultConfig);
    setValidationErrors([]);
    setError('');
  };

  // 获取默认本地路径（从已保存的连接中）
  const getDefaultLocalPath = (): string => {
    const connections = StorageServiceManager.getStoredConnections();
    const localConnections = connections.filter(conn => conn.config.type === 'local');

    if (localConnections.length > 0) {
      // 按最后连接时间排序
      const sorted = localConnections.sort((a, b) => {
        const aTime = new Date(a.lastConnected || 0).getTime();
        const bTime = new Date(b.lastConnected || 0).getTime();
        return bTime - aTime;
      });

      return sorted[0].config.rootPath || '';
    }

    return '';
  };

  const handleSelectStoredConnection = (connection: StoredConnection) => {
    setSelectedStoredConnection(connection);
    setError('');
    setValidationErrors([]);

    const config = connection.config;
    setStorageType(config.type);

    // 使用 adapter 提取表单数据
    const adapter = getStorageAdapter(config.type);
    const extractedFormData = adapter.extractFormData?.(config) || {};

    setFormData(extractedFormData);
  };

  useEffect(() => {
    const wasDisconnected = localStorage.getItem('userDisconnected') === 'true';

    if (wasDisconnected) {
      // 如果用户主动断开连接，仍然使用最近的连接信息预填表单，但不自动连接
      const defaultConnection = StorageServiceManager.getDefaultConnection();
      if (defaultConnection) {
        const config = defaultConnection.config;
        setStorageType(config.type);

        switch (config.type) {
          case 'local':
            setDefaultLocalPath(config.rootPath || '');
            break;
          case 'oss':
          case 'huggingface':
          case 'webdav':
          case 'smb':
          case 'ssh':
            handleSelectStoredConnection(defaultConnection);
            break;
        }
      }
    } else {
      // 如果不是主动断开，使用默认连接逻辑
      const defaultConnection = StorageServiceManager.getDefaultConnection();
      if (defaultConnection) {
        const config = defaultConnection.config;
        setStorageType(config.type);

        switch (config.type) {
          case 'local':
            setDefaultLocalPath(config.rootPath || '');
            break;
          case 'oss':
          case 'huggingface':
          case 'webdav':
          case 'smb':
          case 'ssh':
            handleSelectStoredConnection(defaultConnection);
            break;
        }
      }
    }
    // 注意：不要在这里清除 userDisconnected 标志，应该在实际连接成功时清除
  }, []);

  const handleWebDAVConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleConnectWithValidation('webdav', formData);
  };

  const handleLocalConnect = async (rootPath: string) => {
    const localFormData = {
      ...formData,
      rootPath: rootPath || defaultLocalPath || getDefaultLocalPath(),
    };
    await handleConnectWithValidation('local', localFormData);
  };

  // 通用连接方法 - 使用 adapter 配置构建，移除前端验证
  const handleConnectWithValidation = async (
    storageType: StorageClientType,
    formData: Record<string, any>
  ) => {
    setConnecting(true);
    setError('');
    setValidationErrors([]);

    try {
      const adapter = getStorageAdapter(storageType);

      // 1. 使用 adapter 构建完整配置（不再做前端验证）
      const config =
        adapter.buildConnectionConfig?.(formData, selectedStoredConnection) ||
        (formData as ConnectionConfig);

      // 2. 直接尝试连接，让后端处理所有验证
      const success = await StorageServiceManager.connectWithConfig(config);
      if (success) {
        onConnectSuccess?.();
        return;
      } else {
        throw new Error(t('error.connection.failed'));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('error.connection.failed');
      setError(errorMessage);
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async (config: ConnectionConfig) => {
    setConnecting(true);
    setError('');

    try {
      const success = await StorageServiceManager.connectWithConfig(config);
      if (success) {
        // 连接成功，StorageServiceManager 已经处理了保存和设置默认连接
        onConnectSuccess?.();
        return;
      } else {
        throw new Error(t('error.connection.failed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.connection.failed'));
    } finally {
      setConnecting(false);
    }
  };

  // 处理WebDAV表单字段变化
  const handleUrlChange = (value: string) => {
    setUrl(value);
    setError('');
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setError('');
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setError('');
    setIsPasswordFromStorage(false);
  };

  const handlePasswordFocus = () => {
    if (isPasswordFromStorage) {
      setPassword('');
      setIsPasswordFromStorage(false);
    }
  };

  // 新增：使用当前表单数据连接
  const handleConnectWithCurrentForm = async () => {
    await handleConnectWithValidation(storageType, formData);
  };

  // SSH连接处理
  const handleSSHConnect = async (config?: ConnectionConfig) => {
    if (config) {
      await handleConnect(config);
    } else {
      await handleConnectWithValidation('ssh', formData);
    }
  };

  // SMB连接处理
  const handleSMBConnect = async (config?: ConnectionConfig) => {
    if (config) {
      await handleConnect(config);
    } else {
      await handleConnectWithValidation('smb', formData);
    }
  };

  // OSS和HuggingFace连接处理
  const handleOSSConnect = async (config: ConnectionConfig) => {
    await handleConnect(config);
  };

  const handleHuggingFaceConnect = async (config: ConnectionConfig) => {
    await handleConnect(config);
  };

  const handleStorageTypeChange = (type: StorageClientType) => {
    setStorageType(type);
    setError('');
    setValidationErrors([]);

    // 如果当前选择的连接类型匹配新类型，保持选择状态
    if (selectedStoredConnection && selectedStoredConnection.config.type === type) {
      return; // 保持当前表单数据
    }

    // 清除当前选择并初始化新类型的默认表单数据
    setSelectedStoredConnection(null);
    initializeFormData(type);

    // 特殊处理：本地文件系统需要设置默认路径
    if (type === 'local') {
      const defaultPath = getDefaultLocalPath();
      if (defaultPath) {
        updateFormData('rootPath', defaultPath);
      }
    }
  };

  // 辅助函数
  const getHostnameFromUrl = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  return {
    // 核心状态
    storageType,
    connecting,
    error,
    selectedStoredConnection,

    // 新增：表单数据和验证
    formData,
    validationErrors,
    updateFormData,

    // 兼容性状态（映射到 formData）
    url,
    username,
    password,
    isPasswordFromStorage,
    defaultLocalPath,
    sshPort,
    sshPrivateKeyPath,
    sshPassphrase,
    sshRemotePath,
    smbShare,
    smbDomain,

    // 状态设置函数（兼容性）
    setStorageType,
    setError,
    setSelectedStoredConnection,
    setUrl,
    setUsername,
    setPassword,
    setIsPasswordFromStorage,
    setDefaultLocalPath,
    setSshPort,
    setSshPrivateKeyPath,
    setSshPassphrase,
    setSshRemotePath,
    setSmbShare,
    setSmbDomain,

    // 核心处理函数
    handleStorageTypeChange,
    handleSelectStoredConnection,
    handleConnectWithValidation, // 新增：使用 adapter 的通用连接方法
    handleConnectWithCurrentForm, // 新增：使用当前表单数据连接

    // 专用连接方法
    handleWebDAVConnect,
    handleSSHConnect,
    handleSMBConnect,
    handleLocalConnect,
    handleConnect, // 保留原有方法，用于直接配置连接
    handleOSSConnect,
    handleHuggingFaceConnect,
    // 通用的表单数据更新方法
    handleFormDataChange: (updates: Partial<Record<string, any>>) => {
      setFormData(prev => ({ ...prev, ...updates }));
    },

    // 表单处理方法
    handleUrlChange,
    handleUsernameChange,
    handlePasswordChange,
    handlePasswordFocus,

    // 辅助函数
    getDefaultLocalPath,
    getHostnameFromUrl,
  };
}
