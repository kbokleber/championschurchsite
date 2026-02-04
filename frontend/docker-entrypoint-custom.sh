#!/bin/sh
set -e

# Substituir variável BACKEND_URL no template do Nginx
if [ -f /etc/nginx/templates/default.conf.template ]; then
    echo "Substituindo BACKEND_URL: ${BACKEND_URL:-http://backend:8000}"
    envsubst '${BACKEND_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
    echo "✓ Configuração do Nginx gerada com sucesso"
else
    echo "⚠️ Template não encontrado, usando configuração padrão"
fi

# Executar entrypoint padrão do Nginx (ele já faz envsubst automaticamente também)
exec /docker-entrypoint.sh nginx -g "daemon off;"
