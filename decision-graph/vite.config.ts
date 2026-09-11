import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api/llm': {
        target: 'https://dev-models.wiseai.wiseyak.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llm/, '/v1/chat/completions'),
      },
    },
  },
})
