"""
Comando Django para criar usuário admin automaticamente.
Uso: python manage.py create_admin
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Cria um usuário admin com username "admin" e senha "admin123"'

    def handle(self, *args, **options):
        username = 'admin'
        email = 'admin@church.com'
        password = 'admin123'

        # Verificar se o usuário já existe
        if User.objects.filter(username=username).exists():
            self.stdout.write(
                self.style.WARNING(f'Usuário "{username}" já existe!')
            )
            # Atualizar senha se necessário
            user = User.objects.get(username=username)
            user.set_password(password)
            user.is_staff = True
            user.is_superuser = True
            user.is_active = True
            user.save()
            self.stdout.write(
                self.style.SUCCESS(f'Senha do usuário "{username}" foi atualizada para "{password}"')
            )
        else:
            # Criar novo usuário admin
            User.objects.create_superuser(
                username=username,
                email=email,
                password=password
            )
            self.stdout.write(
                self.style.SUCCESS(f'Usuário admin criado com sucesso!')
            )
            self.stdout.write(
                self.style.SUCCESS(f'Username: {username}')
            )
            self.stdout.write(
                self.style.SUCCESS(f'Senha: {password}')
            )
