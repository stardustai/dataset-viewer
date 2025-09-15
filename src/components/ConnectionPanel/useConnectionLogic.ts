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

  // 保留必要的兼容性状态
  const isPasswordFromStorage = formData.isPasswordFromStorage || false;

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
    // 使用最近的连接信息预填表单，但不自动连接
    const defaultConnection = StorageServiceManager.getDefaultConnection();
    if (defaultConnection) {
      handleSelectStoredConnection(defaultConnection);
    }
  }, []);

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
        adapter.buildConnectionConfig?.(formData, selectedStoredConnection || undefined) ||
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

  // 新增：使用当前表单数据连接
  const handleConnectWithCurrentForm = async () => {
    await handleConnectWithValidation(storageType, formData);
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
  };

  return {
    // 核心状态
    storageType,
    connecting,
    error,
    selectedStoredConnection,
    formData,
    validationErrors,
    isPasswordFromStorage,

    // 核心处理函数
    updateFormData,
    handleStorageTypeChange,
    handleSelectStoredConnection,
    handleConnectWithCurrentForm,
    handleFormDataChange: (updates: Partial<Record<string, any>>) => {
      setFormData(prev => ({ ...prev, ...updates }));
    },

    // 保留的状态设置函数（用于外部调用）
    setStorageType,
    setError,
    setSelectedStoredConnection,
  };
}
