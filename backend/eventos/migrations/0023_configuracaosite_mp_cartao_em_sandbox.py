# Generated migration for mp_cartao_em_sandbox

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0022_webhookeventlog'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='mp_cartao_em_sandbox',
            field=models.BooleanField(
                default=False,
                verbose_name='Cartão em Sandbox (testes)',
                help_text='Quando ativo: PIX usa produção (obrigatório) e cartão usa sandbox para testar com cartões de teste sem cobrança real. Ambiente geral deve estar em Produção.'
            ),
        ),
    ]
