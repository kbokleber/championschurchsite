"""
Diagnóstico do banco: lista usuários e verifica se admin existe.
Uso: python manage.py check_db_users
Execute no container do Coolify (Exec) para verificar o banco dev.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import connection

User = get_user_model()


class Command(BaseCommand):
    help = 'Lista usuários no banco e verifica se admin existe'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Reseta senha do admin para admin123 se existir',
        )

    def handle(self, *args, **options):
        self.stdout.write('=== Diagnóstico do banco de dados ===\n')

        # 1. Verificar conexão
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT current_database(), current_user')
                db, user = cursor.fetchone()
                self.stdout.write(self.style.SUCCESS(f'Conectado: banco={db}, user={user}\n'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Erro de conexão: {e}'))
            return

        # 2. Verificar se tabela auth_user existe
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' AND table_name = 'auth_user'
                    )
                """)
                exists = cursor.fetchone()[0]
                if not exists:
                    self.stdout.write(self.style.ERROR('Tabela auth_user NÃO existe! Execute as migrações.'))
                    return
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Erro ao verificar tabela: {e}'))
            return

        # 3. Contar usuários via SQL (funciona mesmo se modelo mudou)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT COUNT(*) FROM auth_user')
                total = cursor.fetchone()[0]
                self.stdout.write(f'Total de usuários na auth_user: {total}\n')

                if total == 0:
                    self.stdout.write(self.style.WARNING('Banco VAZIO - nenhum usuário!'))
                    self.stdout.write('Execute: python manage.py create_admin\n')
                    return

                # Listar usuários
                cursor.execute('''
                    SELECT id, username, email, is_staff, is_superuser, is_active
                    FROM auth_user ORDER BY id
                ''')
                rows = cursor.fetchall()
                self.stdout.write('Usuários:\n')
                for r in rows:
                    uid, username, email, staff, superuser, active = r
                    status = '✓' if active else '✗ inativo'
                    flags = []
                    if staff:
                        flags.append('staff')
                    if superuser:
                        flags.append('superuser')
                    self.stdout.write(f'  id={uid} | {username} | {email or "-"} | {", ".join(flags) or "-"} | {status}\n')
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Erro ao listar usuários: {e}'))
            return

        # 4. Verificar admin via Django ORM
        self.stdout.write('\n')
        if User.objects.filter(username='admin').exists():
            u = User.objects.get(username='admin')
            self.stdout.write(self.style.SUCCESS(f'Usuário "admin" existe (id={u.id}, is_active={u.is_active})'))
            if not u.is_active:
                self.stdout.write(self.style.WARNING('  ATENÇÃO: admin está INATIVO!'))
            if options.get('fix'):
                u.set_password('admin123')
                u.is_staff = True
                u.is_superuser = True
                u.is_active = True
                u.save()
                self.stdout.write(self.style.SUCCESS('  Senha resetada para admin123'))
        else:
            self.stdout.write(self.style.WARNING('Usuário "admin" NÃO existe!'))
            self.stdout.write('Execute: python manage.py create_admin\n')

        # 5. ConfiguracaoSite
        try:
            from eventos.models import ConfiguracaoSite
            count = ConfiguracaoSite.objects.count()
            self.stdout.write(f'\nConfiguracaoSite: {count} registro(s)')
        except Exception:
            pass

        self.stdout.write('\n=== Fim do diagnóstico ===')
