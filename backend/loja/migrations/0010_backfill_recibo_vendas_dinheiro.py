import uuid

from django.db import migrations
from django.utils import timezone


def backfill_recibo_vendas_dinheiro(apps, schema_editor):
    Venda = apps.get_model('loja', 'Venda')
    CobrancaLoja = apps.get_model('loja', 'CobrancaLoja')

    for venda in Venda.objects.filter(status='pago', meio_pagamento='dinheiro'):
        cobranca = CobrancaLoja.objects.filter(venda_id=venda.id).first()
        if cobranca:
            if cobranca.status == 'pago' and cobranca.codigo:
                continue
            cobranca.valor = venda.total
            cobranca.status = 'pago'
            cobranca.metodo_pagamento = 'Dinheiro'
            if not cobranca.data_pagamento:
                cobranca.data_pagamento = venda.data_criacao or timezone.now()
            if not cobranca.codigo:
                cobranca.codigo = str(uuid.uuid4())
            cobranca.save()
            continue

        CobrancaLoja.objects.create(
            venda_id=venda.id,
            codigo=str(uuid.uuid4()),
            valor=venda.total,
            status='pago',
            data_pagamento=venda.data_criacao or timezone.now(),
            metodo_pagamento='Dinheiro',
        )


class Migration(migrations.Migration):

    dependencies = [
        ('loja', '0009_lojaauditoria'),
    ]

    operations = [
        migrations.RunPython(backfill_recibo_vendas_dinheiro, migrations.RunPython.noop),
    ]
