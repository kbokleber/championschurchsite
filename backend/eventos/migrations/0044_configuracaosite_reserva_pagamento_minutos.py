from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0043_configuracaosite_wa_msg_inscricao_isenta_admin'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='reserva_pagamento_minutos',
            field=models.PositiveSmallIntegerField(
                default=30,
                help_text=(
                    'Tempo em que a vaga fica reservada após inscrição sem pagamento em eventos pagos. '
                    'Após esse prazo, a reserva expira e a vaga libera para outra pessoa.'
                ),
                verbose_name='Minutos de reserva da vaga',
            ),
        ),
    ]
