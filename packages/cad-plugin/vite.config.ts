import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'node:url';
import dts from 'vite-plugin-dts';

// @ts-ignore Node ESM 环境下定义
const __dirname = fileURLToPath(new URL('.', import.meta.url));

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
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'esm' : 'cjs'}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'lucide-react'],
      output: {
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
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM',
          'lucide-react': 'LucideReact'
        }
      },
    },
    chunkSizeWarningLimit: 10000,
  },
  optimizeDeps: {
    exclude: ['@mlightcad/libredwg-web']
  }
});
