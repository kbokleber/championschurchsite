"""
Comando para resetar senha do admin após restore de backup.
Uso: python manage.py reset_admin [username]
Exemplo: python manage.py reset_admin admin
         python manage.py reset_admin  (usa "admin" como padrão)
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Reseta a senha do usuário admin (útil após restore de backup)'

    def add_arguments(self, parser):
        parser.add_argument(
            'username',
            nargs='?',
            default='admin',
            help='Username do admin (padrão: admin)',
        )
        parser.add_argument(
            '--password',
            default='admin123',
            help='Nova senha (padrão: admin123)',
        )

    def handle(self, *args, **options):
        username = options['username']
        password = options['password']

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            # Criar se não existir
            User.objects.create_superuser(
                username=username,
                email=f'{username}@church.com',
                password=password,
            )
            self.stdout.write(
                self.style.SUCCESS(f'Usuário "{username}" criado com senha "{password}"')
            )
            return

        user.set_password(password)
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.save()

        self.stdout.write(
            self.style.SUCCESS(f'Senha do usuário "{username}" resetada para "{password}"')
        )
        self.stdout.write(
            self.style.SUCCESS('Faça login em /admin/login')
        )
