"""
Pagamentos Mercado Pago via API (checkout transparente).
PIX embutido: payment().create com payment_method_id=pix.
"""
import logging
import re
import uuid

import mercadopago

from .mercadopago_sdk import (
    get_mercadopago_sdk,
    get_mp_env_pix,
    is_mp_payment_id,
    mp_buscar_pagamento,
)
from .models import ConfiguracaoSite

logger = logging.getLogger(__name__)

VALOR_MINIMO_PIX = 0.01


def _normalizar_cpf(numero: str) -> str:
    return re.sub(r'\D', '', numero or '')


def extrair_dados_pix(payment: dict) -> dict:
    """Extrai QR e metadados de um payment PIX do MP."""
    poi = payment.get('point_of_interaction') or {}
    tx = poi.get('transaction_data') or {}
    return {
        'payment_id': payment.get('id'),
        'status': payment.get('status'),
        'qr_code': tx.get('qr_code') or '',
        'qr_code_base64': tx.get('qr_code_base64') or '',
        'ticket_url': tx.get('ticket_url') or '',
        'date_of_expiration': payment.get('date_of_expiration') or tx.get('expiration_date'),
    }


def resolver_pagador_loja(config=None, payer_input=None) -> dict:
    """
    Pagador para loja/cantina: cliente anônimo no balcão.
    Usa mp_loja_pix_* ou e-mail de contato + CPF/CNPJ da igreja (obrigatório no admin).
    """
    config = config or ConfiguracaoSite.get_config()
    payer_input = payer_input or {}
    email_req = (payer_input.get('email') or '').strip()
    id_req = payer_input.get('identification') or {}
    doc_req = _normalizar_cpf(id_req.get('number') or '')

    email = (
        email_req
        or (getattr(config, 'mp_loja_pix_email', None) or '').strip()
        or (config.email or '').strip()
    )
    doc = doc_req or _normalizar_cpf(getattr(config, 'mp_loja_pix_cpf_cnpj', None) or '')
    if not email:
        raise ValueError(
            'Configure o e-mail de contato da igreja ou "E-mail pagador PIX (loja)" em Configurações → Mercado Pago.'
        )
    if len(doc) not in (11, 14):
        raise ValueError(
            'Configure CPF ou CNPJ em Configurações → Mercado Pago → "CPF/CNPJ pagador PIX (loja)" '
            '(vendas sem identificar o comprador).'
        )
    id_type = 'CNPJ' if len(doc) == 14 else 'CPF'
    nome = (config.nome_igreja or 'Loja').strip()
    partes = nome.split(None, 1)
    return {
        'email': email,
        'first_name': partes[0][:255],
        'last_name': (partes[1] if len(partes) > 1 else partes[0])[:255],
        'identification': {'type': id_type, 'number': doc},
    }


def montar_payer_pix(payer_input: dict, *, email_fallback: str = '', nome_fallback: str = '') -> dict:
    """Monta payer para PIX MLB (email + CPF obrigatórios)."""
    email = (payer_input.get('email') or email_fallback or '').strip()
    identification = payer_input.get('identification') or {}
    id_type = identification.get('type') or 'CPF'
    id_number = _normalizar_cpf(identification.get('number') or '')
    if not email:
        raise ValueError('E-mail do pagador é obrigatório para PIX.')
    if len(id_number) < 11:
        raise ValueError('CPF do pagador é obrigatório para PIX (11 dígitos).')
    nome = (nome_fallback or 'Pagador').strip()
    partes = nome.split(None, 1)
    first_name = partes[0][:255]
    last_name = (partes[1] if len(partes) > 1 else partes[0])[:255]
    return {
        'email': email,
        'first_name': first_name,
        'last_name': last_name,
        'identification': {'type': id_type, 'number': id_number},
    }


