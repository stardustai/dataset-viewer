import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PasswordInput } from '../../common';
import { ConnectButton, ErrorDisplay } from '../common';
import { OSS_PLATFORMS, OSSPlatformSelector } from '../OSSPlatformSelector';
import type { UnifiedConnectionFormProps } from './types';

interface OSSConnectionFormProps extends UnifiedConnectionFormProps {
  config: {
    endpoint?: string;
    accessKey?: string;
    secretKey?: string;
    bucket?: string;
    region?: string;
    platform?: string;
  };
}

/**
 * OSS 连接表单组件
 * 支持阿里云 OSS、AWS S3 等兼容的对象存储服务
 */
export const OSSConnectionForm: React.FC<OSSConnectionFormProps> = ({
  config,
  onChange,
  connecting,
  error,
  onConnect,
  isPasswordFromStorage = false,
}) => {
  const { t } = useTranslation();

  // 从 adapter 的默认配置获取默认值
  const fallbackPlatform = OSS_PLATFORMS.find(p => p.id === 'aliyun');
  const fallbackRegion = 'cn-hangzhou';
  const fallbackEndpoint =
    fallbackPlatform?.regions.find(r => r.id === fallbackRegion)?.endpoint || '';

  // 从 config 中获取当前配置，如果没有则使用默认值
  const currentConfig = {
    endpoint: config.endpoint || fallbackEndpoint,
    accessKey: config.accessKey || '',
    secretKey: config.secretKey || '',
    bucket: config.bucket || '',
    region: config.region || fallbackRegion,
    platform: config.platform || 'aliyun',
  };

  // 平台选择相关状态
  const [selectedPlatform, setSelectedPlatform] = useState(currentConfig.platform);
  const [selectedRegion, setSelectedRegion] = useState(currentConfig.region);
  const [customEndpoint, setCustomEndpoint] = useState(
    currentConfig.platform === 'custom' ? currentConfig.endpoint : ''
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  // 处理平台变化
  const handlePlatformChange = (platformId: string) => {
    setSelectedPlatform(platformId);
    const platform = OSS_PLATFORMS.find(p => p.id === platformId);

    if (platform) {
      if (platformId === 'custom') {
        // 自定义平台，清空端点让用户输入
        setCustomEndpoint('');
        onChange({ ...currentConfig, endpoint: '', region: '', platform: platformId });
      } else {
        // 预设平台，设置默认区域
        const defaultRegion = platform.defaultRegion || platform.regions[0]?.id || '';
        setSelectedRegion(defaultRegion);

        // 更新端点和区域
        const regionData = platform.regions.find(r => r.id === defaultRegion);
        const endpoint =
          regionData?.endpoint || platform.endpoint.replace('{region}', defaultRegion);

        onChange({
          ...currentConfig,
          endpoint: endpoint,
          region: defaultRegion,
          platform: platformId,
        });
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

      onChange({
        ...currentConfig,
        endpoint: endpoint,
        region: regionId,
      });
    }
  };

  // 处理自定义端点变化
  const handleCustomEndpointChange = (endpoint: string) => {
    setCustomEndpoint(endpoint);
    onChange({ ...currentConfig, endpoint: endpoint });
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // 验证端点
    const endpointToValidate =
      selectedPlatform === 'custom' ? customEndpoint : currentConfig.endpoint;
    if (!endpointToValidate?.trim()) {
      newErrors.endpoint = t('error.endpoint.required');
    } else {
      try {
        new URL(endpointToValidate);
      } catch {
        newErrors.endpoint = t('error.endpoint.invalid');
      }
    }

    if (!currentConfig.accessKey?.trim()) {
      newErrors.accessKey = t('error.access.key.required');
    }

    if (!currentConfig.secretKey?.trim()) {
      newErrors.secretKey = t('error.secret.key.required');
    }

    if (!currentConfig.bucket?.trim()) {
      newErrors.bucket = t('error.bucket.required');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    onConnect();
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

    onChange({ ...currentConfig, [field]: processedValue });

    // 清除对应字段的错误
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorDisplay error={error || ''} />

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
        {errors.endpoint && <ErrorDisplay error={errors.endpoint} />}

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
              value={currentConfig.accessKey}
              onChange={e => handleInputChange('accessKey', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.accessKey ? 'border-red-300 dark:border-red-600' : 'border-gray-300'
              }`}
              placeholder={t('oss.access.key.placeholder')}
              disabled={connecting}
              required
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
            <PasswordInput
              id="secretKey"
              value={currentConfig.secretKey}
              onChange={value => handleInputChange('secretKey', value)}
              placeholder={t('oss.secret.key.placeholder')}
              isFromStorage={isPasswordFromStorage}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.secretKey ? 'border-red-300 dark:border-red-600' : 'border-gray-300'
              }`}
              required
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
                value={currentConfig.bucket}
                onChange={e => handleInputChange('bucket', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                  errors.bucket ? 'border-red-300 dark:border-red-600' : 'border-gray-300'
                }`}
                placeholder={t('oss.bucket.placeholder')}
                disabled={connecting}
                required
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
                value={currentConfig.region}
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
              value={currentConfig.bucket}
              onChange={e => handleInputChange('bucket', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.bucket ? 'border-red-300 dark:border-red-600' : 'border-gray-300'
              }`}
              placeholder={t('oss.bucket.placeholder')}
              disabled={connecting}
              required
            />
            {errors.bucket && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.bucket}</p>
            )}
          </div>
        )}

        <ConnectButton connecting={connecting} />

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
