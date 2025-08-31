import React, { useState, useEffect } from 'react';
import { Check, X, Link2, Folder, FileText, Archive, Code2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showToast } from '../../utils/clipboard';
import { commands } from '../../types/tauri-commands';

// Import functions from fileTypes.ts to get all supported extensions
import { FileType, getAllSupportedExtensions, getExtensionsByType } from '../../utils/fileTypes';

interface FileAssociationSettingsProps {
  onClose: () => void;
}

interface ExtensionCategory {
  name: string;
  icon: React.ComponentType<any>;
  extensions: string[];
  types: FileType[];
}

const extensionCategories: ExtensionCategory[] = [
  {
    name: 'Documents',
    icon: FileText,
    extensions: [], // Will be populated dynamically
    types: ['text', 'markdown', 'word', 'presentation', 'pdf', 'spreadsheet'],
  },
  {
    name: 'Media',
    icon: FileText,
    extensions: [], // Will be populated dynamically
    types: ['image', 'video', 'audio'],
  },
  {
    name: 'Archives',
    icon: Archive,
    extensions: [], // Will be populated dynamically
    types: ['archive'],
  },
  {
    name: 'Data Files',
    icon: Folder,
    extensions: [], // Will be populated dynamically
    types: ['data', 'pointcloud'],
  },
];

// Populate extensions for each category
extensionCategories.forEach(category => {
  category.extensions = getExtensionsByType(category.types);
});

// Extensions that should be excluded from default registration due to potential system conflicts
const problematicExtensions = ['bat', 'exe', 'sh', 'ps1'];

export const FileAssociationSettings: React.FC<FileAssociationSettingsProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [supportedExtensions, setSupportedExtensions] = useState<string[]>([]);
  const [selectedExtensions, setSelectedExtensions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Load supported extensions on mount
  useEffect(() => {
    loadSupportedExtensions();
  }, []);

  const loadSupportedExtensions = async () => {
    setIsLoading(true);
    try {
      // Get extensions from fileTypes.ts instead of backend
      const extensions = getAllSupportedExtensions();
      setSupportedExtensions(extensions);
      
      // Pre-select safe extensions (exclude problematic ones)
      const safeExtensions = extensions.filter(ext => !problematicExtensions.includes(ext));
      setSelectedExtensions(safeExtensions);
      
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load supported extensions:', error);
      showToast(t('file.extensions.load.failed'), 'error');
      setIsLoading(false);
    }
  };

  const handleExtensionToggle = (extension: string) => {
    setSelectedExtensions(prev => 
      prev.includes(extension)
        ? prev.filter(ext => ext !== extension)
        : [...prev, extension]
    );
  };

  const handleCategoryToggle = (category: ExtensionCategory) => {
    const categoryExtensions = category.extensions.filter(ext => supportedExtensions.includes(ext));
    const allSelected = categoryExtensions.every(ext => selectedExtensions.includes(ext));
    
    if (allSelected) {
      // Deselect all in category
      setSelectedExtensions(prev => prev.filter(ext => !categoryExtensions.includes(ext)));
    } else {
      // Select all in category
      setSelectedExtensions(prev => {
        const newSelected = [...prev];
        categoryExtensions.forEach(ext => {
          if (!newSelected.includes(ext)) {
            newSelected.push(ext);
          }
        });
        return newSelected;
      });
    }
  };

  const handleSelectAll = () => {
    const safeExtensions = supportedExtensions.filter(ext => !problematicExtensions.includes(ext));
    setSelectedExtensions(safeExtensions);
  };

  const handleDeselectAll = () => {
    setSelectedExtensions([]);
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      // Send all supported extensions to backend, it will handle both selected and unselected
      const allExtensions = supportedExtensions;
      
      // First, unregister all supported extensions
      if (allExtensions.length > 0) {
        const unregisterResult = await commands.systemUnregisterFiles(allExtensions);
        if (unregisterResult.status !== 'ok') {
          console.warn('Failed to unregister some file associations:', unregisterResult.error);
        }
      }

      // Then register only selected extensions
      if (selectedExtensions.length > 0) {
        const registerResult = await commands.systemRegisterSelectedFiles(selectedExtensions);
        if (registerResult.status === 'ok') {
          showToast(
            t('file.associations.applied.success', { count: selectedExtensions.length }),
            'success'
          );
        } else {
          throw new Error(registerResult.error);
        }
      } else {
        showToast(t('file.associations.cleared.success'), 'success');
      }
      
      onClose();
    } catch (error) {
      console.error('Failed to apply file associations:', error);
      showToast(t('file.associations.apply.failed'), 'error');
    } finally {
      setIsApplying(false);
    }
  };

  const renderExtensionCategory = (category: ExtensionCategory) => {
    const categoryExtensions = category.extensions.filter(ext => supportedExtensions.includes(ext));
    if (categoryExtensions.length === 0) return null;

    const selectedCount = categoryExtensions.filter(ext => selectedExtensions.includes(ext)).length;
    const allSelected = selectedCount === categoryExtensions.length;
    const someSelected = selectedCount > 0 && selectedCount < categoryExtensions.length;

    return (
      <div key={category.name} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <category.icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            <span className="font-medium text-gray-900 dark:text-white">
              {t(`file.category.${category.name.toLowerCase()}`)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ({selectedCount}/{categoryExtensions.length})
            </span>
          </div>
          <button
            onClick={() => handleCategoryToggle(category)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              allSelected
                ? 'bg-blue-500'
                : someSelected
                ? 'bg-blue-300 dark:bg-blue-700'
                : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                allSelected || someSelected ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {categoryExtensions.map(extension => {
            const isSelected = selectedExtensions.includes(extension);
            const isProblematic = problematicExtensions.includes(extension);
            
            return (
              <button
                key={extension}
                onClick={() => handleExtensionToggle(extension)}
                className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                } ${
                  isProblematic ? 'border-orange-300 dark:border-orange-700' : ''
                }`}
                title={isProblematic ? t('file.extension.problematic.tooltip') : undefined}
              >
                <span>.{extension}</span>
                {isSelected && <Check className="w-3 h-3 ml-1" />}
                {isProblematic && !isSelected && (
                  <span className="w-3 h-3 ml-1 text-orange-500">⚠</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
          <div className="flex items-center space-x-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <span className="text-gray-900 dark:text-white">{t('loading.file.extensions')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Link2 className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('file.association.settings')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Description */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                {t('file.association.advanced.description')}
              </p>
            </div>

            {/* Bulk Actions */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {t('selected.extensions.count', { 
                  selected: selectedExtensions.length, 
                  total: supportedExtensions.length 
                })}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/70 transition-colors"
                >
                  {t('select.all.safe')}
                </button>
                <button
                  onClick={handleDeselectAll}
                  className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {t('deselect.all')}
                </button>
              </div>
            </div>

            {/* Extension Categories */}
            <div className="space-y-4">
              {extensionCategories.map(renderExtensionCategory)}
            </div>

            {/* Warning for problematic extensions */}
            {selectedExtensions.some(ext => problematicExtensions.includes(ext)) && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <p className="text-sm text-orange-800 dark:text-orange-300">
                  <strong>{t('warning')}:</strong> {t('file.extension.problematic.warning')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-600 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleApply}
            disabled={isApplying}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
          >
            {isApplying && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>}
            <span>{isApplying ? t('applying') : t('apply.settings')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};