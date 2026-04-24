"""
Cobranças e itens ligados a inscrições: recálculo, remoção e limpeza após excluir inscrição.
"""

from decimal import Decimal


def ajustar_cobrancas_ao_cancelar_inscricao(inscricao):
    """
    Com a inscrição já gravada como cancelada:
    - se a inscrição era a única na cobrança: grava a cobrança com status *cancelado* (mantém itens/ histórico);
    - se havia outras pessoas na mesma cobrança: remove só o item desta inscrição e recalcula a cobrança.
    """
    from .models import Cobranca, CobrancaItem

    for item in list(
        CobrancaItem.objects.filter(inscricao=inscricao).select_related('cobranca')
    ):
        cobranca = item.cobranca
        n_outros = cobranca.itens.exclude(pk=item.pk).count()
        if n_outros == 0:
            cobranca.status = "cancelado"
            cobranca.valor = Decimal("0.00")
            cobranca.save()
            # mantém o CobrancaItem (inscrição ainda existe, só cancelada)
        else:
            c_id = item.cobranca_id
            item.delete()
            c = Cobranca.objects.filter(pk=c_id).first()
            if not c:
                continue
            if not c.itens.exists():
                c.delete()
            else:
                recalcular_cobranca_apos_mudanca_itens(
                    c, request=None, disparar_webhook=False
                )


def recalcular_cobranca_apos_mudanca_itens(cobranca, request=None, disparar_webhook=False):
    """
    Recalcula valor e status da cobrança após alterar/remover itens.
    Exclui a cobrança se não restarem itens.
    """
    from django.utils import timezone

    itens = list(cobranca.itens.select_related('inscricao').all())
    if not itens:
        cobranca.delete()
        return

    statuses = [item.inscricao.status_pagamento for item in itens]
    novo_valor = sum(
        float(item.valor)
        for item in itens
        if item.inscricao.status_pagamento != 'cancelado'
    )
    cobranca.valor = novo_valor
    if all(s == 'cancelado' for s in statuses):
        cobranca.status = 'cancelado'
        cobranca.save()
        return
    if all(s in ('pago', 'isento') for s in statuses):
        cobranca.status = 'isento' if all(s == 'isento' for s in statuses) else 'pago'
        cobranca.data_pagamento = timezone.now()
        cobranca.save()
        if disparar_webhook and request is not None:
            from . import views as eventos_views

            eventos_views._disparar_webhook_cobranca_confirmada(
                cobranca,
                tipo='isento' if cobranca.status == 'isento' else 'confirmado_pagamento_manual',
                request=request,
            )
        return
    cobranca.save()


def pos_delete_inscricao_cascade_cobrancas(cobranca_ids):
    """
    Após excluir uma inscrição (CASCADE removeu itens de cobrança), recalcula ou exclui cobranças.
    """
    if not cobranca_ids:
        return
    from .models import Cobranca, CobrancaItem

    for cid in set(cobranca_ids):
        c = Cobranca.objects.filter(pk=cid).first()
        if not c:
            continue
        if not CobrancaItem.objects.filter(cobranca_id=cid).exists():
            c.delete()
        else:
            recalcular_cobranca_apos_mudanca_itens(
                c, request=None, disparar_webhook=False
            )
