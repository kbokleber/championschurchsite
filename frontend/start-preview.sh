#!/bin/sh
# Script para iniciar Vite Preview permitindo todos os hosts
# Garantir que o build existe antes de iniciar o preview
if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
  echo "Build não encontrado. Executando build..."
  # VITE_API_URL deve estar disponível durante o build
  echo "VITE_API_URL durante build: ${VITE_API_URL:-não definida}"
  npm run build
fi

# Verificar se VITE_API_URL está definida
if [ -z "$VITE_API_URL" ]; then
  echo "⚠️  AVISO: VITE_API_URL não está definida!"
  echo "   Configure a variável de ambiente VITE_API_URL no Coolify"
  echo "   Exemplo: VITE_API_URL=http://seu-backend.com"
fi

# Iniciar preview com configurações para SPA
# Usar variável de ambiente para desabilitar verificação de host
export VITE_PREVIEW_ALLOWED_HOSTS=all
# Forçar host 0.0.0.0 e desabilitar verificação de host
exec npx vite preview --host 0.0.0.0 --port 80 --strictPort false
