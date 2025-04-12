import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import fs from 'fs';
import os from 'os';

const homeDir = os.homedir();

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      crypto: 'crypto-browserify'
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    https: {
      key: fs.readFileSync(`${homeDir}/certs/privkey.pem`),
      cert: fs.readFileSync(`${homeDir}/certs/fullchain.pem`)
    },
    allowedHosts: ['andersan.riis.okayama-u.ac.jp'],
    proxy: {
      '/api': {
        target: 'http://localhost:8087',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    },
    watch: {
      usePolling: false,
      interval: 1000,
      ignored: ['**/node_modules/**', '**/dist/**']
    },
    middlewareMode: false,
    hmr: {
      clientPort: 8080,
      timeout: 30000,
      overlay: false
    },
    logLevel: 'info',
    open: false,
    cors: true,
    fs: {
      strict: true,
      allow: ['..']
    }
  },
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true
      }
    }
  }
}); 