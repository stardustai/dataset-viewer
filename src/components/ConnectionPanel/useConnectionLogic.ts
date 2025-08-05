import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StorageClientType, ConnectionConfig } from '../../services/storage/types';
import { StorageServiceManager } from '../../services/storage';
import { StoredConnection } from '../../services/connectionStorage';
import { getHostnameFromUrl } from '../../utils/urlUtils';

export const useConnectionLogic = (onConnect: () => void) => {
  const { t } = useTranslation();

  // 存储类型选择
  const [storageType, setStorageType] = useState<StorageClientType>('webdav');

  // WebDAV 连接状态
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [selectedStoredConnection, setSelectedStoredConnection] = useState<StoredConnection | null>(null);
  const [isPasswordFromStorage, setIsPasswordFromStorage] = useState(false);

  // 本地文件系统连接状态
  const [defaultLocalPath, setDefaultLocalPath] = useState('');

  // 获取最近的本地连接路径
  const getRecentLocalPath = () => {
    const connections = StorageServiceManager.getStoredConnections();
    const localConnections = connections.filter(conn => conn.url.startsWith('file:///'));

    if (localConnections.length > 0) {
      const sorted = localConnections.sort((a, b) => {
        const aTime = new Date(a.lastConnected || 0).getTime();
        const bTime = new Date(b.lastConnected || 0).getTime();
        return bTime - aTime;
      });

      return sorted[0].url.replace('file:///', '');
    }

    return '';
  };

  useEffect(() => {
    const wasDisconnected = localStorage.getItem('userDisconnected') === 'true';

    if (!wasDisconnected) {
      const defaultConnection = StorageServiceManager.getDefaultConnection();
      if (defaultConnection) {
        if (defaultConnection.url.startsWith('file:///')) {
          setStorageType('local');
          const localPath = defaultConnection.url.replace('file:///', '');
          setDefaultLocalPath(localPath);
        } else if (defaultConnection.url.startsWith('oss://')) {
          setStorageType('oss');
          handleSelectStoredConnection(defaultConnection);
        } else if (defaultConnection.url.startsWith('huggingface://')) {
          setStorageType('huggingface');
          handleSelectStoredConnection(defaultConnection);
        } else {
          setStorageType('webdav');
          handleSelectStoredConnection(defaultConnection);
        }
      }
    }

    localStorage.removeItem('userDisconnected');
  }, []);

  const handleSelectStoredConnection = (connection: StoredConnection) => {
    setSelectedStoredConnection(connection);
    setError('');

    if (connection.url.startsWith('file:///')) {
      setStorageType('local');
      const localPath = connection.url.replace('file:///', '');
      setDefaultLocalPath(localPath);
    } else if (connection.url.startsWith('oss://')) {
      setStorageType('oss');
    } else if (connection.url.startsWith('huggingface://')) {
      setStorageType('huggingface');
    } else {
      setStorageType('webdav');
      setUrl(connection.url);
      setUsername(connection.username);
      if (connection.password) {
        setPassword('••••••••');
        setIsPasswordFromStorage(true);
      } else {
        setPassword('');
        setIsPasswordFromStorage(false);
      }
    }
  };

  const handleWebDAVConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    const connectionName = selectedStoredConnection ?
      selectedStoredConnection.name :
      t('connection.name.webdav', 'WebDAV({{host}})', { host: getHostnameFromUrl(url) });

    const actualPassword = isPasswordFromStorage && selectedStoredConnection?.password
      ? selectedStoredConnection.password
      : password;

    const config: ConnectionConfig = {
      type: 'webdav',
      url,
      username,
      password: actualPassword,
      name: connectionName
    };

    await handleConnect(config);
  };

  const handleLocalConnect = async (rootPath: string) => {
    const config: ConnectionConfig = {
      type: 'local',
      rootPath,
      url: rootPath, // 兼容性
      name: t('connection.name.local', '本机文件({{path}})', { path: rootPath })
    };

    await handleConnect(config);
  };

  const handleOSSConnect = async (config: ConnectionConfig) => {
    await handleConnect(config);
  };

  const handleHuggingFaceConnect = async (config: ConnectionConfig) => {
    await handleConnect(config);
  };

  // 统一的连接处理方法
  const handleConnect = async (config: ConnectionConfig) => {
    setConnecting(true);
    setError('');

    try {
      const success = await StorageServiceManager.connectWithConfig(config);
      if (success) {
        onConnect();
      } else {
        setError(t(`error.${config.type}.connection.failed`));
      }
    } catch (err) {
      console.error(`${config.type} connection error:`, err);
      setError(err instanceof Error ? err.message : t('error.connection.failed'));
    } finally {
      setConnecting(false);
    }
  };

  const handleStorageTypeChange = (type: StorageClientType) => {
    setStorageType(type);
    setError('');

    if (type === 'webdav') {
      if (selectedStoredConnection && !selectedStoredConnection.url.startsWith('file:///') && !selectedStoredConnection.url.startsWith('oss://') && !selectedStoredConnection.url.startsWith('huggingface://')) {
        // 保持 WebDAV 连接选择
      } else {
        setSelectedStoredConnection(null);
        setUrl('');
        setUsername('');
        setPassword('');
        setIsPasswordFromStorage(false);
      }
    } else if (type === 'local') {
      if (selectedStoredConnection && selectedStoredConnection.url.startsWith('file:///')) {
        const localPath = selectedStoredConnection.url.replace('file:///', '');
        setDefaultLocalPath(localPath);
      } else {
        setSelectedStoredConnection(null);
        if (!defaultLocalPath) {
          const recentPath = getRecentLocalPath();
          if (recentPath) {
            setDefaultLocalPath(recentPath);
          }
        }
      }
    } else if (type === 'oss') {
      if (!selectedStoredConnection || !selectedStoredConnection.url.startsWith('oss://')) {
        setSelectedStoredConnection(null);
      }
    } else if (type === 'huggingface') {
      if (!selectedStoredConnection || !selectedStoredConnection.url.startsWith('huggingface://')) {
        setSelectedStoredConnection(null);
      }
    }

    if (type !== 'webdav') {
      setUrl('');
      setUsername('');
      setPassword('');
      setIsPasswordFromStorage(false);
    }
  };

  const handleUrlChange = (value: string) => {
    setUrl(value.trim());
    setSelectedStoredConnection(null);
    if (isPasswordFromStorage) {
      setPassword('');
      setIsPasswordFromStorage(false);
    }
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value.trim());
    setSelectedStoredConnection(null);
    if (isPasswordFromStorage) {
      setPassword('');
      setIsPasswordFromStorage(false);
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
  };

  const handlePasswordFocus = () => {
    if (isPasswordFromStorage) {
      setPassword('');
      setIsPasswordFromStorage(false);
    }
  };

  return {
    storageType,
    selectedStoredConnection,
    url,
    username,
    password,
    connecting,
    error,
    isPasswordFromStorage,
    defaultLocalPath,
    handleStorageTypeChange,
    handleSelectStoredConnection,
    handleWebDAVConnect,
    handleLocalConnect,
    handleOSSConnect,
    handleHuggingFaceConnect,
    handleUrlChange,
    handleUsernameChange,
    handlePasswordChange,
    handlePasswordFocus
  };
};
