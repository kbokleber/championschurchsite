"""
Recibo público (não fiscal) e lembretes da loja/cantina.

- GET  /api/loja/recibo/<codigo>/                 → JSON da venda paga.
- POST /api/loja/recibo/<codigo>/enviar-whatsapp/ → envia link do recibo.
- POST /api/loja/reservas/<id>/enviar-whatsapp/   → lembrete de reserva pendente.
"""
import logging

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from eventos.evolution_go import enviar_texto_evolution_go, normalizar_telefone_whatsapp
from eventos.models import ConfiguracaoSite

from .models import CobrancaLoja, ReservaLoja

logger = logging.getLogger(__name__)


def _formatar_valor(valor) -> str:
    return f"R$ {float(valor or 0):.2f}".replace('.', ',')


def _serializar_recibo(cobranca: CobrancaLoja) -> dict:
    venda = cobranca.venda
    config = ConfiguracaoSite.get_config()
    itens = []
    categorias = set()
    for item in venda.itens.select_related('produto').all():
        produto = item.produto
        categoria = (getattr(produto, 'categoria', '') or '').strip() or 'loja'
        categorias.add(categoria)
        itens.append({
            'id': item.id,
            'nome': (getattr(produto, 'nome', '') or 'Produto').strip(),
            'descricao': (getattr(produto, 'descricao', '') or '').strip(),
            'categoria': categoria,
            'quantidade': int(item.quantidade or 1),
            'preco_unitario': float(item.preco_unitario or 0),
            'subtotal': float(item.subtotal or 0),
        })
    if categorias == {'cantina'}:
        titulo_secao = 'Cantina'
    elif categorias == {'loja'}:
        titulo_secao = 'Loja'
    else:
        titulo_secao = 'Loja / Cantina'

    atendente = ''
    u = getattr(venda, 'criado_por', None)
    if u is not None:
        try:
            atendente = (u.get_full_name() or u.get_username() or '').strip()
        except Exception:
            atendente = getattr(u, 'username', '') or ''

    return {
        'codigo': cobranca.codigo,
        'titulo_secao': titulo_secao,
        'data_pagamento': cobranca.data_pagamento.isoformat() if cobranca.data_pagamento else None,
        'data_criacao': cobranca.data_criacao.isoformat() if cobranca.data_criacao else None,
        'comprador_nome': (getattr(venda, 'comprador_nome', '') or '').strip(),
        'atendente_nome': atendente,
        'metodo_pagamento': (cobranca.metodo_pagamento or '').strip(),
        'total': float(cobranca.valor or 0),
        'itens': itens,
        'igreja': {
            'nome': (config.nome_igreja or 'Champions Church').strip(),
            'telefone': (config.telefone or '').strip(),
            'email': (config.email or '').strip(),
            'endereco': (config.endereco or '').strip(),
            'cidade': (config.cidade or '').strip(),
            'estado': (config.estado or '').strip(),
            'logo': config.logo.url if getattr(config, 'logo', None) else None,
        },
        'aviso': 'Documento não fiscal',
    }


