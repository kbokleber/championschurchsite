from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0042_reserva_isencao_import'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='wa_msg_inscricao_isenta_admin',
            field=models.TextField(
                blank=True,
                help_text=(
                    'Mensagem ao cadastrar isenção avulsa ou importar planilha. '
                    'Placeholders: {{nome}}, {{telefone}}, {{senha}}, {{evento}}, {{data_evento}}, '
                    '{{local_evento}}, {{endereco_evento}}, {{link_ingressos}}, {{codigo_inscricao}}, '
                    '{{motivo_isencao}}, {{liberador_por}}, {{igreja_nome}}.'
                ),
                verbose_name='Template WhatsApp - Isenção cadastrada pelo admin',
            ),
        ),
    ]
