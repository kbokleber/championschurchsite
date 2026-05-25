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

from eventos.evolution_go import (
    enviar_texto_evolution_go,
    diagnosticar_conexao_evolution_go,
    normalizar_telefone_whatsapp,
)
from eventos.models import ConfiguracaoSite

from .models import CobrancaLoja, ReservaLoja

logger = logging.getLogger(__name__)


def _mensagem_diagnostico_whatsapp_loja(diagnostico: dict) -> str:
    motivo = (diagnostico.get('motivo') or '').strip()
    if motivo == 'ok':
        return ''
    if motivo == 'instancia_nao_configurada':
        return (
            'Instância WhatsApp da cantina não está configurada. '
            'Em Configurações → WhatsApp → Credenciais (Loja/Cantina), informe a instância e teste a conexão.'
        )
    if motivo == 'token_nao_configurado':
        return (
            'Token WhatsApp da cantina não está configurado. '
            'Em Configurações → WhatsApp → Credenciais (Loja/Cantina), informe a API key da instância.'
        )
    if motivo == 'configuracao_incompleta':
        return (
            'WhatsApp da cantina incompleto. '
            'Configure a URL da API Evolution, a instância e o token em Configurações → WhatsApp (Loja/Cantina).'
        )
    if motivo == 'whatsapp_desconectado':
        return (
            'WhatsApp da cantina está desconectado. '
            'Acesse Configurações → WhatsApp → Loja/Cantina, teste a conexão e escaneie o QR Code para conectar.'
        )
    if motivo == 'nao_autorizado':
        return (
            'Credencial WhatsApp da cantina recusada pelo servidor. '
            'Verifique a API key da instância em Configurações → WhatsApp (Loja/Cantina).'
        )
    if motivo == 'requisicao_erro':
        return (
            'Não foi possível contactar o servidor WhatsApp (Evolution). '
            'Confira se a URL da API está correta e se o serviço está online.'
        )
    detalhe = (diagnostico.get('detalhe') or '').strip()
    if detalhe:
        return detalhe[:400]
    return 'WhatsApp da cantina indisponível. Verifique a conexão em Configurações → WhatsApp (Loja/Cantina).'


def _diagnostico_whatsapp_loja_config(config) -> dict:
    instancia_loja = (getattr(config, 'evolution_api_instance_loja', '') or '').strip()
    api_key_loja = (getattr(config, 'evolution_api_key_loja', '') or '').strip()
    api_key_global = (getattr(config, 'evolution_api_key', '') or '').strip()
    api_url = (getattr(config, 'evolution_api_url', '') or '').strip()
    api_key_efetiva = api_key_loja or api_key_global

    if not instancia_loja:
        return {
            'ok': False,
            'motivo': 'instancia_nao_configurada',
            'mensagem': _mensagem_diagnostico_whatsapp_loja({'motivo': 'instancia_nao_configurada'}),
            'instancia': None,
        }
    if not api_url:
        return {
            'ok': False,
            'motivo': 'configuracao_incompleta',
            'mensagem': _mensagem_diagnostico_whatsapp_loja({'motivo': 'configuracao_incompleta'}),
            'instancia': instancia_loja,
        }
    if not api_key_efetiva:
        return {
            'ok': False,
            'motivo': 'token_nao_configurado',
            'mensagem': _mensagem_diagnostico_whatsapp_loja({'motivo': 'token_nao_configurado'}),
            'instancia': instancia_loja,
        }

    class _CfgTeste:
        pass

    cfg_teste = _CfgTeste()
    cfg_teste.evolution_api_url = api_url
    cfg_teste.evolution_api_key = api_key_efetiva
    cfg_teste.evolution_api_instance = instancia_loja

    diagnostico = diagnosticar_conexao_evolution_go(cfg_teste)
    diagnostico['instancia'] = instancia_loja
    diagnostico['mensagem'] = _mensagem_diagnostico_whatsapp_loja(diagnostico)
    return diagnostico


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def diagnostico_whatsapp_loja(request):
    """Verifica se a instância WhatsApp da loja/cantina está configurada e conectada."""
    config = ConfiguracaoSite.get_config()
    diagnostico = _diagnostico_whatsapp_loja_config(config)
    http_status = status.HTTP_200_OK if diagnostico.get('ok') else status.HTTP_400_BAD_REQUEST
    return Response(diagnostico, status=http_status)


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

    config = ConfiguracaoSite.get_config()
    diagnostico = _diagnostico_whatsapp_loja_config(config)
    if not diagnostico.get('ok'):
        return Response(
            {
                'success': False,
                'error': diagnostico.get('mensagem') or 'WhatsApp da cantina indisponível.',
                'motivo': diagnostico.get('motivo'),
                'detalhe': diagnostico.get('detalhe'),
            },
            status=status.HTTP_400_BAD_REQUEST,
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
            status__in=('pendente', 'em_cobranca'),
        )
    )
    if reserva.lote_reserva_id:
        grupo = grupo.filter(lote_reserva=reserva.lote_reserva)
    else:
        grupo = grupo.filter(nome__iexact=nome_grupo, pk=reserva.pk)
    grupo = grupo.order_by('id')
    if not grupo.exists():
        return Response(
            {'error': 'Não há reservas pendentes para este nome nesta data.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    instancia_loja = (getattr(config, 'evolution_api_instance_loja', '') or '').strip()
    api_key_loja = (getattr(config, 'evolution_api_key_loja', '') or '').strip()

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
