# Dockerfile para Frontend React - Champions Church
# Multi-stage build para otimizar tamanho da imagem

# Stage 1: Build
FROM node:18-alpine AS builder

# Definir diretório de trabalho
WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências (incluindo devDependencies para build)
RUN npm ci

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build

# Stage 2: Runtime com Nginx
FROM nginx:alpine

# Instalar gettext para envsubst (substituição de variáveis)
RUN apk add --no-cache gettext

# Criar diretório de templates do Nginx
RUN mkdir -p /etc/nginx/templates

# Copiar configuração customizada do Nginx como template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Variável de ambiente padrão (pode ser sobrescrita via Coolify)
ENV BACKEND_URL=http://backend:8000

# Copiar build do React do stage anterior
COPY --from=builder /app/dist /usr/share/nginx/html

# Criar usuário não-root
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Mudar para usuário não-root
USER nginx

# Expor porta
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Script de entrada para substituir variáveis antes de iniciar Nginx
COPY <<EOF /docker-entrypoint-custom.sh
#!/bin/sh
set -e
# Substituir variável BACKEND_URL no template
envsubst '\$BACKEND_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
# Executar entrypoint padrão do Nginx
exec /docker-entrypoint.sh nginx -g "daemon off;"
EOF

RUN chmod +x /docker-entrypoint-custom.sh

# Comando padrão
ENTRYPOINT ["/docker-entrypoint-custom.sh"]
