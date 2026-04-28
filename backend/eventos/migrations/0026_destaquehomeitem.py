from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0025_add_permissao_menu_loja'),
    ]

    operations = [
        migrations.CreateModel(
            name='DestaqueHomeItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('titulo', models.CharField(max_length=120, verbose_name='Título')),
                ('descricao', models.TextField(verbose_name='Descrição')),
                ('imagem', models.ImageField(blank=True, null=True, upload_to='configuracoes/destaques_home/', verbose_name='Imagem')),
                ('ordem', models.PositiveIntegerField(default=0, verbose_name='Ordem')),
                ('ativo', models.BooleanField(default=True, verbose_name='Ativo')),
                ('criado_em', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
                ('atualizado_em', models.DateTimeField(auto_now=True, verbose_name='Atualizado em')),
                ('configuracao', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='destaques_home', to='eventos.configuracaosite', verbose_name='Configuração do Site')),
            ],
            options={
                'verbose_name': 'Item de Destaque da Home',
                'verbose_name_plural': 'Itens de Destaque da Home',
                'ordering': ['ordem', 'id'],
            },
        ),
    ]

