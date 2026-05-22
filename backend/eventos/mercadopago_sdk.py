"""Instância do SDK Mercado Pago e helpers de ambiente (ConfiguracaoSite)."""
import logging
import uuid

import mercadopago
import requests

from .models import ConfiguracaoSite

logger = logging.getLogger(__name__)


def get_mp_env_pix(config=None, *, pagamento_embutido=False):
    """
    Ambiente para PIX.
    pagamento_embutido=True: payment().create (QR na página). O MP exige credenciais de
    produção — token sandbox (test_user) retorna 401 'Unauthorized use of live credentials'.
    Checkout Pro (preferência): segue mp_ambiente / mp_cartao_em_sandbox.
    """
    config = config or ConfiguracaoSite.get_config()
    if pagamento_embutido:
        if config.get_mp_access_token_for('production'):
            return 'production'
        if (config.mp_ambiente or 'sandbox') == 'sandbox':
            raise ValueError(
                'PIX na página exige credenciais de Produção do Mercado Pago. '
                'Configure Public Key e Access Token na aba Produção em Configurações → Mercado Pago.'
            )
    if getattr(config, 'mp_cartao_em_sandbox', False):
        return 'production'
    return config.mp_ambiente or 'sandbox'


def get_mp_env_card(config=None):
    """Ambiente para cartão transparente (Brick + payment().create)."""
    config = config or ConfiguracaoSite.get_config()
    if getattr(config, 'mp_cartao_em_sandbox', False):
        return 'sandbox'
    return config.mp_ambiente or 'sandbox'


def get_mercadopago_sdk(ambiente=None):
    """
    Retorna uma instância do SDK do Mercado Pago.
    ambiente: None = usa config.mp_ambiente; 'production' ou 'sandbox' = força o ambiente.
    """
    config = ConfiguracaoSite.get_config()
    if not config.mp_ativo:
        return None
    env = ambiente if ambiente in ('sandbox', 'production') else config.mp_ambiente
    access_token = config.get_mp_access_token_for(env)
    if not access_token:
        return None
    return mercadopago.SDK(access_token)


def is_mp_payment_id(referencia_externa: str) -> bool:
    """Payment id numérico vs preference id (contém hífen/uuid)."""
    ref = (referencia_externa or '').strip()
    return bool(ref) and ref.isdigit()


def mp_buscar_pagamento(payment_id, config=None):
    """
    Busca pagamento no MP tentando ambiente PIX e cartão (split sandbox/produção).
    Retorna (payment_dict, env_usado) ou (None, None).
    """
    config = config or ConfiguracaoSite.get_config()
    for env in (get_mp_env_pix(config), get_mp_env_card(config)):
        sdk = get_mercadopago_sdk(env)
        if not sdk:
            continue
        try:
            resp = sdk.payment().get(payment_id)
            if resp.get('status') == 200:
                return resp.get('response', {}), env
        except Exception as exc:
            logger.debug('mp_buscar_pagamento %s env=%s: %s', payment_id, env, exc)
    return None, None


# Mensagens amigáveis para status_detail do Payments API (cartão)
_MP_STATUS_DETAIL_PT = {
    'cc_rejected_bad_filled_card_number': 'Número do cartão inválido. Confira e tente de novo.',
    'cc_rejected_bad_filled_date': 'Data de vencimento inválida.',
    'cc_rejected_bad_filled_other': 'Revise os dados do cartão.',
    'cc_rejected_bad_filled_security_code': 'Código de segurança inválido.',
    'cc_rejected_blacklist': 'Cartão não permitido para este pagamento.',
    'cc_rejected_call_for_authorize': 'É necessário autorizar o pagamento com o banco.',
    'cc_rejected_card_disabled': 'Cartão desativado. Use outro cartão.',
    'cc_rejected_duplicated_payment': 'Pagamento duplicado. Verifique se já foi cobrado.',
    'cc_rejected_high_risk': (
        'Pagamento recusado pelo antifraude do Mercado Pago (alto risco). '
        'Tente outro cartão ou PIX. Em testes com cartão de teste, use titular APRO e CPF 12345678909.'
    ),
    'cc_rejected_insufficient_amount': 'Saldo ou limite insuficiente.',
    'cc_rejected_invalid_installments': 'Parcelamento não disponível para este cartão.',
    'cc_rejected_max_attempts': 'Limite de tentativas atingido. Aguarde e tente mais tarde.',
    'cc_rejected_other': 'Cartão recusado. Verifique os dados ou use outro cartão.',
}


