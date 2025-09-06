import React from 'react';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { FeatureShowcase } from './FeatureShowcase';
import { ConnectionFormContainer } from './ConnectionFormContainer';
import useConnectionLogic from './useConnectionLogic';

interface ConnectionPanelProps {
  onConnect: () => void;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ onConnect }) => {
  const connectionLogic = useConnectionLogic(onConnect);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* 语言切换器 - 右上角 */}
      <div className="absolute top-4 right-4 flex items-center space-x-3">
        <LanguageSwitcher />
      </div>

      <div className="min-h-screen flex items-stretch sm:items-center justify-center p-0 sm:p-4 lg:p-8">
        <div className="w-full max-w-none sm:max-w-6xl h-full">
          <div className="grid lg:grid-cols-2 gap-0 sm:gap-8 items-stretch sm:items-center px-0 sm:px-4 lg:px-0 h-full min-h-screen sm:min-h-0">
            {/* 左侧：功能介绍和品牌展示 */}
            <FeatureShowcase />

            {/* 右侧：连接表单 */}
            <ConnectionFormContainer
              storageType={connectionLogic.storageType}
              selectedStoredConnection={connectionLogic.selectedStoredConnection}
              formData={connectionLogic.formData}
              connecting={connectionLogic.connecting}
              error={connectionLogic.error}
              isPasswordFromStorage={connectionLogic.isPasswordFromStorage}
              onStorageTypeChange={connectionLogic.handleStorageTypeChange}
              onStoredConnectionSelect={connectionLogic.handleSelectStoredConnection}
              onConnect={connectionLogic.handleConnectWithCurrentForm}
              onFormDataChange={connectionLogic.handleFormDataChange}
              onPasswordFocus={connectionLogic.handlePasswordFocus}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
