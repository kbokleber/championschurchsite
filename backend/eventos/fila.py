"""Servico generico de fila assincrona (Redis + RQ).

Substitui o uso direto de ``threading.Thread(daemon=True)`` em pontos
criticos (envio de WhatsApp, processamento de webhooks do Mercado Pago,
baixa de estoque, auditoria). Cada trabalho vira um registro ``JobFila``
persistido em banco e enfileirado no RQ; o worker processa e atualiza
o status. Se o processo cair no meio, o worker recupera o job na proxima
inicializacao.
"""

from __future__ import annotations

import logging
import os
from datetime import timedelta
from typing import Any, Callable, Dict, Optional

import redis
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rq import Queue

logger = logging.getLogger(__name__)


def _ensure_handlers_loaded() -> None:
    """Garante que todos os modulos de handlers estao importados.

    Importa dinamicamente os modulos de handlers para que os decoradores
    ``@registrar_handler`` sejam executados e populam ``HANDLERS``.
    """
    if HANDLERS:
        return
    from importlib import import_module
    for name in ('whatsapp_queue', 'loja_queue'):
        try:
            import_module(f'eventos.{name}')
        except Exception:  # noqa: BLE001
            logger.exception('Falha ao importar handler %s', name)


# Filas nomeadas (workers Docker consomem cada uma separadamente).
FILA_CRITICA = 'critica'
FILA_WHATSAPP = 'whatsapp'
FILA_BAIXA = 'baixa'

FILAS_VALIDAS = (FILA_CRITICA, FILA_WHATSAPP, FILA_BAIXA)

# Backoff exponencial (segundos) por numero de tentativa (1..max).
# Cobre ~3 dias: 30s, 2m, 10m, 30m, 1h, 2h, 6h, 12h, 24h, 48h.
BACKOFF_SEGUNDOS = (30, 120, 600, 1800, 3600, 7200, 21600, 43200, 86400, 172800)

DEFAULT_MAX_TENTATIVAS = 10

# Registry de handlers por tipo de job.
HANDLERS: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {}


def registrar_handler(tipo: str):
    """Decorator para registrar um handler de um tipo de job."""

    def decorator(func):
        HANDLERS[tipo] = func
        func.TIPO_JOB = tipo
        return func

    return decorator


def _redis_url() -> str:
    return (
        os.environ.get('REDIS_URL')
        or getattr(settings, 'REDIS_URL', None)
        or 'redis://localhost:6379/0'
    )


def get_redis() -> redis.Redis:
    """Conexao Redis compartilhada."""
    return redis.from_url(_redis_url())


def get_queue(fila: str = FILA_BAIXA) -> Queue:
    """Retorna a fila RQ pelo nome."""
    if fila not in FILAS_VALIDAS:
        fila = FILA_BAIXA
    return Queue(fila, connection=get_redis())


def inferir_fila(tipo: str) -> str:
    """Heuristica simples para escolher a fila conforme o tipo de job."""
    if tipo.startswith('whatsapp_'):
        return FILA_WHATSAPP
    if tipo.startswith('mp_') or tipo.startswith('loja_'):
        return FILA_CRITICA
    return FILA_BAIXA


@transaction.atomic
def enfileirar(
    tipo: str,
    payload: Optional[Dict[str, Any]] = None,
    *,
    referencia_tipo: str = '',
    referencia_id: str = '',
    fila: Optional[str] = None,
    max_tentativas: Optional[int] = None,
    executar_em: Optional[Any] = None,
) -> int:
    """Cria um JobFila pendente e enfileira no RQ.

    Retorna o id do JobFila criado.
    """
    from .models_fila import JobFila

    payload = payload or {}
    fila_usar = fila or inferir_fila(tipo)
    if fila_usar not in FILAS_VALIDAS:
        fila_usar = FILA_BAIXA
    max_t = int(max_tentativas or os.environ.get('FILA_MAX_TENTATIVAS') or DEFAULT_MAX_TENTATIVAS)

    job = JobFila.objects.create(
        tipo=tipo,
        fila=fila_usar,
        status='pendente',
        payload=payload,
        referencia_tipo=referencia_tipo,
        referencia_id=str(referencia_id) if referencia_id not in (None, '') else '',
        max_tentativas=max_t,
        proxima_execucao_em=executar_em or timezone.now(),
    )

    enfileirar_job(job.id, executar_em=executar_em)
    return job.id


def enfileirar_job(job_id: int, *, executar_em: Optional[Any] = None) -> None:
    """Enfileira um JobFila existente no RQ."""
    from .models_fila import JobFila

    try:
        job = JobFila.objects.get(pk=job_id)
    except JobFila.DoesNotExist:
        logger.warning('enfileirar_job: job %s nao encontrado', job_id)
        return

    fila = job.fila if job.fila in FILAS_VALIDAS else FILA_BAIXA
    queue = get_queue(fila)
    now = timezone.now()
    scheduled_for = executar_em or now
    # Se o tempo agendado e no futuro, usa enqueue_at; senao enfileira direto.
    if scheduled_for and scheduled_for > now + timedelta(seconds=1):
        rq_job = queue.enqueue_at(
            scheduled_for,
            'eventos.fila.executar_job',
            job.id,
            job_id=f'jobfila-{job.id}',
            retry=None,
        )
    else:
        rq_job = queue.enqueue(
            'eventos.fila.executar_job',
            job.id,
            job_id=f'jobfila-{job.id}',
            retry=None,
        )
    JobFila.objects.filter(pk=job.id).update(job_id=str(rq_job.id))


