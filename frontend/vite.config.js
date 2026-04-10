import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load .env so the proxy target can be configured via VITE_BACKEND_URL
  const env = loadEnv(mode, process.cwd())
  const backendHttp = env.VITE_BACKEND_URL ?? 'http://localhost:8000'
  const backendWs   = backendHttp.replace(/^http/, 'ws')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // REST endpoints
        '/api': {
          target:       backendHttp,
          changeOrigin: true,
        },
        // WebSocket stream
        '/ws': {
          target:       backendWs,
          ws:           true,
          changeOrigin: true,
        },
      },
    },
  }
})
