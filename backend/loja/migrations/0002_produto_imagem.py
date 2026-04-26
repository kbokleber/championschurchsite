from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loja', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='produto',
            name='imagem',
            field=models.ImageField(
                blank=True,
                help_text='Ex.: JPG ou PNG; melhora a leitura no balcão e no PDV.',
                null=True,
                upload_to='loja/produtos/',
                verbose_name='Foto',
            ),
        ),
    ]
