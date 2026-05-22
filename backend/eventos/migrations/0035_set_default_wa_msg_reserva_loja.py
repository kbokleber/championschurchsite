from django.db import migrations


DEFAULT_MSG = (
    "Olá{nome_saudacao}! Aqui é da {nome_igreja}.\n\n"
    "Existe uma reserva em nome de {nome} para o dia {data}: {itens}.\n"
    "Passe na cantina para retirar e pagar quando puder. Obrigado!"
)


def set_default_template(apps, schema_editor):
    ConfiguracaoSite = apps.get_model('eventos', 'ConfiguracaoSite')
    for cfg in ConfiguracaoSite.objects.all():
        atual = (cfg.wa_msg_reserva_loja or '').strip()
        if not atual:
            cfg.wa_msg_reserva_loja = DEFAULT_MSG
            cfg.save(update_fields=['wa_msg_reserva_loja'])


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('eventos', '0034_configuracaosite_wa_msg_reserva_loja'),
    ]

    operations = [
        migrations.RunPython(set_default_template, noop_reverse),
    ]
