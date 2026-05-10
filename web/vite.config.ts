import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Inside Docker, the backend service is named 'backend'.
// When running locally, process.env.VITE_BACKEND_INTERNAL_URL can be set to http://localhost:8000
const BACKEND_URL = process.env.VITE_BACKEND_INTERNAL_URL || 'http://backend:8000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5175,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/uploads': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
    },
  },
})
