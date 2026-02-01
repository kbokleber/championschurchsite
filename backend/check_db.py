import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'champions_backend.settings')
django.setup()

db_engine = settings.DATABASES['default']['ENGINE']
db_host = settings.DATABASES['default']['HOST']

print(f"ENGINE: {db_engine}")
print(f"HOST: {db_host}")
