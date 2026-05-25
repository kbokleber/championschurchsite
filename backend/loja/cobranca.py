"""Helpers de CobrancaLoja (recibo, confirmação de pagamento)."""
from django.utils import timezone

from .models import CobrancaLoja


def marcar_cobranca_venda_paga(venda, *, metodo_pagamento: str) -> CobrancaLoja:
    """
    Garante CobrancaLoja com status pago para emitir recibo (dinheiro ou MP).
    Reaproveita cobrança pendente da mesma venda, se existir.
    """
    agora = timezone.now()
    cobranca = CobrancaLoja.objects.filter(venda_id=venda.pk).first()
    if cobranca:
        cobranca.valor = venda.total
        cobranca.status = 'pago'
        cobranca.metodo_pagamento = metodo_pagamento
        if not cobranca.data_pagamento:
            cobranca.data_pagamento = agora
        cobranca.save(
            update_fields=['valor', 'status', 'metodo_pagamento', 'data_pagamento'],
        )
        return cobranca

    return CobrancaLoja.objects.create(
        venda=venda,
        valor=venda.total,
        status='pago',
        data_pagamento=agora,
        metodo_pagamento=metodo_pagamento,
    )
