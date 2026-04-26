from django.db import migrations


def add_menu_loja(apps, schema_editor):
    PermissaoMenu = apps.get_model('eventos', 'PermissaoMenu')
    PermissaoMenu.objects.update_or_create(
        codigo='loja',
        defaults={
            'nome': 'Loja / Cantina',
            'descricao': 'Produtos, PDV e vendas (interno); atribua a permissão ao grupo em Grupos',
            'ordem': 13,
            'ativo': True,
        },
    )


def remove_menu_loja(apps, schema_editor):
    PermissaoMenu = apps.get_model('eventos', 'PermissaoMenu')
    PermissaoMenu.objects.filter(codigo='loja').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('eventos', '0024_formularioinscricao_and_more'),
    ]

    operations = [
        migrations.RunPython(add_menu_loja, remove_menu_loja),
    ]
