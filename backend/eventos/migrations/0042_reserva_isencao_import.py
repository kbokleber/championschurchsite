from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0041_evento_particular_link_acesso'),
    ]

    operations = [
        migrations.AddField(
            model_name='cobranca',
            name='reserva_expira_em',
            field=models.DateTimeField(
                blank=True,
                help_text='Prazo para pagamento antes de liberar a vaga (eventos pagos).',
                null=True,
                verbose_name='Reserva expira em',
            ),
        ),
        migrations.AddField(
            model_name='inscricao',
            name='liberador_isencao',
            field=models.CharField(
                blank=True,
                help_text='Quem autorizou a isenção (admin/pastor)',
                max_length=200,
                verbose_name='Liberado por',
            ),
        ),
        migrations.AddField(
            model_name='inscricao',
            name='motivo_isencao',
            field=models.CharField(
                blank=True,
                max_length=300,
                verbose_name='Motivo da isenção',
            ),
        ),
    ]