def mp_probe_pagamento_cartao(access_token: str) -> dict:
    """
    Verifica se o Access Token consegue criar pagamento com cartão de teste (API).
    O teste em /users/me não detecta token de conta de teste vs credencial da aplicação.
    """
    token = (access_token or '').strip()
    if not token:
        return {
            'ok': False,
            'motivo': 'configuracao_incompleta',
            'detalhe': 'Access Token ausente.',
            'http_status': None,
        }
    card_body = {
        'card_number': '5031433215406351',
        'expiration_month': 11,
        'expiration_year': 2030,
        'security_code': '123',
        'cardholder': {
            'name': 'APRO',
            'identification': {'type': 'CPF', 'number': '12345678909'},
        },
    }
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'User-Agent': 'ChampionsChurch-MercadoPago/1.0',
    }
    try:
        tok_resp = requests.post(
            'https://api.mercadopago.com/v1/card_tokens',
            json=card_body,
            headers=headers,
            timeout=25,
        )
        if tok_resp.status_code not in (200, 201):
            return {
                'ok': False,
                'motivo': 'cartao_token_falhou',
                'detalhe': (tok_resp.text or '')[:400],
                'http_status': tok_resp.status_code,
            }
        card_token = tok_resp.json().get('id')
        if not card_token:
            return {
                'ok': False,
                'motivo': 'cartao_token_falhou',
                'detalhe': 'Resposta do MP sem id de card_token.',
                'http_status': tok_resp.status_code,
            }
        pay_body = {
            'transaction_amount': 1.0,
            'token': card_token,
            'installments': 1,
            'payment_method_id': 'master',
            'payer': {
                'email': 'test@example.com',
                'identification': {'type': 'CPF', 'number': '12345678909'},
            },
        }
        pay_headers = {**headers, 'X-Idempotency-Key': str(uuid.uuid4())}
        pay_resp = requests.post(
            'https://api.mercadopago.com/v1/payments',
            json=pay_body,
            headers=pay_headers,
            timeout=30,
        )
        if pay_resp.status_code in (200, 201):
            return {
                'ok': True,
                'motivo': 'cartao_api_ok',
                'detalhe': 'Pagamento de teste aceito pela API (cartão).',
                'http_status': pay_resp.status_code,
            }
        body = pay_resp.json() if pay_resp.content else {}
        raw = (body.get('message') or body.get('error') or pay_resp.text or '').lower()
        if pay_resp.status_code == 401 or 'live credentials' in raw:
            return {
                'ok': False,
                'motivo': 'token_nao_serve_cartao',
                'detalhe': (
                    'O Access Token autentica em /users/me, mas a API de pagamentos com cartão '
                    'recusa (401 — credenciais de produção/conta de teste). '
                    'Use Public Key e Access Token juntos em Suas integrações → sua aplicação → '
                    'Credenciais de teste. Não use o token da seção Contas de teste.'
                ),
                'http_status': pay_resp.status_code,
            }
        return {
            'ok': False,
            'motivo': 'cartao_api_erro',
            'detalhe': (pay_resp.text or '')[:400],
            'http_status': pay_resp.status_code,
        }
    except Exception as exc:
        logger.warning('mp_probe_pagamento_cartao: %s', exc)
        return {
            'ok': False,
            'motivo': 'requisicao_erro',
            'detalhe': str(exc),
            'http_status': None,
        }


