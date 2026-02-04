import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 80,
    host: '0.0.0.0',
    strictPort: false,
    // Permitir todos os hosts - usar array vazio para desabilitar verificação
    allowedHosts: [],
  },
})
