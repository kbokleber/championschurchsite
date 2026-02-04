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

# Instalar gettext para envsubst e wget para healthcheck
RUN apk add --no-cache gettext wget

# Criar diretório de templates do Nginx
RUN mkdir -p /etc/nginx/templates

# Copiar configuração customizada do Nginx como template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Variável de ambiente padrão (pode ser sobrescrita via Coolify)
ENV BACKEND_URL=http://backend:8000

# Copiar build do React do stage anterior
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar script de entrada customizado ANTES de fazer chown
COPY docker-entrypoint-custom.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

# Criar usuário não-root e configurar permissões
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    chown root:root /docker-entrypoint-custom.sh && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# O entrypoint precisa rodar como root para escrever em /etc/nginx/conf.d
# O Nginx em si roda como nginx (configurado no entrypoint padrão)

# Expor porta
EXPOSE 80

# Health check - usar curl que já vem no nginx:alpine ou verificar se o processo está rodando
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --spider --quiet http://localhost/health 2>/dev/null || wget --spider --quiet http://127.0.0.1/health 2>/dev/null || exit 1

# Comando padrão
ENTRYPOINT ["/docker-entrypoint-custom.sh"]
