import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const BACKEND_URL = process.env.VITE_BACKEND_INTERNAL_URL || 'http://backend:8000'

// Injects current build timestamp into index.html so Telegram's cached mini app is force-reloaded
function buildTimestampPlugin() {
  const ts = String(Date.now())
  return {
    name: 'build-timestamp',
    transformIndexHtml(html: string) {
      return html.replace('__BUILD_TS__', ts)
    },
  }
}

export default defineConfig({
  plugins: [react(), buildTimestampPlugin()],
  base: process.env.NODE_ENV === 'production' ? '/client/' : '/',
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': { target: BACKEND_URL, changeOrigin: true },
      '/uploads': { target: BACKEND_URL, changeOrigin: true },
    },
  },
})