@api_view(['GET'])
@permission_classes([AllowAny])
def recibo_loja_publico(request, codigo: str):
    """Detalhes do recibo (somente venda paga)."""
    try:
        cobranca = (
            CobrancaLoja.objects
            .select_related('venda', 'venda__criado_por')
            .prefetch_related('venda__itens__produto')
            .get(codigo=codigo)
        )
    except CobrancaLoja.DoesNotExist:
        return Response(
            {'error': 'Recibo não encontrado.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if cobranca.status != 'pago':
        return Response(
            {'error': 'Esta venda ainda não foi paga.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(_serializar_recibo(cobranca))


def _build_link_recibo(request, codigo: str) -> str:
    """
    Resolve a URL pública do recibo. Em produção (single-app) o domínio do
    request já basta. Em dev (Vite em :5173 → Django em :8000), o link precisa
    apontar para o frontend, então usamos:

      1) settings.FRONTEND_BASE_URL (se configurado).
      2) header Origin do request (admin chama do frontend, então o Origin
         é o domínio público do frontend).
      3) header Referer (fallback).
      4) request.build_absolute_uri (último recurso).
    """
    base = (getattr(settings, 'FRONTEND_BASE_URL', '') or '').strip().rstrip('/')
    if not base:
        origin = (request.META.get('HTTP_ORIGIN') or '').strip().rstrip('/')
        if origin:
            base = origin
    if not base:
        referer = (request.META.get('HTTP_REFERER') or '').strip()
        if referer:
            try:
                from urllib.parse import urlsplit, urlunsplit

                parts = urlsplit(referer)
                if parts.scheme and parts.netloc:
                    base = urlunsplit((parts.scheme, parts.netloc, '', '', '')).rstrip('/')
            except Exception:
                base = ''
    if base:
        return f'{base}/recibo/{codigo}/'
    return request.build_absolute_uri(f'/recibo/{codigo}/')


def _build_msg_whatsapp(template: str, contexto: dict) -> str:
    if not template:
        template = (
            "Olá{nome_saudacao}! Obrigado pela sua compra em {nome_igreja}.\n\n"
            "Pedido: {codigo}\n"
            "Total: R$ {total}\n"
            "Itens: {itens}\n\n"
            "Recibo (link): {link_recibo}\n\n"
            "Documento não fiscal."
        )
    out = template
    for chave, valor in contexto.items():
        out = out.replace('{' + chave + '}', str(valor))
    return out.strip()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def enviar_recibo_whatsapp(request, codigo: str):
    telefone_raw = (request.data.get('telefone') or '').strip()
    nome_cliente = (request.data.get('nome') or '').strip()
    if not telefone_raw:
        return Response(
            {'error': 'Telefone (WhatsApp) é obrigatório.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    telefone = normalizar_telefone_whatsapp(telefone_raw)
    if not telefone:
        return Response(
            {'error': 'Telefone inválido para WhatsApp.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        cobranca = (
            CobrancaLoja.objects
            .select_related('venda', 'venda__criado_por')
            .prefetch_related('venda__itens__produto')
            .get(codigo=codigo)
        )
    except CobrancaLoja.DoesNotExist:
        return Response(
            {'error': 'Cobrança não encontrada.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    if cobranca.status != 'pago':
        return Response(
            {'error': 'Esta venda ainda não foi paga.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    config = ConfiguracaoSite.get_config()
    instancia_loja = (getattr(config, 'evolution_api_instance_loja', '') or '').strip()
    api_key_loja = (getattr(config, 'evolution_api_key_loja', '') or '').strip()
    if not instancia_loja:
        return Response(
            {
                'error': (
                    'Instância WhatsApp da loja não está configurada. '
                    'Em Configurações → WhatsApp → Credenciais (Loja/Cantina), informe a instância.'
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    itens_resumo = ', '.join(
        f"{(i.produto.nome if i.produto else 'Item').strip()} x{int(i.quantidade or 1)}"
        for i in cobranca.venda.itens.select_related('produto').all()[:6]
    )
    primeiro_nome = nome_cliente.split()[0] if nome_cliente else ''
    contexto = {
        'nome_saudacao': f', {primeiro_nome}' if primeiro_nome else '',
        'nome_igreja': (config.nome_igreja or 'Champions Church').strip(),
        'codigo': cobranca.codigo,
        'total': _formatar_valor(cobranca.valor),
        'itens': itens_resumo or 'Compra',
        'link_recibo': _build_link_recibo(request, cobranca.codigo),
    }
    template = (getattr(config, 'wa_msg_recibo_loja', '') or '').strip()
    mensagem = _build_msg_whatsapp(template, contexto)

    resultado = enviar_texto_evolution_go(
        config,
        telefone,
        mensagem,
        instancia_override=instancia_loja,
        api_key_override=api_key_loja or None,
    )

    if resultado.get('entregue'):
        return Response({
            'success': True,
            'telefone': resultado.get('telefone'),
            'instancia': instancia_loja,
            'link_recibo': contexto['link_recibo'],
        })

    detalhe = (resultado.get('erro') or '')[:300]
    logger.warning(
        'Falha ao enviar recibo WhatsApp loja %s: motivo=%s http=%s erro=%s',
        cobranca.codigo,
        resultado.get('motivo'),
        resultado.get('http_status'),
        detalhe,
    )
    return Response(
        {
            'success': False,
            'motivo': resultado.get('motivo'),
            'http_status': resultado.get('http_status'),
            'detalhe': detalhe,
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _formatar_data_br(d) -> str:
    if not d:
        return ''
    try:
        return d.strftime('%d/%m/%Y')
    except Exception:
        return str(d)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def enviar_lembrete_reserva_whatsapp(request, reserva_id: int):
    """Envia lembrete de reserva pendente (loja/cantina) para um WhatsApp."""
    telefone_raw = (request.data.get('telefone') or '').strip()
    nome_input = (request.data.get('nome') or '').strip()
    if not telefone_raw:
        return Response(
            {'error': 'Telefone (WhatsApp) é obrigatório.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    telefone = normalizar_telefone_whatsapp(telefone_raw)
    if not telefone:
        return Response(
            {'error': 'Telefone inválido para WhatsApp.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        reserva = ReservaLoja.objects.select_related('produto').get(id=reserva_id)
    except ReservaLoja.DoesNotExist:
        return Response(
            {'error': 'Reserva não encontrada.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    nome_grupo = (reserva.nome or '').strip()
    if not nome_grupo:
        return Response(
            {'error': 'Reserva sem nome — não dá para enviar lembrete.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    grupo = (
        ReservaLoja.objects
        .select_related('produto')
        .filter(
            data=reserva.data,
            nome__iexact=nome_grupo,
            status__in=('pendente', 'em_cobranca'),
        )
        .order_by('id')
    )
    if not grupo.exists():
        return Response(
            {'error': 'Não há reservas pendentes para este nome nesta data.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    config = ConfiguracaoSite.get_config()
    instancia_loja = (getattr(config, 'evolution_api_instance_loja', '') or '').strip()
    api_key_loja = (getattr(config, 'evolution_api_key_loja', '') or '').strip()
    if not instancia_loja:
        return Response(
            {
                'error': (
                    'Instância WhatsApp da loja não está configurada. '
                    'Em Configurações → WhatsApp → Credenciais (Loja/Cantina), informe a instância.'
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    itens_resumo = ', '.join(
        f"{(r.produto.nome if r.produto else 'Item').strip()} x{int(r.quantidade or 1)}"
        for r in grupo[:10]
    )
    nome_destino = nome_input or nome_grupo
    primeiro_nome = nome_destino.split()[0] if nome_destino else ''

    contexto = {
        'nome_saudacao': f', {primeiro_nome}' if primeiro_nome else '',
        'nome_igreja': (config.nome_igreja or 'Champions Church').strip(),
        'nome': nome_destino,
        'itens': itens_resumo or 'sua reserva',
        'data': _formatar_data_br(reserva.data),
    }

    template = (getattr(config, 'wa_msg_reserva_loja', '') or '').strip()
    if not template:
        template = (
            "Olá{nome_saudacao}! Aqui é da {nome_igreja}.\n\n"
            "Existe uma reserva em nome de {nome} para o dia {data}: {itens}.\n"
            "Passe na cantina para retirar e pagar quando puder. Obrigado!"
        )
    mensagem = template
    for chave, valor in contexto.items():
        mensagem = mensagem.replace('{' + chave + '}', str(valor))

    resultado = enviar_texto_evolution_go(
        config,
        telefone,
        mensagem.strip(),
        instancia_override=instancia_loja,
        api_key_override=api_key_loja or None,
    )
    if resultado.get('entregue'):
        return Response({
            'success': True,
            'telefone': resultado.get('telefone'),
            'instancia': instancia_loja,
            'itens_enviados': itens_resumo,
        })
    detalhe = (resultado.get('erro') or '')[:300]
    logger.warning(
        'Falha lembrete reserva WhatsApp (id=%s): motivo=%s http=%s erro=%s',
        reserva.id,
        resultado.get('motivo'),
        resultado.get('http_status'),
        detalhe,
    )
    return Response(
        {
            'success': False,
            'motivo': resultado.get('motivo'),
            'http_status': resultado.get('http_status'),
            'detalhe': detalhe,
        },
        status=status.HTTP_400_BAD_REQUEST,
    )
