"""
Marca migrations como aplicadas quando o schema já existe (ex.: restore de backup prod).

Evita falhas do tipo "relation already exists" no deploy após importar backup.
"""

from django.core.management.base import BaseCommand
from django.db import connection
from django.db.migrations.loader import MigrationLoader
from django.db.migrations.recorder import MigrationRecorder


def _table_exists(table: str) -> bool:
    with connection.cursor() as cursor:
        cursor.execute('SELECT to_regclass(%s)', [table])
        return cursor.fetchone()[0] is not None


def _column_exists(table: str, column: str) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = %s
              AND column_name = %s
            LIMIT 1
            """,
            [table, column],
        )
        return cursor.fetchone() is not None


def _column_nullable(table: str, column: str) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT is_nullable
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = %s
              AND column_name = %s
            LIMIT 1
            """,
            [table, column],
        )
        row = cursor.fetchone()
        return row is not None and row[0] == 'YES'


# Migrations cujo schema pode já existir sem registro em django_migrations.
EVENTOS_DRIFT_CHECKS = (
    {
        'name': '0039_grupocategoria_categorias_padrao',
        'required': [
            ('table', 'eventos_grupocategoria'),
            ('column', 'eventos_categoriaparticipante', 'grupo_id'),
            ('column', 'eventos_categoriaparticipante', 'padrao_sistema'),
            ('column', 'eventos_evento', 'grupo_categorias_id'),
        ],
    },
    {
        'name': '0040_evento_permite_inscricao_adolescente',
        'required': [('column', 'eventos_evento', 'permite_inscricao_adolescente')],
    },
    {
        'name': '0041_evento_particular_link_acesso',
        'required': [
            ('column', 'eventos_evento', 'evento_particular'),
            ('column', 'eventos_evento', 'link_acesso'),
        ],
    },
    {
        'name': '0042_reserva_isencao_import',
        'required': [
            ('column', 'eventos_cobranca', 'reserva_expira_em'),
            ('column', 'eventos_inscricao', 'liberador_isencao'),
            ('column', 'eventos_inscricao', 'motivo_isencao'),
        ],
    },
    {
        'name': '0043_configuracaosite_wa_msg_inscricao_isenta_admin',
        'required': [('column', 'eventos_configuracaosite', 'wa_msg_inscricao_isenta_admin')],
    },
    {
        'name': '0044_configuracaosite_reserva_pagamento_minutos',
        'required': [('column', 'eventos_configuracaosite', 'reserva_pagamento_minutos')],
    },
    {
        'name': '0045_inscricao_motivo_cancelamento',
        'required': [('column', 'eventos_inscricao', 'motivo_cancelamento')],
    },
    {
        'name': '0046_cobrancaitem_inscricao_set_null',
        'required': [('nullable_fk', 'eventos_cobrancaitem', 'inscricao_id')],
    },
)


def _schema_matches(checks) -> bool:
    for item in checks['required']:
        kind = item[0]
        if kind == 'table':
            if not _table_exists(item[1]):
                return False
        elif kind == 'column':
            if not _column_exists(item[1], item[2]):
                return False
        elif kind == 'nullable_fk':
            if not _column_nullable(item[1], item[2]):
                return False
        else:
            raise ValueError(f'Tipo de check desconhecido: {kind}')
    return True


class Command(BaseCommand):
    help = 'Marca migrations eventos como aplicadas quando o schema já existe (pós-backup).'

    def handle(self, *args, **options):
        loader = MigrationLoader(connection, ignore_no_migrations=True)
        recorder = MigrationRecorder(connection)
        faked = []

        for checks in EVENTOS_DRIFT_CHECKS:
            name = checks['name']
            if recorder.migration_qs.filter(app='eventos', name=name).exists():
                continue
            if not _schema_matches(checks):
                continue
            key = ('eventos', name)
            if key not in loader.disk_migrations:
                self.stderr.write(self.style.WARNING(f'Migration {name} não encontrada no disco; ignorando.'))
                continue
            recorder.record_applied('eventos', name)
            faked.append(name)

        if faked:
            self.stdout.write(self.style.SUCCESS(f'Migrations marcadas como aplicadas: {", ".join(faked)}'))
        else:
            self.stdout.write('Nenhum drift de migration eventos detectado.')
