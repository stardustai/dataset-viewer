import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

export interface OSSPlatform {
  id: string;
  name: string;
  endpoint: string;
  regions: Array<{
    id: string;
    name: string;
    endpoint: string;
  }>;
  defaultRegion?: string;
  description?: string;
}

// 常见OSS平台预设配置
export const OSS_PLATFORMS: OSSPlatform[] = [
  {
    id: 'aliyun',
    name: '阿里云 OSS',
    endpoint: 'https://oss-{region}.aliyuncs.com',
    defaultRegion: 'cn-hangzhou',
    description: 'Alibaba Cloud Object Storage Service',
    regions: [
      {
        id: 'cn-hangzhou',
        name: '华东1（杭州）',
        endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
      },
      {
        id: 'cn-shanghai',
        name: '华东2（上海）',
        endpoint: 'https://oss-cn-shanghai.aliyuncs.com',
      },
      { id: 'cn-qingdao', name: '华北1（青岛）', endpoint: 'https://oss-cn-qingdao.aliyuncs.com' },
      { id: 'cn-beijing', name: '华北2（北京）', endpoint: 'https://oss-cn-beijing.aliyuncs.com' },
      {
        id: 'cn-zhangjiakou',
        name: '华北3（张家口）',
        endpoint: 'https://oss-cn-zhangjiakou.aliyuncs.com',
      },
      {
        id: 'cn-huhehaote',
        name: '华北5（呼和浩特）',
        endpoint: 'https://oss-cn-huhehaote.aliyuncs.com',
      },
      {
        id: 'cn-wulanchabu',
        name: '华北6（乌兰察布）',
        endpoint: 'https://oss-cn-wulanchabu.aliyuncs.com',
      },
      {
        id: 'cn-shenzhen',
        name: '华南1（深圳）',
        endpoint: 'https://oss-cn-shenzhen.aliyuncs.com',
      },
      { id: 'cn-heyuan', name: '华南2（河源）', endpoint: 'https://oss-cn-heyuan.aliyuncs.com' },
      {
        id: 'cn-guangzhou',
        name: '华南3（广州）',
        endpoint: 'https://oss-cn-guangzhou.aliyuncs.com',
      },
      { id: 'cn-chengdu', name: '西南1（成都）', endpoint: 'https://oss-cn-chengdu.aliyuncs.com' },
      { id: 'cn-hongkong', name: '中国香港', endpoint: 'https://oss-cn-hongkong.aliyuncs.com' },
      {
        id: 'us-west-1',
        name: '美国西部1（硅谷）',
        endpoint: 'https://oss-us-west-1.aliyuncs.com',
      },
      {
        id: 'us-east-1',
        name: '美国东部1（弗吉尼亚）',
        endpoint: 'https://oss-us-east-1.aliyuncs.com',
      },
      {
        id: 'ap-southeast-1',
        name: '亚太东南1（新加坡）',
        endpoint: 'https://oss-ap-southeast-1.aliyuncs.com',
      },
      {
        id: 'ap-southeast-2',
        name: '亚太东南2（悉尼）',
        endpoint: 'https://oss-ap-southeast-2.aliyuncs.com',
      },
      {
        id: 'ap-southeast-3',
        name: '亚太东南3（吉隆坡）',
        endpoint: 'https://oss-ap-southeast-3.aliyuncs.com',
      },
      {
        id: 'ap-southeast-5',
        name: '亚太东南5（雅加达）',
        endpoint: 'https://oss-ap-southeast-5.aliyuncs.com',
      },
      {
        id: 'ap-northeast-1',
        name: '亚太东北1（日本）',
        endpoint: 'https://oss-ap-northeast-1.aliyuncs.com',
      },
      {
        id: 'ap-south-1',
        name: '亚太南部1（孟买）',
        endpoint: 'https://oss-ap-south-1.aliyuncs.com',
      },
      {
        id: 'eu-central-1',
        name: '欧洲中部1（法兰克福）',
        endpoint: 'https://oss-eu-central-1.aliyuncs.com',
      },
      { id: 'eu-west-1', name: '英国（伦敦）', endpoint: 'https://oss-eu-west-1.aliyuncs.com' },
      {
        id: 'me-east-1',
        name: '中东东部1（迪拜）',
        endpoint: 'https://oss-me-east-1.aliyuncs.com',
      },
    ],
  },
  {
    id: 'aws',
    name: 'AWS S3',
    endpoint: 'https://s3.{region}.amazonaws.com',
    defaultRegion: 'us-east-1',
    description: 'Amazon Simple Storage Service',
    regions: [
      {
        id: 'us-east-1',
        name: '默认区域 - US East (N. Virginia)',
        endpoint: 'https://s3.amazonaws.com',
      },
      { id: 'us-east-2', name: 'US East (Ohio)', endpoint: 'https://s3.us-east-2.amazonaws.com' },
      {
        id: 'us-west-1',
        name: 'US West (N. California)',
        endpoint: 'https://s3.us-west-1.amazonaws.com',
      },
      { id: 'us-west-2', name: 'US West (Oregon)', endpoint: 'https://s3.us-west-2.amazonaws.com' },
      {
        id: 'ap-south-1',
        name: 'Asia Pacific (Mumbai)',
        endpoint: 'https://s3.ap-south-1.amazonaws.com',
      },
      {
        id: 'ap-northeast-1',
        name: 'Asia Pacific (Tokyo)',
        endpoint: 'https://s3.ap-northeast-1.amazonaws.com',
      },
      {
        id: 'ap-northeast-2',
        name: 'Asia Pacific (Seoul)',
        endpoint: 'https://s3.ap-northeast-2.amazonaws.com',
      },
      {
        id: 'ap-northeast-3',
        name: 'Asia Pacific (Osaka)',
        endpoint: 'https://s3.ap-northeast-3.amazonaws.com',
      },
      {
        id: 'ap-southeast-1',
        name: 'Asia Pacific (Singapore)',
        endpoint: 'https://s3.ap-southeast-1.amazonaws.com',
      },
      {
        id: 'ap-southeast-2',
        name: 'Asia Pacific (Sydney)',
        endpoint: 'https://s3.ap-southeast-2.amazonaws.com',
      },
      {
        id: 'ca-central-1',
        name: 'Canada (Central)',
        endpoint: 'https://s3.ca-central-1.amazonaws.com',
      },
      {
        id: 'eu-central-1',
        name: 'Europe (Frankfurt)',
        endpoint: 'https://s3.eu-central-1.amazonaws.com',
      },
      { id: 'eu-west-1', name: 'Europe (Ireland)', endpoint: 'https://s3.eu-west-1.amazonaws.com' },
      { id: 'eu-west-2', name: 'Europe (London)', endpoint: 'https://s3.eu-west-2.amazonaws.com' },
      { id: 'eu-west-3', name: 'Europe (Paris)', endpoint: 'https://s3.eu-west-3.amazonaws.com' },
      {
        id: 'eu-north-1',
        name: 'Europe (Stockholm)',
        endpoint: 'https://s3.eu-north-1.amazonaws.com',
      },
      {
        id: 'sa-east-1',
        name: 'South America (São Paulo)',
        endpoint: 'https://s3.sa-east-1.amazonaws.com',
      },
    ],
  },
  {
    id: 'tencent',
    name: '腾讯云 COS',
    endpoint: 'https://cos.{region}.myqcloud.com',
    defaultRegion: 'ap-beijing',
    description: 'Tencent Cloud Object Storage',
    regions: [
      { id: 'ap-beijing-1', name: '北京一区', endpoint: 'https://cos.ap-beijing-1.myqcloud.com' },
      { id: 'ap-beijing', name: '北京', endpoint: 'https://cos.ap-beijing.myqcloud.com' },
      { id: 'ap-nanjing', name: '南京', endpoint: 'https://cos.ap-nanjing.myqcloud.com' },
      { id: 'ap-shanghai', name: '上海', endpoint: 'https://cos.ap-shanghai.myqcloud.com' },
      { id: 'ap-guangzhou', name: '广州', endpoint: 'https://cos.ap-guangzhou.myqcloud.com' },
      { id: 'ap-chengdu', name: '成都', endpoint: 'https://cos.ap-chengdu.myqcloud.com' },
      { id: 'ap-chongqing', name: '重庆', endpoint: 'https://cos.ap-chongqing.myqcloud.com' },
      {
        id: 'ap-shenzhen-fsi',
        name: '深圳金融',
        endpoint: 'https://cos.ap-shenzhen-fsi.myqcloud.com',
      },
      {
        id: 'ap-shanghai-fsi',
        name: '上海金融',
        endpoint: 'https://cos.ap-shanghai-fsi.myqcloud.com',
      },
      {
        id: 'ap-beijing-fsi',
        name: '北京金融',
        endpoint: 'https://cos.ap-beijing-fsi.myqcloud.com',
      },
      { id: 'ap-hongkong', name: '中国香港', endpoint: 'https://cos.ap-hongkong.myqcloud.com' },
      { id: 'ap-singapore', name: '新加坡', endpoint: 'https://cos.ap-singapore.myqcloud.com' },
      { id: 'ap-mumbai', name: '孟买', endpoint: 'https://cos.ap-mumbai.myqcloud.com' },
      { id: 'ap-jakarta', name: '雅加达', endpoint: 'https://cos.ap-jakarta.myqcloud.com' },
      { id: 'ap-seoul', name: '首尔', endpoint: 'https://cos.ap-seoul.myqcloud.com' },
      { id: 'ap-bangkok', name: '曼谷', endpoint: 'https://cos.ap-bangkok.myqcloud.com' },
      { id: 'ap-tokyo', name: '东京', endpoint: 'https://cos.ap-tokyo.myqcloud.com' },
      {
        id: 'na-siliconvalley',
        name: '硅谷',
        endpoint: 'https://cos.na-siliconvalley.myqcloud.com',
      },
      { id: 'na-ashburn', name: '弗吉尼亚', endpoint: 'https://cos.na-ashburn.myqcloud.com' },
      { id: 'na-toronto', name: '多伦多', endpoint: 'https://cos.na-toronto.myqcloud.com' },
      { id: 'eu-frankfurt', name: '法兰克福', endpoint: 'https://cos.eu-frankfurt.myqcloud.com' },
      { id: 'eu-moscow', name: '莫斯科', endpoint: 'https://cos.eu-moscow.myqcloud.com' },
    ],
  },
  {
    id: 'huawei',
    name: '华为云 OBS',
    endpoint: 'https://obs.{region}.myhuaweicloud.com',
    defaultRegion: 'cn-north-1',
    description: 'Huawei Cloud Object Storage Service',
    regions: [
      {
        id: 'cn-north-1',
        name: '华北-北京一',
        endpoint: 'https://obs.cn-north-1.myhuaweicloud.com',
      },
      {
        id: 'cn-north-4',
        name: '华北-北京四',
        endpoint: 'https://obs.cn-north-4.myhuaweicloud.com',
      },
      {
        id: 'cn-north-9',
        name: '华北-乌兰察布一',
        endpoint: 'https://obs.cn-north-9.myhuaweicloud.com',
      },
      { id: 'cn-east-2', name: '华东-上海二', endpoint: 'https://obs.cn-east-2.myhuaweicloud.com' },
      { id: 'cn-east-3', name: '华东-上海一', endpoint: 'https://obs.cn-east-3.myhuaweicloud.com' },
      { id: 'cn-south-1', name: '华南-广州', endpoint: 'https://obs.cn-south-1.myhuaweicloud.com' },
      {
        id: 'cn-southwest-2',
        name: '西南-贵阳一',
        endpoint: 'https://obs.cn-southwest-2.myhuaweicloud.com',
      },
      {
        id: 'ap-southeast-1',
        name: '亚太-香港',
        endpoint: 'https://obs.ap-southeast-1.myhuaweicloud.com',
      },
      {
        id: 'ap-southeast-2',
        name: '亚太-曼谷',
        endpoint: 'https://obs.ap-southeast-2.myhuaweicloud.com',
      },
      {
        id: 'ap-southeast-3',
        name: '亚太-新加坡',
        endpoint: 'https://obs.ap-southeast-3.myhuaweicloud.com',
      },
      {
        id: 'af-south-1',
        name: '非洲-约翰内斯堡',
        endpoint: 'https://obs.af-south-1.myhuaweicloud.com',
      },
    ],
  },
  {
    id: 'minio',
    name: 'MinIO',
    endpoint: 'http://localhost:9000',
    defaultRegion: 'us-east-1',
    description: 'Self-hosted MinIO Server',
    regions: [{ id: 'us-east-1', name: 'Default Region', endpoint: 'http://localhost:9000' }],
  },
  {
    id: 'custom',
    name: '自定义',
    endpoint: '',
    description: 'Custom S3-compatible endpoint',
    regions: [],
  },
] as const;

