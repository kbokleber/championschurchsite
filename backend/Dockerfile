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
    PATH=/root/.local/bin:$PATH \
    DJANGO_SETTINGS_MODULE=champions_backend.settings

# Instalar apenas dependências runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Criar usuário não-root para segurança
RUN useradd -m -u 1000 django && \
    mkdir -p /app /app/staticfiles /app/media /app/logs && \
    chown -R django:django /app

# Copiar dependências Python do stage builder
COPY --from=builder --chown=django:django /root/.local /root/.local

# Definir diretório de trabalho
WORKDIR /app

# Copiar código da aplicação
COPY --chown=django:django . .

# Criar diretórios necessários
RUN mkdir -p staticfiles media logs

# Mudar para usuário não-root
USER django

# Coletar arquivos estáticos (será executado no build)
RUN python manage.py collectstatic --noinput || true

# Expor porta
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/api/', timeout=5)" || exit 1

# Comando padrão: rodar com Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "4", "--threads", "2", "--timeout", "60", "--access-logfile", "-", "--error-logfile", "-", "champions_backend.wsgi:application"]
