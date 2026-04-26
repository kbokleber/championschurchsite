from django.db import migrations, models


def marcar_vendas_pagas_ja_baixadas(apps, schema_editor):
    Venda = apps.get_model('loja', 'Venda')
    Venda.objects.filter(status='pago').update(estoque_baixado=True)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('loja', '0002_produto_imagem'),
    ]

    operations = [
        migrations.AddField(
            model_name='venda',
            name='estoque_baixado',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text='Interno: evita baixar estoque duas vezes se o pagamento for confirmado por mais de um canal.',
                verbose_name='Estoque baixado',
            ),
        ),
        migrations.AddField(
            model_name='produto',
            name='controla_estoque',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text='Se ativo, a quantidade é validada e baixada ao concluir a venda paga.',
                verbose_name='Controlar estoque',
            ),
        ),
        migrations.AddField(
            model_name='produto',
            name='estoque',
            field=models.PositiveIntegerField(
                default=0,
                help_text='Unidades (considerado só se “Controlar estoque” estiver ativo).',
                verbose_name='Quantidade em estoque',
            ),
        ),
        migrations.RunPython(marcar_vendas_pagas_ja_baixadas, noop_reverse),
    ]
