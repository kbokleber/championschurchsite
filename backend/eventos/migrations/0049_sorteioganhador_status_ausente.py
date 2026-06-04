from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('eventos', '0048_sorteioganhador_premio_por_evento'),
    ]

    operations = [
        migrations.AddField(
            model_name='sorteioganhador',
            name='status',
            field=models.CharField(
                choices=[('confirmado', 'Confirmado'), ('ausente', 'Ausente')],
                default='confirmado',
                help_text='Ausente: não compareceu para retirar; volta ao pool do mesmo prêmio.',
                max_length=20,
                verbose_name='Status do prêmio',
            ),
        ),
        migrations.AddField(
            model_name='sorteioganhador',
            name='marcado_ausente_em',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Marcado ausente em'),
        ),
        migrations.AddField(
            model_name='sorteioganhador',
            name='marcado_ausente_por',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='sorteios_ganhador_ausente',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Marcado ausente por',
            ),
        ),
    ]
