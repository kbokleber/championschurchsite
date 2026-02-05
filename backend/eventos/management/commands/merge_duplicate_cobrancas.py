"""
Comando Django para consolidar cobranças pendentes duplicadas (mesmo membro + evento).
Mantém a cobrança mais antiga e cancela as demais.

Uso: python manage.py merge_duplicate_cobrancas
     python manage.py merge_duplicate_cobrancas --dry-run  # apenas mostra o que seria feito
"""
from django.core.management.base import BaseCommand
from django.db.models import Count

from eventos.models import Cobranca


class Command(BaseCommand):
    help = 'Consolida cobranças pendentes duplicadas (mesmo membro+evento), mantendo a mais antiga'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Apenas lista as duplicatas sem cancelar',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('Modo dry-run: nenhuma alteração será feita'))

        # Grupos com mais de uma cobrança pendente para o mesmo membro+evento
        duplicatas = (
            Cobranca.objects.filter(status='pendente')
            .values('membro', 'evento')
            .annotate(total=Count('id'))
            .filter(total__gt=1)
        )

        total_canceladas = 0
        for grupo in duplicatas:
            cobrancas = (
                Cobranca.objects.filter(
                    membro_id=grupo['membro'],
                    evento_id=grupo['evento'],
                    status='pendente'
                )
                .order_by('data_criacao', 'id')
            )
            manter = cobrancas.first()
            cancelar = list(cobrancas[1:])
            self.stdout.write(
                f"Membro {grupo['membro']} / Evento {grupo['evento']}: "
                f"manter #{manter.id} ({manter.codigo}), cancelar {len(cancelar)} duplicata(s)"
            )
            for c in cancelar:
                if not dry_run:
                    c.status = 'cancelado'
                    c.save()
                total_canceladas += 1

        if total_canceladas == 0 and not duplicatas:
            self.stdout.write(self.style.SUCCESS('Nenhuma cobrança duplicada encontrada.'))
        elif dry_run:
            self.stdout.write(
                self.style.WARNING(f'Em modo normal, {total_canceladas} cobrança(s) seria(m) cancelada(s).')
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f'{total_canceladas} cobrança(s) duplicada(s) cancelada(s).')
            )