interface OSSPlatformSelectorProps {
  selectedPlatform: string;
  selectedRegion: string;
  customEndpoint: string;
  onPlatformChange: (platformId: string) => void;
  onRegionChange: (regionId: string) => void;
  onCustomEndpointChange: (endpoint: string) => void;
  disabled?: boolean;
}

export const OSSPlatformSelector: React.FC<OSSPlatformSelectorProps> = ({
  selectedPlatform,
  selectedRegion,
  customEndpoint,
  onPlatformChange,
  onRegionChange,
  onCustomEndpointChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const currentPlatform = OSS_PLATFORMS.find(p => p.id === selectedPlatform);
  const isCustom = selectedPlatform === 'custom';

  return (
    <div className="space-y-4">
      {/* 平台和区域/端点选择 - 放在同一行 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 平台选择 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('oss.platform.select', '选择平台')}
          </label>
          <div className="relative">
            <select
              value={selectedPlatform}
              onChange={e => onPlatformChange(e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none pr-10"
            >
              {OSS_PLATFORMS.map(platform => (
                <option key={platform.id} value={platform.id}>
                  {t(`oss.platforms.${platform.id}`, platform.name)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* 区域选择或自定义端点 */}
        <div>
          <label
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            title={
              isCustom
                ? t('oss.endpoint.custom.description', '输入兼容 S3 API 的对象存储服务端点')
                : undefined
            }
          >
            {isCustom ? t('oss.endpoint.custom', '自定义端点') : t('oss.region.select', '选择区域')}
          </label>
          {isCustom ? (
            <input
              type="url"
              value={customEndpoint}
              onChange={e => onCustomEndpointChange(e.target.value)}
              placeholder={t('oss.endpoint.placeholder')}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          ) : (
            currentPlatform &&
            currentPlatform.regions.length > 0 && (
              <div className="relative">
                <select
                  value={selectedRegion}
                  onChange={e => onRegionChange(e.target.value)}
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white appearance-none pr-10"
                >
                  {currentPlatform.regions.map(region => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
