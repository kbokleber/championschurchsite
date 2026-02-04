#!/bin/sh
set -e

# Verificar se BACKEND_URL está definida
if [ -z "$BACKEND_URL" ]; then
    echo "⚠️ AVISO: BACKEND_URL não está definida!"
    echo "   Configure BACKEND_URL no Coolify → Frontend → Environment Variables"
    echo "   Exemplo: BACKEND_URL=http://s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io"
    exit 1
fi

echo "🔧 Configurando Nginx com BACKEND_URL: ${BACKEND_URL}"

# Extrair host e porta do BACKEND_URL para teste de conectividade e header Host
# Exemplo: http://host:port ou http://host
BACKEND_URL_CLEAN=$(echo "$BACKEND_URL" | sed -E 's|^https?://||' | sed -E 's|/.*$||')
if echo "$BACKEND_URL_CLEAN" | grep -q ':'; then
    # Tem porta explícita
    BACKEND_HOST=$(echo "$BACKEND_URL_CLEAN" | cut -d: -f1)
    BACKEND_PORT=$(echo "$BACKEND_URL_CLEAN" | cut -d: -f2)
else
    # Não tem porta, usar padrão 80
    BACKEND_HOST="$BACKEND_URL_CLEAN"
    BACKEND_PORT=80
fi

# Exportar BACKEND_HOST e BACKEND_URL para uso no envsubst (também usado pelo entrypoint padrão)
export BACKEND_HOST
export BACKEND_URL

echo "📡 Testando conectividade com backend:"
echo "   Host: ${BACKEND_HOST}"
echo "   Port: ${BACKEND_PORT}"

# Testar conectividade (timeout de 5 segundos)
if command -v nc >/dev/null 2>&1; then
    if nc -z -w 5 "${BACKEND_HOST}" "${BACKEND_PORT}" 2>/dev/null; then
        echo "✓ Backend está acessível!"
    else
        echo "⚠️ AVISO: Não foi possível conectar ao backend em ${BACKEND_HOST}:${BACKEND_PORT}"
        echo "   O Nginx ainda vai iniciar, mas pode dar erro 502 se o backend não estiver acessível"
    fi
else
    echo "⚠️ nc (netcat) não disponível, pulando teste de conectividade"
fi

# Executar envsubst manualmente para garantir que BACKEND_HOST seja substituído
# O entrypoint padrão também vai executar, mas vamos fazer antes para verificar
if [ -f /etc/nginx/templates/default.conf.template ]; then
    echo "🔧 Executando envsubst manualmente:"
    envsubst '${BACKEND_URL} ${BACKEND_HOST}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
    
    # Verificar se BACKEND_HOST foi substituído
    if grep -q '\${BACKEND_HOST}' /etc/nginx/conf.d/default.conf; then
        echo "⚠️ ERRO: BACKEND_HOST não foi substituído!"
        echo "   BACKEND_HOST=${BACKEND_HOST}"
        echo "   Verificando configuração:"
        grep "proxy_set_header Host" /etc/nginx/conf.d/default.conf || true
    else
        echo "✓ BACKEND_HOST substituído corretamente"
        echo "   Configuração do proxy Host:"
        grep "proxy_set_header Host" /etc/nginx/conf.d/default.conf | head -1 || true
    fi
else
    echo "⚠️ Template não encontrado em /etc/nginx/templates/default.conf.template"
fi

# Exportar variáveis para o entrypoint padrão (caso ele execute envsubst novamente)
export BACKEND_URL
export BACKEND_HOST

# Executar entrypoint padrão do Nginx
exec /docker-entrypoint.sh nginx -g "daemon off;"
