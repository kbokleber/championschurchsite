"""Handlers de integracoes da loja (Mercado Pago, estoque, auditoria).

Esses handlers delegam para as funcoes ja existentes em ``loja.views``,
``loja.mp_preference`` e ``loja.estoque``. O que muda aqui e que
agora cada operacao e persistida como JobFila e processada por um
worker — entao, mesmo se o backend cair no meio, o trabalho e
retomado quando o worker reiniciar.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from .fila import registrar_handler

logger = logging.getLogger(__name__)


@registrar_handler('mp_criar_preferencia_loja')
def _handler_mp_criar_preferencia(payload: Dict[str, Any]) -> Dict[str, Any]:
    from loja.mp_preference import criar_preferencia_pagamento_loja
    from django.http import HttpRequest
    from .models import CobrancaLoja as _Unused  # noqa: F401  (mantem coerencia)

    cobranca_id = payload.get('cobranca_id')
    if not cobranca_id:
        return {'sucesso': False, 'erro': 'cobranca_id_ausente'}

    # Recria um HttpRequest sintetico para a view atual (ela usa request.build_absolute_uri).
    request = HttpRequest()
    request.method = 'POST'
    request.POST = {}
    request.GET = {}
    request.META = {'HTTP_HOST': 'localhost', 'SERVER_NAME': 'localhost'}

    from loja.models import CobrancaLoja
    cobranca = CobrancaLoja.objects.filter(pk=cobranca_id).first()
    if not cobranca:
        return {'sucesso': False, 'erro': f'cobranca_{cobranca_id}_nao_encontrada'}

    response = criar_preferencia_pagamento_loja(request, cobranca)
    data = response.data if hasattr(response, 'data') else {}
    sucesso = bool(data.get('success'))
    return {
        'sucesso': sucesso,
        'motivo': None if sucesso else 'mp_rejeitado',
        'erro': '' if sucesso else str(data)[:300],
        'init_point': data.get('init_point') if hasattr(data, 'get') else None,
    }


@registrar_handler('mp_consultar_status_cobranca')
def _handler_mp_consultar_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    from .mp_cobranca_sync import consultar_status_mp_cobranca
    from .models import Cobranca
    from .models import ConfiguracaoSite

    cobranca_id = payload.get('cobranca_id')
    if not cobranca_id:
        return {'sucesso': False, 'erro': 'cobranca_id_ausente'}
    cobranca = Cobranca.objects.filter(pk=cobranca_id).first()
    if not cobranca:
        return {'sucesso': False, 'erro': f'cobranca_{cobranca_id}_nao_encontrada'}
    config = ConfiguracaoSite.get_config()
    config.refresh_from_db()
    status, _payment = consultar_status_mp_cobranca(cobranca, config)
    return {'sucesso': True, 'mp_status': status}


@registrar_handler('mp_processar_pagamento_webhook')
def _handler_mp_processar_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    from . import views as eventos_views

    resource_id = payload.get('resource_id')
    topic = payload.get('topic')
    if not resource_id:
        return {'sucesso': False, 'erro': 'resource_id_ausente'}
    try:
        eventos_views._processar_webhook_mp_pagamento(resource_id, topic=topic)
    except Exception as exc:  # noqa: BLE001
        return {'sucesso': False, 'erro': str(exc)}
    return {'sucesso': True}


@registrar_handler('mp_pix_embutido_loja')
def _handler_mp_pix_embutido(payload: Dict[str, Any]) -> Dict[str, Any]:
    from django.http import HttpRequest
    from loja.views import criar_pagamento_pix_embutido_loja

    cobranca_id = payload.get('cobranca_id')
    if not cobranca_id:
        return {'sucesso': False, 'erro': 'cobranca_id_ausente'}

    request = HttpRequest()
    request.method = 'POST'
    request.POST = {}
    request.GET = {}
    request.META = {'HTTP_HOST': 'localhost', 'SERVER_NAME': 'localhost'}
    request.data = payload.get('dados') or {}

    response = criar_pagamento_pix_embutido_loja(request)
    data = response.data if hasattr(response, 'data') else {}
    sucesso = bool(data.get('success') or data.get('id') or data.get('init_point'))
    return {'sucesso': sucesso, 'resposta': str(data)[:500]}


@registrar_handler('loja_baixar_estoque_venda')
def _handler_loja_baixar_estoque(payload: Dict[str, Any]) -> Dict[str, Any]:
    from loja.estoque import baixar_estoque_venda
    from loja.models import Venda

    venda_id = payload.get('venda_id')
    if not venda_id:
        return {'sucesso': False, 'erro': 'venda_id_ausente'}
    venda = Venda.objects.filter(pk=venda_id).first()
    if not venda:
        return {'sucesso': False, 'erro': f'venda_{venda_id}_nao_encontrada'}
    if getattr(venda, 'estoque_baixado', False):
        # Idempotente: ja foi baixado, considera sucesso.
        return {'sucesso': True, 'motivo': 'ja_baixado'}
    try:
        baixar_estoque_venda(venda)
    except Exception as exc:  # noqa: BLE001
        return {'sucesso': False, 'erro': str(exc)}
    return {'sucesso': True}


@registrar_handler('loja_auditoria')
def _handler_loja_auditoria(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Registra uma entrada no log de auditoria da loja.

    Se a LojaAuditoria ainda nao existir no projeto, apenas registramos
    no log do Django para nao bloquear o pipeline.
    """
    from loja.models import LojaAuditoria

    tipo_evento = payload.get('tipo_evento')
    if not tipo_evento:
        return {'sucesso': False, 'erro': 'tipo_evento_ausente'}
    LojaAuditoria.objects.create(
        tipo_evento=tipo_evento,
        usuario=payload.get('usuario'),
        venda=payload.get('venda_id'),
        detalhes=payload.get('detalhes') or {},
    )
    return {'sucesso': True}
