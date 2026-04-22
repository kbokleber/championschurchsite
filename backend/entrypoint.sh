#!/bin/bash
set -e

# Criar banco PostgreSQL se não existir - DEVE rodar como root (antes do gosu) para ter env vars do Docker
# Coolify injeta POSTGRES_HOST quando o banco está vinculado ao serviço
if [ "$(id -u)" = "0" ] && [ -n "${POSTGRES_HOST:-}" ]; then
  DB_NAME="${POSTGRES_DB:-championschurch}"
  echo "[DB] Verificando se o banco '$DB_NAME' existe no host ${POSTGRES_HOST}..."
  if ! PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-postgres}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null | grep -q 1; then
    echo "Banco '$DB_NAME' não existe. Criando..."
    if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-postgres}" -d postgres -c "CREATE DATABASE ${DB_NAME};"; then
      echo "✓ Banco '$DB_NAME' criado com sucesso!"
    else
      echo "✗ Falha ao criar banco '$DB_NAME' (verifique usuário/senha)"
    fi
  else
    echo "✓ Banco '$DB_NAME' já existe"
  fi
else
  if [ "$(id -u)" = "0" ] && [ -z "${POSTGRES_HOST:-}" ]; then
    echo "[DB] POSTGRES_HOST não definido - pule criação automática do banco"
  fi
fi

# Se estiver rodando como root (ex.: container sem USER django), ajustar permissão do volume de mídia e reexecutar como django
if [ "$(id -u)" = "0" ]; then
  chown -R django:django /app/media 2>/dev/null || true
  exec gosu django "$0" "$@"
  exit 0
fi

echo "Iniciando entrypoint do backend..."

# Verificar se o frontend foi buildado
echo "Verificando build do frontend..."
if [ -d "/app/frontend_dist" ]; then
    echo "✓ Diretório frontend_dist encontrado"
    echo "  Conteúdo:"
    ls -la /app/frontend_dist/ | head -10
    if [ -f "/app/frontend_dist/index.html" ]; then
        echo "✓ index.html encontrado"
    else
        echo "✗ AVISO: index.html NÃO encontrado em frontend_dist"
    fi
else
    echo "✗ AVISO: Diretório frontend_dist NÃO encontrado - frontend não será servido"
fi

# Verificar conexão com banco de dados
echo "Verificando conexão com banco de dados..."
python manage.py shell << 'PYEOF'
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'champions_backend.settings')
import django
django.setup()

from django.db import connection
try:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        print("✓ Conexão com banco de dados OK")
except Exception as e:
    print(f"✗ ERRO na conexão com banco: {e}")
    import traceback
    traceback.print_exc()
    exit(1)
PYEOF

# Executar migrações
echo "Executando migrações do banco de dados..."
if python manage.py migrate --noinput; then
    echo "✓ Migrações executadas com sucesso!"
else
    echo "✗ ERRO: Falha ao executar migrações!"
    echo "Tentando novamente com verbosidade para debug..."
    python manage.py migrate --verbosity 3 || {
        echo "✗ ERRO CRÍTICO: Não foi possível executar migrações!"
        exit 1
    }
fi

# Coletar arquivos estáticos
echo "Coletando arquivos estáticos..."
if [ "${SKIP_COLLECTSTATIC:-false}" = "true" ]; then
  echo "SKIP_COLLECTSTATIC=true: pulando collectstatic."
else
  python manage.py collectstatic --noinput || true
fi

# Tarefas pesadas ficam opcionais para reduzir risco no boot.
# Execute em pós-deploy: python manage.py bootstrap_prod
if [ "${RUN_BOOTSTRAP_TASKS:-false}" = "true" ]; then
  echo "RUN_BOOTSTRAP_TASKS=true: executando bootstrap pós-deploy..."
  python manage.py bootstrap_prod || {
    echo "✗ ERRO: bootstrap_prod falhou."
    exit 1
  }
else
  echo "RUN_BOOTSTRAP_TASKS=false: bootstrap pesado pulado no startup."
  echo "Para executar manualmente no Coolify shell: python manage.py bootstrap_prod"
fi

# Ajuste dinâmico de Gunicorn por CPU/memória via env vars.
CPU_COUNT="$(python -c 'import os; print(os.cpu_count() or 2)')"
DEFAULT_WEB_CONCURRENCY=$((CPU_COUNT * 2 + 1))
MAX_WEB_CONCURRENCY="${MAX_WEB_CONCURRENCY:-8}"
if [ "$DEFAULT_WEB_CONCURRENCY" -gt "$MAX_WEB_CONCURRENCY" ]; then
  DEFAULT_WEB_CONCURRENCY="$MAX_WEB_CONCURRENCY"
fi

WEB_CONCURRENCY="${WEB_CONCURRENCY:-$DEFAULT_WEB_CONCURRENCY}"
GUNICORN_THREADS="${GUNICORN_THREADS:-2}"
GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-90}"
GUNICORN_GRACEFUL_TIMEOUT="${GUNICORN_GRACEFUL_TIMEOUT:-30}"
GUNICORN_KEEPALIVE="${GUNICORN_KEEPALIVE:-5}"
GUNICORN_MAX_REQUESTS="${GUNICORN_MAX_REQUESTS:-1000}"
GUNICORN_MAX_REQUESTS_JITTER="${GUNICORN_MAX_REQUESTS_JITTER:-50}"

echo "Iniciando Gunicorn com config:"
echo "  WEB_CONCURRENCY=$WEB_CONCURRENCY"
echo "  GUNICORN_THREADS=$GUNICORN_THREADS"
echo "  GUNICORN_TIMEOUT=$GUNICORN_TIMEOUT"
echo "  GUNICORN_GRACEFUL_TIMEOUT=$GUNICORN_GRACEFUL_TIMEOUT"
echo "  GUNICORN_KEEPALIVE=$GUNICORN_KEEPALIVE"
echo "  GUNICORN_MAX_REQUESTS=$GUNICORN_MAX_REQUESTS"
echo "  GUNICORN_MAX_REQUESTS_JITTER=$GUNICORN_MAX_REQUESTS_JITTER"

exec gunicorn \
  --bind 0.0.0.0:8000 \
  --workers "$WEB_CONCURRENCY" \
  --threads "$GUNICORN_THREADS" \
  --timeout "$GUNICORN_TIMEOUT" \
  --graceful-timeout "$GUNICORN_GRACEFUL_TIMEOUT" \
  --keep-alive "$GUNICORN_KEEPALIVE" \
  --max-requests "$GUNICORN_MAX_REQUESTS" \
  --max-requests-jitter "$GUNICORN_MAX_REQUESTS_JITTER" \
  --worker-tmp-dir /dev/shm \
  --access-logfile - \
  --error-logfile - \
  --access-logformat '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" request_id=%({x-request-id}i)s rt=%(D)sus' \
  champions_backend.wsgi:application
