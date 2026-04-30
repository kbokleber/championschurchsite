from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0027_configuracaosite_whatsapp_templates'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='imagem_banner_mobile',
            field=models.ImageField(
                blank=True,
                help_text='Imagem opcional específica para celulares na seção de boas-vindas',
                null=True,
                upload_to='configuracoes/',
                verbose_name='Imagem do Banner Mobile (página inicial)',
            ),
        ),
    ]
