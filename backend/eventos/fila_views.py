"""Endpoints REST para a tela Admin > Fila de Integracoes."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .fila import cancelar, enfileirar_job, reenviar, stats
from .models_fila import JobFila, WhatsappMensagem

logger = logging.getLogger(__name__)


def _resolver_periodo(request) -> tuple:
    """Resolve o filtro de periodo para a tela de filas.

    Retorna (data_inicio, data_fim) como date, ou (None, None) se 'tudo'.
    Valores de periodo: dia, mes, personalizado, tudo.
    """
    periodo = (request.query_params.get('periodo') or 'tudo').strip().lower()
    hoje = timezone.localdate()

    if periodo == 'dia':
        return hoje, hoje
    if periodo == 'mes':
        return hoje.replace(day=1), hoje
    if periodo == 'personalizado':
        raw_inicio = request.query_params.get('data_inicio')
        raw_fim = request.query_params.get('data_fim')
        if not raw_inicio or not raw_fim:
            return None, None
        try:
            d_ini = datetime.strptime(raw_inicio, '%Y-%m-%d').date()
            d_fim = datetime.strptime(raw_fim, '%Y-%m-%d').date()
        except ValueError:
            return None, None
        return d_ini, d_fim
    return None, None  # 'tudo'


class JobFilaAdminViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet para acompanhar e reprocessar jobs da fila."""

    permission_classes = [IsAdminUser]
    serializer_label_prefix = 'fila'

    def get_queryset(self):
        qs = JobFila.objects.all().select_related('whatsapp').order_by('-criado_em')

        params = self.request.query_params
        status_filtro = params.get('status')
        tipo = params.get('tipo')
        fila = params.get('fila')
        busca = (params.get('busca') or '').strip()

        if status_filtro and status_filtro != 'todos':
            qs = qs.filter(status=status_filtro)
        if tipo:
            qs = qs.filter(tipo=tipo)
        if fila:
            qs = qs.filter(fila=fila)
        if busca:
            # Busca por telefone (somente digitos) no registro WhatsappMensagem
            from .models_fila import WhatsappMensagem
            busca_digits = ''.join(c for c in busca if c.isdigit())
            if busca_digits:
                qs = qs.filter(whatsapp__telefone__icontains=busca_digits)
            else:
                qs = qs.filter(referencia_id__icontains=busca)
            try:
                qs = qs.distinct()
            except Exception:  # noqa: BLE001
                pass

        d_ini, d_fim = _resolver_periodo(self.request)
        if d_ini and d_fim:
            qs = qs.filter(criado_em__date__gte=d_ini, criado_em__date__lte=d_fim)

        return qs

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        try:
            page = int(request.query_params.get('page', '1'))
            page_size = int(request.query_params.get('page_size', '25'))
        except ValueError:
            page, page_size = 1, 25
        page = max(page, 1)
        page_size = min(max(page_size, 1), 100)
        total = qs.count()
        start = (page - 1) * page_size
        jobs = list(qs[start:start + page_size])
        return Response({
            'count': total,
            'page': page,
            'page_size': page_size,
            'results': [_serializar_job(job) for job in jobs],
        })

    def retrieve(self, request, pk=None):
        job = self.get_queryset().filter(pk=pk).first()
        if not job:
            return Response({'error': 'Job nao encontrado'}, status=status.HTTP_404_NOT_FOUND)
        data = _serializar_job(job, completo=True)
        data['whatsapp'] = _serializar_whatsapp(job) if hasattr(job, 'whatsapp') else None
        data['tentativas_log'] = [
            {
                'id': t.id,
                'iniciado_em': t.iniciado_em.isoformat(),
                'terminou_em': t.terminou_em.isoformat() if t.terminou_em else None,
                'sucesso': t.sucesso,
                'erro': t.erro,
                'http_status': t.http_status,
            }
            for t in job.tentativas_log.all().order_by('-iniciado_em')[:20]
        ]
        return Response(data)

    @action(detail=True, methods=['post'])
    def reenviar(self, request, pk=None):
        ok = reenviar(int(pk))
        if not ok:
            return Response({'error': 'Job nao pode ser reenviado'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'id': int(pk)})

    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        ok = cancelar(int(pk))
        if not ok:
            return Response({'error': 'Job nao pode ser cancelado'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'id': int(pk)})

    @action(detail=True, methods=['delete'], url_path='excluir')
    def excluir(self, request, pk=None):
        """Exclui definitivamente um JobFila (admin only)."""
        try:
            job = JobFila.objects.get(pk=int(pk))
        except (JobFila.DoesNotExist, ValueError, TypeError):
            return Response(
                {'success': False, 'erro': 'job_nao_encontrado'},
                status=status.HTTP_404_NOT_FOUND,
            )
        # Bloqueia exclusao de jobs em execucao para nao corromper o worker.
        if job.status == 'executando':
            return Response(
                {'success': False, 'erro': 'job_em_execucao'},
                status=status.HTTP_409_CONFLICT,
            )
        job_id = job.id
        job.delete()
        logger.info('Fila: job %s excluido pelo admin', job_id)
        return Response({'success': True, 'id': job_id})

    @action(detail=False, methods=['post'], url_path='excluir-lote')
    def excluir_lote(self, request):
        """Exclui varios JobFila em lote (admin only)."""
        ids = request.data.get('ids') or []
        if not isinstance(ids, list):
            return Response(
                {'success': False, 'erro': 'ids_invalido'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        excluidos = []
        erros = []
        bloqueados = []
        for raw_id in ids:
            try:
                job_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            try:
                job = JobFila.objects.get(pk=job_id)
            except JobFila.DoesNotExist:
                erros.append(job_id)
                continue
            if job.status == 'executando':
                bloqueados.append(job_id)
                continue
            job.delete()
            excluidos.append(job_id)
        logger.info(
            'Fila: exclusao em lote: %s excluidos, %s bloqueados (executando), %s nao encontrados',
            len(excluidos), len(bloqueados), len(erros),
        )
        return Response({
            'success': True,
            'excluidos': excluidos,
            'bloqueados': bloqueados,
            'erros': erros,
        })

    @action(detail=False, methods=['post'], url_path='reenviar-lote')
    def reenviar_lote(self, request):
        ids = request.data.get('ids') or []
        reenviados = []
        erros = []
        for raw_id in ids:
            try:
                job_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            if reenviar(job_id):
                reenviados.append(job_id)
            else:
                erros.append(job_id)
        return Response({'reenviados': reenviados, 'erros': erros})

    @action(detail=False, methods=['get'])
    def filtros(self, request):
        """Retorna os valores distintos de fila/tipo que existem no banco.

        Util para o frontend popular selects dinamicamente sem hardcodar
        opcoes que nunca serao usadas.
        """
        filas = sorted(set(
            JobFila.objects.values_list('fila', flat=True).distinct()
        ))
        tipos = sorted(set(
            JobFila.objects.values_list('tipo', flat=True).distinct()
        ))
        return Response({'filas': filas, 'tipos': tipos})

    @action(detail=False, methods=['get'])
    def kpis(self, request):
        base = JobFila.objects.all()
        ult_24h = timezone.now() - timedelta(hours=24)
        d_ini, d_fim = _resolver_periodo(request)
        base_periodo = base
        if d_ini and d_fim:
            base_periodo = base.filter(
                criado_em__date__gte=d_ini, criado_em__date__lte=d_fim,
            )
        tipos = list(
            base_periodo.values('tipo').annotate(total=Count('id')).order_by('-total')[:12]
        )
        data = {
            'periodo': {
                'periodo': (request.query_params.get('periodo') or 'tudo'),
                'data_inicio': d_ini.isoformat() if d_ini else None,
                'data_fim': d_fim.isoformat() if d_fim else None,
            },
            'pendente': base_periodo.filter(status='pendente').count(),
            'executando': base_periodo.filter(status='executando').count(),
            'sucesso_24h': base.filter(status='sucesso', concluido_em__gte=ult_24h).count(),
            'falha_total': base_periodo.filter(status='falha').count(),
            'falha_24h': base.filter(status='falha', concluido_em__gte=ult_24h).count(),
            'por_tipo': [
                {'tipo': t['tipo'], 'total': t['total']} for t in tipos
            ],
            'por_fila': list(
                base_periodo.values('fila').annotate(total=Count('id')).order_by('fila')
            ),
            'por_status': list(
                base_periodo.values('status').annotate(total=Count('id')).order_by('status')
            ),
        }
        return Response(data)


def _serializar_job(job: JobFila, completo: bool = False) -> dict:
    data = {
        'id': job.id,
        'tipo': job.tipo,
        'fila': job.fila,
        'status': job.status,
        'tentativas': job.tentativas,
        'max_tentativas': job.max_tentativas,
        'criado_em': job.criado_em.isoformat(),
        'atualizado_em': job.atualizado_em.isoformat(),
        'ultima_execucao_em': job.ultima_execucao_em.isoformat() if job.ultima_execucao_em else None,
        'proxima_execucao_em': job.proxima_execucao_em.isoformat() if job.proxima_execucao_em else None,
        'concluido_em': job.concluido_em.isoformat() if job.concluido_em else None,
        'referencia_tipo': job.referencia_tipo,
        'referencia_id': job.referencia_id,
        'duracao_ms': job.duracao_ms,
    }
    if hasattr(job, 'whatsapp'):
        data['telefone'] = job.whatsapp.telefone
    else:
        data['telefone'] = None
    if completo:
        data.update({
            'payload': job.payload,
            'ultimo_erro': job.ultimo_erro,
            'job_id': job.job_id,
        })
    return data


def _serializar_whatsapp(job: JobFila) -> dict | None:
    if not hasattr(job, 'whatsapp'):
        return None
    wm = job.whatsapp
    return {
        'tipo': wm.tipo,
        'telefone': wm.telefone,
        'mensagem_renderizada': wm.mensagem_renderizada,
        'instancia_override': wm.instancia_override,
    }
