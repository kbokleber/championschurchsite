#!/bin/sh
set -e

# Verificar se BACKEND_URL está definida
if [ -z "$BACKEND_URL" ]; then
    echo "⚠️ AVISO: BACKEND_URL não está definida!"
    echo "   Configure BACKEND_URL no Coolify → Frontend → Environment Variables"
    echo "   Exemplo: BACKEND_URL=http://s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io"
    exit 1
fi

echo "🔧 Substituindo BACKEND_URL: ${BACKEND_URL}"

# Substituir variável BACKEND_URL no template do Nginx
if [ -f /etc/nginx/templates/default.conf.template ]; then
    envsubst '${BACKEND_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
    echo "✓ Configuração do Nginx gerada com sucesso"
    
    # Mostrar primeira linha do arquivo gerado para debug
    echo "📄 Primeira linha da config gerada:"
    head -n 1 /etc/nginx/conf.d/default.conf || true
else
    echo "⚠️ Template não encontrado, usando configuração padrão"
fi

# Executar entrypoint padrão do Nginx
exec /docker-entrypoint.sh nginx -g "daemon off;"
