 import { useState, useEffect, useCallback } from 'react';

type AppState = 'initializing' | 'connecting' | 'browsing' | 'viewing';

interface RouterState {
  appState: AppState;
  selectedFile?: any;
  selectedFilePath?: string;
  selectedStorageClient?: any;
  currentDirectory?: string;
}

interface UseRouterReturn {
  appState: AppState;
  selectedFile: any;
  selectedFilePath: string;
  selectedStorageClient: any;
  currentDirectory: string;
  navigateToConnecting: () => void;
  navigateToBrowsing: () => void;
  navigateToViewing: (file: any, path: string, storageClient?: any) => void;
  navigateBack: () => void;
  setCurrentDirectory: (path: string) => void;
}

const ROUTE_PATHS = {
  connecting: '/connecting',
  browsing: '/browsing',
  viewing: '/viewing'
};

export const useRouter = (): UseRouterReturn => {
  const [routerState, setRouterState] = useState<RouterState>({
    appState: 'initializing',
    selectedFile: null,
    selectedFilePath: '',
    selectedStorageClient: null,
    currentDirectory: ''
  });

  // 从URL路径解析应用状态
  const parseStateFromPath = useCallback((pathname: string): AppState => {
    if (pathname === ROUTE_PATHS.connecting) return 'connecting';
    if (pathname === ROUTE_PATHS.browsing) return 'browsing';
    if (pathname === ROUTE_PATHS.viewing) return 'viewing';
    return 'connecting'; // 默认状态
  }, []);

  // 处理浏览器前进/后退
  const handlePopState = useCallback((event: PopStateEvent) => {
    const state = event.state as RouterState | null;
    if (state) {
      setRouterState(state);
    } else {
      // 如果没有状态，从URL解析
      const appState = parseStateFromPath(window.location.pathname);
      setRouterState(prev => ({ ...prev, appState }));
    }
  }, [parseStateFromPath]);

  // 推送新的路由状态
  const pushState = useCallback((newState: RouterState, path: string) => {
    setRouterState(newState);
    window.history.pushState(newState, '', path);
  }, []);

  // 替换当前路由状态
  const replaceState = useCallback((newState: RouterState, path: string) => {
    setRouterState(newState);
    window.history.replaceState(newState, '', path);
  }, []);

  // 导航函数
  const navigateToConnecting = useCallback(() => {
    const newState: RouterState = {
      appState: 'connecting',
      selectedFile: null,
      selectedFilePath: '',
      selectedStorageClient: null,
      currentDirectory: routerState.currentDirectory
    };
    pushState(newState, ROUTE_PATHS.connecting);
  }, [pushState, routerState.currentDirectory]);

  const navigateToBrowsing = useCallback(() => {
    const newState: RouterState = {
      appState: 'browsing',
      selectedFile: null,
      selectedFilePath: '',
      selectedStorageClient: null,
      currentDirectory: routerState.currentDirectory
    };
    pushState(newState, ROUTE_PATHS.browsing);
  }, [pushState, routerState.currentDirectory]);

  const navigateToViewing = useCallback((file: any, path: string, storageClient?: any) => {
    const newState: RouterState = {
      appState: 'viewing',
      selectedFile: file,
      selectedFilePath: path,
      selectedStorageClient: storageClient,
      currentDirectory: routerState.currentDirectory
    };
    pushState(newState, ROUTE_PATHS.viewing);
  }, [pushState, routerState.currentDirectory]);

  const navigateBack = useCallback(() => {
    window.history.back();
  }, []);

  const setCurrentDirectory = useCallback((path: string) => {
    setRouterState(prev => ({ ...prev, currentDirectory: path }));
  }, []);

  // 初始化路由
  useEffect(() => {
    // 监听浏览器前进/后退
    window.addEventListener('popstate', handlePopState);

    // 初始化时，如果URL不是根路径，解析当前状态
    const currentPath = window.location.pathname;
    if (currentPath !== '/' && currentPath !== '') {
      const appState = parseStateFromPath(currentPath);
      setRouterState(prev => ({ ...prev, appState }));
    } else {
      // 如果是根路径，设置为连接状态
      setRouterState(prev => ({ ...prev, appState: 'connecting' }));
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handlePopState, parseStateFromPath]);

  // 当应用状态改变时，确保URL同步
  useEffect(() => {
    const currentPath = window.location.pathname;
    const expectedPath = ROUTE_PATHS[routerState.appState as keyof typeof ROUTE_PATHS];
    
    if (expectedPath && currentPath !== expectedPath) {
      replaceState(routerState, expectedPath);
    }
  }, [routerState, replaceState]);

  return {
    appState: routerState.appState,
    selectedFile: routerState.selectedFile,
    selectedFilePath: routerState.selectedFilePath || '',
    selectedStorageClient: routerState.selectedStorageClient,
    currentDirectory: routerState.currentDirectory || '',
    navigateToConnecting,
    navigateToBrowsing,
    navigateToViewing,
    navigateBack,
    setCurrentDirectory
  };
};