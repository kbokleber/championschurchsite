import logging
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

import mercadopago
import requests
from django.db import transaction
from django.db.models import Count, Sum
from django.db.models.deletion import ProtectedError
from django.db.models.functions import TruncDate, TruncMonth
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated, IsAdminUser, BasePermission
from rest_framework.response import Response

from django.utils import timezone

from eventos.mercadopago_sdk import (
    get_mercadopago_sdk,
    get_mp_env_card,
    get_mp_env_pix,
    interpretar_resposta_payment_create,
    mensagem_erro_payment_http,
    mensagem_resposta_cartao_mp,
    mp_search_payments_by_reference,
)
from eventos.mp_payments import (
    aplicar_identificacao_mp,
    criar_ou_reutilizar_pix_embutido,
    montar_payer_payment_cartao,
    resolver_pagador_cartao_loja,
    resolver_pagador_loja,
)
from eventos.models import ConfiguracaoSite
from .estoque import (
    baixar_estoque_venda,
    reverter_estoque_venda,
    validar_estoque_ao_adicionar_itens,
    validar_estoque_disponivel,
)
from .models import Produto, Venda, ItemVenda, CobrancaLoja, ReservaLoja, LojaAuditoria
from .reservas import liberar_reservas_ao_cancelar_venda, marcar_reservas_venda_paga
from .serializers import (
    ProdutoSerializer,
    VendaListSerializer,
    VendaDetailSerializer,
    VendaCreateSerializer,
    ItemVendaInputSerializer,
    CobrancaLojaSerializer,
    LojaAuditoriaSerializer,
    ReservaLojaListSerializer,
    ReservaLojaCreateSerializer,
    ReservaLojaLoteSerializer,
)
logger = logging.getLogger(__name__)


