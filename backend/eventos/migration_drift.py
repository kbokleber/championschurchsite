"""
Reconcilia django_migrations com o schema real (comum após restore de backup prod).
"""

from django.db import connection
from django.db.migrations.loader import MigrationLoader
from django.db.migrations.recorder import MigrationRecorder


def _table_exists(table: str) -> bool:
    return table in connection.introspection.table_names()


def _column_exists(table: str, column: str) -> bool:
    if not _table_exists(table):
        return False
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(cursor, table)
    return any(col.name == column for col in description)


def _column_nullable(table: str, column: str) -> bool:
    if not _table_exists(table):
        return False
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(cursor, table)
    for col in description:
        if col.name == column:
            return col.null_ok
    return False


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


def schema_matches(checks: dict) -> bool:
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


def reconcile_eventos_migration_drift() -> dict[str, list[str]]:
    """
    - Marca migration como aplicada se o schema já existe (evita "already exists").
    - Remove registro se migration consta aplicada mas o schema não existe (pós-backup antigo).
    """
    loader = MigrationLoader(connection, ignore_no_migrations=True)
    recorder = MigrationRecorder(connection)
    faked: list[str] = []
    unmarked: list[str] = []

    for checks in EVENTOS_DRIFT_CHECKS:
        name = checks['name']
        key = ('eventos', name)
        if key not in loader.disk_migrations:
            continue

        applied = recorder.migration_qs.filter(app='eventos', name=name).exists()
        ok = schema_matches(checks)

        if applied and not ok:
            recorder.migration_qs.filter(app='eventos', name=name).delete()
            unmarked.append(name)
        elif not applied and ok:
            recorder.record_applied('eventos', name)
            faked.append(name)

    return {'faked': faked, 'unmarked': unmarked}
