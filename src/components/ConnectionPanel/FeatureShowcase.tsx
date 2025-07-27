import React from 'react';
import { useTranslation } from 'react-i18next';

export const FeatureShowcase: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="hidden lg:block space-y-8 pl-8">
      {/* 主标题和介绍 */}
      <div className="text-left">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          {t('webdav.browser')}
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-6">
          {t('app.tagline')}
        </p>
      </div>

      {/* 功能特性 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('features.title')}
        </h3>
        <div className="grid gap-3">
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2"></div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                {t('features.large_files')}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('features.large_files.desc')}
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2"></div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                {t('features.archive_preview')}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('features.archive_preview.desc')}
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2"></div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                {t('features.virtual_scrolling')}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('features.virtual_scrolling.desc')}
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2"></div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                {t('features.multi_storage')}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('features.multi_storage.desc')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 技术栈标签 */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {t('tech.stack')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {['Tauri', 'React', 'TypeScript', 'Rust', 'Tailwind CSS'].map((tech) => (
            <span
              key={tech}
              className="px-3 py-1 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 rounded-full"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
