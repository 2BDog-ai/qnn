import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
import commonjs from '@rollup/plugin-commonjs';
import { spawn } from 'child_process';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(args) {
          // 启动 Electron
          if (args.startup) {
            args.startup();
          }
        },
        vite: {
          define: {
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
          },
          build: {
            sourcemap: process.env.NODE_ENV === 'development',
            minify: process.env.NODE_ENV !== 'development',
            rollupOptions: {
              external: ['electron', 'better-sqlite3'],
              plugins: [
                commonjs({
                  ignoreDynamicRequires: false,
                  dynamicRequireTargets: ['node_modules/better-sqlite3/lib/database.js'],
                }),
              ],
            },
          },
        },
      },
      {
        vite: {
          build: {
            sourcemap: process.env.NODE_ENV === 'development',
            minify: process.env.NODE_ENV !== 'development',
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
        entry: 'src/preload/index.ts',
      },
    ]),
    renderer(),
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Target Electron 28's Chromium for smaller, more modern output
    target: 'chrome120',
    // Use Vite/esbuild defaults; avoid overly aggressive minification that caused empty chunks
    minify: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      external: ['better-sqlite3'],
      // Keep default Rollup treeshake settings to prevent accidental removal of side effects
      output: {
        compact: true,
        // Let Rollup decide chunking automatically for stability
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
    strictPort: false, // 如果端口被占用，自动尝试下一个
    host: true
  }
});
