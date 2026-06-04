from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0047_sorteio_models'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='sorteioganhador',
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name='sorteioganhador',
            constraint=models.UniqueConstraint(
                fields=('sorteio', 'rodada'),
                name='unique_sorteio_rodada',
            ),
        ),
    ]
