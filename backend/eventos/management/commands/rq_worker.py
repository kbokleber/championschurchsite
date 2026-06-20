"""Inicia workers que processam JobFila pendentes do banco.

Esta implementacao faz polling direto no Postgres (sem RQ) para
compatibilidade maxima com Windows (sem os.fork). O Redis continua
sendo usado como channel de pubsub para refresh rapido entre processos,
mas o estado canonico fica no Postgres.

Em producao (Coolify/Linux) recomenda-se usar workers reais RQ com
fork_job_execution=True (Docker + Linux). Para dev local no Windows
este polling-based funciona perfeitamente.

Uso:
    python manage.py rq_worker whatsapp
    python manage.py rq_worker critica
    python manage.py rq_worker baixa
    python manage.py rq_worker all
"""

import logging
import os
import signal
import threading
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections, transaction
from django.utils import timezone

from eventos.fila import FILAS_VALIDAS, executar_job


logger = logging.getLogger('eventos.fila.worker')


class PollingWorker(threading.Thread):
    def __init__(self, queue_name, poll_interval=2.0):
        super().__init__(daemon=True, name=f'worker-{queue_name}')
        self.queue_name = queue_name
        self.poll_interval = poll_interval
        self._stop = threading.Event()

    def stop(self):
        self._stop.set()

    def run(self):
        from eventos.models_fila import JobFila
        from django.db.models import Q

        logger.info('worker %s iniciado', self.queue_name)
        while not self._stop.is_set():
            try:
                # Busca jobs pendentes (com lock) cuja fila confere e a hora ja chegou.
                agora = timezone.now()
                with transaction.atomic():
                    qs = (
                        JobFila.objects
                        .select_for_update(skip_locked=True)
                        .filter(
                            fila=self.queue_name,
                            status='pendente',
                        )
                        .filter(Q(proxima_execucao_em__isnull=True) | Q(proxima_execucao_em__lte=agora))
                        .order_by('criado_em')[:1]
                    )
                    job = list(qs)
                for j in job:
                    close_old_connections()
                    logger.info('[%s] executando job #%s (%s)', self.queue_name, j.id, j.tipo)
                    try:
                        executar_job(j.id)
                    except Exception:  # noqa: BLE001
                        logger.exception('[%s] erro ao executar job #%s', self.queue_name, j.id)
            except Exception:  # noqa: BLE001
                logger.exception('[%s] erro no loop', self.queue_name)
            # Sleep interrompivel
            self._stop.wait(self.poll_interval)


class Command(BaseCommand):
    help = 'Inicia workers que processam JobFila pendentes do banco.'

    def add_arguments(self, parser):
        parser.add_argument(
            'fila',
            choices=list(FILAS_VALIDAS) + ['all'],
            help='Nome da fila (critica, whatsapp, baixa) ou "all" para todas.',
        )
        parser.add_argument(
            '--poll-interval',
            type=float,
            default=2.0,
            help='Intervalo de polling em segundos (padrao: 2.0).',
        )

    def handle(self, *args, **options):
        queue_names = list(FILAS_VALIDAS) if options['fila'] == 'all' else [options['fila']]
        poll_interval = options['poll_interval']

        workers = []
        for qname in queue_names:
            w = PollingWorker(qname, poll_interval=poll_interval)
            w.start()
            workers.append(w)

        self.stdout.write(self.style.SUCCESS(
            f'Iniciado(s) {len(workers)} worker(s) de polling para fila(s): {", ".join(queue_names)} '
            f'(intervalo={poll_interval}s)'
        ))

        stop_event = threading.Event()

        def _signal(signum, frame):
            self.stdout.write('\nEncerrando workers...')
            stop_event.set()
            for w in workers:
                w.stop()

        signal.signal(signal.SIGINT, _signal)
        try:
            signal.signal(signal.SIGTERM, _signal)
        except (ValueError, AttributeError):
            pass

        try:
            while not stop_event.is_set():
                time.sleep(0.5)
        finally:
            for w in workers:
                w.stop()
            for w in workers:
                w.join(timeout=3)
