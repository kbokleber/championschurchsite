# Generated manually: reservas usam estoque / sem controle (não mais flags no produto).

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('loja', '0005_reservas_e_cota'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='produto',
            name='aceita_reserva',
        ),
        migrations.RemoveField(
            model_name='produto',
            name='cota_reserva_diaria',
        ),
    ]
