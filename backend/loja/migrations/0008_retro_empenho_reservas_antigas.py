# Empenha estoque e marca flag para reservas criadas antes de em_estoque_empenho.
from django.db import migrations, transaction


def _retro_empenho(apps, schema_editor):
    ReservaLoja = apps.get_model('loja', 'ReservaLoja')
    Produto = apps.get_model('loja', 'Produto')
    pend = ReservaLoja.objects.filter(
        em_estoque_empenhado=False, status__in=['pendente', 'em_cobranca']
    )
    pids = list(pend.values_list('id', flat=True))
    for rid in pids:
        with transaction.atomic():
            r = ReservaLoja.objects.select_for_update().get(pk=rid)
            if r.em_estoque_empenhado:
                continue
            if r.status not in ('pendente', 'em_cobranca'):
                continue
            q = int(r.quantidade or 0)
            if not q:
                r.em_estoque_empenhado = True
                r.save(update_fields=['em_estoque_empenhado'])
                continue
            p = Produto.objects.select_for_update().get(pk=r.produto_id)
            if p.controla_estoque and q:
                novo = p.estoque - q
                p.estoque = novo if novo > 0 else 0
                p.save(update_fields=['estoque'])
            r.em_estoque_empenhado = True
            r.save(update_fields=['em_estoque_empenhado'])


def _noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('loja', '0007_reserva_empenho_estoque'),
    ]

    operations = [
        migrations.RunPython(_retro_empenho, _noop, elidable=True),
    ]
