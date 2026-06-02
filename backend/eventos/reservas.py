"""Reserva de vagas para inscrições com pagamento pendente (TTL)."""

from __future__ import annotations

import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .cobranca_inscricao import MOTIVO_RESERVA_EXPIRADA, aplicar_cancelamento_inscricao
from .models import Cobranca, Inscricao

logger = logging.getLogger(__name__)

RESERVA_PAGAMENTO_MINUTOS_PADRAO = 30
RESERVA_PAGAMENTO_MINUTOS_MAX = 24 * 60


def get_reserva_pagamento_minutos() -> int:
    """Minutos de reserva configurados pelo admin (Configuração do site)."""
    from .models import ConfiguracaoSite

    try:
        config = ConfiguracaoSite.get_config()
        val = int(config.reserva_pagamento_minutos or RESERVA_PAGAMENTO_MINUTOS_PADRAO)
    except (TypeError, ValueError, AttributeError):
        val = RESERVA_PAGAMENTO_MINUTOS_PADRAO
    return max(1, min(val, RESERVA_PAGAMENTO_MINUTOS_MAX))


def reserva_expira_em_para_agora():
    return timezone.now() + timedelta(minutes=get_reserva_pagamento_minutos())


def _reserva_expirada(cobranca: Cobranca, agora=None) -> bool:
    agora = agora or timezone.now()
    expira = cobranca.reserva_expira_em
    if expira is None:
        # Legado: usa data_criacao + TTL vigente na configuração
        expira = cobranca.data_criacao + timedelta(minutes=get_reserva_pagamento_minutos())
    return agora >= expira


def cancelar_reserva_cobranca(cobranca: Cobranca) -> bool:
    """Cancela cobrança pendente e inscrições vinculadas (libera vagas)."""
    with transaction.atomic():
        c = Cobranca.objects.select_for_update().get(pk=cobranca.pk)
        if c.status != 'pendente':
            return False
        c.status = 'cancelado'
        c.save(update_fields=['status'])
        for item in c.itens.select_related('inscricao').all():
            ins = item.inscricao
            if ins.status == 'cancelada':
                continue
            aplicar_cancelamento_inscricao(ins, motivo=MOTIVO_RESERVA_EXPIRADA)
            ins.save(update_fields=['status', 'status_pagamento', 'motivo_cancelamento'])
        logger.info('Reserva expirada: cobrança %s cancelada', c.codigo)
        return True


def expirar_reservas_evento(evento) -> int:
    """Cancela cobranças pendentes vencidas do evento. Retorna quantidade expirada."""
    agora = timezone.now()
    expiradas = 0
    qs = Cobranca.objects.filter(evento=evento, status='pendente').only(
        'id', 'status', 'reserva_expira_em', 'data_criacao', 'codigo'
    )
    for cob in qs:
        if _reserva_expirada(cob, agora):
            if cancelar_reserva_cobranca(cob):
                expiradas += 1
    return expiradas


def expirar_reservas_cobranca(cobranca: Cobranca) -> bool:
    """Expira uma cobrança se vencida. Retorna True se foi cancelada."""
    if cobranca.status != 'pendente':
        return False
    if not _reserva_expirada(cobranca):
        return False
    return cancelar_reserva_cobranca(cobranca)


def inscricao_ocupa_vaga(inscricao: Inscricao, agora=None) -> bool:
    """Indica se a inscrição consome vaga do evento."""
    agora = agora or timezone.now()
    if inscricao.status == 'cancelada':
        return False
    if inscricao.status == 'confirmada':
        return True
    if inscricao.status == 'lista_espera':
        return False
    if inscricao.status != 'pendente' or inscricao.status_pagamento != 'pendente':
        return False
    item = inscricao.itens_cobranca.select_related('cobranca').first()
    if not item or not item.cobranca:
        return True
    cob = item.cobranca
    if cob.status != 'pendente':
        return False
    return not _reserva_expirada(cob, agora)


def contar_inscricoes_ocupando_vaga(evento) -> int:
    """Conta inscrições que ocupam vaga, expirando reservas vencidas antes."""
    if evento.vagas is None:
        return 0
    expirar_reservas_evento(evento)
    agora = timezone.now()
    total = 0
    qs = Inscricao.objects.filter(evento=evento).prefetch_related(
        'itens_cobranca__cobranca'
    )
    for ins in qs:
        if inscricao_ocupa_vaga(ins, agora):
            total += 1
    return total


def aplicar_reserva_expira_cobranca(cobranca: Cobranca, *, renovar=False) -> None:
    """Define ou renova o prazo de reserva na cobrança pendente."""
    if cobranca.status != 'pendente':
        return
    novo = reserva_expira_em_para_agora()
    if renovar or not cobranca.reserva_expira_em:
        cobranca.reserva_expira_em = novo
        cobranca.save(update_fields=['reserva_expira_em'])


def cobranca_reserva_valida(cobranca: Cobranca) -> bool:
    """Verifica se cobrança pendente ainda está dentro do prazo de reserva."""
    if cobranca.status != 'pendente':
        return cobranca.status == 'pago'
    expirar_reservas_cobranca(cobranca)
    cobranca.refresh_from_db()
    return cobranca.status == 'pendente'


def verificar_vagas_disponiveis(evento, quantidade: int) -> tuple[bool, int]:
    """Retorna (ok, vagas_disponiveis) após expirar reservas."""
    if evento.vagas is None:
        return True, 999999
    expirar_reservas_evento(evento)
    ocupadas = contar_inscricoes_ocupando_vaga(evento)
    disponiveis = max(0, evento.vagas - ocupadas)
    return quantidade <= disponiveis, disponiveis
