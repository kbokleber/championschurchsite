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

MP_STATEMENT_DESCRIPTOR = 'CHAMPIONSCHURCH'

VALOR_MINIMO_PIX = 0.01
MP_MAX_CHARS = 256


def _formatar_data_evento_mp(evento) -> str:
    if evento and evento.data_inicio:
        from django.utils import timezone
        return timezone.localtime(evento.data_inicio).strftime('%d/%m/%Y %H:%M')
    return ''


def _participantes_cobranca(cobranca) -> list[str]:
    nomes = []
    for item in cobranca.itens.select_related('inscricao__membro', 'inscricao__categoria').all():
        inscricao = item.inscricao
        if not inscricao:
            continue
        membro_nome = (getattr(inscricao.membro, 'nome', None) or '').strip()
        if not membro_nome:
            continue
        categoria = (getattr(inscricao.categoria, 'nome', None) or '').strip()
        if item.descricao:
            label = item.descricao.strip()
        elif categoria:
            label = f'{membro_nome} — {categoria}'
        else:
            label = membro_nome
        if label not in nomes:
            nomes.append(label)
    if not nomes:
        fallback = (getattr(cobranca.membro, 'nome', None) or 'Participante').strip()
        nomes = [fallback]
    return nomes


def montar_identificacao_cobranca_evento(cobranca) -> dict:
    """
    Monta título, detalhe e itens para identificar a cobrança no painel Mercado Pago:
    nome do evento, data e participantes.
    """
    evento = cobranca.evento
    titulo_evento = (getattr(evento, 'titulo', None) or 'Evento').strip()
    data_evento = _formatar_data_evento_mp(evento)
    participantes = _participantes_cobranca(cobranca)
    participantes_txt = ', '.join(participantes)

    titulo_mp = f'Evento: {titulo_evento}'
    if data_evento:
        titulo_mp += f' — {data_evento}'

    detalhe_mp = f'Participantes: {participantes_txt}' if participantes_txt else ''

    descricao_completa = titulo_evento
    if data_evento:
        descricao_completa += f' ({data_evento})'
    if participantes_txt:
        descricao_completa += f' — {participantes_txt}'
    if len(descricao_completa) > MP_MAX_CHARS:
        descricao_completa = descricao_completa[: MP_MAX_CHARS - 3] + '...'

    items = [
        {
            'nome': titulo_mp[:256],
            'descricao': (detalhe_mp or descricao_completa)[:256],
            'quantidade': 1,
            'preco_unitario': float(cobranca.valor),
            'categoria': 'event',
            'id': str(cobranca.codigo).replace('-', '')[:40],
        }
    ]

    description_order = titulo_mp
    if detalhe_mp:
        description_order = f'{titulo_mp} | {detalhe_mp}'
    if len(description_order) > 255:
        description_order = description_order[:252] + '...'

    return {
        'titulo_mp': titulo_mp[:200],
        'detalhe_mp': (detalhe_mp or participantes_txt)[:256],
        'origem_mp': 'evento',
        'items': items,
        'description_order': description_order,
    }


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


def resolver_pagador_pix_config(
    config=None,
    payer_input=None,
    *,
    email_fallback: str = '',
    nome_fallback: str = '',
) -> dict:
    """
    Pagador PIX via configuração da igreja (mp_loja_pix_*).
    Loja: só config. Eventos: e-mail da inscrição (email_fallback) + CPF/CNPJ do admin.
    payer_input opcional sobrescreve e-mail/documento.
    """
    config = config or ConfiguracaoSite.get_config()
    payer_input = payer_input or {}
    email_req = (payer_input.get('email') or '').strip()
    id_req = payer_input.get('identification') or {}
    doc_req = _normalizar_cpf(id_req.get('number') or '')

    email = (
        email_req
        or (email_fallback or '').strip()
        or (getattr(config, 'mp_loja_pix_email', None) or '').strip()
        or (config.email or '').strip()
    )
    doc = doc_req or _normalizar_cpf(getattr(config, 'mp_loja_pix_cpf_cnpj', None) or '')
    if not email:
        raise ValueError(
            'Configure o e-mail de contato da igreja, o e-mail da inscrição ou '
            '"E-mail pagador PIX (loja)" em Configurações → Mercado Pago.'
        )
    if len(doc) not in (11, 14):
        raise ValueError(
            'Configure CPF ou CNPJ em Configurações → Mercado Pago → "CPF/CNPJ pagador PIX (loja)".'
        )
    id_type = 'CNPJ' if len(doc) == 14 else 'CPF'
    nome = (nome_fallback or config.nome_igreja or 'Pagador').strip()
    partes = nome.split(None, 1)
    return {
        'email': email,
        'first_name': partes[0][:255],
        'last_name': (partes[1] if len(partes) > 1 else partes[0])[:255],
        'identification': {'type': id_type, 'number': doc},
    }


def resolver_pagador_loja(config=None, payer_input=None) -> dict:
    """Alias: loja/cantina sem comprador identificado."""
    return resolver_pagador_pix_config(config, payer_input)


