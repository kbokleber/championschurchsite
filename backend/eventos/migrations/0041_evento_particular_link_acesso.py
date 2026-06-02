from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0040_evento_permite_inscricao_adolescente'),
    ]

    operations = [
        migrations.AddField(
            model_name='evento',
            name='evento_particular',
            field=models.BooleanField(
                default=False,
                help_text='Não listar no site; acesso à inscrição somente via link exclusivo (/inscricao/{codigo}).',
                verbose_name='Evento particular',
            ),
        ),
        migrations.AddField(
            model_name='evento',
            name='link_acesso',
            field=models.UUIDField(
                blank=True,
                db_index=True,
                help_text='Código único gerado automaticamente para eventos particulares.',
                null=True,
                unique=True,
                verbose_name='Link de acesso',
            ),
        ),
    ]
