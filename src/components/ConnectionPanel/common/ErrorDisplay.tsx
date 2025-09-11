import type React from 'react';

interface ErrorDisplayProps {
  error: string;
  className?: string;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, className = '' }) => {
  if (!error) return null;

  return (
    <div className={`rounded-md bg-red-50 dark:bg-red-900/20 p-4 ${className}`}>
      <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
    </div>
  );
};
