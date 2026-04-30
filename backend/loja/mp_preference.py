"""
Preferência Mercado Pago (Checkout Pro) para CobrancaLoja.
Reutiliza a mesma configuração (tokens/ambiente) de ConfiguracaoSite.
"""
import logging

from rest_framework import status
from rest_framework.response import Response

from eventos.mercadopago_sdk import get_mercadopago_sdk
from eventos.models import ConfiguracaoSite

logger = logging.getLogger(__name__)

MP_MAX_CHARS = 256


def _validar_credenciais_mp_ambiente(ambiente, public_key, access_token):
    public_key_upper = (public_key or '').strip().upper()
    access_token_upper = (access_token or '').strip().upper()

    if ambiente == 'production':
        if public_key_upper.startswith('TEST-') or access_token_upper.startswith('TEST-'):
            return (
                False,
                'Para Produção, use as credenciais produtivas do Mercado Pago. Credenciais TEST- são apenas para sandbox.',
            )

    return True, None


def criar_preferencia_pagamento_loja(request, cobranca_loja) -> Response:
    """
    Cria preferência no MP para a cobrança de loja ou reutiliza referência_externa existente
    (ID da preferência, não o payment_id).
    """

    from .models import Venda

    venda = (
        Venda.objects.filter(pk=cobranca_loja.venda_id)
        .select_related('criado_por')
        .prefetch_related('itens__produto')
        .get()
    )

    if cobranca_loja.status != 'pendente':
        return Response(
            {
                'error': f'Cobrança já está: {cobranca_loja.get_status_display()}',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    config = ConfiguracaoSite.get_config()
    if not config.mp_ativo:
        return Response(
            {'error': 'Mercado Pago não está ativo nas configurações'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    mp_env = 'production' if getattr(config, 'mp_cartao_em_sandbox', False) else config.mp_ambiente
    credenciais_ok, detalhe_credenciais = _validar_credenciais_mp_ambiente(
        mp_env,
        config.get_mp_public_key_for(mp_env),
        config.get_mp_access_token_for(mp_env),
    )
    if not credenciais_ok:
        return Response({'error': detalhe_credenciais}, status=status.HTTP_400_BAD_REQUEST)

    sdk = get_mercadopago_sdk(mp_env)
    if not sdk:
        return Response(
            {'error': 'Mercado Pago não configurado corretamente'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if mp_env == 'sandbox' and cobranca_loja.referencia_externa:
        cobranca_loja.referencia_externa = ''
        cobranca_loja.save(update_fields=['referencia_externa'])

    if cobranca_loja.referencia_externa:
        try:
            preference_response = sdk.preference().get(cobranca_loja.referencia_externa)
            preference = preference_response.get('response', {})
            if preference_response.get('status') in [200, 201] and preference.get('init_point'):
                return Response(
                    {
                        'success': True,
                        'preference_id': cobranca_loja.referencia_externa,
                        'init_point': preference.get('init_point'),
                        'sandbox_init_point': preference.get('sandbox_init_point'),
                        'is_sandbox': mp_env == 'sandbox',
                        'valor': float(cobranca_loja.valor),
                        'cobranca_loja': {
                            'id': cobranca_loja.id,
                            'codigo': cobranca_loja.codigo,
                        },
                        'reutilizado': True,
                    }
                )
        except Exception as e:
            logger.warning('Erro ao reutilizar preferência loja, recriando: %s', e)
            cobranca_loja.referencia_externa = ''
            cobranca_loja.save(update_fields=['referencia_externa'])

    # Descrição a partir dos itens
    partes = []
    for it in venda.itens.all():
        label = (it.produto.nome or 'Item') if it.produto else 'Item'
        partes.append(f"{label} x{it.quantidade}")
    descricao = 'Loja / Cantina — ' + ', '.join(partes) if partes else 'Loja / Cantina'
    if venda.comprador_nome:
        descricao = f"{venda.comprador_nome} — {descricao}"
    if len(descricao) > MP_MAX_CHARS:
        descricao = descricao[: MP_MAX_CHARS - 3] + '...'
    titulo = 'Loja / Cantina'[:MP_MAX_CHARS]

    valor_total = float(cobranca_loja.valor)
    item_data = {
        'title': titulo,
        'description': descricao,
        'quantity': 1,
        'unit_price': valor_total,
        'currency_id': 'BRL',
    }
    items = [item_data]

    base_url = request.build_absolute_uri('/')
    is_localhost = 'localhost' in base_url or '127.0.0.1' in base_url
    u = venda.criado_por
    if mp_env == 'sandbox':
        email_pagador = ''
    elif is_localhost:
        email_pagador = f'loja{getattr(u, "id", 0)}@loja-interna.local'
    else:
        email_pagador = getattr(u, 'email', None) or 'loja@igreja.local'
    try:
        nome_pagador = (u.get_full_name() or u.get_username() or 'Loja') if u else 'Loja'
    except Exception:
        nome_pagador = getattr(u, 'username', 'Loja') if u else 'Loja'

    preference_data = {
        'items': items,
        'external_reference': cobranca_loja.codigo,
        'statement_descriptor': 'IGREJA',
        'payment_methods': {
            'excluded_payment_methods': [],
            'excluded_payment_types': [{'id': 'ticket'}],
            'installments': 12,
            'default_installments': 1,
        },
        'metadata': {
            'tipo': 'loja',
            'venda_id': venda.id,
            'cobranca_loja_id': cobranca_loja.id,
        },
    }
    if email_pagador:
        preference_data['payer'] = {
            'email': email_pagador,
            'name': nome_pagador[:200],
        }
    # Retorno automático só em domínio público https.
    # Em localhost o MP costuma rejeitar back_urls (400: back_url.success must be defined).
    site_base = request.build_absolute_uri('/').rstrip('/')
    is_local_site = 'localhost' in site_base or '127.0.0.1' in site_base
    is_https_site = site_base.startswith('https://')
    if (not is_local_site) and is_https_site:
        retorno_pagamento = f'{site_base}/admin/loja/pagamento/{cobranca_loja.id}?from_mp=1'
        preference_data['back_urls'] = {
            'success': retorno_pagamento,
            'pending': retorno_pagamento,
            'failure': retorno_pagamento,
        }
        preference_data['auto_return'] = 'approved'

    webhook_url = request.build_absolute_uri('/api/mercadopago/webhook/')
    if 'localhost' not in webhook_url and '127.0.0.1' not in webhook_url:
        preference_data['notification_url'] = webhook_url

    try:
        preference_response = sdk.preference().create(preference_data)
        preference = preference_response.get('response', {})
        if preference_response.get('status') not in [200, 201]:
            err_msg = preference.get('message', 'Erro ao criar link de pagamento')
            logger.error('Erro MP loja: %s', preference_response)
            return Response(
                {'error': err_msg, 'details': preference},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cobranca_loja.referencia_externa = str(preference.get('id', ''))
        cobranca_loja.metodo_pagamento = 'Mercado Pago (Checkout Pro)'
        cobranca_loja.save(update_fields=['referencia_externa', 'metodo_pagamento'])
        return Response(
            {
                'success': True,
                'preference_id': preference.get('id'),
                'init_point': preference.get('init_point'),
                'sandbox_init_point': preference.get('sandbox_init_point'),
                'is_sandbox': mp_env == 'sandbox',
                'valor': float(cobranca_loja.valor),
                'cobranca_loja': {
                    'id': cobranca_loja.id,
                    'codigo': cobranca_loja.codigo,
                },
            }
        )
    except Exception as e:
        logger.error('Erro ao criar preferência MP (loja): %s', e, exc_info=True)
        return Response(
            {'error': f'Erro ao processar pagamento: {e!s}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
