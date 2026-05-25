from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loja', '0010_backfill_recibo_vendas_dinheiro'),
    ]

    operations = [
        migrations.AddField(
            model_name='reservaloja',
            name='whatsapp',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Telefone opcional para lembrete (somente dígitos, com DDI quando informado).',
                max_length=20,
                verbose_name='WhatsApp',
            ),
        ),
    ]
