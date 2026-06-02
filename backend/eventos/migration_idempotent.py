"""Operações de migration que ignoram objetos já existentes (restore de backup / drift)."""

from django.db import migrations


def _table_names(schema_editor):
    return set(schema_editor.connection.introspection.table_names())


def _column_names(schema_editor, table):
    with schema_editor.connection.cursor() as cursor:
        return {
            col.name
            for col in schema_editor.connection.introspection.get_table_description(cursor, table)
        }


class CreateModelIfNotExists(migrations.CreateModel):
    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.name)
        if model._meta.db_table in _table_names(schema_editor):
            return
        super().database_forwards(app_label, schema_editor, from_state, to_state)


class AddFieldIfNotExists(migrations.AddField):
    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        to_model = to_state.apps.get_model(app_label, self.model_name)
        field = to_model._meta.get_field(self.name)
        table = to_model._meta.db_table
        if field.column in _column_names(schema_editor, table):
            return
        super().database_forwards(app_label, schema_editor, from_state, to_state)
