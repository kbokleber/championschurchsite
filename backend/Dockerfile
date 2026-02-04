# Dockerfile para Backend Django - Champions Church
# Multi-stage build para otimizar tamanho da imagem

# Stage 1: Build
FROM python:3.11-slim as builder

# Variáveis de ambiente para Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Instalar dependências do sistema necessárias para compilação
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Copiar requirements e instalar dependências Python
COPY requirements.txt .
RUN pip install --user --no-warn-script-location -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

# Variáveis de ambiente
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH=/usr/local/bin:/home/django/.local/bin:$PATH \
    DJANGO_SETTINGS_MODULE=champions_backend.settings

# Instalar apenas dependências runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Criar usuário não-root para segurança
RUN useradd -m -u 1000 django && \
    mkdir -p /app /app/staticfiles /app/media /app/logs /home/django/.local && \
    chown -R django:django /app && \
    # Criar symlink python -> python3 para facilitar uso
    ln -s /usr/local/bin/python3 /usr/local/bin/python || true

# Copiar dependências Python do stage builder para local acessível ao usuário django
COPY --from=builder /root/.local /home/django/.local
RUN chown -R django:django /home/django/.local

# Definir diretório de trabalho
WORKDIR /app

# Copiar código da aplicação
COPY --chown=django:django . .

# Criar diretórios necessários
RUN mkdir -p staticfiles media logs

# Copiar e configurar entrypoint script
COPY --chown=django:django entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Mudar para usuário não-root
USER django

# Expor porta
EXPOSE 8000

# Health check - verificar se o servidor está respondendo sem seguir redirects
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; req = urllib.request.Request('http://localhost:8000/api/configuracao/'); req.add_header('User-Agent', 'HealthCheck'); resp = urllib.request.urlopen(req, timeout=5); exit(0 if resp.getcode() < 400 else 1)" || exit 1

# Usar entrypoint script que executa migrações e cria admin antes de iniciar
ENTRYPOINT ["/app/entrypoint.sh"]
