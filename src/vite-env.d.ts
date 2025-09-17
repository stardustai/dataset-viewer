/// <reference types="vite/client" />

// 全局Window对象扩展
declare global {
  interface Window {
    React?: any;
    ReactDOM?: any;
    ReactJSXRuntime?: {
      jsx: any;
      jsxs: any;
      Fragment: any;
    };
    TauriCore?: any;
    __PLUGIN_MODULE_LOADER__?: (specifier: string, referrer?: string) => Promise<any>;
  }
}

// 声明 dav1d.js 模块类型
declare module 'dav1d.js' {
  interface Dav1dDecoder {
    decodeFrameAsYUV(obu: Uint8Array): { width: number; height: number; data: Uint8Array } | null;
    decodeFrameAsBMP(obu: Uint8Array): { width: number; height: number; data: Uint8Array } | null;
    unsafeDecodeFrameAsYUV(obu: Uint8Array): Uint8Array;
    unsafeDecodeFrameAsBMP(obu: Uint8Array): Uint8Array;
    unsafeCleanup(): void;
  }

  interface Dav1dModule {
    create(options: { wasmURL?: string; wasmData?: Uint8Array }): Promise<Dav1dDecoder>;
  }

  const dav1d: Dav1dModule;
  export { dav1d as default };
}

// MP4Box 类型声明
declare module 'mp4box' {
  interface MP4File {
    onError: (error: any) => void;
    onReady: (info: any) => void;
    onSamples: (id: number, user: any, samples: any[]) => void;
    appendBuffer: (buffer: ArrayBuffer) => void;
    flush: () => void;
    setExtractionOptions: (trackId: number, user: any, options: any) => void;
    start: () => void;
  }

  function createFile(): MP4File;
}
