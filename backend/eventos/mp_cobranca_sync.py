"""
Sincronização de cobranças de eventos com o Mercado Pago (webhook, polling, reconciliação).
"""

import logging

from django.db import transaction
from django.utils import timezone

from .mercadopago_sdk import (
    is_mp_payment_id,
    mp_buscar_merchant_order,
    mp_buscar_order,
    mp_buscar_pagamento,
    mp_search_orders_by_reference,
    mp_search_payments_by_reference,
    normalizar_order_cartao_response,
)
from .models import Cobranca, ConfiguracaoSite

logger = logging.getLogger(__name__)


def consultar_status_mp_cobranca(cobranca, config=None):
    """
    Consulta o Mercado Pago pelo pagamento ligado à cobrança.
    Sempre tenta buscar por external_reference (= cobranca.codigo), mesmo sem referencia_externa local.
    Retorna (mp_status, payment_dict|None).
    """
    config = config or ConfiguracaoSite.get_config()
    mp_status = 'pending'
    payment_hit = None
    ref = (cobranca.referencia_externa or '').strip()

    if ref.startswith('ORD'):
        order, _env = mp_buscar_order(ref, config)
        if order:
            norm = normalizar_order_cartao_response(order)
            return norm.get('status', 'pending'), norm

    if is_mp_payment_id(ref):
        payment, _env = mp_buscar_pagamento(ref, config)
        if payment:
            return payment.get('status') or 'pending', payment

    codigo = str(cobranca.codigo)
    for payment in mp_search_payments_by_reference(codigo, config):
        st = payment.get('status') or 'pending'
        if st == 'approved':
            return 'approved', payment
        if st in ('pending', 'in_process'):
            mp_status = st
            payment_hit = payment

    for order in mp_search_orders_by_reference(codigo, config):
        norm = normalizar_order_cartao_response(order)
        st = norm.get('status', 'pending')
        if st == 'approved':
            return 'approved', norm
        if st in ('pending', 'in_process'):
            mp_status = st
            payment_hit = norm

    return mp_status, payment_hit


def _metodo_pagamento_de_payment(payment):
    if not payment:
        return None
    pm = payment.get('payment_method_id') or ''
    if pm == 'pix':
        return 'Mercado Pago (PIX)'
    if payment.get('payment_type_id') in ('credit_card', 'debit_card', 'prepaid_card'):
        return 'Mercado Pago (cartão)'
    return None


def confirmar_cobranca_evento_paga_mp(
    cobranca,
    *,
    payment=None,
    referencia_externa=None,
    metodo_pagamento=None,
    disparar_webhook=True,
):
    """
    Marca cobrança e inscrições como pagas (idempotente).
    Gera QR code das inscrições quando necessário.
    """
    ref = (referencia_externa or '').strip() or None
    metodo = metodo_pagamento
    if payment:
        if not ref:
            ref = str(payment.get('order_id') or payment.get('id') or '') or None
        if not metodo:
            metodo = _metodo_pagamento_de_payment(payment)

    updated = False
    with transaction.atomic():
        c = Cobranca.objects.select_for_update().get(pk=cobranca.pk)
        if c.status == 'pago':
            cobranca.refresh_from_db()
            return False

        c.status = 'pago'
        c.data_pagamento = timezone.now()
        if ref:
            c.referencia_externa = ref
        if metodo:
            c.metodo_pagamento = metodo
        c.save()

        for item in c.itens.select_related('inscricao').all():
            ins = item.inscricao
            ins.status_pagamento = 'pago'
            ins.status = 'confirmada'
            ins.data_pagamento = timezone.now()
            if not ins.qrcode:
                ins.gerar_qrcode()
            ins.save()
        updated = True

    if updated:
        cobranca.refresh_from_db()
        if disparar_webhook:
            from . import views as eventos_views

            eventos_views._disparar_webhook_cobranca_confirmada(cobranca)
        logger.info('Cobrança %s confirmada via sincronização MP', cobranca.codigo)
    return updated


def cancelar_cobranca_evento_mp(cobranca):
    """Cancela cobrança pendente quando o MP rejeita/cancela o pagamento."""
    with transaction.atomic():
        c = Cobranca.objects.select_for_update().get(pk=cobranca.pk)
        if c.status != 'pendente':
            return False
        c.status = 'cancelado'
        c.save()
        logger.info('Cobrança %s cancelada/rejeitada via MP', c.codigo)
        return True


def resolver_pagamento_webhook_mp(resource_id, topic=None, config=None):
    """
    Obtém dict de pagamento normalizado a partir do id do webhook (payment, order ou merchant_order).
    Retorna (payment_dict|None, external_reference|None).
    """
    config = config or ConfiguracaoSite.get_config()
    resource_id = str(resource_id or '').strip()
    topic = (topic or '').strip()

    if topic == 'merchant_order':
        return mp_normalizar_merchant_order_payment(resource_id, config)

    if resource_id.startswith('ORD') or topic == 'order':
        order, _env = mp_buscar_order(resource_id, config)
        if order:
            norm = normalizar_order_cartao_response(order)
            return norm, norm.get('external_reference')
        return None, None

    payment, _env = mp_buscar_pagamento(resource_id, config)
    if payment:
        return payment, payment.get('external_reference')

    order, _env = mp_buscar_order(resource_id, config)
    if order:
        norm = normalizar_order_cartao_response(order)
        return norm, norm.get('external_reference')

    return mp_normalizar_merchant_order_payment(resource_id, config)


def mp_normalizar_merchant_order_payment(merchant_order_id, config=None):
    """Merchant orders (Checkout Pro / preferências) expõem pagamentos aninhados."""
    mo, _env = mp_buscar_merchant_order(merchant_order_id, config)
    if not mo:
        return None, None

    external_reference = mo.get('external_reference')
    payments = mo.get('payments') or []
    chosen = None
    for p in payments:
        if p.get('status') == 'approved':
            chosen = p
            break
    if not chosen and payments:
        chosen = payments[-1]
    if not chosen:
        return None, external_reference

    st = chosen.get('status') or 'pending'
    if st == 'approved':
        status_mp = 'approved'
    elif st in ('pending', 'in_process'):
        status_mp = st
    elif st in ('rejected', 'cancelled', 'canceled'):
        status_mp = 'rejected'
    else:
        status_mp = st

    return {
        'id': chosen.get('id'),
        'status': status_mp,
        'external_reference': external_reference,
        'payment_method_id': chosen.get('payment_method_id'),
        'payment_type_id': chosen.get('payment_type_id'),
    }, external_reference