def interpretar_resposta_payment_create(payment_response):
    """
    SDK MP: { status: HTTP, response: body }.
    Retorna (payment_dict, http_status, erro_curto ou None).
    """
    if not isinstance(payment_response, dict):
        return {}, 500, 'Resposta inválida do Mercado Pago'
    http_status = payment_response.get('status')
    payment = payment_response.get('response')
    if payment is None:
        payment = {}
    if not isinstance(payment, dict):
        payment = {'message': str(payment)}
    if http_status in (200, 201):
        return payment, http_status, None
    err = payment.get('message') or payment.get('error') or payment.get('cause')
    return payment, http_status, str(err) if err else None


def mensagem_erro_payment_http(http_status, payment: dict, *, env: str) -> str:
    """Mensagem quando payment().create não retorna 200/201."""
    payment = payment or {}
    raw = (payment.get('message') or payment.get('error') or '').lower()
    env_label = 'Sandbox (teste)' if env == 'sandbox' else 'Produção'
    if http_status == 401 or 'unauthorized' in raw or 'live credentials' in raw:
        return (
            f'Credenciais Mercado Pago incompatíveis (erro {http_status}). '
            f'O Brick e o servidor precisam usar o mesmo par Public Key + Access Token '
            f'de {env_label}, copiados juntos em Suas integrações → sua aplicação → '
            f'{"Credenciais de teste" if env == "sandbox" else "Credenciais de produção"}. '
            'Não use o Access Token da seção Contas de teste (conta TESTUSER…). '
            'Em Configurações, clique em Testar conexão após corrigir.'
        )
    if http_status == 403:
        return 'Acesso negado pelo Mercado Pago (403). Verifique se o token tem permissão para criar pagamentos.'
    detail = payment.get('message') or payment.get('error') or f'Erro HTTP {http_status}'
    return f'Mercado Pago recusou a operação: {detail}'


def mensagem_resposta_cartao_mp(payment: dict, *, sandbox: bool = False) -> dict:
    """
    Texto e flags para resposta de pagar_cartao.
    payment: dict response do MP (status, status_detail, ...).
    """
    status_mp = payment.get('status') or ''
    detail = payment.get('status_detail') or ''
    # Evita confundir código HTTP (ex.: 401) com status do pagamento
    if isinstance(status_mp, int) or (isinstance(status_mp, str) and status_mp.isdigit()):
        return {
            'message': 'Resposta inválida do Mercado Pago. Tente novamente ou contate o suporte.',
            'success': False,
            'user_error': True,
        }
    if status_mp == 'approved':
        return {
            'message': 'Pagamento aprovado!',
            'success': True,
            'user_error': False,
        }
    if status_mp in ('pending', 'in_process'):
        return {
            'message': 'Pagamento em análise. Aguarde a confirmação (pode levar alguns minutos).',
            'success': True,
            'user_error': False,
        }
    base = _MP_STATUS_DETAIL_PT.get(detail) or (
        f'Pagamento não aprovado ({detail or status_mp or "recusado"}).'
    )
    if sandbox:
        base += (
            ' No sandbox, o nome do titular no cartão deve ser exatamente APRO '
            '(não use nome real). CPF de teste: 12345678909.'
        )
    return {
        'message': base,
        'success': False,
        'user_error': True,
    }


def mp_search_payments_by_reference(codigo: str, config=None):
    """Lista pagamentos por external_reference (produção primeiro — PIX embutido)."""
    config = config or ConfiguracaoSite.get_config()
    results = []
    for env in ('production', 'sandbox'):
        token = config.get_mp_access_token_for(env)
        if not token:
            continue
        try:
            r = requests.get(
                'https://api.mercadopago.com/v1/payments/search',
                params={'external_reference': codigo},
                headers={
                    'Authorization': f'Bearer {token}',
                    'User-Agent': 'ChampionsChurch-MercadoPago/1.0',
                },
                timeout=30,
            )
            if r.status_code == 200:
                results = r.json().get('results', [])
                if results:
                    return results
        except Exception as exc:
            logger.warning('mp_search_payments_by_reference %s: %s', env, exc)
    return results
