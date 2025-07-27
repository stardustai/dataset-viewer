import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StorageClientType, ConnectionConfig } from '../../services/storage/types';
import { StorageServiceManager } from '../../services/storage';
import { StoredConnection } from '../../services/connectionStorage';

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
  const savePassword = true;

  // 本地文件系统连接状态
  const [defaultLocalPath, setDefaultLocalPath] = useState('');

  // 获取最近的本地连接路径
  const getRecentLocalPath = () => {
    const connections = StorageServiceManager.getStoredConnections();
    const localConnections = connections.filter(conn => conn.url.startsWith('local://'));

    if (localConnections.length > 0) {
      const sorted = localConnections.sort((a, b) => {
        const aTime = new Date(a.lastConnected || 0).getTime();
        const bTime = new Date(b.lastConnected || 0).getTime();
        return bTime - aTime;
      });

      return sorted[0].url.replace('local://', '');
    }

    return '';
  };

  useEffect(() => {
    const wasDisconnected = localStorage.getItem('userDisconnected') === 'true';

    if (!wasDisconnected) {
      const defaultConnection = StorageServiceManager.getDefaultConnection();
      if (defaultConnection) {
        if (defaultConnection.url.startsWith('local://')) {
          setStorageType('local');
          const localPath = defaultConnection.url.replace('local://', '');
          setDefaultLocalPath(localPath);
        } else if (defaultConnection.url.startsWith('oss://')) {
          setStorageType('oss');
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

    if (connection.url.startsWith('local://')) {
      setStorageType('local');
      const localPath = connection.url.replace('local://', '');
      setDefaultLocalPath(localPath);
    } else if (connection.url.startsWith('oss://')) {
      setStorageType('oss');
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
    setConnecting(true);
    setError('');

    try {
      const connectionName = selectedStoredConnection ?
        selectedStoredConnection.name :
        t('connection.name.webdav', 'WebDAV({{host}})', { host: new URL(url).hostname });

      const actualPassword = isPasswordFromStorage && selectedStoredConnection?.password
        ? selectedStoredConnection.password
        : password;

      const success = await StorageServiceManager.connect(url, username, actualPassword, true, connectionName, savePassword);
      if (success) {
        if (selectedStoredConnection) {
          StorageServiceManager.setDefaultConnection(selectedStoredConnection.id);
        }
        onConnect();
      } else {
        setError(t('error.credentials'));
      }
    } catch (err) {
      setError(t('error.connection.failed'));
    } finally {
      setConnecting(false);
    }
  };

  const handleLocalConnect = async (rootPath: string) => {
    setConnecting(true);
    setError('');

    try {
      if (StorageServiceManager.isConnected()) {
        StorageServiceManager.disconnect();
      }

      const success = await StorageServiceManager.connectToLocal(
        rootPath,
        true,
        t('connection.name.local', '本机文件({{path}})', { path: rootPath })
      );

      if (success) {
        const connections = StorageServiceManager.getStoredConnections();
        const localConnection = connections.find(conn =>
          conn.url.startsWith('local://') && conn.url.includes(rootPath)
        );
        if (localConnection) {
          StorageServiceManager.setDefaultConnection(localConnection.id);
        }
        onConnect();
      } else {
        setError(t('local.error.access'));
      }
    } catch (err) {
      console.error('Local connection error:', err);
      setError(t('local.error.connection'));
    } finally {
      setConnecting(false);
    }
  };

  const handleOSSConnect = async (config: ConnectionConfig) => {
    setConnecting(true);
    setError('');

    try {
      if (StorageServiceManager.isConnected()) {
        StorageServiceManager.disconnect();
      }

      const success = await StorageServiceManager.connectToOSS(config);

      if (success) {
        const connections = StorageServiceManager.getStoredConnections();
        const ossConnection = connections.find(conn =>
          conn.url.startsWith('oss://') && conn.username === config.username
        );
        if (ossConnection) {
          StorageServiceManager.setDefaultConnection(ossConnection.id);
        }
        onConnect();
      } else {
        setError(t('error.oss.connection.failed'));
      }
    } catch (err) {
      console.error('OSS connection error:', err);
      setError(err instanceof Error ? err.message : t('error.connection.failed'));
    } finally {
      setConnecting(false);
    }
  };

  const handleStorageTypeChange = (type: StorageClientType) => {
    setStorageType(type);
    setError('');

    if (type === 'webdav') {
      if (selectedStoredConnection && !selectedStoredConnection.url.startsWith('local://') && !selectedStoredConnection.url.startsWith('oss://')) {
        // 保持 WebDAV 连接选择
      } else {
        setSelectedStoredConnection(null);
        setUrl('');
        setUsername('');
        setPassword('');
        setIsPasswordFromStorage(false);
      }
    } else if (type === 'local') {
      if (selectedStoredConnection && selectedStoredConnection.url.startsWith('local://')) {
        const localPath = selectedStoredConnection.url.replace('local://', '');
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
    }

    if (type !== 'webdav') {
      setUrl('');
      setUsername('');
      setPassword('');
      setIsPasswordFromStorage(false);
    }
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setSelectedStoredConnection(null);
    if (isPasswordFromStorage) {
      setPassword('');
      setIsPasswordFromStorage(false);
    }
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
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
    handleUrlChange,
    handleUsernameChange,
    handlePasswordChange,
    handlePasswordFocus
  };
};
