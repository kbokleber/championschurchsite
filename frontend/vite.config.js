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
    // Permitir todos os hosts - usar true para desabilitar verificação
    allowedHosts: true,
    cors: true,
    // IMPORTANTE: Não configurar proxy aqui - o código JavaScript usa VITE_API_URL
    // O proxy do Vite Preview não funciona bem com containers separados
  },
  build: {
    // Garantir que o build gere arquivos estáticos corretos
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