def resolver_pagador_cartao_loja(config=None, payer_input=None) -> dict:
    """
    Cartão na loja: o token do Brick foi gerado com os dados do formulário MP.
    Se o Brick enviou e-mail + documento, usa esses dados; senão, config da igreja (PIX).
    """
    config = config or ConfiguracaoSite.get_config()
    payer_input = payer_input or {}
    email_req = (payer_input.get('email') or '').strip()
    id_req = payer_input.get('identification') or {}
    doc_req = _normalizar_cpf(id_req.get('number') or '')
    if email_req and len(doc_req) in (11, 14):
        id_type = id_req.get('type') or ('CNPJ' if len(doc_req) == 14 else 'CPF')
        nome_completo = (payer_input.get('cardholder_name') or '').strip()
        if not nome_completo:
            fn = (payer_input.get('first_name') or '').strip()
            ln = (payer_input.get('last_name') or '').strip()
            nome_completo = f'{fn} {ln}'.strip()
        if not nome_completo:
            nome_completo = (payer_input.get('name') or 'Pagador').strip()
        nome = nome_completo or 'Pagador'
        partes = nome.split(None, 1)
        return {
            'email': email_req,
            'first_name': partes[0][:255],
            'last_name': (partes[1] if len(partes) > 1 else partes[0])[:255],
            'identification': {'type': id_type, 'number': doc_req},
        }
    return resolver_pagador_loja(config, payer_input)


def montar_payer_payment_cartao(pagador: dict) -> dict:
    """Monta objeto payer para payment().create (cartão)."""
    ident = pagador.get('identification') or {}
    doc = _normalizar_cpf(ident.get('number') or '')
    id_type = ident.get('type') or ('CNPJ' if len(doc) == 14 else 'CPF')
    if not (pagador.get('email') or '').strip():
        raise ValueError('E-mail do pagador é obrigatório para cartão.')
    if len(doc) not in (11, 14):
        raise ValueError('CPF ou CNPJ do pagador é obrigatório para cartão.')
    out = {
        'email': (pagador.get('email') or '').strip(),
        'identification': {'type': id_type, 'number': doc},
    }
    fn = (pagador.get('first_name') or '').strip()
    ln = (pagador.get('last_name') or '').strip()
    if not fn and not ln:
        holder = (pagador.get('cardholder_name') or '').strip()
        if holder:
            partes = holder.split(None, 1)
            fn = partes[0]
            ln = partes[1] if len(partes) > 1 else partes[0]
    fn = fn or 'Pagador'
    ln = ln or fn
    out['first_name'] = fn[:255]
    out['last_name'] = ln[:255]
    return out


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


def aplicar_identificacao_mp(
    payment_data: dict,
    *,
    valor,
    codigo: str,
    titulo: str,
    detalhe: str = '',
    origem: str = '',
    items: list | None = None,
) -> dict:
    """
    Preenche description, additional_info.items e metadata para o painel MP
    identificar loja vs evento (ex.: "Cantina", "Loja" ou "Evento: Culto Domingo").

    items: lista opcional de dicts com {nome, quantidade, preco_unitario, descricao, categoria}
    para descrever os produtos no painel MP. Quando ausente, usa o título/detalhe.
    """
    titulo = (titulo or 'Pagamento').strip()
    detalhe = (detalhe or '').strip()
    linha = titulo if not detalhe else f'{titulo} — {detalhe}'
    if items:
        partes = [f"{(i.get('nome') or 'Item').strip()} x{int(i.get('quantidade') or 1)}" for i in items]
        resumo = ', '.join(partes)
        if resumo:
            linha = f'{titulo} — {resumo}' if titulo else resumo
    payment_data['description'] = linha[:200]
    payment_data['statement_descriptor'] = MP_STATEMENT_DESCRIPTOR
    payment_data['external_reference'] = (payment_data.get('external_reference') or codigo or '')[:256]
    payment_data['metadata'] = {
        'origem': (origem or 'championschurch')[:30],
        'codigo': str(codigo)[:60],
        'titulo': titulo[:100],
    }

    if items:
        mp_items = []
        for i, raw in enumerate(items):
            nome = (raw.get('nome') or 'Item').strip()[:256]
            mp_items.append(
                {
                    'id': str(raw.get('id') or f"{codigo}-{i+1}")[:40],
                    'title': nome,
                    'description': (raw.get('descricao') or nome)[:256],
                    'category_id': (raw.get('categoria') or origem or 'others')[:64],
                    'quantity': int(raw.get('quantidade') or 1),
                    'unit_price': round(float(raw.get('preco_unitario') or 0), 2),
                }
            )
    else:
        mp_items = [
            {
                'id': str(codigo).replace('-', '')[:40] or 'champions',
                'title': titulo[:256],
                'description': (detalhe or linha)[:256],
                'quantity': 1,
                'unit_price': round(float(valor), 2),
            }
        ]
    payment_data['additional_info'] = {'items': mp_items}
    return payment_data


def _criar_payment_pix_sdk(
    sdk,
    *,
    valor,
    codigo,
    payer_mp: dict,
    titulo_mp: str = '',
    detalhe_mp: str = '',
    origem_mp: str = '',
    descricao: str = '',
    items: list | None = None,
):
    """Chama payment().create para PIX."""
    titulo = (titulo_mp or descricao or 'Pagamento').strip()
    payment_data = {
        'transaction_amount': round(float(valor), 2),
        'payment_method_id': 'pix',
        'payer': payer_mp,
    }
    aplicar_identificacao_mp(
        payment_data,
        valor=valor,
        codigo=codigo,
        titulo=titulo,
        detalhe=detalhe_mp,
        origem=origem_mp,
        items=items,
    )
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
    descricao: str = '',
    titulo_mp: str = '',
    detalhe_mp: str = '',
    origem_mp: str = '',
    referencia_externa: str,
    payer_input: dict,
    email_fallback: str = '',
    nome_fallback: str = '',
    limpar_referencia_invalida: callable = None,
    payer_mp_override=None,
    items: list | None = None,
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
        titulo_mp=titulo_mp or descricao,
        detalhe_mp=detalhe_mp,
        origem_mp=origem_mp,
        payer_mp=payer_mp,
        items=items,
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
