import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 用相对路径：既能部署到任意子目录，也能让 Electron 用 file:// 直接加载 dist
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
})