class IsSuperUser(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


def registrar_log_loja(*, tipo_evento, usuario=None, venda=None, produto=None, detalhes=None):
    LojaAuditoria.objects.create(
        tipo_evento=tipo_evento,
        usuario=usuario,
        venda=venda,
        produto=produto,
        detalhes=detalhes or {},
    )


class LojaPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class ProdutoViewSet(viewsets.ModelViewSet):
    serializer_class = ProdutoSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = LojaPagination
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_permissions(self):
        if self.action == 'destroy':
            return [IsAuthenticated(), IsAdminUser()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = Produto.objects.all()
        ativo = self.request.query_params.get('ativo')
        if ativo is not None:
            qs = qs.filter(ativo=ativo.lower() == 'true')
        categoria = self.request.query_params.get('categoria')
        if categoria in ('cantina', 'loja'):
            qs = qs.filter(categoria=categoria)
        seg = self.request.query_params.get('segmento_cantina')
        if seg in ('comida', 'bebida'):
            qs = qs.filter(segmento_cantina=seg)
        return qs.order_by('nome')

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError(
                'Este produto possui histórico vinculado (vendas/cobranças). '
                'Para evitar inconsistências, mantenha o cadastro e desative o produto.'
            )

    def perform_create(self, serializer):
        produto = serializer.save()
        registrar_log_loja(
            tipo_evento='produto_criado',
            usuario=self.request.user,
            produto=produto,
            detalhes={
                'nome': produto.nome,
                'categoria': produto.categoria,
                'preco': str(produto.preco),
                'ativo': bool(produto.ativo),
                'controla_estoque': bool(produto.controla_estoque),
                'estoque': int(produto.estoque),
            },
        )

    def perform_update(self, serializer):
        original = Produto.objects.get(pk=serializer.instance.pk)
        produto = serializer.save()
        detalhes_base = {}
        campos_rastreaveis = ['nome', 'descricao', 'categoria', 'segmento_cantina', 'ativo', 'controla_estoque', 'estoque']
        for campo in campos_rastreaveis:
            antes = getattr(original, campo, None)
            depois = getattr(produto, campo, None)
            if antes != depois:
                detalhes_base[campo] = {'de': antes, 'para': depois}
        if detalhes_base:
            registrar_log_loja(
                tipo_evento='produto_atualizado',
                usuario=self.request.user,
                produto=produto,
                detalhes=detalhes_base,
            )
        if original.preco != produto.preco:
            registrar_log_loja(
                tipo_evento='produto_preco_alterado',
                usuario=self.request.user,
                produto=produto,
                detalhes={
                    'nome': produto.nome,
                    'de': str(original.preco),
                    'para': str(produto.preco),
                },
            )


class VendaViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = LojaPagination
    http_method_names = ['get', 'post', 'put', 'head', 'options', 'delete']

    def get_permissions(self):
        if self.action == 'destroy':
            return [IsAuthenticated(), IsAdminUser()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = (
            Venda.objects.all()
            .select_related('criado_por')
            .prefetch_related('itens__produto', 'cobranca_mp')
        )
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        categoria = self.request.query_params.get('categoria')
        if categoria in ('cantina', 'loja'):
            qs = qs.filter(itens__produto__categoria=categoria).distinct()
        d0 = self.request.query_params.get('data_inicio')
        d1 = self.request.query_params.get('data_fim')
        if d0:
            qs = qs.filter(data_criacao__date__gte=d0)
        if d1:
            qs = qs.filter(data_criacao__date__lte=d1)
        meio = self.request.query_params.get('meio_pagamento')
        if meio in ('dinheiro', 'pix_mp', 'cartao_mp'):
            qs = qs.filter(meio_pagamento=meio)
        return qs.order_by('-data_criacao')

    def get_serializer_class(self):
        if self.action == 'create':
            return VendaCreateSerializer
        if self.action == 'list':
            return VendaListSerializer
        return VendaDetailSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def create(self, request, *args, **kwargs):
        ser = VendaCreateSerializer(data=request.data, context=self.get_serializer_context())
        ser.is_valid(raise_exception=True)
        venda = ser.save()
        registrar_log_loja(
            tipo_evento='venda_criada',
            usuario=request.user,
            venda=venda,
            detalhes={
                'meio_pagamento': venda.meio_pagamento,
                'comprador_nome': venda.comprador_nome,
                'total': str(venda.total),
                'itens': [
                    {
                        'produto_id': it.produto_id,
                        'produto_nome': it.produto.nome,
                        'quantidade': int(it.quantidade),
                        'preco_unitario': str(it.preco_unitario),
                    }
                    for it in venda.itens.select_related('produto').all()
                ],
            },
        )
        return Response(
            VendaDetailSerializer(venda, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def perform_destroy(self, instance):
        with transaction.atomic():
            reverter_estoque_venda(instance)
            instance.delete()

    @action(detail=True, methods=['post'], url_path='adicionar-itens')
    def adicionar_itens(self, request, pk=None):
        v = self.get_object()
        if v.status != 'rascunho':
            return Response(
                {'error': 'Só é possível alterar itens em venda rascunho.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lines = request.data.get('itens', [])
        if not lines:
            return Response({'error': 'Envie a lista "itens".'}, status=status.HTTP_400_BAD_REQUEST)
        child = ItemVendaInputSerializer(many=True, data=lines)
        child.is_valid(raise_exception=True)
        try:
            validar_estoque_ao_adicionar_itens(v, child.validated_data)
        except serializers.ValidationError as exc:
            return Response(
                exc.detail if hasattr(exc, 'detail') else str(exc),
                status=status.HTTP_400_BAD_REQUEST,
            )
        for line in child.validated_data:
            try:
                prod = Produto.objects.get(pk=line['produto'], ativo=True)
            except Produto.DoesNotExist:
                return Response(
                    {'error': f"Produto {line['produto']} inexistente ou inativo."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            ItemVenda.objects.create(
                venda=v,
                produto=prod,
                quantidade=line['quantidade'],
                preco_unitario=prod.preco,
            )
        v.recalcular_total()
        v.save(update_fields=['total'])
        registrar_log_loja(
            tipo_evento='venda_itens_alterados',
            usuario=request.user,
            venda=v,
            detalhes={
                'acao': 'adicionar_itens',
                'total': str(v.total),
                'itens_adicionados': [
                    {'produto_id': int(line['produto']), 'quantidade': int(line['quantidade'])}
                    for line in child.validated_data
                ],
            },
        )
        return Response(VendaDetailSerializer(v, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['put'], url_path='definir-itens')
    def definir_itens(self, request, pk=None):
        """
        Substitui todos os itens de uma venda rascunho (ex.: ajuste de quantidades após importar da reserva).
        """
        v = self.get_object()
        if v.status != 'rascunho':
            return Response(
                {'error': 'Só é possível alterar itens em venda rascunho.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lines = request.data.get('itens', [])
        if not lines:
            return Response(
                {'error': 'Envie ao menos um item em "itens".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        child = ItemVendaInputSerializer(many=True, data=lines)
        child.is_valid(raise_exception=True)
        validated = child.validated_data
        try:
            from .estoque_reserva import validar_estoque_extra_para_venda_rascunho

            itens = [
                {'produto': int(x['produto']), 'quantidade': int(x['quantidade'])} for x in validated
            ]
            validar_estoque_extra_para_venda_rascunho(v, itens)
        except serializers.ValidationError as exc:
            return Response(
                exc.detail if hasattr(exc, 'detail') else str(exc),
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            v.itens.all().delete()
            for line in validated:
                try:
                    prod = Produto.objects.get(pk=line['produto'], ativo=True)
                except Produto.DoesNotExist:
                    return Response(
                        {'error': f"Produto {line['produto']} inexistente ou inativo."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                ItemVenda.objects.create(
                    venda=v,
                    produto=prod,
                    quantidade=line['quantidade'],
                    preco_unitario=prod.preco,
                )
            v.recalcular_total()
            v.save(update_fields=['total'])
        registrar_log_loja(
            tipo_evento='venda_itens_alterados',
            usuario=request.user,
            venda=v,
            detalhes={
                'acao': 'definir_itens',
                'total': str(v.total),
                'itens': [
                    {'produto_id': int(line['produto']), 'quantidade': int(line['quantidade'])}
                    for line in validated
                ],
            },
        )
        v = Venda.objects.prefetch_related('itens__produto', 'cobranca_mp').get(pk=v.pk)
        return Response(VendaDetailSerializer(v, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'], url_path='registrar-pagamento-dinheiro')
    def registrar_pagamento_dinheiro(self, request, pk=None):
        v_chk = self.get_object()
        if v_chk.status not in ('rascunho', 'pendente_pagamento'):
            return Response(
                {'error': 'Não é possível registrar dinheiro nesta venda.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        t = v_chk.recalcular_total()
        if t is None or t <= 0:
            return Response(
                {'error': 'Venda sem total válido; adicione itens.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            with transaction.atomic():
                v = (
                    Venda.objects.select_for_update()
                    .get(pk=pk)
                )
                v.meio_pagamento = 'dinheiro'
                v.status = 'pago'
                v.save()
                c = CobrancaLoja.objects.select_for_update().filter(
                    venda_id=v.pk, status='pendente'
                ).first()
                if c:
                    c.status = 'cancelado'
                    c.save(update_fields=['status'])
                baixar_estoque_venda(v)
                marcar_reservas_venda_paga(v)
                registrar_log_loja(
                    tipo_evento='venda_pagamento_dinheiro',
                    usuario=request.user,
                    venda=v,
                    detalhes={
                        'meio_pagamento': 'dinheiro',
                        'total': str(v.total),
                        'comprador_nome': v.comprador_nome,
                    },
                )
        except serializers.ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.error(
                'registrar_pagamento_dinheiro: erro ao confirmar venda %s: %s',
                pk,
                exc,
                exc_info=True,
            )
            return Response(
                {
                    'error': (
                        'Não foi possível concluir o pagamento em dinheiro agora. '
                        'Tente novamente em instantes.'
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        v = (
            Venda.objects.select_related('criado_por', 'cobranca_mp')
            .prefetch_related('itens__produto')
            .get(pk=pk)
        )
        return Response(VendaDetailSerializer(v, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'], url_path='gerar-cobranca-mp')
    def gerar_cobranca_mp(self, request, pk=None):
        v = self.get_object()
        if v.status not in ('rascunho', 'pendente_pagamento'):
            return Response(
                {'error': 'Venda não pode receber cobrança MP (status incompatível).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        t = v.recalcular_total()
        if t is None or t <= 0 or not v.itens.exists():
            return Response(
                {'error': 'Venda sem itens ou total zero.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        meio = request.data.get('meio_pagamento') or 'pix_mp'
        if meio not in ('pix_mp', 'cartao_mp'):
            meio = 'pix_mp'
        v.meio_pagamento = meio
        v.status = 'pendente_pagamento'
        v.save()
        c, _created = CobrancaLoja.objects.get_or_create(
            venda=v,
            defaults={
                'valor': v.total,
                'status': 'pendente',
            },
        )
        c.valor = v.total
        c.status = 'pendente'
        c.save()
        return Response(
            {
                'success': True,
                'valor': float(c.valor),
                'venda_id': v.id,
                'cobranca_loja': {'id': c.id, 'codigo': c.codigo},
            }
        )

    @action(detail=True, methods=['post'], url_path='cancelar')
    def cancelar(self, request, pk=None):
        v = self.get_object()
        if v.status == 'pago':
            return Response(
                {'error': 'Não é possível cancelar venda já paga.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        v.status = 'cancelado'
        v.save()
        liberar_reservas_ao_cancelar_venda(v)
        if hasattr(v, 'cobranca_mp') and v.cobranca_mp:
            cl = v.cobranca_mp
            if cl.status == 'pendente':
                cl.status = 'cancelado'
                cl.save()
        registrar_log_loja(
            tipo_evento='venda_cancelada',
            usuario=request.user,
            venda=v,
            detalhes={
                'status_anterior': 'rascunho_ou_pendente',
                'total': str(v.total),
            },
        )
        return Response(VendaDetailSerializer(v, context=self.get_serializer_context()).data)


class ReservaLojaViewSet(viewsets.ModelViewSet):
    """
    Reservas por dia/produto (culto). Criar reserva; depois `iniciar-cobranca` gera o rascunho de venda
    e o PDV abre com ?venda=.
    """
    permission_classes = [IsAuthenticated]
    pagination_class = LojaPagination
    http_method_names = ['get', 'post', 'head', 'options', 'delete']

    def get_queryset(self):
        qs = ReservaLoja.objects.all().select_related('produto', 'venda', 'criado_por')
        d = self.request.query_params.get('data')
        if d:
            qs = qs.filter(data=d)
        pid = self.request.query_params.get('produto')
        if pid and str(pid).isdigit():
            qs = qs.filter(produto_id=int(pid))
        st = self.request.query_params.get('status')
        if st and st in {x[0] for x in ReservaLoja.STATUS_CHOICES}:
            qs = qs.filter(status=st)
        cat = self.request.query_params.get('categoria')
        if cat in ('cantina', 'loja'):
            qs = qs.filter(produto__categoria=cat)
        # Listagem operacional: canceladas não aparecem (continuam no banco p/ histórico / admin).
        qs = qs.exclude(status='cancelada')
        return qs.order_by('data', 'nome', 'id')

    def get_serializer_class(self):
        if self.action == 'create':
            return ReservaLojaCreateSerializer
        if self.action == 'criar_lote':
            return ReservaLojaLoteSerializer
        return ReservaLojaListSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def create(self, request, *args, **kwargs):
        ser = ReservaLojaCreateSerializer(data=request.data, context=self.get_serializer_context())
        ser.is_valid(raise_exception=True)
        r = ser.save()
        return Response(
            ReservaLojaListSerializer(r, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'], url_path='criar-lote')
    def criar_lote(self, request, *args, **kwargs):
        lote = ReservaLojaLoteSerializer(data=request.data, context=self.get_serializer_context())
        lote.is_valid(raise_exception=True)
        vdata = lote.validated_data
        d = vdata['data']
        nome = vdata['nome']
        obs = (vdata.get('observacao') or '').strip()
        created = []
        with transaction.atomic():
            for line in vdata['itens']:
                ser = ReservaLojaCreateSerializer(
                    data={
                        'produto': line['produto'],
                        'data': d,
                        'nome': nome,
                        'quantidade': line['quantidade'],
                        'observacao': obs,
                    },
                    context=self.get_serializer_context(),
                )
                ser.is_valid(raise_exception=True)
                created.append(ser.save())
        return Response(
            ReservaLojaListSerializer(created, many=True, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'], url_path='iniciar-cobranca-grupo')
    def iniciar_cobranca_grupo(self, request, *args, **kwargs):
        """
        Uma venda com todos os itens pendentes do cliente nesta data (por nome, cantina).
        Não use quando houver itens pendentes e itens já em venda; conclua ou cancele a parcial.
        """
        d_raw = request.data.get('data')
        nome_in = (request.data.get('nome') or '').strip()
        if not d_raw or not nome_in or len(nome_in) < 2:
            return Response(
                {
                    'error': 'Informe a data (AAAA-MM-DD) e o nome (mín. 2 caracteres) igual ao do cadastro.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            if isinstance(d_raw, date):
                d = d_raw
            else:
                d = date.fromisoformat(str(d_raw)[:10])
        except ValueError:
            return Response({'error': 'Data inválida. Use AAAA-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        nlow = nome_in.lower()
        base = (
            ReservaLoja.objects.filter(data=d, produto__categoria='cantina')
            .exclude(status__in=('pago', 'cancelada'))
            .select_related('produto', 'venda')
        )
        reservas = [r for r in base if (r.nome or '').strip().lower() == nlow]
        reservas.sort(key=lambda x: x.id)
        if not reservas:
            return Response(
                {'error': 'Nenhuma reserva (pendente ou em cobrança) encontrada para este nome e data.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pend = [r for r in reservas if r.status == 'pendente']
        ec = [r for r in reservas if r.status == 'em_cobranca']
        if pend and ec:
            return Response(
                {
                    'error': (
                        'Há itens ainda pendentes e itens já na venda. '
                        'Conclua ou cancele a venda em aberto no PDV, ou use Cobrar só nos itens pendentes.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ec and not pend:
            vids = {r.venda_id for r in ec if r.venda_id}
            if len(vids) != 1:
                return Response(
                    {'error': 'Reservas com vendas vinculadas conflitantes. Ajuste no admin ou unifique em uma única venda.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            v0 = list(vids)[0]
            v = ec[0].venda
            if not v or v.id != v0 or v.status not in ('rascunho', 'pendente_pagamento'):
                return Response(
                    {'error': 'A venda vinculada não está aberta. Verifique o histórico.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            categoria = 'cantina'
            return Response(
                {
                    'venda_id': v.id,
                    'categoria': categoria,
                    'reutilizou': True,
                    'path_pdv': f'/admin/loja/{categoria}/nova-venda?venda={v.id}',
                }
            )
        if not pend:
            return Response(
                {'error': 'Nada a cobrar nesta lista.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        need = defaultdict(int)
        for r in pend:
            need[r.produto_id] += int(r.quantidade)
        u = request.user
        with transaction.atomic():
            v = Venda.objects.create(
                criado_por=u,
                meio_pagamento='dinheiro',
                status='rascunho',
                comprador_nome=nome_in,
                observacao='',
            )
            for pid, qtd in need.items():
                prod = Produto.objects.get(pk=pid, ativo=True)
                ItemVenda.objects.create(
                    venda=v,
                    produto=prod,
                    quantidade=qtd,
                    preco_unitario=prod.preco,
                )
            v.recalcular_total()
            v.save(update_fields=['total'])
            for r in pend:
                r.venda = v
                r.status = 'em_cobranca'
                r.save(update_fields=['venda', 'status'])
        categoria = 'cantina'
        return Response(
            {
                'venda_id': v.id,
                'categoria': categoria,
                'reutilizou': False,
                'path_pdv': f'/admin/loja/{categoria}/nova-venda?venda={v.id}',
            }
        )

    def perform_destroy(self, instance):
        if instance.status == 'pago':
            raise ValidationError('Não é possível excluir reserva já paga.')
        if instance.status == 'cancelada':
            return
        from .estoque_reserva import (
            devolver_empenho_reserva_se_aplicavel,
            excluir_reserva_cobranca_sincroniza_venda,
        )

        if instance.status == 'em_cobranca' and instance.venda_id:
            with transaction.atomic():
                excluir_reserva_cobranca_sincroniza_venda(instance)
            return
        with transaction.atomic():
            devolver_empenho_reserva_se_aplicavel(instance)
            o = type(instance).objects.get(pk=instance.pk)
            if o.status != 'pago' and o.status != 'cancelada':
                o.status = 'cancelada'
                o.save(update_fields=['status'])

    @action(detail=True, methods=['post'], url_path='iniciar-cobranca')
    def iniciar_cobranca(self, request, pk=None):
        r = self.get_object()
        if r.status in ('pago', 'cancelada'):
            return Response(
                {'error': 'Reserva indisponível (já paga ou cancelada).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if r.venda_id and r.status == 'em_cobranca':
            v = r.venda
            if v and v.status in ('rascunho', 'pendente_pagamento'):
                categoria = r.produto.categoria
                if categoria not in ('cantina', 'loja'):
                    categoria = 'cantina'
                return Response(
                    {
                        'venda_id': v.id,
                        'categoria': categoria,
                        'reutilizou': True,
                        'path_pdv': f'/admin/loja/{categoria}/nova-venda?venda={v.id}',
                    }
                )
        u = request.user
        v = None
        with transaction.atomic():
            v = Venda.objects.create(
                criado_por=u,
                meio_pagamento='dinheiro',
                status='rascunho',
                comprador_nome=(r.nome or '').strip(),
                observacao='',
            )
            ItemVenda.objects.create(
                venda=v,
                produto=r.produto,
                quantidade=r.quantidade,
                preco_unitario=r.produto.preco,
            )
            v.recalcular_total()
            v.save(update_fields=['total'])
            r.venda = v
            r.status = 'em_cobranca'
            r.save(update_fields=['venda', 'status'])
        categoria = r.produto.categoria
        if categoria not in ('cantina', 'loja'):
            categoria = 'cantina'
        return Response(
            {
                'venda_id': v.id,
                'categoria': categoria,
                'reutilizou': False,
                'path_pdv': f'/admin/loja/{categoria}/nova-venda?venda={v.id}',
            }
        )


class CobrancaLojaViewSet(viewsets.ReadOnlyModelViewSet):
    """Detalhe da cobrança MP (interno) para tela de pagamento admin."""

    serializer_class = CobrancaLojaSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    lookup_field = 'id'

    def get_queryset(self):
        return CobrancaLoja.objects.all().select_related('venda')


class LojaAuditoriaViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LojaAuditoriaSerializer
    permission_classes = [IsSuperUser]
    pagination_class = LojaPagination

    def get_queryset(self):
        qs = LojaAuditoria.objects.all().select_related('usuario', 'venda', 'produto')
        categoria = self.request.query_params.get('categoria')
        if categoria in ('cantina', 'loja'):
            qs = qs.filter(produto__categoria=categoria)
        tipo_evento = self.request.query_params.get('tipo_evento')
        if tipo_evento:
            qs = qs.filter(tipo_evento=tipo_evento)
        venda_id = self.request.query_params.get('venda_id')
        if venda_id and str(venda_id).isdigit():
            qs = qs.filter(venda_id=int(venda_id))
        produto_id = self.request.query_params.get('produto_id')
        if produto_id and str(produto_id).isdigit():
            qs = qs.filter(produto_id=int(produto_id))
        usuario_id = self.request.query_params.get('usuario_id')
        if usuario_id and str(usuario_id).isdigit():
            qs = qs.filter(usuario_id=int(usuario_id))
        d0 = self.request.query_params.get('data_inicio')
        if d0:
            qs = qs.filter(data_evento__date__gte=d0)
        d1 = self.request.query_params.get('data_fim')
        if d1:
            qs = qs.filter(data_evento__date__lte=d1)
        return qs.order_by('-data_evento', '-id')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def verificar_pagamento_loja(request, cobranca_loja_id: int):
    try:
        cobranca = CobrancaLoja.objects.select_related('venda').get(id=cobranca_loja_id)
    except CobrancaLoja.DoesNotExist:
        return Response({'error': 'Cobrança não encontrada'}, status=status.HTTP_404_NOT_FOUND)

    if cobranca.status == 'pago' or (cobranca.venda and cobranca.venda.status == 'pago'):
        return Response(
            {
                'status': 'pago',
                'cobranca_status': cobranca.status,
                'venda_status': cobranca.venda.status,
                'data_pagamento': (
                    cobranca.data_pagamento.strftime('%d/%m/%Y %H:%M:%S') if cobranca.data_pagamento else None
                ),
            }
        )

    if not cobranca.referencia_externa:
        return Response(
            {
                'status': 'aguardando_pix',
                'cobranca_status': cobranca.status,
            }
        )

    config = ConfiguracaoSite.get_config()
    if not config.mp_ativo:
        return Response(
            {
                'status': cobranca.status,
                'cobranca_status': cobranca.status,
                'mp_error': 'MP não configurado',
            }
        )
    try:
        results = mp_search_payments_by_reference(cobranca.codigo, config)
        mp_status = 'pending'
        for pay in results:
            if pay.get('status') == 'approved':
                mp_status = 'approved'
                break
            if pay.get('status') in ('pending', 'in_process'):
                mp_status = pay.get('status', 'pending')

        if mp_status == 'approved' and cobranca.status != 'pago':
            try:
                with transaction.atomic():
                    c = CobrancaLoja.objects.select_for_update().select_related('venda').get(
                        id=cobranca.id
                    )
                    if c.status == 'pago':
                        pass
                    else:
                        c.status = 'pago'
                        c.data_pagamento = timezone.now()
                        c.save()
                        v = c.venda
                        v = Venda.objects.select_for_update().get(pk=v.pk)
                        v.status = 'pago'
                        v.save()
                        baixar_estoque_venda(v)
                        marcar_reservas_venda_paga(v)
                        registrar_log_loja(
                            tipo_evento='venda_pagamento_mp',
                            usuario=request.user,
                            venda=v,
                            detalhes={
                                'origem': 'verificacao_pagamento_loja',
                                'metodo': c.metodo_pagamento or 'Mercado Pago',
                                'referencia_externa': c.referencia_externa,
                                'total': str(v.total),
                            },
                        )
            except serializers.ValidationError as exc:
                return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
            cobranca.refresh_from_db()
            cobranca.venda.refresh_from_db()
        return Response(
            {
                'status': 'pago' if mp_status == 'approved' else mp_status,
                'cobranca_status': cobranca.status,
                'mp_status': mp_status,
                'venda_status': cobranca.venda.status,
                'data_pagamento': (
                    cobranca.data_pagamento.strftime('%d/%m/%Y %H:%M:%S') if cobranca.data_pagamento else None
                ),
            }
        )
    except Exception as e:
        logger.error('verificar_pagamento_loja: %s', e, exc_info=True)
        return Response(
            {
                'status': cobranca.status,
                'cobranca_status': cobranca.status,
                'mp_error': str(e),
            }
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def pagar_cartao_loja(request):
    """
    Pagamento com cartão (token) para CobrancaLoja — mesmo fluxo que inscrições, sem inscrição.
    Body: cobranca_loja_id, token, payment_method_id, installments, payer, issuer_id (opc).
    """
    try:
        return _pagar_cartao_loja_impl(request)
    except serializers.ValidationError as exc:
        return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        logger.exception('pagar_cartao_loja inesperado')
        return Response(
            {
                'error': 'Erro interno ao processar cartão. Tente novamente ou use PIX.',
                'details': str(exc),
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _pagar_cartao_loja_impl(request):
    cobranca_id = request.data.get('cobranca_loja_id') or request.data.get('cobranca_id')
    token = request.data.get('token')
    payment_method_id = request.data.get('payment_method_id')
    installments = request.data.get('installments', 1)
    issuer_id = request.data.get('issuer_id')
    payer = request.data.get('payer') or {}

    if not cobranca_id or not token or not payment_method_id:
        return Response(
            {'error': 'cobranca_loja_id, token e payment_method_id são obrigatórios'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        cobranca = CobrancaLoja.objects.select_related('venda', 'venda__criado_por').get(id=cobranca_id)
    except CobrancaLoja.DoesNotExist:
        return Response({'error': 'Cobrança não encontrada'}, status=status.HTTP_404_NOT_FOUND)

    if cobranca.status != 'pendente':
        return Response(
            {
                'error': f'Cobrança não está pendente (status: {cobranca.get_status_display()})',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    config = ConfiguracaoSite.get_config()
    if not config.mp_ativo:
        return Response({'error': 'Mercado Pago não está ativo'}, status=status.HTTP_400_BAD_REQUEST)
    if not getattr(config, 'mp_cartao_habilitado', True):
        return Response(
            {'error': 'Pagamento com cartão não está habilitado nas configurações do site.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    sdk = get_mercadopago_sdk(get_mp_env_card(config))
    if not sdk:
        return Response({'error': 'Mercado Pago não configurado'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    v = cobranca.venda
    try:
        pagador_loja = resolver_pagador_cartao_loja(config, payer)
        payer_mp = montar_payer_payment_cartao(pagador_loja)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    transaction_amount = float(cobranca.valor)
    VALOR_MINIMO_CARTAO = 0.50
    if round(transaction_amount, 2) < VALOR_MINIMO_CARTAO:
        return Response(
            {
                'error': f'Valor mínimo para pagamento com cartão é R$ {VALOR_MINIMO_CARTAO:.2f}. Para valores menores, use PIX (Checkout Pro).',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    payment_data = {
        'transaction_amount': round(transaction_amount, 2),
        'token': token,
        'installments': int(installments) if installments else 1,
        'payment_method_id': payment_method_id,
        'payer': payer_mp,
    }
    aplicar_identificacao_mp(
        payment_data,
        valor=transaction_amount,
        codigo=cobranca.codigo,
        titulo='Lojinha / Cantina',
        detalhe=f'Venda #{v.id}',
        origem='loja',
    )
    if issuer_id:
        payment_data['issuer_id'] = str(issuer_id)

    idem = str(uuid.uuid4())
    try:
        ro = getattr(mercadopago, 'config', None) and getattr(mercadopago.config, 'RequestOptions', None)
        if ro:
            opts = ro()
            opts.custom_headers = {'x-idempotency-key': idem}
            payment_response = sdk.payment().create(payment_data, opts)
        else:
            payment_response = sdk.payment().create(payment_data)
    except Exception as e:
        logger.exception('pagar_cartao_loja')
        return Response(
            {'error': 'Erro ao processar cartão', 'details': str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    payment, http_status, api_err = interpretar_resposta_payment_create(payment_response)
    if api_err or http_status not in (200, 201):
        mp_env = get_mp_env_card(config)
        msg = mensagem_erro_payment_http(http_status, payment, env=mp_env)
        return Response(
            {
                'success': False,
                'status': 'api_error',
                'message': msg,
                'error': msg,
                'mp_http_status': http_status,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    status_mp = payment.get('status')
    payment_id = payment.get('id')

    if status_mp == 'approved':
        with transaction.atomic():
            c = CobrancaLoja.objects.select_for_update().select_related('venda').get(id=cobranca.id)
            c.status = 'pago'
            c.data_pagamento = timezone.now()
            c.referencia_externa = str(payment_id or '')
            c.metodo_pagamento = 'Mercado Pago (cartão)'
            c.save()
            v = Venda.objects.select_for_update().get(pk=c.venda_id)
            v.status = 'pago'
            v.save()
            baixar_estoque_venda(v)
            marcar_reservas_venda_paga(v)
            registrar_log_loja(
                tipo_evento='venda_pagamento_mp',
                usuario=request.user,
                venda=v,
                detalhes={
                    'origem': 'pagar_cartao_loja',
                    'metodo': 'Mercado Pago (cartão)',
                    'referencia_externa': str(payment_id or ''),
                    'total': str(v.total),
                },
            )
    if payment_id and status_mp in ('approved', 'pending', 'in_process'):
        cobranca.referencia_externa = str(payment_id)
        cobranca.metodo_pagamento = 'Mercado Pago (cartão)'
        cobranca.save(update_fields=['referencia_externa', 'metodo_pagamento'])

    mp_env = get_mp_env_card(config)
    resp_msg = mensagem_resposta_cartao_mp(payment, sandbox=(mp_env == 'sandbox'))
    return Response(
        {
            'success': resp_msg['success'],
            'status': status_mp,
            'status_detail': payment.get('status_detail'),
            'payment_id': payment_id,
            'message': resp_msg['message'],
        }
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def criar_pagamento_pix_embutido_loja(request):
    """PIX embutido (QR) para CobrancaLoja."""
    from eventos.views import _validar_credenciais_mp_ambiente

    cobranca_id = request.data.get('cobranca_loja_id') or request.data.get('cobranca_id')
    if not cobranca_id:
        return Response(
            {'error': 'cobranca_loja_id é obrigatório'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        cobranca = CobrancaLoja.objects.select_related('venda', 'venda__criado_por').get(id=cobranca_id)
    except CobrancaLoja.DoesNotExist:
        return Response({'error': 'Cobrança não encontrada'}, status=status.HTTP_404_NOT_FOUND)

    if cobranca.status != 'pendente':
        return Response(
            {'error': f'Cobrança não está pendente (status: {cobranca.get_status_display()})'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    config = ConfiguracaoSite.get_config()
    if not config.mp_ativo:
        return Response({'error': 'Mercado Pago não está ativo'}, status=status.HTTP_400_BAD_REQUEST)
    if not config.mp_pix_habilitado:
        return Response(
            {'error': 'Pagamento via PIX não está habilitado nas configurações do site.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        mp_env = get_mp_env_pix(config, pagamento_embutido=True)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    credenciais_ok, detalhe = _validar_credenciais_mp_ambiente(
        mp_env,
        config.get_mp_public_key_for(mp_env),
        config.get_mp_access_token_for(mp_env),
    )
    if not credenciais_ok:
        return Response({'error': detalhe}, status=status.HTTP_400_BAD_REQUEST)

    payer_req = request.data.get('payer') or {}
    v = cobranca.venda
    try:
        payer_mp = resolver_pagador_loja(config, payer_req)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    nome_fb = getattr(v, 'comprador_nome', None) or config.nome_igreja or 'Loja'
    if nome_fb and nome_fb.strip():
        partes = nome_fb.strip().split(None, 1)
        payer_mp['first_name'] = partes[0][:255]
        payer_mp['last_name'] = (partes[1] if len(partes) > 1 else 'Balcão')[:255]

    def limpar_ref():
        cobranca.referencia_externa = ''
        cobranca.save(update_fields=['referencia_externa'])

    try:
        result = criar_ou_reutilizar_pix_embutido(
            codigo=cobranca.codigo,
            valor=float(cobranca.valor),
            titulo_mp='Lojinha / Cantina',
            detalhe_mp=f'Venda #{v.id}',
            origem_mp='loja',
            referencia_externa=cobranca.referencia_externa,
            payer_input={},
            email_fallback=payer_mp['email'],
            nome_fallback=nome_fb,
            limpar_referencia_invalida=limpar_ref,
            payer_mp_override=payer_mp,
        )
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    if result.get('already_approved'):
        if cobranca.status != 'pago':
            try:
                with transaction.atomic():
                    c = CobrancaLoja.objects.select_for_update().select_related('venda').get(id=cobranca.id)
                    c.status = 'pago'
                    c.data_pagamento = timezone.now()
                    c.referencia_externa = str(result.get('payment_id') or c.referencia_externa or '')
                    c.metodo_pagamento = 'Mercado Pago (PIX)'
                    c.save()
                    v2 = Venda.objects.select_for_update().get(pk=c.venda_id)
                    v2.status = 'pago'
                    v2.save()
                    baixar_estoque_venda(v2)
                    marcar_reservas_venda_paga(v2)
            except serializers.ValidationError as exc:
                return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        return Response({**result, 'cobranca_loja': {'id': cobranca.id, 'codigo': cobranca.codigo}})

    pid = result.get('payment_id')
    if pid:
        cobranca.referencia_externa = str(pid)
        cobranca.metodo_pagamento = 'Mercado Pago (PIX)'
        cobranca.save(update_fields=['referencia_externa', 'metodo_pagamento'])

    return Response({
        **result,
        'cobranca_loja': {'id': cobranca.id, 'codigo': cobranca.codigo},
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_financeiro_loja(request):
    """
    Dashboard financeiro da loja/cantina com filtros por período.
    Query params:
      - periodo: dia | mes | personalizado
      - data_inicio: AAAA-MM-DD (opcional; obrigatório em personalizado)
      - data_fim: AAAA-MM-DD (opcional; obrigatório em personalizado)
      - categoria: cantina | loja | (vazio=todas)
    """
    periodo = (request.query_params.get('periodo') or 'mes').strip().lower()
    categoria = (request.query_params.get('categoria') or '').strip().lower()
    hoje = timezone.localdate()

    if periodo == 'dia':
        data_inicio = hoje
        data_fim = hoje
    elif periodo == 'mes':
        data_inicio = hoje.replace(day=1)
        data_fim = hoje
    elif periodo == 'personalizado':
        raw_inicio = request.query_params.get('data_inicio')
        raw_fim = request.query_params.get('data_fim')
        if not raw_inicio or not raw_fim:
            return Response(
                {'error': 'Para período personalizado, informe data_inicio e data_fim.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            data_inicio = datetime.strptime(raw_inicio, '%Y-%m-%d').date()
            data_fim = datetime.strptime(raw_fim, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Datas inválidas. Use o formato AAAA-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        return Response(
            {'error': 'Parâmetro periodo inválido. Use: dia, mes ou personalizado.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if data_fim < data_inicio:
        return Response(
            {'error': 'data_fim não pode ser menor que data_inicio.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    vendas_qs = Venda.objects.filter(
        status='pago',
        data_criacao__date__gte=data_inicio,
        data_criacao__date__lte=data_fim,
    )
    if categoria in ('cantina', 'loja'):
        vendas_qs = vendas_qs.filter(itens__produto__categoria=categoria).distinct()

    itens_qs = ItemVenda.objects.filter(
        venda__status='pago',
        venda__data_criacao__date__gte=data_inicio,
        venda__data_criacao__date__lte=data_fim,
    )
    if categoria in ('cantina', 'loja'):
        itens_qs = itens_qs.filter(produto__categoria=categoria)

    vendas_canceladas = Venda.objects.filter(
        status='cancelado',
        data_criacao__date__gte=data_inicio,
        data_criacao__date__lte=data_fim,
    )
    if categoria in ('cantina', 'loja'):
        vendas_canceladas = vendas_canceladas.filter(itens__produto__categoria=categoria).distinct()

    total_bruto = vendas_qs.aggregate(total=Sum('total'))['total'] or Decimal('0.00')
    total_vendas = vendas_qs.count()
    ticket_medio = (total_bruto / total_vendas) if total_vendas else Decimal('0.00')
    total_itens = itens_qs.aggregate(total=Sum('quantidade'))['total'] or 0

    top_produtos = list(
        itens_qs.values('produto_id', 'produto__nome')
        .annotate(
            unidades=Sum('quantidade'),
            faturamento=Sum('subtotal'),
            vendas=Count('venda', distinct=True),
        )
        .order_by('-faturamento', '-unidades')[:10]
    )

    meios_pagamento = list(
        vendas_qs.values('meio_pagamento')
        .annotate(
            quantidade=Count('id'),
            valor=Sum('total'),
        )
        .order_by('-valor')
    )

    categorias_venda = list(
        itens_qs.values('produto__categoria')
        .annotate(
            unidades=Sum('quantidade'),
            faturamento=Sum('subtotal'),
        )
        .order_by('-faturamento')
    )

    if (data_fim - data_inicio).days > 62:
        serie_base = (
            vendas_qs.annotate(periodo=TruncMonth('data_criacao'))
            .values('periodo')
            .annotate(valor=Sum('total'), vendas=Count('id'))
            .order_by('periodo')
        )
        serie = [
            {
                'periodo': x['periodo'].strftime('%Y-%m'),
                'valor': str(x['valor'] or Decimal('0.00')),
                'vendas': int(x['vendas'] or 0),
            }
            for x in serie_base
        ]
    else:
        serie_base = (
            vendas_qs.annotate(periodo=TruncDate('data_criacao'))
            .values('periodo')
            .annotate(valor=Sum('total'), vendas=Count('id'))
            .order_by('periodo')
        )
        serie = [
            {
                'periodo': x['periodo'].isoformat(),
                'valor': str(x['valor'] or Decimal('0.00')),
                'vendas': int(x['vendas'] or 0),
            }
            for x in serie_base
        ]

    top_horarios = list(
        vendas_qs.values('data_criacao__hour')
        .annotate(
            vendas=Count('id'),
            valor=Sum('total'),
        )
        .order_by('-valor', '-vendas')[:6]
    )
    top_horarios = [
        {
            'hora': int(x['data_criacao__hour'] or 0),
            'vendas': int(x['vendas'] or 0),
            'valor': str(x['valor'] or Decimal('0.00')),
        }
        for x in top_horarios
    ]

    return Response(
        {
            'filtro': {
                'periodo': periodo,
                'categoria': categoria or 'todas',
                'data_inicio': data_inicio.isoformat(),
                'data_fim': data_fim.isoformat(),
            },
            'resumo': {
                'faturamento_total': str(total_bruto),
                'total_vendas_pagas': int(total_vendas),
                'ticket_medio': str(ticket_medio.quantize(Decimal('0.01'))),
                'total_itens_vendidos': int(total_itens),
                'total_vendas_canceladas': int(vendas_canceladas.count()),
                'media_vendas_dia': round(
                    total_vendas / max((data_fim - data_inicio).days + 1, 1), 2
                ),
            },
            'top_produtos': [
                {
                    'produto_id': x['produto_id'],
                    'produto_nome': x['produto__nome'],
                    'unidades': int(x['unidades'] or 0),
                    'faturamento': str(x['faturamento'] or Decimal('0.00')),
                    'vendas': int(x['vendas'] or 0),
                }
                for x in top_produtos
            ],
            'meios_pagamento': [
                {
                    'meio_pagamento': x['meio_pagamento'],
                    'quantidade': int(x['quantidade'] or 0),
                    'valor': str(x['valor'] or Decimal('0.00')),
                }
                for x in meios_pagamento
            ],
            'categorias': [
                {
                    'categoria': x['produto__categoria'],
                    'unidades': int(x['unidades'] or 0),
                    'faturamento': str(x['faturamento'] or Decimal('0.00')),
                }
                for x in categorias_venda
            ],
            'serie_faturamento': serie,
            'top_horarios': top_horarios,
        }
    )
