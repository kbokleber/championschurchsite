from django.db import migrations, models


def backfill_segmento_cantina(apps, schema_editor):
    Produto = apps.get_model('loja', 'Produto')
    Produto.objects.filter(categoria='cantina', segmento_cantina__isnull=True).update(segmento_cantina='comida')


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('loja', '0003_produto_estoque_venda_baixado'),
    ]

    operations = [
        migrations.AddField(
            model_name='produto',
            name='segmento_cantina',
            field=models.CharField(
                blank=True,
                choices=[('comida', 'Comidas'), ('bebida', 'Bebidas')],
                db_index=True,
                help_text='Só na cantina: separa o cardápio em comidas e bebidas. Em produtos de loja fica vazio.',
                max_length=20,
                null=True,
                verbose_name='Comidas ou bebidas',
            ),
        ),
        migrations.AddIndex(
            model_name='produto',
            index=models.Index(
                fields=['categoria', 'segmento_cantina', 'ativo'], name='loja_prod_cat_seg_ativo'
            ),
        ),
        migrations.RunPython(backfill_segmento_cantina, noop_reverse),
    ]
