import uuid
from collections import defaultdict

from django.db import migrations, models


def agrupar_lotes_reservas_existentes(apps, schema_editor):
    ReservaLoja = apps.get_model('loja', 'ReservaLoja')
    grupos = defaultdict(list)
    for reserva in ReservaLoja.objects.all().order_by('id'):
        criado = reserva.data_criacao
        if criado is not None:
            criado = criado.replace(microsecond=0)
        chave = (
            (reserva.nome or '').strip().lower(),
            str(reserva.data),
            reserva.criado_por_id,
            criado,
        )
        grupos[chave].append(reserva.pk)

    for pks in grupos.values():
        lote = uuid.uuid4()
        ReservaLoja.objects.filter(pk__in=pks).update(lote_reserva=lote)


class Migration(migrations.Migration):

    dependencies = [
        ('loja', '0011_reservaloja_whatsapp'),
    ]

    operations = [
        migrations.AddField(
            model_name='reservaloja',
            name='lote_reserva',
            field=models.UUIDField(
                db_index=True,
                help_text='Itens confirmados juntos na mesma operação compartilham o mesmo lote.',
                null=True,
                verbose_name='Lote da reserva',
            ),
        ),
        migrations.RunPython(agrupar_lotes_reservas_existentes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='reservaloja',
            name='lote_reserva',
            field=models.UUIDField(
                db_index=True,
                help_text='Itens confirmados juntos na mesma operação compartilham o mesmo lote.',
                verbose_name='Lote da reserva',
            ),
        ),
    ]