def _criar_payment_pix_sdk(sdk, *, valor, codigo, descricao, payer_mp: dict):
    """Chama payment().create para PIX."""
    payment_data = {
        'transaction_amount': round(float(valor), 2),
        'payment_method_id': 'pix',
        'payer': payer_mp,
        'external_reference': codigo,
        'description': (descricao or 'Pagamento')[:200],
    }
    idempotency_key = str(uuid.uuid4())
    request_options = getattr(mercadopago, 'config', None) and getattr(
        mercadopago.config, 'RequestOptions', None
    )
    if request_options:
        opts = request_options()
        opts.custom_headers = {'x-idempotency-key': idempotency_key}
        return sdk.payment().create(payment_data, opts)
    return sdk.payment().create(payment_data)


def criar_ou_reutilizar_pix_embutido(
    *,
    codigo: str,
    valor: float,
    descricao: str,
    referencia_externa: str,
    payer_input: dict,
    email_fallback: str = '',
    nome_fallback: str = '',
    limpar_referencia_invalida: callable = None,
    payer_mp_override=None,
):
    """
    Cria pagamento PIX ou reutiliza pending existente.
    limpar_referencia_invalida: callback() quando referencia era preference id antiga.
    Retorna dict de resposta para API ou levanta ValueError com mensagem.
    """
    config = ConfiguracaoSite.get_config()
    if not config.mp_ativo:
        raise ValueError('Mercado Pago não está ativo nas configurações.')

    if round(float(valor), 2) < VALOR_MINIMO_PIX:
        raise ValueError(f'Valor mínimo para PIX é R$ {VALOR_MINIMO_PIX:.2f}.')

    mp_env = get_mp_env_pix(config, pagamento_embutido=True)
    sdk = get_mercadopago_sdk(mp_env)
    if not sdk:
        raise ValueError('Mercado Pago não configurado corretamente.')

    if payer_mp_override:
        payer_mp = payer_mp_override
    else:
        payer_mp = montar_payer_pix(
            payer_input, email_fallback=email_fallback, nome_fallback=nome_fallback
        )

    ref = (referencia_externa or '').strip()
    if ref and not is_mp_payment_id(ref):
        if limpar_referencia_invalida:
            limpar_referencia_invalida()
        ref = ''

    if ref and is_mp_payment_id(ref):
        payment, _env = mp_buscar_pagamento(ref, config)
        if payment:
            status = payment.get('status')
            if status in ('pending', 'in_process'):
                dados = extrair_dados_pix(payment)
                if dados.get('qr_code') or dados.get('qr_code_base64'):
                    return {
                        'success': True,
                        'reutilizado': True,
                        'is_sandbox': mp_env == 'sandbox',
                        'mp_env': mp_env,
                        'valor': float(valor),
                        **dados,
                    }
            if status == 'approved':
                return {
                    'success': True,
                    'already_approved': True,
                    'payment_id': payment.get('id'),
                    'status': 'approved',
                    'is_sandbox': mp_env == 'sandbox',
                    'mp_env': mp_env,
                }

    payment_response = _criar_payment_pix_sdk(
        sdk,
        valor=valor,
        codigo=codigo,
        descricao=descricao,
        payer_mp=payer_mp,
    )
    payment = payment_response.get('response', {}) if isinstance(payment_response, dict) else {}
    if payment_response.get('status') not in (200, 201):
        err = payment.get('message') or payment.get('cause') or payment_response
        logger.error('Erro PIX embutido MP: %s', payment_response)
        err_str = str(err).lower()
        if 'live credentials' in err_str or 'unauthorized' in err_str:
            raise ValueError(
                'PIX na página usa credenciais de Produção do Mercado Pago. '
                'Em Configurações → Mercado Pago, preencha a aba Produção (Access Token e Public Key). '
                'Cartão pode continuar em Sandbox para testes.'
            )
        raise ValueError(str(err))

    dados = extrair_dados_pix(payment)
    if not dados.get('qr_code') and not dados.get('qr_code_base64'):
        raise ValueError('Mercado Pago não retornou QR Code PIX.')

    return {
        'success': True,
        'reutilizado': False,
        'is_sandbox': mp_env == 'sandbox',
        'mp_env': mp_env,
        'valor': float(valor),
        **dados,
    }
