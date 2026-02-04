#!/bin/bash
set -e

echo "Iniciando entrypoint do backend..."

# Executar migrações
echo "Executando migrações do banco de dados..."
python manage.py migrate --noinput || {
    echo "ERRO: Falha ao executar migrações!"
    echo "Continuando mesmo assim para verificar outros problemas..."
}

# Criar configuração padrão do site se não existir
echo "Verificando/criando configuração do site..."
python manage.py shell << 'PYEOF'
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'champions_backend.settings')
import django
django.setup()

from eventos.models import ConfiguracaoSite
try:
    config, created = ConfiguracaoSite.objects.get_or_create(pk=1)
    if created:
        print("✓ Configuração do site criada com sucesso!")
    else:
        print("✓ Configuração do site já existe.")
except Exception as e:
    print(f"✗ ERRO ao criar configuração: {e}")
    import traceback
    traceback.print_exc()
PYEOF

# Coletar arquivos estáticos
echo "Coletando arquivos estáticos..."
python manage.py collectstatic --noinput || true

# Criar usuário admin se não existir
echo "Verificando/criando usuário admin..."
python manage.py create_admin || {
    echo "AVISO: Não foi possível criar usuário admin (pode já existir)"
}

# Verificar se o usuário admin existe
echo "Verificando usuário admin..."
python manage.py shell << 'PYEOF'
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'champions_backend.settings')
import django
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()
try:
    if User.objects.filter(username='admin').exists():
        print("✓ Usuário admin existe")
    else:
        print("✗ Usuário admin NÃO existe!")
except Exception as e:
    print(f"✗ ERRO ao verificar admin: {e}")
PYEOF

# Iniciar servidor Gunicorn
echo "Iniciando servidor Gunicorn..."
exec gunicorn --bind 0.0.0.0:8000 --workers 4 --threads 2 --timeout 60 --access-logfile - --error-logfile - champions_backend.wsgi:application
