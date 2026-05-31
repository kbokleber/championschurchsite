from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0036_googledrivecredential_backup_menu'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracaosite',
            name='evolution_global_api_key',
            field=models.CharField(
                blank=True,
                help_text='GLOBAL_API_KEY do Evolution Go. Necessária para validar o nome da instância no teste de conexão.',
                max_length=200,
                verbose_name='Chave global Evolution Go',
            ),
        ),
    ]
