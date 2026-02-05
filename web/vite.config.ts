import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../AI-CrossTalk/web',
    emptyOutDir: true,
  },
  base: './', // 相对路径，确保在扩展环境中正常工作
})
