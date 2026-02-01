import os
import django
from django.conf import settings
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'champions_backend.settings')
django.setup()

db_config = settings.DATABASES['default']
print(f"--- Configuração do Django ---")
print(f"ENGINE: {db_config['ENGINE']}")
print(f"HOST: {db_config['HOST']}")
print(f"PORT: {db_config['PORT']}")
print(f"NAME (Banco): {db_config['NAME']}")
print(f"USER: {db_config['USER']}")

print(f"\n--- Verificando Tabelas via Conexão Ativa ---")
try:
    with connection.cursor() as cursor:
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
        tables = cursor.fetchall()
        if tables:
            print(f"Total de tabelas encontradas: {len(tables)}")
            for t in tables[:10]: # Mostrar as primeiras 10
                print(f" - {t[0]}")
            if len(tables) > 10:
                print(" ...")
        else:
            print("Nenhuma tabela encontrada no schema 'public'.")
            
        # Verificar em qual banco o postgres acha que está
        cursor.execute("SELECT current_database();")
        curr_db = cursor.fetchone()
        print(f"\nBanco de dados atual (via SQL): {curr_db[0]}")
except Exception as e:
    print(f"Erro ao conectar ou consultar: {e}")
