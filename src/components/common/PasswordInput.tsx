import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  isFromStorage?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  value,
  onChange,
  placeholder,
  required = false,
  className = '',
  isFromStorage = false,
}) => {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);

  const handleFocus = () => {
    if (isFromStorage) {
      onChange(''); // 清空密码，让用户输入新密码
    }
  };

  const displayValue = isFromStorage ? '******' : value;
  const isReadOnly = isFromStorage;

  return (
    <div className="relative">
      <div className="absolute left-3 top-0 bottom-0 flex items-center pointer-events-none z-10">
        <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
      </div>

      <input
        id={id}
        type={showPassword ? 'text' : 'password'}
        value={displayValue}
        onChange={e => {
          if (!isReadOnly) {
            onChange(e.target.value);
          }
        }}
        onFocus={handleFocus}
        placeholder={isReadOnly ? t('password.click.to.edit') : placeholder}
        readOnly={isReadOnly}
        required={required}
        className={`w-full pl-10 pr-12 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-500 dark:placeholder-gray-400 ${className} ${
          isReadOnly
            ? 'bg-gray-50 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-pointer'
            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
        }`}
      />

      {!isReadOnly && (
        <div className="absolute right-3 top-0 bottom-0 flex items-center">
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
};
