import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StorageServiceManager } from '../../services/storage/StorageManager';
import { StoredConnection, connectionStorage } from '../../services/connectionStorage';
import { ConnectionConfig, StorageClientType } from '../../services/storage/types';

export default function useConnectionLogic(onConnectSuccess?: () => void) {
  const { t } = useTranslation();

  // 通用状态
  const [storageType, setStorageType] = useState<StorageClientType>('webdav');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [selectedStoredConnection, setSelectedStoredConnection] = useState<StoredConnection | null>(
    null
  );

  // WebDAV 状态
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordFromStorage, setIsPasswordFromStorage] = useState(false);

  // 本地文件系统状态
  const [defaultLocalPath, setDefaultLocalPath] = useState('');

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

    const config = connection.config;
    setStorageType(config.type);

    switch (config.type) {
      case 'local':
        setDefaultLocalPath(config.rootPath || '');
        break;

      case 'oss':
        // OSS 相关状态将由 OSSConnectionForm 处理
        break;

      case 'huggingface':
        // HuggingFace 相关状态将由 HuggingFaceConnectionForm 处理
        break;

      case 'webdav':
        setUrl(config.url || '');
        setUsername(config.username || '');
        if (config.password) {
          setPassword('••••••••');
          setIsPasswordFromStorage(true);
        } else {
          setPassword('');
          setIsPasswordFromStorage(false);
        }
        break;
    }
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
            handleSelectStoredConnection(defaultConnection);
            break;
        }
      }
    }
    // 注意：不要在这里清除 userDisconnected 标志，应该在实际连接成功时清除
  }, []);

  const handleWebDAVConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    const connectionName = selectedStoredConnection
      ? selectedStoredConnection.name
      : t('connection.name.webdav', 'WebDAV({{host}})', { host: getHostnameFromUrl(url) });

    const actualPassword =
      isPasswordFromStorage && selectedStoredConnection?.config.password
        ? selectedStoredConnection.config.password
        : password;

    const config: ConnectionConfig = {
      type: 'webdav',
      url: url.trim().replace(/\/+$/, ''), // 标准化 URL，移除末尾斜杠
      username: username.trim(),
      password: actualPassword,
      name: connectionName,
    };

    await handleConnect(config);
  };

  const handleLocalConnect = async (rootPath: string) => {
    const path = rootPath || defaultLocalPath || getDefaultLocalPath();
    if (!path.trim()) {
      setError(t('error.path.required'));
      return;
    }

    const config: ConnectionConfig = {
      type: 'local',
      rootPath: path,
      name:
        selectedStoredConnection?.name ||
        t('connection.name.local', 'Local({{path}})', {
          path: path.split('/').pop() || 'Root',
        }),
    };

    await handleConnect(config);
  };

  const handleConnect = async (config: ConnectionConfig) => {
    setConnecting(true);
    setError('');

    try {
      const success = await StorageServiceManager.connectWithConfig(config);
      if (success) {
        // 连接成功后，将当前连接设为默认连接
        const currentConnection = connectionStorage.findConnection(config);
        if (currentConnection) {
          connectionStorage.setDefaultConnection(currentConnection.id);
        }

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

    if (type === 'webdav') {
      if (selectedStoredConnection && selectedStoredConnection.config.type === 'webdav') {
        // 保持 WebDAV 连接选择
      } else {
        setSelectedStoredConnection(null);
        setUrl('');
        setUsername('');
        setPassword('');
        setIsPasswordFromStorage(false);
      }
    } else if (type === 'local') {
      if (selectedStoredConnection && selectedStoredConnection.config.type === 'local') {
        setDefaultLocalPath(selectedStoredConnection.config.rootPath || '');
      } else {
        setSelectedStoredConnection(null);
        if (!defaultLocalPath) {
          setDefaultLocalPath(getDefaultLocalPath());
        }
      }
    } else if (type === 'oss') {
      if (!selectedStoredConnection || selectedStoredConnection.config.type !== 'oss') {
        setSelectedStoredConnection(null);
      }
    } else if (type === 'huggingface') {
      if (!selectedStoredConnection || selectedStoredConnection.config.type !== 'huggingface') {
        setSelectedStoredConnection(null);
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
    // 状态
    storageType,
    connecting,
    error,
    selectedStoredConnection,
    url,
    username,
    password,
    isPasswordFromStorage,
    defaultLocalPath,

    // 状态设置函数
    setStorageType,
    setError,
    setSelectedStoredConnection,
    setUrl,
    setUsername,
    setPassword,
    setIsPasswordFromStorage,
    setDefaultLocalPath,

    // 处理函数
    handleStorageTypeChange,
    handleSelectStoredConnection,
    handleWebDAVConnect,
    handleLocalConnect,
    handleConnect,
    handleOSSConnect,
    handleHuggingFaceConnect,
    handleUrlChange,
    handleUsernameChange,
    handlePasswordChange,
    handlePasswordFocus,

    // 辅助函数
    getDefaultLocalPath,
    getHostnameFromUrl,
  };
}
