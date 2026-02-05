"""
Comando para popular as permissões de menu iniciais do sistema.
Execute: python manage.py popular_permissoes_menu

Este comando agora usa o método de sincronização automática do modelo PermissaoMenu,
garantindo que todos os menus definidos em MENUS_DISPONIVEIS sejam criados/atualizados.
"""

from django.core.management.base import BaseCommand
from eventos.models import PermissaoMenu


class Command(BaseCommand):
    help = 'Popula as permissões de menu iniciais do sistema (usa sincronização automática)'

    def handle(self, *args, **options):
        self.stdout.write('Sincronizando permissões de menu...')
        
        # Usar o método de sincronização automática do modelo
        criados, atualizados = PermissaoMenu.sincronizar_menus()
        
        # Listar menus sincronizados para feedback
        menus = PermissaoMenu.objects.filter(ativo=True).order_by('ordem', 'nome')
        for menu in menus:
            if menu.codigo in [m['codigo'] for m in PermissaoMenu.MENUS_DISPONIVEIS]:
                status = '[OK]' if menu.codigo in [m['codigo'] for m in PermissaoMenu.MENUS_DISPONIVEIS[:criados]] else '[ATUALIZADA]'
                self.stdout.write(
                    self.style.SUCCESS(f'{status} {menu.nome} ({menu.codigo})')
                )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\n[CONCLUIDO] Processo concluido! Criadas: {criados}, Atualizadas: {atualizados}'
            )
        )
