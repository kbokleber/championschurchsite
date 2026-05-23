from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0031_configuracaosite_mp_metodos_pagamento'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='evolution_api_instance_loja',
            field=models.CharField(
                blank=True,
                help_text=(
                    'Nome da instância usada para enviar recibos da loja/cantina. '
                    'Reaproveita URL e API Key da Evolution acima.'
                ),
                max_length=100,
                verbose_name='Instância Evolution (Loja/Cantina)',
            ),
        ),
        migrations.AddField(
            model_name='configuracaosite',
            name='wa_msg_recibo_loja',
            field=models.TextField(
                blank=True,
                help_text=(
                    'Mensagem enviada com o link do recibo. Placeholders: '
                    '{nome_saudacao}, {nome_igreja}, {codigo}, {total}, {itens}, {link_recibo}.'
                ),
                verbose_name='Template WhatsApp - Recibo da Loja',
            ),
        ),
    ]
