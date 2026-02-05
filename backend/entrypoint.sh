#!/bin/bash
set -e

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

# Sincronizar permissões de menu automaticamente
echo "Sincronizando permissões de menu..."
python manage.py shell << 'PYEOF'
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'champions_backend.settings')
import django
django.setup()

from eventos.models import PermissaoMenu
try:
    criados, atualizados = PermissaoMenu.garantir_sincronizacao()
    print(f"✓ Permissões sincronizadas! Criadas: {criados}, Atualizadas: {atualizados}")
except Exception as e:
    print(f"✗ ERRO ao sincronizar permissões: {e}")
    import traceback
    traceback.print_exc()
PYEOF

# Iniciar servidor Gunicorn
echo "Iniciando servidor Gunicorn..."
exec gunicorn --bind 0.0.0.0:8000 --workers 4 --threads 2 --timeout 60 --access-logfile - --error-logfile - champions_backend.wsgi:application
