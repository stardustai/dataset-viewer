import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // 配置需要拷贝的静态资源
  assetsInclude: ['**/*.wasm'],

  // 定义全局变量，让插件能够访问React实例
  define: {
    global: 'globalThis',
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    // 配置文件系统访问权限，允许插件HTTP加载
    fs: {
      allow: [
        // 默认允许项目根目录
        '..',
        // 允许访问插件目录以支持HTTP协议加载
        '.plugins',
        // 允许访问npm link的插件
        '../node_modules',
      ],
    },
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}));
