import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    target: 'es2020',
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'CADPlugin',
      formats: ['es'],
      fileName: (format) => `index.esm.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'lucide-react'],
      output: {
        // 手动配置chunks以处理大型依赖
        manualChunks: (id) => {
          if (id.includes('@mlightcad/libredwg-web')) {
            return 'libredwg-web';
          }
          if (id.includes('@mlightcad')) {
            return 'mlightcad';
          }
          if (id.includes('three')) {
            return 'three';
          }
        },
        // 优化资源加载
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM',
          'lucide-react': 'LucideReact'
        }
      },
    },
    minify: 'terser',
    sourcemap: true,
    // 增加chunk大小限制以处理WebAssembly
    chunkSizeWarningLimit: 10000,
    // 优化依赖预打包
    commonjsOptions: {
      include: [/node_modules/],
      exclude: ['@mlightcad/libredwg-web']
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  // 处理WebAssembly文件
  assetsInclude: ['**/*.wasm'],
  // 优化依赖预打包
  optimizeDeps: {
    include: [
      '@mlightcad/cad-simple-viewer',
      '@mlightcad/data-model',
      '@mlightcad/libredwg-converter',
      'three'
    ],
    exclude: [
      '@mlightcad/libredwg-web' // 动态导入，避免预打包
    ]
  },
  // 静态资源处理
  publicDir: 'public',
  server: {
    // 开发服务器配置
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
