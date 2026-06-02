from django.db import migrations, models
import django.db.models.deletion

from eventos.migration_idempotent import AddFieldIfNotExists, CreateModelIfNotExists


FAIXAS_PADRAO = (
    {
        'nome': 'Adulto',
        'descricao': 'Maiores de 18 anos',
        'tipo_valor': 'porcentagem',
        'valor': 100,
        'idade_minima': 18,
        'idade_maxima': None,
        'ordem': 1,
    },
    {
        'nome': 'Adolescente',
        'descricao': 'De 13 à 17 anos',
        'tipo_valor': 'porcentagem',
        'valor': 50,
        'idade_minima': 13,
        'idade_maxima': 17,
        'ordem': 2,
    },
    {
        'nome': 'Criança',
        'descricao': 'De 0 a 12 anos',
        'tipo_valor': 'porcentagem',
        'valor': 0,
        'idade_minima': 1,
        'idade_maxima': 12,
        'ordem': 3,
    },
)


def seed_grupo_padrao(apps, schema_editor):
    GrupoCategoria = apps.get_model('eventos', 'GrupoCategoria')
    CategoriaParticipante = apps.get_model('eventos', 'CategoriaParticipante')

    grupo, _ = GrupoCategoria.objects.get_or_create(
        padrao_sistema=True,
        defaults={
            'nome': 'Padrão',
            'descricao': 'Grupo padrão do sistema (Adulto, Adolescente, Criança)',
            'ativo': True,
        },
    )
    if grupo.nome != 'Padrão':
        grupo.nome = 'Padrão'
        grupo.padrao_sistema = True
        grupo.save(update_fields=['nome', 'padrao_sistema'])

    nomes_padrao = {d['nome'] for d in FAIXAS_PADRAO}
    for cat in CategoriaParticipante.objects.filter(nome__in=nomes_padrao):
        cat.grupo = grupo
        cat.padrao_sistema = True
        cat.save(update_fields=['grupo', 'padrao_sistema'])

    CategoriaParticipante.objects.filter(grupo__isnull=True).update(grupo=grupo)

    for defs in FAIXAS_PADRAO:
        CategoriaParticipante.objects.get_or_create(
            grupo=grupo,
            nome=defs['nome'],
            defaults={**defs, 'padrao_sistema': True, 'ativo': True},
        )


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0038_evento_permite_acompanhantes'),
    ]

    operations = [
        CreateModelIfNotExists(
            name='GrupoCategoria',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nome', models.CharField(max_length=100, verbose_name='Nome do grupo')),
                ('descricao', models.CharField(blank=True, max_length=300, verbose_name='Descrição')),
                ('padrao_sistema', models.BooleanField(
                    default=False,
                    help_text='O grupo Padrão não pode ser excluído.',
                    verbose_name='Grupo padrão do sistema',
                )),
                ('ativo', models.BooleanField(default=True, verbose_name='Ativo')),
                ('criado_em', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
            ],
            options={
                'verbose_name': 'Grupo de Categorias',
                'verbose_name_plural': 'Grupos de Categorias',
                'ordering': ['padrao_sistema', 'nome'],
            },
        ),
        AddFieldIfNotExists(
            model_name='categoriaparticipante',
            name='grupo',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='categorias',
                to='eventos.grupocategoria',
                verbose_name='Grupo',
            ),
        ),
        AddFieldIfNotExists(
            model_name='categoriaparticipante',
            name='padrao_sistema',
            field=models.BooleanField(
                default=False,
                help_text='Faixas do grupo Padrão (Adulto, Adolescente, Criança) não podem ser excluídas.',
                verbose_name='Faixa padrão do sistema',
            ),
        ),
        AddFieldIfNotExists(
            model_name='evento',
            name='grupo_categorias',
            field=models.ForeignKey(
                blank=True,
                help_text='Faixas usadas na inscrição. Se vazio, usa o grupo Padrão.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='eventos',
                to='eventos.grupocategoria',
                verbose_name='Grupo de categorias',
            ),
        ),
        migrations.RunPython(seed_grupo_padrao, migrations.RunPython.noop),
    ]
