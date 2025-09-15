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
      formats: ['es', 'cjs'],
      fileName: (format: string) => `index.${format === 'es' ? 'esm' : 'cjs'}.js`,
    },
    rollupOptions: {
      // 将React相关依赖设为外部依赖，避免重复打包
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: [
        // ESM 格式
        {
          format: 'es',
          entryFileNames: 'index.esm.js',
          // 定义全局变量映射，用于运行时获取React实例
          globals: {
            'react': 'React',
            'react-dom': 'ReactDOM',
            'react/jsx-runtime': 'React'
          },
          manualChunks: (id: string) => {
            if (id.includes('@mlightcad/libredwg-web')) {
              return 'libredwg-web';
            }
            if (id.includes('@mlightcad')) {
              return 'mlightcad';
            }
            if (id.includes('three')) {
              return 'three';
            }
          }
        },
        // CJS 格式
        {
          format: 'cjs',
          entryFileNames: 'index.cjs.js',
          globals: {
            'react': 'React',
            'react-dom': 'ReactDOM',
            'react/jsx-runtime': 'React'
          }
        }
      ],
    },
    chunkSizeWarningLimit: 10000,
  },
  optimizeDeps: {
    exclude: ['@mlightcad/libredwg-web']
  }
});
