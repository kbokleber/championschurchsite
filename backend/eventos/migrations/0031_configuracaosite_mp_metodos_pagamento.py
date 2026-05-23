from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0030_configuracaosite_mp_loja_pix_pagador'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='mp_pix_habilitado',
            field=models.BooleanField(
                default=True,
                help_text='Exibe PIX no checkout de eventos e da loja/cantina.',
                verbose_name='Aceitar PIX',
            ),
        ),
        migrations.AddField(
            model_name='configuracaosite',
            name='mp_cartao_habilitado',
            field=models.BooleanField(
                default=True,
                help_text='Exibe pagamento com cartão (Brick) em eventos e na loja/cantina.',
                verbose_name='Aceitar cartão',
            ),
        ),
    ]
