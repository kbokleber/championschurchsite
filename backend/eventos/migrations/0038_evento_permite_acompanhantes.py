from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0037_configuracaosite_evolution_global_api_key'),
    ]

    operations = [
        migrations.AddField(
            model_name='evento',
            name='permite_acompanhantes',
            field=models.BooleanField(
                default=True,
                help_text='Desative para eventos em que o ingresso já contempla o casal/grupo (sem cadastro extra de acompanhantes).',
                verbose_name='Permite acompanhantes',
            ),
        ),
    ]
