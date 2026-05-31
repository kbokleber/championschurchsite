"""Helpers de acesso público a cobranças de eventos (por UUID)."""

import uuid as uuid_mod

from rest_framework.exceptions import NotFound, ValidationError

from .models import Cobranca


def normalizar_codigo_cobranca(codigo):
    codigo = (codigo or '').strip()
    if not codigo:
        raise ValidationError({'codigo': 'Código da cobrança é obrigatório.'})
    try:
        uuid_mod.UUID(str(codigo))
    except (ValueError, TypeError):
        raise ValidationError({'codigo': 'Código da cobrança inválido.'})
    return str(codigo)


def queryset_cobranca_evento():
    return Cobranca.objects.select_related('membro', 'evento').prefetch_related(
        'itens__inscricao__membro',
        'itens__inscricao__categoria',
    )


def obter_cobranca_evento_por_codigo(codigo, *, status_permitidos=None):
    codigo = normalizar_codigo_cobranca(codigo)
    try:
        cobranca = queryset_cobranca_evento().get(codigo=codigo)
    except Cobranca.DoesNotExist:
        raise NotFound('Cobrança não encontrada.')
    if status_permitidos is not None and cobranca.status not in status_permitidos:
        raise NotFound('Cobrança não encontrada.')
    return cobranca


def obter_cobranca_evento_pagamento(request):
    """Exige ``codigo`` (UUID). ``cobranca_id`` opcional deve coincidir se enviado."""
    codigo = (
        request.data.get('codigo')
        or request.query_params.get('codigo')
        or ''
    ).strip()
    if not codigo:
        raise ValidationError({'codigo': 'Código da cobrança é obrigatório para pagamento.'})
    cobranca = obter_cobranca_evento_por_codigo(codigo)
    cobranca_id = request.data.get('cobranca_id')
    if cobranca_id is not None and str(cobranca.id) != str(cobranca_id):
        raise ValidationError({'codigo': 'Cobrança inválida.'})
    return cobranca
