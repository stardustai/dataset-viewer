import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Server, ExternalLink } from 'lucide-react';

interface DemoServerListProps {
  onSelectDemo: (url: string, username: string, password: string) => void;
}

export const DemoServerList: React.FC<DemoServerListProps> = ({ onSelectDemo }) => {
  const { t } = useTranslation();

  const demoServers = [
    {
      name: t('local.test.server'),
      description: t('local.test.desc'),
      url: 'http://localhost:8080',
      username: 'test',
      password: 'test',
    },
    {
      name: t('custom.server'),
      description: t('custom.server.desc'),
      url: '',
      username: '',
      password: '',
    },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center space-x-2 mb-4">
        <AlertCircle className="w-5 h-5 text-blue-500 dark:text-blue-400" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('quick.start')}</h3>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
        {t('quick.start.desc')}
      </p>

      <div className="space-y-4">
        {demoServers.map((server, index) => (
          <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <Server className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{server.name}</h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{server.description}</p>
                {server.url && (
                  <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <div className="flex">
                      <span className="w-16 font-medium">URL:</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300">{server.url}</span>
                    </div>
                    <div className="flex">
                      <span className="w-16 font-medium">{t('username')}:</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300">{server.username}</span>
                    </div>
                    <div className="flex">
                      <span className="w-16 font-medium">{t('password')}:</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300">{server.password}</span>
                    </div>
                  </div>
                )}
              </div>

              {server.url && (
                <button
                  onClick={() => onSelectDemo(server.url, server.username, server.password)}
                  className="ml-4 px-3 py-1 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
                >
                  {t('use.demo')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <div className="flex items-start space-x-2">
          <ExternalLink className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-800 dark:text-yellow-300">{t('setup.local.server')}</p>
            <p className="text-yellow-700 dark:text-yellow-400 mt-1">
              {t('setup.desc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
