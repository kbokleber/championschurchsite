from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0049_sorteioganhador_status_ausente'),
    ]

    operations = [
        migrations.AddField(
            model_name='evento',
            name='checkin_abre_em',
            field=models.DateTimeField(
                blank=True,
                help_text='Opcional. Horário em que o check-in fica disponível (ex.: equipe de organização). Se vazio, o check-in abre no início do evento.',
                null=True,
                verbose_name='Abertura do check-in',
            ),
        ),
    ]
