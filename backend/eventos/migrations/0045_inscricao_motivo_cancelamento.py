from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0044_configuracaosite_reserva_pagamento_minutos'),
    ]

    operations = [
        migrations.AddField(
            model_name='inscricao',
            name='motivo_cancelamento',
            field=models.CharField(
                blank=True,
                max_length=300,
                verbose_name='Motivo do cancelamento',
            ),
        ),
        migrations.AlterField(
            model_name='inscricao',
            name='status_pagamento',
            field=models.CharField(
                choices=[
                    ('nao_aplicavel', 'Não Aplicável'),
                    ('pendente', 'Pendente'),
                    ('pago', 'Pago'),
                    ('isento', 'Isento'),
                    ('cancelado', 'Cancelado'),
                ],
                default='nao_aplicavel',
                max_length=20,
                verbose_name='Status do Pagamento',
            ),
        ),
    ]
