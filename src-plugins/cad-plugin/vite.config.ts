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
      fileName: () => 'index.esm.js',
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
