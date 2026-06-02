from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0039_grupocategoria_categorias_padrao'),
    ]

    operations = [
        migrations.AddField(
            model_name='evento',
            name='permite_inscricao_adolescente',
            field=models.BooleanField(
                default=False,
                help_text='Quando ativo, quem se inscreve pode informar se é Adulto ou Adolescente (faixa e valor correspondentes).',
                verbose_name='Permite inscrição de adolescente',
            ),
        ),
    ]
