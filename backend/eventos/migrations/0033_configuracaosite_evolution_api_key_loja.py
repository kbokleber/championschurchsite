from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0032_configuracaosite_recibo_loja'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='evolution_api_key_loja',
            field=models.CharField(
                blank=True,
                help_text=(
                    'Token da instância da loja/cantina (opcional). '
                    'Se vazio, usa o Token da instância principal.'
                ),
                max_length=200,
                verbose_name='Token da Instância Evolution (Loja/Cantina)',
            ),
        ),
    ]
