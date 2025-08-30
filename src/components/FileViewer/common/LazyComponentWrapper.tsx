import React, { Suspense, ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

interface LazyComponentWrapperProps {
  component: ComponentType<any> | React.LazyExoticComponent<ComponentType<any>>;
  props: Record<string, any>;
  loadingText?: string;
  fallbackHeight?: string | number;
}

/**
 * 通用的懒加载组件包装器
 * 支持同步和异步组件的统一渲染
 * 为异步组件提供统一的加载状态
 */
export const LazyComponentWrapper: React.FC<LazyComponentWrapperProps> = ({
  component: Component,
  props,
  loadingText,
  fallbackHeight = 'h-64',
}) => {
  const { t } = useTranslation();

  // 检查是否是懒加载组件
  const isLazyComponent = (Component as any)._payload !== undefined;

  if (isLazyComponent) {
    // 异步组件：使用 Suspense 包装
    return (
      <Suspense
        fallback={
          <div
            className={`flex items-center justify-center ${typeof fallbackHeight === 'string' ? fallbackHeight : 'h-64'}`}
          >
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">
              {loadingText || t('loading', '加载中...')}
            </span>
          </div>
        }
      >
        <Component {...props} />
      </Suspense>
    );
  } else {
    // 同步组件：直接渲染
    return <Component {...props} />;
  }
};
