"""Export/import parcial de integrações do ConfiguracaoSite (MP, WhatsApp, webhooks)."""

from __future__ import annotations

import json
from typing import Any

from django.utils import timezone

from .backup_ops import backup_host_label
from .models import ConfiguracaoSite

INTEGRATION_FIELD_NAMES: tuple[str, ...] = (
    # Webhooks
    'webhook_inscricao',
    'webhook_ativo',
    'webhook_reset_senha',
    'webhook_eventos',
    # Mercado Pago
    'mp_ambiente',
    'mp_ativo',
    'mp_public_key_sandbox',
    'mp_access_token_sandbox',
    'mp_public_key_production',
    'mp_access_token_production',
    'mp_webhook_secret',
    'mp_loja_pix_email',
    'mp_loja_pix_cpf_cnpj',
    'mp_cartao_em_sandbox',
    'mp_pix_habilitado',
    'mp_cartao_habilitado',
    # WhatsApp Evolution API (evolution_global_api_key = GLOBAL_API_KEY do Evolution Go)
    'evolution_api_url',
    'evolution_api_key',
    'evolution_global_api_key',
    'evolution_api_instance',
    'evolution_api_instance_loja',
    'evolution_api_key_loja',
    'wa_msg_recibo_loja',
    'wa_msg_reserva_loja',
    'wa_msg_reset_senha',
    'wa_msg_inscricao_gratis',
    'wa_msg_inscricao_paga_pendente',
    'wa_msg_inscricao_paga_confirmada',
)

INTEGRATION_BOOLEAN_FIELDS: frozenset[str] = frozenset({
    'webhook_ativo',
    'mp_ativo',
    'mp_cartao_em_sandbox',
    'mp_pix_habilitado',
    'mp_cartao_habilitado',
})

ALLOWED_PAYLOAD_KEYS: frozenset[str] = frozenset({
    'version',
    'kind',
    'exported_at',
    'host',
    'fields',
})

CONFIG_SNAPSHOT_VERSION = 1
CONFIG_SNAPSHOT_KIND = 'integrations'


def _bool_value(val: Any) -> bool:
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    return str(val).strip().lower() in ('true', '1', 'yes', 'on')


def _serialize_field_value(field_name: str, value: Any) -> Any:
    if field_name in INTEGRATION_BOOLEAN_FIELDS:
        return bool(value)
    if value is None:
        return ''
    return value


def _coerce_field_value(field_name: str, value: Any) -> Any:
    if field_name in INTEGRATION_BOOLEAN_FIELDS:
        return _bool_value(value)
    if value is None:
        return '' if field_name not in ('webhook_reset_senha', 'webhook_eventos') else None
    return value


def exportar_config_integracoes(host_header: str) -> tuple[bytes, str]:
    config = ConfiguracaoSite.get_config()
    host_label = backup_host_label(host_header)
    timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
    filename = f'{host_label}_config_integracoes_{timestamp}.json'

    fields = {
        name: _serialize_field_value(name, getattr(config, name))
        for name in INTEGRATION_FIELD_NAMES
    }
    payload = {
        'version': CONFIG_SNAPSHOT_VERSION,
        'kind': CONFIG_SNAPSHOT_KIND,
        'exported_at': timezone.now().isoformat(),
        'host': host_header or host_label,
        'fields': fields,
    }
    content = json.dumps(payload, ensure_ascii=False, indent=2)
    return content.encode('utf-8'), filename


def importar_config_integracoes(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError('JSON inválido: esperado objeto na raiz.')

    unknown_top = set(payload.keys()) - ALLOWED_PAYLOAD_KEYS
    if unknown_top:
        raise ValueError(f'Campos desconhecidos no JSON: {", ".join(sorted(unknown_top))}.')

    version = payload.get('version')
    if version != CONFIG_SNAPSHOT_VERSION:
        raise ValueError(f'Versão não suportada: {version!r}. Esperado: {CONFIG_SNAPSHOT_VERSION}.')

    kind = payload.get('kind')
    if kind != CONFIG_SNAPSHOT_KIND:
        raise ValueError(f'Tipo de snapshot inválido: {kind!r}. Esperado: {CONFIG_SNAPSHOT_KIND!r}.')

    fields = payload.get('fields')
    if not isinstance(fields, dict):
        raise ValueError('Campo "fields" é obrigatório e deve ser um objeto.')

    unknown_fields = set(fields.keys()) - set(INTEGRATION_FIELD_NAMES)
    if unknown_fields:
        raise ValueError(f'Campos desconhecidos em "fields": {", ".join(sorted(unknown_fields))}.')

    config = ConfiguracaoSite.get_config()
    campos_aplicados: list[str] = []
    campos_ignorados: list[str] = []

    for name in INTEGRATION_FIELD_NAMES:
        if name not in fields:
            campos_ignorados.append(name)
            continue
        setattr(config, name, _coerce_field_value(name, fields[name]))
        campos_aplicados.append(name)

    if config.mp_ativo and not config.mp_pix_habilitado and not config.mp_cartao_habilitado:
        raise ValueError('Com o Mercado Pago ativo, habilite pelo menos PIX ou cartão.')

    config.save(update_fields=list(campos_aplicados) + ['atualizado_em'])

    return {
        'detail': f'Configurações de integração importadas ({len(campos_aplicados)} campos).',
        'campos_aplicados': campos_aplicados,
        'campos_ignorados': campos_ignorados,
        'host_origem': payload.get('host') or '',
        'exported_at': payload.get('exported_at') or '',
    }
