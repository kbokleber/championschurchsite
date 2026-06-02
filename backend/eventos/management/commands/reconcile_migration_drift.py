"""Marca migrations eventos como aplicadas quando o schema já existe (pós-backup)."""

from django.core.management.base import BaseCommand

from eventos.migration_drift import reconcile_eventos_migration_drift


class Command(BaseCommand):
    help = 'Reconcilia django_migrations eventos com o schema real (restore de backup).'

    def handle(self, *args, **options):
        result = reconcile_eventos_migration_drift()
        faked = result['faked']
        unmarked = result['unmarked']

        if unmarked:
            self.stdout.write(
                self.style.WARNING(
                    f'Registros removidos (schema incompleto): {", ".join(unmarked)}'
                )
            )
        if faked:
            self.stdout.write(
                self.style.SUCCESS(f'Migrations marcadas como aplicadas: {", ".join(faked)}')
            )
        if not faked and not unmarked:
            self.stdout.write('Nenhum drift de migration eventos detectado.')
