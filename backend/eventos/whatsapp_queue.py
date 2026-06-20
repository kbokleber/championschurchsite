"""Handlers de envio de WhatsApp para a fila assincrona."""

from __future__ import annotations

import logging
from typing import Any, Dict

from django.utils import timezone

from .evolution_go import enviar_texto_evolution_go
from .fila import registrar_handler
from .models import ConfiguracaoSite

logger = logging.getLogger(__name__)


TIPO_JOB_PARA_TIPO_MSG = {
    'whatsapp_inscricao_gratis': 'inscricao_gratis',
    'whatsapp_inscricao_paga_pendente': 'inscricao_paga_pendente',
    'whatsapp_inscricao_paga_confirmada': 'inscricao_paga_confirmada',
    'whatsapp_inscricao_isenta_admin': 'inscricao_isenta_admin',
    'whatsapp_reset_senha': 'reset_senha',
    # cobranca_confirmada reusa o mesmo template de inscricao_paga_confirmada
    # porque ambos sao "pagamento confirmado" — evita duplicar texto/variaveis.
    'whatsapp_cobranca_confirmada': 'inscricao_paga_confirmada',
    'whatsapp_recibo_loja': None,  # usa template proprio
    'whatsapp_lembrete_reserva_loja': None,
}


def _renderizar_mensagem_whatsapp(payload: Dict[str, Any]) -> tuple[str, str]:
    """Renderiza a mensagem final usando o helper do views.py."""
    from . import views as eventos_views

    tipo_job = payload.get('tipo_job_whatsapp')
    tipo_msg = TIPO_JOB_PARA_TIPO_MSG.get(tipo_job)
    config = ConfiguracaoSite.get_config()
    config.refresh_from_db()

    if tipo_msg:
        variaveis = payload.get('variaveis') or {}
        msg_payload = eventos_views._build_whatsapp_message_payload(config, tipo_msg, variaveis)
        return msg_payload.get('mensagem', ''), tipo_msg

    mensagem_direta = payload.get('mensagem_direta')
    if mensagem_direta:
        return str(mensagem_direta), 'direta'
    return '', 'vazio'


@registrar_handler('whatsapp_inscricao_gratis')
def _handler_whatsapp_inscricao_gratis(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _enviar_whatsapp(payload)


@registrar_handler('whatsapp_inscricao_paga_pendente')
def _handler_whatsapp_inscricao_paga_pendente(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _enviar_whatsapp(payload)


@registrar_handler('whatsapp_inscricao_paga_confirmada')
def _handler_whatsapp_inscricao_paga_confirmada(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _enviar_whatsapp(payload)


@registrar_handler('whatsapp_inscricao_isenta_admin')
def _handler_whatsapp_inscricao_isenta_admin(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _enviar_whatsapp(payload)


@registrar_handler('whatsapp_reset_senha')
def _handler_whatsapp_reset_senha(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _enviar_whatsapp(payload)


@registrar_handler('whatsapp_cobranca_confirmada')
def _handler_whatsapp_cobranca_confirmada(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _enviar_whatsapp(payload)


@registrar_handler('whatsapp_recibo_loja')
def _handler_whatsapp_recibo_loja(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _enviar_whatsapp(payload)


@registrar_handler('whatsapp_lembrete_reserva_loja')
def _handler_whatsapp_lembrete_reserva_loja(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _enviar_whatsapp(payload)


def _enviar_whatsapp(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Envia a mensagem via Evolution API e devolve o resultado."""
    telefone = payload.get('telefone') or ''
    payload['tipo_job_whatsapp'] = payload.get('tipo_job_whatsapp') or _tipo_para_job(payload)

    mensagem, tipo_msg = _renderizar_mensagem_whatsapp(payload)
    if not mensagem:
        return {'sucesso': False, 'motivo': 'mensagem_vazia'}

    config = ConfiguracaoSite.get_config()
    config.refresh_from_db()

    instancia_override = payload.get('instancia_override') or None
    api_key_override = payload.get('api_key_override') or None
    if api_key_override == '':
        api_key_override = None

    # Pré-validação: SEMPRE pega a config fresca e valida a instancia antes de
    # enviar. Se a instancia estiver errada/desconectada/config incompleta,
    # falha agora — o JobFila fica pendente e a fila faz retry quando o
    # admin corrigir a config.
    from .evolution_go import validar_instancia_evolution_go

    validacao = validar_instancia_evolution_go(
        config,
        instancia_override=instancia_override,
        api_key_override=api_key_override,
    )
    if not validacao.get('valido'):
        return {
            'sucesso': False,
            'motivo': f"pre_validacao_{validacao.get('motivo', 'falha')}",
            'http_status': validacao.get('http_status'),
            'erro': validacao.get('erro') or '',
            'url_usada': validacao.get('url_usada'),
            'tipo_msg': tipo_msg,
            'instance': validacao.get('instance'),
        }

    resultado = enviar_texto_evolution_go(
        config,
        telefone,
        mensagem,
        instancia_override=instancia_override,
        api_key_override=api_key_override,
        timeout=30,
    )

    entregue = bool(resultado.get('entregue'))
    return {
        'sucesso': entregue,
        'motivo': resultado.get('motivo'),
        'http_status': resultado.get('http_status'),
        'erro': resultado.get('erro') or '',
        'url_usada': resultado.get('url_usada'),
        'tipo_msg': tipo_msg,
    }


def _tipo_para_job(payload: Dict[str, Any]) -> str:
    """Mapeia o tipo do payload (whatsapp_recibo_loja etc.) para uso interno."""
    return payload.get('__tipo') or ''


# ---------------------------------------------------------------------------
# API publica: enfileiramento das mensagens WhatsApp
# ---------------------------------------------------------------------------

def enfileirar_mensagem(
    *,
    tipo_msg: str,
    telefone: str,
    variaveis: Dict[str, Any] | None = None,
    instancia_override: str | None = None,
    api_key_override: str | None = None,
    mensagem_direta: str | None = None,
    referencia_tipo: str = '',
    referencia_id: str | None = None,
    executar_em=None,
) -> int:
    """Helper de alto nivel para enfileirar uma mensagem WhatsApp."""
    from .fila import enfileirar
    from .models_fila import JobFila, WhatsappMensagem

    tipo_job = f'whatsapp_{tipo_msg}'
    payload = {
        'tipo_job_whatsapp': tipo_job,
        'telefone': telefone,
        'variaveis': variaveis or {},
        'instancia_override': instancia_override or '',
        'api_key_override': api_key_override or '',
        'mensagem_direta': mensagem_direta or '',
    }
    job_id = enfileirar(
        tipo_job,
        payload,
        referencia_tipo=referencia_tipo or 'whatsapp',
        referencia_id=str(referencia_id or ''),
        executar_em=executar_em,
    )

    mensagem_renderizada, _ = _renderizar_mensagem_whatsapp(
        {**payload, 'tipo_job_whatsapp': tipo_job}
    )

    WhatsappMensagem.objects.create(
        job_id=job_id,
        tipo=tipo_msg,
        telefone=telefone or '',
        mensagem_renderizada=mensagem_renderizada or '',
        instancia_override=instancia_override or '',
        api_key_override=api_key_override or '',
    )
    return job_id
