from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0051_jobfila_alter_sorteioganhador_status_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='wa_msg_cobranca_confirmada',
            field=models.TextField(
                blank=True,
                help_text=(
                    'Mensagem enviada quando uma cobrança é confirmada (pagamento MP, '
                    'manual ou isenção). Placeholders: {{nome}}, {{telefone}}, {{email}}, '
                    '{{evento}}, {{data_evento}}, {{local_evento}}, {{endereco_evento}}, '
                    '{{status_pagamento}}, {{valor_total}}, {{codigo_inscricao}}, '
                    '{{codigo_cobranca}}, {{igreja_nome}}.'
                ),
                verbose_name='Template WhatsApp - Cobrança confirmada',
            ),
        ),
    ]