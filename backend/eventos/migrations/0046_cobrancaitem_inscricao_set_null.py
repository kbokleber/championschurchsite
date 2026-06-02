from decimal import Decimal
import uuid

from django.db import migrations, models
import django.db.models.deletion


def backfill_cobrancas_isentas(apps, schema_editor):
    """Cria cobrança isenta para inscrições isentas que ainda não tinham registro."""
    Inscricao = apps.get_model('eventos', 'Inscricao')
    Cobranca = apps.get_model('eventos', 'Cobranca')
    CobrancaItem = apps.get_model('eventos', 'CobrancaItem')

    qs = Inscricao.objects.filter(
        status_pagamento='isento',
        is_acompanhante=False,
    ).select_related('membro', 'evento')

    for ins in qs.iterator():
        if CobrancaItem.objects.filter(inscricao_id=ins.id).exists():
            continue
        motivo = (getattr(ins, 'motivo_isencao', '') or '').strip() or 'Isenção administrativa'
        nome = ins.membro.nome if ins.membro_id else 'Participante'
        cob = Cobranca.objects.create(
            codigo=str(uuid.uuid4()),
            membro_id=ins.membro_id,
            evento_id=ins.evento_id,
            valor=Decimal('0'),
            status='isento',
            data_pagamento=ins.data_pagamento,
            descricao=f'Isenção: {motivo}',
        )
        CobrancaItem.objects.create(
            cobranca=cob,
            inscricao_id=ins.id,
            valor=Decimal('0'),
            descricao=nome,
        )


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0045_inscricao_motivo_cancelamento'),
    ]

    operations = [
        migrations.AlterField(
            model_name='cobrancaitem',
            name='inscricao',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='itens_cobranca',
                to='eventos.inscricao',
                verbose_name='Inscrição',
            ),
        ),
        migrations.RunPython(backfill_cobrancas_isentas, migrations.RunPython.noop),
    ]
