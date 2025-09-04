import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectionConfig } from '../../services/storage/types';
import { StoredConnection } from '../../services/connectionStorage';
import { OSSPlatformSelector, OSS_PLATFORMS } from './OSSPlatformSelector';

interface OSSConnectionFormProps {
  onConnect: (config: ConnectionConfig) => Promise<void>;
  connecting: boolean;
  error?: string;
  selectedConnection?: StoredConnection | null;
}

/**
 * OSS 连接表单组件
 * 支持阿里云 OSS、AWS S3 等兼容的对象存储服务
 */
export const OSSConnectionForm: React.FC<OSSConnectionFormProps> = ({
  onConnect,
  connecting,
  error: externalError,
  selectedConnection,
}) => {
  const { t } = useTranslation();

  // 获取默认平台和端点
  const defaultPlatform = OSS_PLATFORMS.find(p => p.id === 'aliyun');
  const defaultRegion = 'cn-hangzhou';
  const defaultEndpoint =
    defaultPlatform?.regions.find(r => r.id === defaultRegion)?.endpoint || '';

  const [config, setConfig] = useState({
    endpoint: defaultEndpoint,
    accessKey: '',
    secretKey: '',
    bucket: '',
    region: defaultRegion,
  });

  // 平台选择相关状态
  const [selectedPlatform, setSelectedPlatform] = useState('aliyun');
  const [selectedRegion, setSelectedRegion] = useState('cn-hangzhou');
  const [customEndpoint, setCustomEndpoint] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});

  // 处理平台变化
  const handlePlatformChange = (platformId: string) => {
    setSelectedPlatform(platformId);
    const platform = OSS_PLATFORMS.find(p => p.id === platformId);

    if (platform) {
      if (platformId === 'custom') {
        // 自定义平台，清空端点让用户输入
        setConfig(prev => ({ ...prev, endpoint: '', region: '' }));
        setCustomEndpoint('');
      } else {
        // 预设平台，设置默认区域
        const defaultRegion = platform.defaultRegion || platform.regions[0]?.id || '';
        setSelectedRegion(defaultRegion);

        // 更新端点和区域
        const regionData = platform.regions.find(r => r.id === defaultRegion);
        const endpoint =
          regionData?.endpoint || platform.endpoint.replace('{region}', defaultRegion);

        setConfig(prev => ({
          ...prev,
          endpoint: endpoint,
          region: defaultRegion,
        }));
      }
    }
  };

  // 处理区域变化
  const handleRegionChange = (regionId: string) => {
    setSelectedRegion(regionId);
    const platform = OSS_PLATFORMS.find(p => p.id === selectedPlatform);

    if (platform && platform.id !== 'custom') {
      const regionData = platform.regions.find(r => r.id === regionId);
      const endpoint = regionData?.endpoint || platform.endpoint.replace('{region}', regionId);

      setConfig(prev => ({
        ...prev,
        endpoint: endpoint,
        region: regionId,
      }));
    }
  };

  // 处理自定义端点变化
  const handleCustomEndpointChange = (endpoint: string) => {
    setCustomEndpoint(endpoint);
    setConfig(prev => ({ ...prev, endpoint: endpoint }));
  };

  // 当选中连接变化时，更新表单
  useEffect(() => {
    if (selectedConnection && selectedConnection.config.type === 'oss') {
      try {
        const config = selectedConnection.config;

        // 从配置中获取信息
        const bucket = config.bucket || '';
        const endpoint = config.endpoint || '';
        const region = config.region || '';
        const platform = config.platform || 'custom';

        // 尝试匹配平台
        let matchedPlatform = platform;
        let matchedRegion = region;

        // 如果没有明确的平台信息，尝试根据endpoint匹配
        if (platform === 'custom' || !platform) {
          for (const platformInfo of OSS_PLATFORMS) {
            if (platformInfo.id === 'custom') continue;

            const regionMatch = platformInfo.regions.find(
              r =>
                r.endpoint === endpoint ||
                endpoint.includes(r.id) ||
                (platformInfo.endpoint.includes('{region}') && endpoint.includes(r.id))
            );

            if (regionMatch) {
              matchedPlatform = platformInfo.id;
              matchedRegion = regionMatch.id;
              break;
            }
          }
        }

        // 更新平台和区域状态
        setSelectedPlatform(matchedPlatform);
        setSelectedRegion(matchedRegion);

        if (matchedPlatform === 'custom') {
          setCustomEndpoint(endpoint);
        }

        setConfig({
          endpoint: endpoint,
          accessKey: config.username || '',
          secretKey: config.password ? '••••••••' : '',
          bucket: bucket,
          region: matchedRegion,
        });
      } catch (error) {
        console.error('Failed to parse OSS connection:', error);
        // 如果解析失败，使用自定义模式
        setSelectedPlatform('custom');
        setCustomEndpoint(selectedConnection.config.endpoint || '');
        setConfig({
          endpoint: selectedConnection.config.endpoint || '',
          accessKey: selectedConnection.config.username || '',
          secretKey: selectedConnection.config.password ? '••••••••' : '',
          bucket: selectedConnection.config.bucket || '',
          region: selectedConnection.config.region || '',
        });
      }
    } else if (!selectedConnection) {
      // 清空表单，恢复默认值
      setSelectedPlatform('aliyun');
      setSelectedRegion('cn-hangzhou');
      setCustomEndpoint('');

      // 设置默认端点
      const defaultPlatform = OSS_PLATFORMS.find(p => p.id === 'aliyun');
      const defaultEndpoint =
        defaultPlatform?.regions.find(r => r.id === 'cn-hangzhou')?.endpoint || '';

      setConfig({
        endpoint: defaultEndpoint,
        accessKey: '',
        secretKey: '',
        bucket: '',
        region: 'cn-hangzhou',
      });
    }
  }, [selectedConnection]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // 验证端点
    const endpointToValidate = selectedPlatform === 'custom' ? customEndpoint : config.endpoint;
    if (!endpointToValidate.trim()) {
      newErrors.endpoint = t('error.endpoint.required');
    } else {
      try {
        new URL(endpointToValidate);
      } catch {
        newErrors.endpoint = t('error.endpoint.invalid');
      }
    }

    if (!config.accessKey.trim()) {
      newErrors.accessKey = t('error.access.key.required');
    }

    if (!config.secretKey.trim()) {
      newErrors.secretKey = t('error.secret.key.required');
    }

    if (!config.bucket.trim()) {
      newErrors.bucket = t('error.bucket.required');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // 确定最终使用的端点
    const finalEndpoint = selectedPlatform === 'custom' ? customEndpoint : config.endpoint;

    // 解析 host（含端口），确保从有效的端点中提取
    let hostWithPort = '';
    try {
      const url = new URL(finalEndpoint);
      hostWithPort = url.host; // e.g., localhost:9000 或 oss-cn-hangzhou.aliyuncs.com

      // 检查主机名格式是否有效
      if (
        url.hostname.includes('/') ||
        !url.hostname.includes('.') ||
        url.hostname.split('.').length < 2
      ) {
        // 主机名格式无效，使用默认的阿里云 OSS 端点
        const region = config.region || selectedRegion || 'cn-hangzhou';
        hostWithPort = `oss-${region}.aliyuncs.com`;
      }
    } catch {
      // URL 解析失败，使用默认的阿里云 OSS 端点
      const region = config.region || selectedRegion || 'cn-hangzhou';
      hostWithPort = `oss-${region}.aliyuncs.com`;
    }

    // 生成默认连接名称
    const hostname = hostWithPort;
    const platformName = OSS_PLATFORMS.find(p => p.id === selectedPlatform)?.name || 'OSS';
    // 显示完整的桶名和路径信息
    const bucketDisplayName = config.bucket || 'Unknown';
    const defaultName =
      selectedPlatform === 'custom'
        ? t('connection.name.oss', 'OSS({{host}}-{{bucket}})', {
            host: hostname,
            bucket: bucketDisplayName,
          })
        : `${platformName}(${bucketDisplayName})`;

    // 如果密码是占位符（来自已保存的连接），使用真实密码
    const actualSecretKey =
      config.secretKey === '••••••••' && selectedConnection?.config.password
        ? selectedConnection.config.password
        : config.secretKey;

    // 处理bucket路径：移除尾部无意义的斜杠
    const cleanBucket = config.bucket.trim();
    const bucketWithPath = cleanBucket.replace(/\/+$/, ''); // 移除所有尾部斜杠

    // 检查当前配置是否与选中的连接相同（只比较桶的基础名称）
    const isConfigChanged =
      selectedConnection &&
      ((selectedConnection.config.bucket || '').split('/')[0] !== bucketWithPath.split('/')[0] ||
        selectedConnection.config.region !== (config.region || selectedRegion) ||
        selectedConnection.config.endpoint !== finalEndpoint ||
        selectedConnection.config.username !== config.accessKey);

    // 如果配置有变化，使用新生成的名称；否则保持原名称
    const connectionName = isConfigChanged ? defaultName : selectedConnection?.name || defaultName;

    const connectionConfig: ConnectionConfig = {
      type: 'oss',
      name: connectionName,
      url: finalEndpoint, // 保存实际的 HTTP 端点
      username: config.accessKey, // 使用 username 字段存储 accessKey
      password: actualSecretKey, // 使用 password 字段存储 secretKey
      bucket: bucketWithPath, // 添加 bucket 字段（清理后的）
      region: config.region || selectedRegion, // 使用选中的区域
      endpoint: finalEndpoint, // 添加 endpoint 字段
      platform: selectedPlatform, // 直接保存用户选择的平台信息
    };

    try {
      await onConnect(connectionConfig);
    } catch (error) {
      // 错误由父组件处理，这里不需要设置本地错误状态
      console.error('OSS connection failed:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    let processedValue = value.trim();

    // 如果是 bucket 字段，处理协议前缀
    if (field === 'bucket') {
      // 移除常见的协议前缀
      const protocolPrefixes = ['oss://', 's3://', 'cos://', 'obs://'];
      for (const prefix of protocolPrefixes) {
        if (processedValue.toLowerCase().startsWith(prefix)) {
          processedValue = processedValue.substring(prefix.length);
          break;
        }
      }
      // 移除开头的斜杠
      processedValue = processedValue.replace(/^\/+/, '');
    }

    setConfig(prev => ({ ...prev, [field]: processedValue }));
    // 清除对应字段的错误
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    // 如果用户修改了任何字段，清除选中的连接状态（除非是密码字段的特殊处理）
    if (selectedConnection && field !== 'secretKey') {
      // 不清除选中连接，但标记为已修改
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {externalError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{externalError}</p>
          </div>
        )}

        {/* 平台选择器 */}
        <OSSPlatformSelector
          selectedPlatform={selectedPlatform}
          selectedRegion={selectedRegion}
          customEndpoint={customEndpoint}
          onPlatformChange={handlePlatformChange}
          onRegionChange={handleRegionChange}
          onCustomEndpointChange={handleCustomEndpointChange}
          disabled={connecting}
        />
        {errors.endpoint && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-2">
            <p className="text-sm text-red-600 dark:text-red-400">{errors.endpoint}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="accessKey"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t('oss.access.key')}
            </label>
            <input
              type="text"
              id="accessKey"
              value={config.accessKey}
              onChange={e => handleInputChange('accessKey', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.accessKey ? 'border-red-300 dark:border-red-600' : 'border-gray-300'
              }`}
              placeholder={t('oss.access.key.placeholder')}
              disabled={connecting}
            />
            {errors.accessKey && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.accessKey}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="secretKey"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t('oss.secret.key')}
            </label>
            <input
              type="password"
              id="secretKey"
              value={config.secretKey}
              onChange={e => handleInputChange('secretKey', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.secretKey ? 'border-red-300 dark:border-red-600' : 'border-gray-300'
              }`}
              placeholder={t('oss.secret.key.placeholder')}
              disabled={connecting}
            />
            {errors.secretKey && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.secretKey}</p>
            )}
          </div>
        </div>

        {/* Bucket 字段 - 根据平台类型调整布局 */}
        {selectedPlatform === 'custom' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="bucket"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {t('oss.bucket')}
              </label>
              <input
                type="text"
                id="bucket"
                value={config.bucket}
                onChange={e => handleInputChange('bucket', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                  errors.bucket ? 'border-red-300 dark:border-red-600' : 'border-gray-300'
                }`}
                placeholder={t('oss.bucket.placeholder')}
                disabled={connecting}
              />
              {errors.bucket && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.bucket}</p>
              )}
            </div>

            {/* 区域信息显示 - 仅在自定义平台时允许手动输入 */}
            <div>
              <label
                htmlFor="region"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                {t('oss.region')}
              </label>
              <input
                type="text"
                id="region"
                value={config.region}
                onChange={e => handleInputChange('region', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder={t('oss.region.placeholder')}
                disabled={connecting}
              />
            </div>
          </div>
        ) : (
          <div>
            <label
              htmlFor="bucket"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t('oss.bucket')}
            </label>
            <input
              type="text"
              id="bucket"
              value={config.bucket}
              onChange={e => handleInputChange('bucket', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.bucket ? 'border-red-300 dark:border-red-600' : 'border-gray-300'
              }`}
              placeholder={t('oss.bucket.placeholder')}
              disabled={connecting}
            />
            {errors.bucket && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.bucket}</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={connecting}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                   text-white font-medium py-2 px-4 rounded-md transition-colors
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                   disabled:cursor-not-allowed flex items-center justify-center"
        >
          {connecting ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              {t('connecting')}
            </>
          ) : (
            t('connect')
          )}
        </button>

        {/* 帮助信息 */}
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>{t('oss.help.credentials.title')}</p>
          <p>1. {t('oss.help.step1')}</p>
          <p>2. {t('oss.help.step2')}</p>
          <p>3. {t('oss.help.step3')}</p>
          <p>4. {t('oss.help.step4')}</p>
        </div>
      </form>
    </>
  );
};
