import { Loader2 } from 'lucide-react';
import type React from 'react';
import { type ComponentType, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

interface LazyComponentWrapperProps<T = any> {
  component: ComponentType<T> | React.LazyExoticComponent<ComponentType<T>>;
  props: T;
  loadingText?: string;
  fallbackHeight?: string | number;
}

/**
 * 通用的懒加载组件包装器
 * 支持同步和异步组件的统一渲染
 * 为异步组件提供统一的加载状态
 */
export const LazyComponentWrapper = <T = any>({
  component: Component,
  props,
  loadingText,
  fallbackHeight = 'h-64',
}: LazyComponentWrapperProps<T>): React.ReactElement => {
  const { t } = useTranslation();

  // 检查是否为懒加载组件
  const isLazyComponent = Component && typeof Component === 'object' && '$$typeof' in Component;

  const heightStyle = typeof fallbackHeight === 'number' ? `${fallbackHeight}px` : fallbackHeight;

  if (isLazyComponent) {
    // 异步组件：使用 Suspense 包装
    const LazyComponent = Component as React.LazyExoticComponent<ComponentType<T>>;
    return (
      <Suspense
        fallback={
          <div className={`flex items-center justify-center ${heightStyle}`}>
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">
              {loadingText || t('loading', '加载中...')}
            </span>
          </div>
        }
      >
        <LazyComponent {...(props as any)} />
      </Suspense>
    );
  } else {
    // 同步组件：直接渲染
    const SyncComponent = Component as ComponentType<T>;
    return <SyncComponent {...(props as any)} />;
  }
};
