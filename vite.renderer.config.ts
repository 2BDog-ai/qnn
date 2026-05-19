import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    minify: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      external: ['better-sqlite3'],
      output: {
        compact: true,
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@/components': path.resolve(__dirname, 'src/renderer/components'),
      '@/hooks': path.resolve(__dirname, 'src/renderer/hooks'),
      '@/utils': path.resolve(__dirname, 'src/renderer/utils'),
      '@/store': path.resolve(__dirname, 'src/renderer/store'),
      '@/types': path.resolve(__dirname, 'src/renderer/types')
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true
  }
});
