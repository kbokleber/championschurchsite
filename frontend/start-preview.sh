#!/bin/sh
# Script para iniciar Vite Preview permitindo todos os hosts
# Garantir que o build existe antes de iniciar o preview
if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
  echo "Build não encontrado. Executando build..."
  npm run build
fi

# Iniciar preview com configurações para SPA
# Usar variável de ambiente para desabilitar verificação de host
export VITE_PREVIEW_ALLOWED_HOSTS=all
# Forçar host 0.0.0.0 e desabilitar verificação de host
exec npx vite preview --host 0.0.0.0 --port 80 --strictPort false
