# Dockerfile para Backend Django + Frontend React (single app) - Champions Church
# Build a partir da RAIZ do repositório: docker build -f backend/Dockerfile .

# Stage 1: Build do frontend (Vite/React)
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build dependências Python
FROM python:3.11-slim AS builder
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev postgresql-client \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --user --no-warn-script-location -r requirements.txt

# Stage 3: Runtime
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH=/usr/local/bin:/home/django/.local/bin:$PATH \
    DJANGO_SETTINGS_MODULE=champions_backend.settings

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 postgresql-client gosu \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 django && \
    mkdir -p /app /app/staticfiles /app/media /app/logs /home/django/.local && \
    ln -s /usr/local/bin/python3 /usr/local/bin/python || true

COPY --from=builder /root/.local /home/django/.local
RUN chown -R django:django /home/django/.local

WORKDIR /app
COPY --chown=django:django backend/ .
COPY --from=frontend-build /app/frontend/dist /app/frontend_dist

# Garantir que todos os diretórios tenham permissões corretas antes de mudar para usuário django
# Criar diretórios e garantir propriedade do usuário django
RUN mkdir -p /app/staticfiles /app/media /app/logs && \
    chown -R django:django /app && \
    chmod +x /app/entrypoint.sh
# Não usar USER django aqui: entrypoint roda como root, ajusta permissão de /app/media (volume) e depois exec como django
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import socket; s = socket.socket(); s.settimeout(5); result = s.connect_ex(('localhost', 8000)); s.close(); exit(0 if result == 0 else 1)"

ENTRYPOINT ["/app/entrypoint.sh"]
