from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0033_configuracaosite_evolution_api_key_loja'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='wa_msg_reserva_loja',
            field=models.TextField(
                blank=True,
                help_text=(
                    'Mensagem enviada para lembrar de reserva ainda não retirada/paga. '
                    'Placeholders: {nome_saudacao}, {nome_igreja}, {nome}, {itens}, {data}.'
                ),
                verbose_name='Template WhatsApp - Lembrete de Reserva',
            ),
        ),
    ]
