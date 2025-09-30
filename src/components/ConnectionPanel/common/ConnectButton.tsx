import { Loader2 } from 'lucide-react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface ConnectButtonProps {
  connecting: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  connectingText?: string;
  connectText?: string;
}

export const ConnectButton: FC<ConnectButtonProps> = ({
  connecting,
  onClick,
  type = 'submit',
  className = '',
  connectingText,
  connectText,
}) => {
  const { t } = useTranslation();

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={connecting}
      className={`w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                 text-white font-medium py-2 px-4 rounded-md transition-colors
                 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                 disabled:cursor-not-allowed flex items-center justify-center ${className}`}
    >
      {connecting ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          {connectingText || t('connecting')}
        </>
      ) : (
        connectText || t('connect')
      )}
    </button>
  );
};
