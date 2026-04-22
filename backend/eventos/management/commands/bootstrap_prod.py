"""
Comando para bootstrap pós-deploy em produção.
Uso: python manage.py bootstrap_prod
"""

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand

from eventos.models import ConfiguracaoSite, PermissaoMenu


class Command(BaseCommand):
    help = "Executa tarefas administrativas pesadas (configuração, admin e permissões)."

    def handle(self, *args, **options):
        self.stdout.write("Iniciando bootstrap_prod...")

        # Configuração do site
        config, created = ConfiguracaoSite.objects.get_or_create(pk=1)
        if created:
            self.stdout.write(self.style.SUCCESS("ConfiguracaoSite criada com sucesso."))
        else:
            self.stdout.write("ConfiguracaoSite já existente.")

        # Usuário admin
        self.stdout.write("Garantindo usuário admin...")
        call_command("create_admin")
        user_model = get_user_model()
        if user_model.objects.filter(username="admin").exists():
            self.stdout.write(self.style.SUCCESS('Usuário "admin" confirmado.'))
        else:
            self.stdout.write(self.style.WARNING('Usuário "admin" não encontrado após create_admin.'))

        # Sincronização de permissões de menu
        criados, atualizados = PermissaoMenu.garantir_sincronizacao()
        self.stdout.write(
            self.style.SUCCESS(
                f"Permissões sincronizadas com sucesso. Criadas: {criados}, Atualizadas: {atualizados}"
            )
        )

        self.stdout.write(self.style.SUCCESS("bootstrap_prod concluído."))
