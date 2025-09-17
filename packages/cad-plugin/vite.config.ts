import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'node:url';
import dts from 'vite-plugin-dts';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// @ts-ignore Node ESM 环境下定义
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
    viteStaticCopy({
      targets: [
        {
          src: './node_modules/@mlightcad/data-model/dist/dxf-parser-worker.js',
          dest: '.'
        },
        {
          src: './node_modules/@mlightcad/cad-simple-viewer/dist/libredwg-parser-worker.js',
          dest: '.'
        }
      ]
    })
  ],
  build: {
    target: 'es2020',
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'CADPlugin',
      formats: ['cjs'], // 只输出CJS格式
      fileName: () => 'index.cjs.js', // 固定文件名
    },
    rollupOptions: {
      // 将React相关依赖设为外部依赖，运行时由主应用提供
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime'
      ],
      output: {
        // 强制内联所有依赖，打包成单文件
        inlineDynamicImports: true,
      },
    },
    // 禁用代码分割，确保单文件输出
    chunkSizeWarningLimit: 15000, // 15MB
    // 强制内联所有依赖
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // 保留console.log用于调试
      },
    },
  },
  optimizeDeps: {
    exclude: ['@mlightcad/libredwg-web']
  }
});
