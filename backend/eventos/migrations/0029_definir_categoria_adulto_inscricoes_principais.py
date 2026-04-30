from django.db import migrations


def definir_adulto_para_inscricoes_principais(apps, schema_editor):
    CategoriaParticipante = apps.get_model('eventos', 'CategoriaParticipante')
    Inscricao = apps.get_model('eventos', 'Inscricao')

    categoria_adulto, _ = CategoriaParticipante.objects.get_or_create(
        nome='Adulto',
        defaults={
            'descricao': 'Categoria padrão para adultos',
            'tipo_valor': 'porcentagem',
            'valor': 100,
            'ordem': 1,
            'ativo': True,
        },
    )

    Inscricao.objects.filter(
        is_acompanhante=False,
        categoria__isnull=True,
    ).update(categoria=categoria_adulto)


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0028_configuracaosite_imagem_banner_mobile'),
    ]

    operations = [
        migrations.RunPython(
            definir_adulto_para_inscricoes_principais,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
