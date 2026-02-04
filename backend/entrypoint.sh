#!/bin/bash
set -e

echo "Iniciando entrypoint do backend..."

# Executar migrações
echo "Executando migrações do banco de dados..."
python manage.py migrate --noinput

# Coletar arquivos estáticos
echo "Coletando arquivos estáticos..."
python manage.py collectstatic --noinput || true

# Criar usuário admin se não existir
echo "Verificando/criando usuário admin..."
python manage.py create_admin || echo "Aviso: Não foi possível criar usuário admin (pode já existir)"

# Iniciar servidor Gunicorn
echo "Iniciando servidor Gunicorn..."
exec gunicorn --bind 0.0.0.0:8000 --workers 4 --threads 2 --timeout 60 --access-logfile - --error-logfile - champions_backend.wsgi:application
