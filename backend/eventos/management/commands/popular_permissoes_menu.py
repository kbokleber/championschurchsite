"""
Comando para popular as permissões de menu iniciais do sistema.
Execute: python manage.py popular_permissoes_menu
"""

from django.core.management.base import BaseCommand
from eventos.models import PermissaoMenu


class Command(BaseCommand):
    help = 'Popula as permissões de menu iniciais do sistema'

    def handle(self, *args, **options):
        # Definir menus padrão baseados no AdminLayout
        menus = [
            {'codigo': 'dashboard', 'nome': 'Dashboard', 'ordem': 1, 'descricao': 'Painel principal com estatísticas'},
            {'codigo': 'eventos', 'nome': 'Eventos', 'ordem': 2, 'descricao': 'Gerenciar eventos da igreja'},
            {'codigo': 'membros', 'nome': 'Membros', 'ordem': 3, 'descricao': 'Gerenciar membros e participantes'},
            {'codigo': 'inscricoes', 'nome': 'Inscrições', 'ordem': 4, 'descricao': 'Visualizar e gerenciar inscrições'},
            {'codigo': 'cobrancas', 'nome': 'Cobranças', 'ordem': 5, 'descricao': 'Gerenciar cobranças e pagamentos'},
            {'codigo': 'checkin', 'nome': 'Check-in', 'ordem': 6, 'descricao': 'Realizar check-in de participantes'},
            {'codigo': 'contatos', 'nome': 'Contatos', 'ordem': 7, 'descricao': 'Visualizar mensagens de contato'},
            {'codigo': 'categorias', 'nome': 'Categorias', 'ordem': 8, 'descricao': 'Gerenciar categorias de participantes'},
            {'codigo': 'configuracoes', 'nome': 'Configurações', 'ordem': 9, 'descricao': 'Configurações gerais do sistema'},
            {'codigo': 'usuarios', 'nome': 'Usuários', 'ordem': 10, 'descricao': 'Gerenciar usuários administrativos'},
            {'codigo': 'grupos', 'nome': 'Grupos', 'ordem': 11, 'descricao': 'Gerenciar grupos e permissões'},
        ]
        
        criados = 0
        atualizados = 0
        
        for menu_data in menus:
            permissao, created = PermissaoMenu.objects.update_or_create(
                codigo=menu_data['codigo'],
                defaults={
                    'nome': menu_data['nome'],
                    'descricao': menu_data['descricao'],
                    'ordem': menu_data['ordem'],
                    'ativo': True
                }
            )
            
            if created:
                criados += 1
                self.stdout.write(
                    self.style.SUCCESS(f'[OK] Criada permissao: {permissao.nome} ({permissao.codigo})')
                )
            else:
                atualizados += 1
                self.stdout.write(
                    self.style.WARNING(f'[ATUALIZADA] Atualizada permissao: {permissao.nome} ({permissao.codigo})')
                )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\n[CONCLUIDO] Processo concluido! Criadas: {criados}, Atualizadas: {atualizados}'
            )
        )