def executar_job(job_id: int) -> Dict[str, Any]:
    """Entry point chamado pelo worker RQ."""
    _ensure_handlers_loaded()
    from .models_fila import JobFila, TentativaJob

    job = JobFila.objects.filter(pk=job_id).first()
    if not job:
        logger.warning('executar_job: job %s nao encontrado', job_id)
        return {'sucesso': False, 'motivo': 'job_nao_encontrado'}

    if job.status in ('sucesso', 'cancelado'):
        logger.info('executar_job: job %s ja em status %s, ignorando', job_id, job.status)
        return {'sucesso': True, 'motivo': f'ja_{job.status}'}

    handler = HANDLERS.get(job.tipo)
    tentativa = TentativaJob.objects.create(job=job, iniciado_em=timezone.now())
    JobFila.objects.filter(pk=job_id).update(
        status='executando',
        ultima_execucao_em=timezone.now(),
        tentativas=job.tentativas + 1,
    )

    inicio = timezone.now()
    try:
        if handler is None:
            raise ValueError(f'Sem handler registrado para tipo {job.tipo!r}')
        resultado = handler(job.payload or {}) or {}
        sucesso = bool(resultado.get('sucesso'))
        erro = '' if sucesso else (resultado.get('erro') or resultado.get('motivo') or 'falha_desconhecida')
    except Exception as exc:  # noqa: BLE001
        logger.exception('executar_job: erro no handler do job %s', job_id)
        sucesso = False
        erro = f'{type(exc).__name__}: {exc}'
        resultado = {'sucesso': False, 'erro': erro}

    duracao_ms = int((timezone.now() - inicio).total_seconds() * 1000)
    TentativaJob.objects.filter(pk=tentativa.pk).update(
        terminou_em=timezone.now(),
        sucesso=sucesso,
        erro=erro,
        http_status=resultado.get('http_status'),
    )

    update = {
        'ultimo_erro': '' if sucesso else erro[:2000],
        'ultima_execucao_em': timezone.now(),
        'duracao_ms': duracao_ms,
    }
    if sucesso:
        update.update(status='sucesso', concluido_em=timezone.now())
        JobFila.objects.filter(pk=job_id).update(**update)
    else:
        novo_job = JobFila.objects.get(pk=job_id)
        if novo_job.tentativas >= novo_job.max_tentativas:
            update.update(status='falha', concluido_em=timezone.now())
            JobFila.objects.filter(pk=job_id).update(**update)
            logger.error(
                'Fila: job %s (%s) esgotou tentativas (%s)',
                job_id, novo_job.tipo, novo_job.tentativas,
            )
        else:
            idx = min(novo_job.tentativas - 1, len(BACKOFF_SEGUNDOS) - 1)
            update['proxima_execucao_em'] = timezone.now() + timedelta(
                seconds=BACKOFF_SEGUNDOS[idx]
            )
            # Volta a pendente para que o worker pegue na proxima janela.
            update['status'] = 'pendente'
            JobFila.objects.filter(pk=job_id).update(**update)
            logger.info(
                'Fila: job %s (%s) tentativa %s/%s falhou; proxima em %ss',
                job_id, novo_job.tipo, novo_job.tentativas, novo_job.max_tentativas,
                BACKOFF_SEGUNDOS[idx],
            )

    return resultado


def reenviar(job_id: int) -> bool:
    """Zera tentativas e reenfileira um job (mesmo se ja falhou)."""
    from .models_fila import JobFila

    with transaction.atomic():
        job = JobFila.objects.select_for_update().filter(pk=job_id).first()
        if not job:
            return False
        if job.status == 'executando':
            return False
        JobFila.objects.filter(pk=job_id).update(
            status='pendente',
            tentativas=0,
            proxima_execucao_em=timezone.now(),
            concluido_em=None,
            ultimo_erro='',
        )
    enfileirar_job(job_id)
    return True


def cancelar(job_id: int) -> bool:
    """Cancela um job pendente."""
    from .models_fila import JobFila

    with transaction.atomic():
        job = JobFila.objects.select_for_update().filter(pk=job_id).first()
        if not job:
            return False
        if job.status in ('sucesso', 'cancelado'):
            return False
        JobFila.objects.filter(pk=job_id).update(status='cancelado', concluido_em=timezone.now())
    # Tenta remover do RQ (pode ja ter sido executado).
    try:
        if job.job_id:
            from rq.job import Job as RQJob
            rq_job = RQJob.fetch(job.job_id, connection=get_redis())
            rq_job.cancel()
    except Exception:  # noqa: BLE001
        pass
    return True


def stats() -> Dict[str, Any]:
    """Contadores por status e tipo (para KPI cards)."""
    from .models_fila import JobFila

    por_status = dict(
        JobFila.objects.values_list('status').annotate(total=models_count()).order_by()
    )
    por_tipo = dict(
        JobFila.objects.values_list('tipo').annotate(total=models_count()).order_by()
    )
    return {'por_status': por_status, 'por_tipo': por_tipo}


def models_count():
    """Helper para o stats() — Django nao expoe Count diretamente aqui."""
    from django.db.models import Count
    return Count('id')
