"""
Views da API REST para Champions Church.
"""

import json
import requests
import threading
import logging
from collections import Counter
from io import BytesIO

from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly, AllowAny
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Q, Prefetch
from django.http import HttpResponse
from django.contrib.auth.models import User
from django.conf import settings
from .models import (
    Membro, Evento, Inscricao, Contato, ConfiguracaoSite, 
    CategoriaParticipante, Cobranca, CobrancaItem,
    PermissaoMenu, Grupo, WebhookEventLog,
    FormularioInscricao, CampoFormulario, RespostaCampoInscricao,
)
from .utils_imagem import substituir_fundo_logo_por_navy
from .cobranca_inscricao import (
    ajustar_cobrancas_ao_cancelar_inscricao,
    recalcular_cobranca_apos_mudanca_itens,
)
from .serializers import (
    MembroSerializer, MembroResumoSerializer,
    EventoSerializer, EventoListaSerializer,
    InscricaoSerializer, InscricaoAdminSerializer, ContatoSerializer,
    UserSerializer, ConfiguracaoSiteSerializer, ConfiguracaoSitePublicSerializer,
    CategoriaParticipanteSerializer, CobrancaSerializer,
    PermissaoMenuSerializer, GrupoSerializer, UsuarioAdminSerializer,
    FormularioInscricaoSerializer, FormularioInscricaoResumoSerializer,
    RespostaCampoInscricaoAdminSerializer,
    validar_respostas_formulario,
)

logger = logging.getLogger(__name__)


def _evolution_integracao_json(config):
    """
    URL e instância cadastradas no admin, para o corpo JSON do webhook.
    A API key não vai no JSON (fica nos headers). Automatizadores costumam
    mapear só o body e ignorar headers customizados — isso evita instância "antiga".
    """
    url = (getattr(config, 'evolution_api_url', None) or '').strip()
    inst = (getattr(config, 'evolution_api_instance', None) or '').strip()
    if not url and not inst:
        return None
    out = {}
    if url:
        out['api_url'] = url
    if inst:
        out['instance'] = inst
    return out or None


def enviar_webhook_inscricao(dados_webhook):
    """
    Envia webhook de inscrição de forma assíncrona.
    Chamado em uma thread separada para não bloquear a resposta.
    """
    print('>>> WEBHOOK: Iniciando envio de webhook...')
    try:
        config = ConfiguracaoSite.get_config()
        config.refresh_from_db()

        if not config.webhook_ativo or not config.webhook_inscricao:
            print(f'>>> WEBHOOK: Inativo ou não configurado. Ativo: {config.webhook_ativo}, URL: {config.webhook_inscricao}')
            logger.info('Webhook não configurado ou inativo')
            return
        
        print(f'>>> WEBHOOK: URL configurada: {config.webhook_inscricao}')
        
        # Monta a URL completa do QR Code
        base_url = dados_webhook.get('base_url', 'http://localhost:8000')
        qrcode_path = dados_webhook.get('qrcode_path')
        qrcode_url = f"{base_url}{qrcode_path}" if qrcode_path else None
        
        # Processar acompanhantes com URLs completas dos QR Codes
        acompanhantes_webhook = []
        for acomp in dados_webhook.get('acompanhantes', []):
            acomp_qrcode = acomp.get('qrcode')
            acomp_qrcode_url = f"{base_url}{acomp_qrcode}" if acomp_qrcode else None
            acompanhantes_webhook.append({
                'id': acomp.get('id'),
                'nome': acomp.get('nome'),
                'codigo': acomp.get('codigo'),
                'qrcode_url': acomp_qrcode_url,
            })
        
        # Payload do webhook
        payload = {
            'tipo': dados_webhook.get('tipo', 'nova_inscricao'),
            'timestamp': timezone.now().isoformat(),
            
            # Dados do responsável (quem fez a inscrição)
            'responsavel': {
                'id': dados_webhook.get('participante_id'),
                'nome': dados_webhook.get('nome'),
                'telefone': dados_webhook.get('telefone'),
                'telefone_formatado': dados_webhook.get('telefone_formatado'),
                'email': dados_webhook.get('email'),
                'senha': dados_webhook.get('senha'),
                'novo_cadastro': dados_webhook.get('novo_cadastro', False),
            },
            
            # Inscrição do responsável
            'inscricao': {
                'id': dados_webhook.get('inscricao_id'),
                'codigo': dados_webhook.get('codigo'),
                'qrcode_url': qrcode_url,
                'status': 'confirmada',
            },
            
            # Lista de acompanhantes
            'acompanhantes': acompanhantes_webhook,
            'total_inscritos': dados_webhook.get('total_inscritos', 1),
            
            # Dados do evento
            'evento': {
                'id': dados_webhook.get('evento_id'),
                'titulo': dados_webhook.get('evento_titulo'),
                'data_inicio': dados_webhook.get('evento_data_inicio'),
                'data_fim': dados_webhook.get('evento_data_fim'),
                'local': dados_webhook.get('evento_local'),
                'endereco': dados_webhook.get('evento_endereco'),
                'evento_pago': dados_webhook.get('evento_pago', False),
                'valor_unitario': str(dados_webhook.get('evento_valor')) if dados_webhook.get('evento_valor') else None,
            },
            
            # Valor total a pagar (responsável + acompanhantes)
            'valor_total': str(dados_webhook.get('valor_total')) if dados_webhook.get('valor_total') else None,
            'pagamento_confirmado': dados_webhook.get('pagamento_confirmado', False),
            
            # Dados da igreja
            'igreja': {
                'nome': config.nome_igreja,
                'telefone': config.telefone,
                'email': config.email,
            }
        }
        evo_json = _evolution_integracao_json(config)
        if evo_json:
            payload['integracao_evolution'] = evo_json
        
        # Preparar headers com informações da Evolution API
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'ChampionsChurch-Webhook/1.0'
        }
        
        # Adicionar informações da Evolution API nos headers
        if config.evolution_api_url:
            headers['X-Evolution-API-URL'] = config.evolution_api_url
        if config.evolution_api_key:
            headers['X-Evolution-API-Key'] = config.evolution_api_key
        if config.evolution_api_instance:
            headers['X-Evolution-Instance'] = config.evolution_api_instance
        
        # Envia o webhook
        print(f'>>> WEBHOOK: Enviando para {config.webhook_inscricao}...')
        response = requests.post(
            config.webhook_inscricao,
            json=payload,
            headers=headers,
            timeout=30
        )
        
        print(f'>>> WEBHOOK: Resposta: {response.status_code}')
        logger.info(f'Webhook enviado: {response.status_code} - {config.webhook_inscricao}')
        
    except Exception as e:
        print(f'>>> WEBHOOK ERRO: {str(e)}')
        logger.error(f'Erro ao enviar webhook: {str(e)}')


def _resposta_2xx_json_indica_falha(response):
    """
    Alguns orquestradores (ex.: n8n com "continuar com erro") respondem 200, mas o JSON
    descreve falha no passo de envio. Nesse caso trataremos como não entregue.
    """
    if not (200 <= response.status_code < 300):
        return False
    try:
        data = response.json()
    except (ValueError, TypeError):
        return False
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and _resposta_2xx_item_dict_indica_falha(item):
                return True
        return False
    if isinstance(data, dict) and _resposta_2xx_item_dict_indica_falha(data):
        return True
    return False


def _resposta_2xx_item_dict_indica_falha(d: dict) -> bool:
    if d.get('success') is False or d.get('ok') is False:
        return True
    if d.get('name') == 'AxiosError':
        return True
    st = d.get('status')
    if isinstance(st, int) and st >= 400:
        return True
    msg = d.get('message')
    if isinstance(msg, str) and msg.strip():
        s = msg
        if 'Request failed' in s or (s.strip().startswith('5') and ' -' in s) or s.strip().startswith('500 '):
            return True
    err = d.get('error')
    if err is not None and err is not False:
        if isinstance(err, (str, int, float)) and str(err).strip() != '':
            return True
        if isinstance(err, (dict, list)) and err:
            return True
    for key in ('json', 'data', 'response', 'body'):
        nested = d.get(key)
        if isinstance(nested, dict) and _resposta_2xx_item_dict_indica_falha(nested):
            return True
    return False


def enviar_webhook_reset_senha(dados_webhook):
    """
    Envia webhook de "esqueci minha senha" (síncrono) para a mesma URL de inscrição.

    Retorno:
        entregue (bool): True se a resposta HTTP for 2xx e o corpo não indicar falha
        motivo (str): webhook_inativo | url_nao_configurada | corpo_indica_falha | http_erro | requisicao_erro
        detalhe (str|None): resumo para log (e opcional envio_ao_cliente, sem vazar se não cadastrado)
    """
    resultado = {'entregue': False, 'motivo': 'requisicao_erro', 'http_status': None, 'url_usada': None, 'erro': None}
    try:
        config = ConfiguracaoSite.get_config()
        config.refresh_from_db()
        if not config.webhook_ativo:
            logger.info('Webhook inativo - reset senha: não enviado (webhook_ativo=False)')
            resultado['motivo'] = 'webhook_inativo'
            return resultado
        url = (getattr(config, 'webhook_inscricao', None) or '').strip()
        if not url:
            logger.info('Nenhuma URL: webhook_inscricao vazio')
            resultado['motivo'] = 'url_nao_configurada'
            return resultado
        resultado['url_usada'] = url
        payload = {
            'tipo': 'reset_senha',
            'timestamp': timezone.now().isoformat(),
            'participante_id': dados_webhook.get('participante_id'),
            'nome': dados_webhook.get('nome'),
            'telefone': dados_webhook.get('telefone'),
            'telefone_formatado': dados_webhook.get('telefone_formatado'),
            'email': dados_webhook.get('email'),
            'senha': dados_webhook.get('senha'),
        }
        evo_json = _evolution_integracao_json(config)
        if evo_json:
            payload['integracao_evolution'] = evo_json

        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'ChampionsChurch-Webhook/1.0'
        }
        if config.evolution_api_url:
            headers['X-Evolution-API-URL'] = config.evolution_api_url
        if config.evolution_api_key:
            headers['X-Evolution-API-Key'] = config.evolution_api_key
        if config.evolution_api_instance:
            headers['X-Evolution-Instance'] = config.evolution_api_instance

        logger.info(
            'Enviando webhook reset_senha para %s (evolution_instance=%r)',
            url,
            (config.evolution_api_instance or '')[:80],
        )
        response = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=30
        )
        resultado['http_status'] = response.status_code
        if 200 <= response.status_code < 300:
            if _resposta_2xx_json_indica_falha(response):
                body_preview = (response.text or '')[:500]
                resultado['erro'] = body_preview
                resultado['motivo'] = 'corpo_indica_falha'
                logger.error(
                    'Webhook reset_senha: HTTP 2xx mas resposta indica falha (corpo) - %s - %s',
                    url, body_preview
                )
            else:
                resultado['entregue'] = True
                resultado['motivo'] = 'ok'
                logger.info('Webhook reset_senha OK: HTTP %s - %s', response.status_code, url)
        else:
            resultado['motivo'] = 'http_erro'
            body_preview = (response.text or '')[:500]
            resultado['erro'] = body_preview
            logger.error(
                'Webhook reset_senha falhou: HTTP %s - %s - corpo: %s',
                response.status_code, url, body_preview
            )
    except Exception as e:
        resultado['motivo'] = 'requisicao_erro'
        resultado['erro'] = str(e)
        logger.error('Exceção ao enviar webhook reset_senha: %s', e, exc_info=True)
    return resultado


def _payload_evento_webhook(evento, acao):
    """Monta o payload para o webhook de eventos (evento pode ser instância ou dict)."""
    if hasattr(evento, 'id'):
        return {
            'tipo': 'evento',
            'acao': acao,
            'timestamp': timezone.now().isoformat(),
            'evento': {
                'id': evento.id,
                'titulo': evento.titulo,
                'tipo': getattr(evento, 'tipo', None),
                'data_inicio': evento.data_inicio.isoformat() if evento.data_inicio else None,
                'data_fim': evento.data_fim.isoformat() if evento.data_fim else None,
                'local': evento.local,
                'endereco': getattr(evento, 'endereco', '') or '',
                'vagas': evento.vagas,
                'status': evento.status,
                'evento_pago': getattr(evento, 'evento_pago', False),
                'valor_inscricao': str(evento.valor_inscricao) if getattr(evento, 'valor_inscricao', None) is not None else None,
                'inscricao_inicio': evento.inscricao_inicio.isoformat() if getattr(evento, 'inscricao_inicio', None) else None,
                'inscricao_fim': evento.inscricao_fim.isoformat() if getattr(evento, 'inscricao_fim', None) else None,
                'destaque': getattr(evento, 'destaque', False),
            }
        }
    # evento já é dict (ex.: após exclusão)
    return {
        'tipo': 'evento',
        'acao': acao,
        'timestamp': timezone.now().isoformat(),
        'evento': evento,
    }


def enviar_webhook_evento(evento, acao):
    """
    Envia webhook de eventos (criado/atualizado/excluído) de forma assíncrona.
    Usa a mesma URL de inscrição (webhook_inscricao).
    """
    try:
        config = ConfiguracaoSite.get_config()
        config.refresh_from_db()
        url = (getattr(config, 'webhook_inscricao', None) or '').strip()
        if not config.webhook_ativo or not url:
            logger.info('Webhook de eventos: inativo ou URL de inscrição não configurada')
            return
        payload = _payload_evento_webhook(evento, acao)
        evo_json = _evolution_integracao_json(config)
        if evo_json:
            payload['integracao_evolution'] = evo_json
        headers = {'Content-Type': 'application/json', 'User-Agent': 'ChampionsChurch-Webhook/1.0'}
        if config.evolution_api_url:
            headers['X-Evolution-API-URL'] = config.evolution_api_url
        if config.evolution_api_key:
            headers['X-Evolution-API-Key'] = config.evolution_api_key
        if config.evolution_api_instance:
            headers['X-Evolution-Instance'] = config.evolution_api_instance
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        logger.info(f'Webhook evento ({acao}) enviado: {response.status_code} - {url}')
    except Exception as e:
        logger.error(f'Erro ao enviar webhook evento: {str(e)}')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    """Retorna os dados do usuário autenticado."""
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


# ============================================
# AUTENTICAÇÃO DE PARTICIPANTES
# ============================================

# Status de evento considerados "ativos" para exibir em Meus Ingressos e permitir check-in
EVENTO_STATUS_ATIVOS = ['agendado', 'em_andamento']


def _serializar_ingressos(membro):
    """Helper para serializar ingressos de um membro, incluindo acompanhantes.
    Retorna todos os ingressos (ativos e já realizados); o frontend filtra por data.
    QR codes de eventos inativos continuam inválidos no check-in.
    """
    # Inscrições próprias do membro (não acompanhantes), todas (ativo/finalizado/cancelado)
    inscricoes = Inscricao.objects.filter(
        membro=membro,
        status__in=['confirmada', 'pendente'],
        is_acompanhante=False
    ).select_related('evento').order_by('-evento__data_inicio')
    
    ingressos = []
    for inscricao in inscricoes:
        # Buscar acompanhantes desta inscrição (mesmo evento, responsável = membro)
        acompanhantes = Inscricao.objects.filter(
            evento=inscricao.evento,
            responsavel=membro,
            is_acompanhante=True,
            status__in=['confirmada', 'pendente']
        ).select_related('membro')
        
        acompanhantes_lista = []
        valor_total_acompanhantes = 0
        for acomp in acompanhantes:
            valor_acomp = float(acomp.valor_inscricao) if acomp.valor_inscricao else 0
            valor_total_acompanhantes += valor_acomp
            acompanhantes_lista.append({
                'id': acomp.id,
                'nome': acomp.membro.nome,
                'codigo': acomp.codigo,
                'qrcode': acomp.qrcode.url if acomp.qrcode else None,
                'presente': acomp.presente,
                'data_checkin': timezone.localtime(acomp.data_checkin).strftime('%d/%m/%Y %H:%M') if acomp.data_checkin else None,
                'categoria': acomp.categoria.nome if acomp.categoria else 'Adulto',
                'valor': valor_acomp,
                'status_pagamento': acomp.status_pagamento,
            })
        
        # Calcular valor total (responsável + acompanhantes)
        valor_responsavel = float(inscricao.valor_inscricao) if inscricao.valor_inscricao else 0
        valor_total = valor_responsavel + valor_total_acompanhantes
        
        # Verificar se pagamento está pendente (responsável OU cobrança de acompanhantes)
        pagamento_pendente = inscricao.status_pagamento == 'pendente'
        cobranca_id = None
        
        # Cobrança ligada à inscrição do responsável
        cobranca_item = CobrancaItem.objects.filter(
            inscricao=inscricao,
            cobranca__status='pendente'
        ).select_related('cobranca').first()
        if cobranca_item:
            cobranca_id = cobranca_item.cobranca.id
            pagamento_pendente = True
        
        # Cobrança só de acompanhantes (ex.: adicionou Nilma depois; responsável já pagou)
        if cobranca_id is None:
            cobranca_acomp = Cobranca.objects.filter(
                membro=membro,
                evento=inscricao.evento,
                status='pendente'
            ).first()
            if cobranca_acomp:
                cobranca_id = cobranca_acomp.id
                pagamento_pendente = True
                # Mostrar só o valor que falta pagar (esta cobrança), não somar ao que já foi pago
                valor_total = float(cobranca_acomp.valor)
        
        dt_inicio = timezone.localtime(inscricao.evento.data_inicio)
        dt_fim = timezone.localtime(inscricao.evento.data_fim) if inscricao.evento.data_fim else None
        ingressos.append({
            'id': inscricao.id,
            'codigo': inscricao.codigo,
            # QR Code só aparece se pagamento não estiver pendente
            'qrcode': inscricao.qrcode.url if inscricao.qrcode and not pagamento_pendente else None,
            'evento': {
                'id': inscricao.evento.id,
                'titulo': inscricao.evento.titulo,
                'data_inicio': dt_inicio.strftime('%d/%m/%Y %H:%M'),
                'data_inicio_iso': dt_inicio.isoformat(),
                'data_fim': dt_fim.strftime('%d/%m/%Y %H:%M') if dt_fim else None,
                'data_fim_iso': dt_fim.isoformat() if dt_fim else None,
                'local': inscricao.evento.local,
                'endereco': inscricao.evento.endereco,
                'imagem': inscricao.evento.imagem.url if inscricao.evento.imagem else None,
                'status': inscricao.evento.status,
                'evento_pago': inscricao.evento.evento_pago,
                'valor_inscricao': float(inscricao.evento.valor_inscricao) if inscricao.evento.valor_inscricao else None,
            },
            'data_inscricao': timezone.localtime(inscricao.data_inscricao).strftime('%d/%m/%Y %H:%M'),
            'presente': inscricao.presente,
            'data_checkin': timezone.localtime(inscricao.data_checkin).strftime('%d/%m/%Y %H:%M') if inscricao.data_checkin else None,
            'status_pagamento': inscricao.status_pagamento,
            'valor': valor_responsavel,
            'valor_total': valor_total,
            'pagamento_pendente': pagamento_pendente,
            'cobranca_id': cobranca_id,  # ID da cobrança pendente (se existir)
            'acompanhantes': acompanhantes_lista,
        })
    return ingressos


@api_view(['GET'])
@permission_classes([AllowAny])
def buscar_participante_por_telefone(request):
    """
    Busca participante pelo telefone para auto-preenchimento no formulário de inscrição.
    Retorna apenas dados públicos (nome e email), sem senha.
    Se evento_id for informado, verifica se o participante já está inscrito no evento.
    """
    try:
        telefone = request.query_params.get('telefone', '')
        evento_id = request.query_params.get('evento_id', '')
        
        if not telefone:
            return Response(
                {'error': 'Telefone é obrigatório'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Normalizar telefone (apenas números)
        telefone_normalizado = Membro.normalizar_telefone(telefone)
        
        if len(telefone_normalizado) < 10:
            return Response(
                {'encontrado': False, 'message': 'Telefone incompleto'},
                status=status.HTTP_200_OK
            )
        
        # Buscar membro pelo telefone (titular ou acompanhante com telefone cadastrado)
        try:
            membro = Membro.objects.get(telefone=telefone_normalizado)
            response_data = {
                'encontrado': True,
                'participante': {
                    'id': membro.id,
                    'nome': membro.nome,
                    'email': membro.email or '',
                }
            }
            
            # Verificar se já está inscrito neste evento (quando evento_id informado)
            if evento_id:
                try:
                    evento_obj = Evento.objects.get(id=evento_id)
                    inscricao = Inscricao.objects.filter(
                        membro=membro,
                        evento=evento_obj,
                        is_acompanhante=False,
                        status__in=['confirmada', 'pendente']
                    ).select_related('evento').first()
                    
                    if inscricao:
                        acompanhantes = Inscricao.objects.filter(
                            evento=evento_obj,
                            responsavel=membro,
                            is_acompanhante=True,
                            status__in=['confirmada', 'pendente']
                        ).select_related('membro', 'categoria')
                        acompanhantes_lista = [
                            {
                                'nome': a.membro.nome,
                                'categoria': a.categoria.nome if a.categoria else 'Adulto',
                            }
                            for a in acompanhantes
                        ]
                        valor_responsavel = float(inscricao.valor_inscricao or 0)
                        valor_total = valor_responsavel + sum(
                            float(a.valor_inscricao or 0) for a in acompanhantes
                        )
                        cobranca_pendente = Cobranca.objects.filter(
                            membro=membro,
                            evento=evento_obj,
                            status='pendente'
                        ).first()
                        
                        response_data['ja_inscrito'] = True
                        response_data['inscricao'] = {
                            'id': inscricao.id,
                            'status_pagamento': inscricao.status_pagamento,
                            'valor': valor_responsavel,
                            'valor_total': valor_total,
                        }
                        response_data['acompanhantes'] = acompanhantes_lista
                        if cobranca_pendente:
                            response_data['cobranca'] = {
                                'id': cobranca_pendente.id,
                                'codigo': cobranca_pendente.codigo,
                                'valor': float(cobranca_pendente.valor),
                                'status': cobranca_pendente.status,
                            }
                except (Evento.DoesNotExist, ValueError):
                    pass
            
            return Response(response_data)
        except Membro.DoesNotExist:
            return Response({
                'encontrado': False,
                'message': 'Participante não encontrado'
            })
        except Exception as e:
            logger.error(f"Erro ao buscar participante: {e}", exc_info=True)
            return Response(
                {'error': 'Erro ao buscar participante'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    except Exception as e:
        logger.error(f"Erro geral em buscar_participante_por_telefone: {e}", exc_info=True)
        return Response(
            {'error': 'Erro ao processar requisição'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def participante_login(request):
    """
    Login de participante com telefone + senha.
    Retorna token JWT para acesso à área do participante.
    """
    telefone = request.data.get('telefone', '')
    senha = request.data.get('senha', '')
    
    if not telefone or not senha:
        return Response(
            {'error': 'Telefone e senha são obrigatórios'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Normalizar telefone (apenas números)
    telefone_normalizado = Membro.normalizar_telefone(telefone)
    
    # Buscar membro pelo telefone
    try:
        membro = Membro.objects.get(telefone=telefone_normalizado)
    except Membro.DoesNotExist:
        return Response(
            {'error': 'Telefone ou senha incorretos'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    # Verificar senha
    if not membro.verificar_senha(senha):
        return Response(
            {'error': 'Telefone ou senha incorretos'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    # Gerar token JWT customizado para participante
    # Usamos um token simples baseado no ID do membro
    # Token válido por 1 ano para evitar logout automático
    import jwt
    from django.conf import settings
    from datetime import datetime, timedelta
    
    now = datetime.utcnow()
    payload = {
        'participante_id': membro.id,
        'telefone': membro.telefone,
        'nome': membro.nome,
        'exp': int((now + timedelta(days=365)).timestamp()),  # Token válido por 1 ano
        'iat': int(now.timestamp()),
        'type': 'participante'
    }
    
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
    
    return Response({
        'success': True,
        'token': token,
        'participante': {
            'id': membro.id,
            'nome': membro.nome,
            'telefone': membro.telefone,
            'email': membro.email,
        },
        'ingressos': _serializar_ingressos(membro)
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def participante_esqueci_senha(request):
    """
    Esqueci minha senha: gera uma nova senha e só persiste no banco após a
    integração (webhook ``reset_senha`` em ``webhook_inscricao``) retornar
    entregue/positivo. Assim a senha antiga continua válida se o envio falhar.
    Resposta opaca se o telefone não existir.
    """
    telefone = (request.data.get('telefone') or '').strip()
    if not telefone:
        return Response(
            {'success': True, 'message': 'Se este número estiver cadastrado, você receberá a senha em instantes.'},
            status=status.HTTP_200_OK
        )
    telefone_normalizado = Membro.normalizar_telefone(telefone)
    if len(telefone_normalizado) < 10:
        return Response(
            {'success': True, 'message': 'Se este número estiver cadastrado, você receberá a senha em instantes.'},
            status=status.HTTP_200_OK
        )
    try:
        membro = Membro.objects.get(telefone=telefone_normalizado)
    except Membro.DoesNotExist:
        return Response(
            {'success': True, 'message': 'Se este número estiver cadastrado, você receberá a senha em instantes.'},
            status=status.HTTP_200_OK
        )
    # Formatar telefone para o payload (não exige save)
    telefone_formatado = membro.telefone
    if len(membro.telefone) == 11:
        telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:7]}-{membro.telefone[7:]}"
    elif len(membro.telefone) == 10:
        telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:6]}-{membro.telefone[6:]}"

    senha_hash_antes = membro.senha
    senha_texto_antes = membro.senha_texto
    nova_senha = membro.definir_senha()  # só em memória; persistimos só se o webhook for OK
    dados_webhook = {
        'participante_id': membro.id,
        'nome': membro.nome,
        'telefone': membro.telefone,
        'telefone_formatado': telefone_formatado,
        'email': membro.email or '',
        'senha': nova_senha,
    }
    res_wh = enviar_webhook_reset_senha(dados_webhook)
    entregue = bool(res_wh.get('entregue'))
    if entregue:
        membro.save(update_fields=['senha', 'senha_texto'])
        message = (
            'Pronto! Sua senha foi alterada e a mensagem com a nova senha foi enviada. '
            'Confira no seu celular.'
        )
    else:
        membro.senha = senha_hash_antes
        membro.senha_texto = senha_texto_antes
        motivo = (res_wh.get('motivo') or '') if isinstance(res_wh, dict) else ''
        if motivo in ('webhook_inativo', 'url_nao_configurada'):
            message = (
                'Não foi possível enviar a nova senha agora: o aviso no celular não está disponível. '
                'Sua senha permanece a mesma. Fale com a equipe da igreja se precisar de acesso imediato.'
            )
        else:
            message = (
                'Não foi possível enviar a nova senha agora. Sua senha permanece a mesma. '
                'Tente de novo em alguns minutos; se continuar, fale com a equipe da igreja.'
            )
    return Response(
        {
            'success': True,
            'message': message,
            'envio_integracao_ok': entregue,
            'mensagem_enviada': entregue,
        },
        status=status.HTTP_200_OK
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def participante_registro(request):
    """
    Registra um novo participante e faz inscrição no evento.
    Se o telefone já existe, faz login e adiciona a inscrição.
    Suporta acompanhantes (apenas nome).
    Retorna a senha gerada (para envio via WhatsApp).
    """
    import jwt
    from datetime import datetime, timedelta
    
    nome = (request.data.get('nome') or '').strip()
    telefone = (request.data.get('telefone') or '').strip()
    email = (request.data.get('email') or '').strip() or None
    evento_id = request.data.get('evento_id')
    acompanhantes = request.data.get('acompanhantes', [])  # Lista de {nome, categoria_id}
    # Quando enviado via multipart/form-data (upload de arquivos do formulário
    # dinâmico), o campo chega como string JSON. Parse defensivo.
    if isinstance(acompanhantes, str):
        try:
            acompanhantes = json.loads(acompanhantes) if acompanhantes else []
        except (ValueError, TypeError):
            acompanhantes = []
    if not isinstance(acompanhantes, list):
        acompanhantes = []
    
    if not nome or not telefone:
        return Response(
            {'error': 'Nome e telefone são obrigatórios'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if not evento_id:
        return Response(
            {'error': 'ID do evento é obrigatório'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Normalizar telefone
    telefone_normalizado = Membro.normalizar_telefone(telefone)
    
    if len(telefone_normalizado) < 10:
        return Response(
            {'error': 'Telefone inválido. Digite o DDD + número.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Verificar se evento existe
    try:
        evento = Evento.objects.get(id=evento_id)
    except Evento.DoesNotExist:
        return Response(
            {'error': 'Evento não encontrado'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Verificar se inscrições estão abertas
    if not evento.inscricoes_abertas:
        return Response(
            {'error': 'Inscrições encerradas para este evento'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Buscar ou criar membro principal
    novo_cadastro = False
    senha_gerada = None
    
    try:
        membro = Membro.objects.get(telefone=telefone_normalizado)
        # Atualizar nome se diferente
        if membro.nome != nome:
            membro.nome = nome
            membro.save(update_fields=['nome'])
    except Membro.DoesNotExist:
        # Criar novo membro
        membro = Membro(
            nome=nome,
            telefone=telefone_normalizado,
            email=email,
            status='visitante'
        )
        senha_gerada = membro.definir_senha()
        membro.save()
        novo_cadastro = True
    
    # Verificar se já está inscrito (inscrições canceladas não contam — usuário pode se inscrever de novo)
    inscricao_existente = Inscricao.objects.filter(
        membro=membro, evento=evento, is_acompanhante=False
    ).exclude(status='cancelada').first()
    if inscricao_existente:
        # Se não está enviando novos acompanhantes, apenas retorna info da inscrição existente
        if not acompanhantes:
            # Buscar acompanhantes existentes
            acompanhantes_existentes = Inscricao.objects.filter(
                evento=evento,
                responsavel=membro,
                is_acompanhante=True
            ).select_related('membro', 'categoria')
            
            response = {
                'success': True,
                'ja_inscrito': True,
                'message': 'Você já está inscrito neste evento. Deseja adicionar acompanhantes?',
                'participante': {
                    'id': membro.id,
                    'nome': membro.nome,
                    'telefone': membro.telefone,
                },
                'inscricao': {
                    'id': inscricao_existente.id,
                    'codigo': inscricao_existente.codigo,
                    'qrcode': inscricao_existente.qrcode.url if inscricao_existente.qrcode else None,
                    'status_pagamento': inscricao_existente.status_pagamento,
                    'valor_inscricao': float(inscricao_existente.valor_inscricao) if inscricao_existente.valor_inscricao else 0,
                },
                'acompanhantes': [
                    {
                        'id': a.id,
                        'nome': a.membro.nome,
                        'codigo': a.codigo,
                        'qrcode': a.qrcode.url if a.qrcode else None,
                        'categoria': a.categoria.nome if a.categoria else 'Adulto',
                    }
                    for a in acompanhantes_existentes
                ]
            }
            # Incluir senha se disponível (para lembrete)
            if membro.senha_texto:
                response['senha_existente'] = membro.senha_texto
                response['lembrete_senha'] = True
            return Response(response)
        
        # Se está enviando novos acompanhantes, adicionar à inscrição existente
        # Verificar se o evento ainda tem vagas
        novos_acompanhantes = len(acompanhantes)
        if evento.vagas is not None:
            vagas_disponiveis = evento.vagas_disponiveis
            if vagas_disponiveis < novos_acompanhantes:
                return Response({
                    'success': False,
                    'error': f'Não há vagas suficientes. Disponíveis: {vagas_disponiveis}'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Calcular valor dos novos acompanhantes
        valor_novos_acompanhantes = 0
        acompanhantes_para_criar = []
        
        for acomp_data in acompanhantes:
            if isinstance(acomp_data, dict):
                nome_acomp = (acomp_data.get('nome') or '').strip()
                acomp_categoria_id = acomp_data.get('categoria_id')
            else:
                nome_acomp = (acomp_data or '').strip()
                acomp_categoria_id = None
            
            if nome_acomp:
                # Buscar categoria do acompanhante (para eventos pagos e gratuitos)
                categoria_acomp = None
                valor_acomp = 0
                if acomp_categoria_id:
                    try:
                        categoria_acomp = CategoriaParticipante.objects.get(id=acomp_categoria_id, ativo=True)
                        if evento.evento_pago and evento.valor_inscricao:
                            valor_acomp = categoria_acomp.calcular_valor(evento.valor_inscricao)
                    except CategoriaParticipante.DoesNotExist:
                        pass
                elif evento.evento_pago and evento.valor_inscricao:
                    valor_acomp = float(evento.valor_inscricao)
                
                valor_novos_acompanhantes += valor_acomp
                acompanhantes_para_criar.append({
                    'nome': nome_acomp,
                    'categoria': categoria_acomp,
                    'valor': valor_acomp
                })
        
        # Se responsável já pagou e evento é pago mas valor ficou 0 (ex.: categoria não enviada), usar valor do evento por acompanhante
        if (inscricao_existente.status_pagamento == 'pago' and evento.evento_pago and
                len(acompanhantes_para_criar) > 0 and valor_novos_acompanhantes == 0 and evento.valor_inscricao):
            valor_unitario = float(evento.valor_inscricao)
            valor_novos_acompanhantes = valor_unitario * len(acompanhantes_para_criar)
            for a in acompanhantes_para_criar:
                a['valor'] = valor_unitario
        
        # Definir status baseado no pagamento atual
        # Se a inscrição original já foi paga, os novos acompanhantes ficam pendentes
        if evento.evento_pago:
            if inscricao_existente.status_pagamento == 'pago':
                # Já pagou, novos acompanhantes precisam pagar
                status_pagamento_acomp = 'pendente'
                status_inscricao_acomp = 'pendente'
            else:
                # Ainda não pagou, acompanhantes seguem mesmo status
                status_pagamento_acomp = inscricao_existente.status_pagamento
                status_inscricao_acomp = inscricao_existente.status
        else:
            status_pagamento_acomp = 'nao_aplicavel'
            status_inscricao_acomp = 'confirmada'
        
        # Criar inscrições para os novos acompanhantes
        novos_acompanhantes_lista = []
        for acomp_info in acompanhantes_para_criar:
            membro_acomp = Membro.objects.create(
                nome=acomp_info['nome'],
                telefone=None,  # Acompanhante não tem telefone
                is_acompanhante=True,
                responsavel=membro,
                status='visitante'
            )
            
            inscricao_acomp = Inscricao.objects.create(
                membro=membro_acomp,
                evento=evento,
                status=status_inscricao_acomp,
                responsavel=membro,
                is_acompanhante=True,
                categoria=acomp_info['categoria'],
                valor_inscricao=0,  # Acompanhante não paga individualmente
                status_pagamento=status_pagamento_acomp
            )
            
            novos_acompanhantes_lista.append({
                'id': inscricao_acomp.id,
                'nome': acomp_info['nome'],
                'codigo': inscricao_acomp.codigo,
                'qrcode': inscricao_acomp.qrcode.url if inscricao_acomp.qrcode else None,
                'categoria': acomp_info['categoria'].nome if acomp_info['categoria'] else None,
                'valor': acomp_info['valor'],
            })
        
        # Criar cobrança separada para os novos acompanhantes
        cobranca = None
        novo_valor_total = float(inscricao_existente.valor_inscricao or 0)
        
        if evento.evento_pago and valor_novos_acompanhantes > 0:
            # Reutilizar cobrança pendente existente ou criar nova (evita duplicatas)
            descricao_itens = ', '.join([a['nome'] for a in acompanhantes_para_criar])
            cobranca_pendente = Cobranca.objects.filter(
                membro=membro,
                evento=evento,
                status='pendente'
            ).first()
            
            if cobranca_pendente:
                # Atualizar cobrança existente com os novos acompanhantes
                cobranca_pendente.valor = float(cobranca_pendente.valor) + valor_novos_acompanhantes
                cobranca_pendente.descricao += f', {descricao_itens}'
                cobranca_pendente.save()
                cobranca = cobranca_pendente
            else:
                # Criar nova cobrança apenas se não existir pendente
                cobranca = Cobranca.objects.create(
                    membro=membro,
                    evento=evento,
                    valor=valor_novos_acompanhantes,
                    descricao=f'Inscrição adicional: {descricao_itens}',
                    status='pendente'
                )
            
            # Adicionar itens à cobrança (vincular cada inscrição de acompanhante)
            for acomp_info, inscricao_item in zip(acompanhantes_para_criar, [
                Inscricao.objects.get(membro__nome=a['nome'], evento=evento, responsavel=membro)
                for a in acompanhantes_para_criar
            ]):
                CobrancaItem.objects.create(
                    cobranca=cobranca,
                    inscricao=inscricao_item,
                    valor=acomp_info['valor'],
                    descricao=f"{acomp_info['nome']} - {acomp_info['categoria'].nome if acomp_info['categoria'] else 'Adulto'}"
                )
            
            novo_valor_total = float(cobranca.valor)  # Valor total da cobrança (existente + novos)
        elif evento.evento_pago and inscricao_existente.status_pagamento != 'pago':
            # Ainda não pagou - adicionar à cobrança existente ou criar uma
            cobranca_pendente = Cobranca.objects.filter(
                membro=membro,
                evento=evento,
                status='pendente'
            ).first()
            
            if cobranca_pendente:
                # Atualizar cobrança existente
                cobranca_pendente.valor = float(cobranca_pendente.valor) + valor_novos_acompanhantes
                cobranca_pendente.descricao += f', {", ".join([a["nome"] for a in acompanhantes_para_criar])}'
                cobranca_pendente.save()
                cobranca = cobranca_pendente
            
            novo_valor_total = float(inscricao_existente.valor_inscricao or 0) + valor_novos_acompanhantes
            inscricao_existente.valor_inscricao = novo_valor_total
            inscricao_existente.save()
        
        # Buscar todos os acompanhantes (existentes + novos)
        todos_acompanhantes = Inscricao.objects.filter(
            evento=evento,
            responsavel=membro,
            is_acompanhante=True
        ).select_related('membro', 'categoria')
        
        response = {
            'success': True,
            'ja_inscrito': True,
            'acompanhantes_adicionados': True,
            'message': f'{len(novos_acompanhantes_lista)} acompanhante(s) adicionado(s) com sucesso!',
            'participante': {
                'id': membro.id,
                'nome': membro.nome,
                'telefone': membro.telefone,
            },
            'inscricao': {
                'id': inscricao_existente.id,
                'codigo': inscricao_existente.codigo,
                'qrcode': inscricao_existente.qrcode.url if inscricao_existente.qrcode else None,
                'status_pagamento': inscricao_existente.status_pagamento,
                'valor': float(inscricao_existente.valor_inscricao) if inscricao_existente.valor_inscricao else 0,
            },
            'novos_acompanhantes': novos_acompanhantes_lista,
            'acompanhantes': [
                {
                    'id': a.id,
                    'nome': a.membro.nome,
                    'codigo': a.codigo,
                    'qrcode': a.qrcode.url if a.qrcode else None,
                    'categoria': a.categoria.nome if a.categoria else 'Adulto',
                }
                for a in todos_acompanhantes
            ],
            'valor_total': novo_valor_total,
            'pagamento_pendente': cobranca is not None and cobranca.status == 'pendente',
            'cobranca': {
                'id': cobranca.id,
                'codigo': cobranca.codigo,
                'valor': float(cobranca.valor),
                'status': cobranca.status,
                'descricao': cobranca.descricao,
            } if cobranca else None,
        }
        
        if membro.senha_texto:
            response['senha_existente'] = membro.senha_texto
            response['lembrete_senha'] = True
        
        # Disparar webhook de inscrição (participante + acompanhantes adicionados)
        try:
            base_url = request.build_absolute_uri('/').rstrip('/')
            telefone_fmt = f"({membro.telefone[:2]}) {membro.telefone[2:7]}-{membro.telefone[7:]}" if membro.telefone and len(membro.telefone) >= 11 else membro.telefone or ''
            acompanhantes_webhook = [
                {
                    'id': a.id,
                    'nome': a.membro.nome,
                    'codigo': a.codigo,
                    'qrcode': a.qrcode.url if a.qrcode else None,
                }
                for a in todos_acompanhantes
            ]
            dados_webhook = {
                'base_url': base_url,
                'tipo': 'acompanhantes_adicionados',
                'participante_id': membro.id,
                'nome': membro.nome,
                'telefone': membro.telefone,
                'telefone_formatado': telefone_fmt,
                'email': membro.email or '',
                'senha': membro.senha_texto or None,
                'novo_cadastro': False,
                'inscricao_id': inscricao_existente.id,
                'codigo': inscricao_existente.codigo,
                'qrcode_path': inscricao_existente.qrcode.url if inscricao_existente.qrcode else None,
                'evento_id': evento.id,
                'evento_titulo': evento.titulo,
                'evento_data_inicio': evento.data_inicio.isoformat() if evento.data_inicio else None,
                'evento_data_fim': evento.data_fim.isoformat() if evento.data_fim else None,
                'evento_local': evento.local,
                'evento_endereco': evento.endereco or '',
                'evento_pago': evento.evento_pago,
                'evento_valor': float(evento.valor_inscricao) if evento.valor_inscricao else None,
                'valor_total': novo_valor_total,
                'pagamento_confirmado': inscricao_existente.status_pagamento == 'pago',
                'acompanhantes': acompanhantes_webhook,
                'total_inscritos': 1 + todos_acompanhantes.count(),
            }
            thread = threading.Thread(target=enviar_webhook_inscricao, args=(dados_webhook,))
            thread.daemon = True
            thread.start()
        except Exception as e:
            logger.exception('Erro ao disparar webhook (acompanhantes adicionados): %s', e)
        
        # Sempre retornar token para manter a sessão do participante (evitar novo login)
        import jwt
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        payload = {
            'participante_id': membro.id,
            'telefone': membro.telefone,
            'nome': membro.nome,
            'exp': int((now + timedelta(days=365)).timestamp()),  # Token válido por 1 ano
            'iat': int(now.timestamp()),
            'type': 'participante'
        }
        response['token'] = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
        
        return Response(response)
    
    # Nova inscrição: verificar vagas (responsável + acompanhantes)
    if evento.vagas is not None:
        vagas_disponiveis = evento.vagas_disponiveis or 0
        total_inscricoes = 1 + len(acompanhantes)
        if total_inscricoes > vagas_disponiveis:
            return Response(
                {'error': f'Vagas insuficientes. Disponível: {vagas_disponiveis}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    # --- Formulário de inscrição (opcional) ---
    # Extrai e valida respostas do formulário se o evento tiver um vinculado.
    # Respostas de texto/numero/boolean/data/email/telefone/cpf/select vêm em
    # request.data['respostas'] (JSON). Arquivos vêm em request.FILES com a
    # convenção "resposta_arquivo_{campo_id}".
    formulario_do_evento = evento.formulario_inscricao
    respostas_validadas = []
    arquivos_respostas_formulario = {}

    if formulario_do_evento:
        respostas_raw = request.data.get('respostas')
        if isinstance(respostas_raw, str):
            try:
                respostas_raw = json.loads(respostas_raw)
            except (ValueError, TypeError):
                respostas_raw = None

        # Coleta arquivos do multipart/form-data
        for chave, arquivo_upload in request.FILES.items():
            if chave.startswith('resposta_arquivo_'):
                try:
                    cid = int(chave.replace('resposta_arquivo_', ''))
                except ValueError:
                    continue
                arquivos_respostas_formulario[cid] = arquivo_upload

        # Valida respostas de texto/numero/etc.
        try:
            respostas_validadas = validar_respostas_formulario(evento, respostas_raw)
        except ValidationError as e:
            detail = getattr(e, 'detail', {}) or {}
            errors = {}
            if isinstance(detail, dict):
                errors = detail.get('errors_por_campo', detail)
            return Response(
                {
                    'success': False,
                    'error': 'Formulário inválido',
                    'errors_por_campo': errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Valida campos de arquivo (obrigatoriedade, extensão e tamanho)
        EXTENSOES_OK = {'pdf', 'jpg', 'jpeg', 'png'}
        MAX_BYTES_ARQUIVO = 5 * 1024 * 1024
        erros_arquivo = {}
        for campo_arq in formulario_do_evento.campos.filter(tipo='arquivo'):
            upload = arquivos_respostas_formulario.get(campo_arq.id)
            if campo_arq.obrigatorio and not upload:
                erros_arquivo[campo_arq.id] = 'Arquivo obrigatório.'
                continue
            if upload is not None:
                nome_arq = getattr(upload, 'name', '') or ''
                ext = nome_arq.rsplit('.', 1)[-1].lower() if '.' in nome_arq else ''
                if ext not in EXTENSOES_OK:
                    erros_arquivo[campo_arq.id] = 'Extensão não permitida (use pdf, jpg ou png).'
                    continue
                if getattr(upload, 'size', 0) > MAX_BYTES_ARQUIVO:
                    erros_arquivo[campo_arq.id] = 'Arquivo excede 5 MB.'
                    continue

        if erros_arquivo:
            return Response(
                {
                    'success': False,
                    'error': 'Formulário inválido',
                    'errors_por_campo': erros_arquivo,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    def _salvar_respostas_formulario(inscricao_obj):
        """Grava respostas + arquivos do formulário na inscrição principal.

        Substitui eventuais respostas existentes (útil ao reativar uma
        inscrição previamente cancelada).
        """
        if not formulario_do_evento:
            return
        RespostaCampoInscricao.objects.filter(inscricao=inscricao_obj).delete()
        for item in respostas_validadas:
            campo = item['campo']
            RespostaCampoInscricao.objects.create(
                inscricao=inscricao_obj,
                campo=campo,
                valor=item['valor'],
            )
        for campo_arq in formulario_do_evento.campos.filter(tipo='arquivo'):
            upload = arquivos_respostas_formulario.get(campo_arq.id)
            if not upload:
                continue
            RespostaCampoInscricao.objects.create(
                inscricao=inscricao_obj,
                campo=campo_arq,
                valor={'nome_original': getattr(upload, 'name', '')},
                arquivo=upload,
            )

    # Buscar ou criar categoria "Adulto" para o responsável
    categoria_adulto = None
    if evento.evento_pago:
        categoria_adulto, _ = CategoriaParticipante.objects.get_or_create(
            nome='Adulto',
            defaults={
                'descricao': 'Categoria padrão para adultos',
                'tipo_valor': 'porcentagem',
                'valor': 100,  # 100% do valor do evento
                'ordem': 1,
                'ativo': True
            }
        )
    
    # Primeiro, calcular o valor dos acompanhantes para somar ao total
    valor_acompanhantes = 0
    acompanhantes_para_criar = []
    
    for acomp_data in acompanhantes:
        if isinstance(acomp_data, dict):
            nome_acomp = (acomp_data.get('nome') or '').strip()
            acomp_categoria_id = acomp_data.get('categoria_id')
        else:
            nome_acomp = (acomp_data or '').strip()
            acomp_categoria_id = None
        
        if nome_acomp:
            # Buscar categoria do acompanhante (para eventos pagos e gratuitos - adulto, idade, etc.)
            categoria_acomp = None
            valor_acomp = 0
            if acomp_categoria_id:
                try:
                    categoria_acomp = CategoriaParticipante.objects.get(id=acomp_categoria_id, ativo=True)
                    if evento.evento_pago and evento.valor_inscricao:
                        valor_acomp = categoria_acomp.calcular_valor(evento.valor_inscricao)
                except CategoriaParticipante.DoesNotExist:
                    pass
            elif evento.evento_pago and evento.valor_inscricao:
                valor_acomp = float(evento.valor_inscricao)
            
            valor_acompanhantes += valor_acomp
            acompanhantes_para_criar.append({
                'nome': nome_acomp,
                'categoria': categoria_acomp,
                'valor': valor_acomp
            })
    
    # Calcular valor total (responsável paga tudo: seu valor + acompanhantes)
    valor_responsavel = 0
    if evento.evento_pago and evento.valor_inscricao:
        valor_responsavel = float(evento.valor_inscricao)
    
    valor_total = valor_responsavel + valor_acompanhantes
    
    # Definir status de pagamento
    if evento.evento_pago:
        status_pagamento = 'pendente'
        status_inscricao = 'pendente'  # Aguardando pagamento
    else:
        status_pagamento = 'nao_aplicavel'
        status_inscricao = 'confirmada'
    
    # Se existe inscrição cancelada, reutilizar em vez de criar nova (respeita unique_together membro+evento)
    inscricao_cancelada = Inscricao.objects.filter(
        membro=membro, evento=evento, is_acompanhante=False, status='cancelada'
    ).first()
    if inscricao_cancelada:
        inscricao = inscricao_cancelada
        inscricao.status = status_inscricao
        inscricao.status_pagamento = status_pagamento
        inscricao.valor_inscricao = valor_total
        inscricao.categoria = categoria_adulto
        inscricao.save(update_fields=['status', 'status_pagamento', 'valor_inscricao', 'categoria'])
        # Gravar respostas do formulário (se houver)
        _salvar_respostas_formulario(inscricao)
        # Criar acompanhantes (novos membros + inscrições)
        inscricoes_acompanhantes = []
        for acomp_info in acompanhantes_para_criar:
            nome_acomp = acomp_info['nome']
            categoria_acomp = acomp_info['categoria']
            valor_acomp = acomp_info['valor']
            membro_acomp = Membro.objects.create(
                nome=nome_acomp,
                telefone=None,
                is_acompanhante=True,
                responsavel=membro,
                status='visitante'
            )
            inscricao_acomp = Inscricao.objects.create(
                membro=membro_acomp,
                evento=evento,
                status=status_inscricao,
                responsavel=membro,
                is_acompanhante=True,
                categoria=categoria_acomp,
                valor_inscricao=0,
                status_pagamento=status_pagamento
            )
            inscricoes_acompanhantes.append({
                'id': inscricao_acomp.id,
                'inscricao': inscricao_acomp,
                'nome': nome_acomp,
                'codigo': inscricao_acomp.codigo,
                'qrcode': inscricao_acomp.qrcode.url if inscricao_acomp.qrcode else None,
                'categoria': categoria_acomp.nome if categoria_acomp else None,
                'valor': valor_acomp,
            })
        cobranca = None
        if evento.evento_pago and valor_total > 0:
            itens_desc = [f"{membro.nome} (Adulto)"]
            for acomp in acompanhantes_para_criar:
                cat_nome = acomp['categoria'].nome if acomp['categoria'] else 'Adulto'
                itens_desc.append(f"{acomp['nome']} ({cat_nome})")
            cobranca = Cobranca.objects.create(
                membro=membro,
                evento=evento,
                valor=valor_total,
                descricao=f"Inscrição: {', '.join(itens_desc)}",
                status='pendente'
            )
            CobrancaItem.objects.create(
                cobranca=cobranca,
                inscricao=inscricao,
                valor=valor_responsavel,
                descricao=f"{membro.nome} - Adulto"
            )
            for acomp_data in inscricoes_acompanhantes:
                CobrancaItem.objects.create(
                    cobranca=cobranca,
                    inscricao=acomp_data['inscricao'],
                    valor=acomp_data['valor'],
                    descricao=f"{acomp_data['nome']} - {acomp_data['categoria'] or 'Adulto'}"
                )
        import jwt
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        token = jwt.encode(
            {
                'participante_id': membro.id,
                'telefone': membro.telefone,
                'nome': membro.nome,
                'exp': int((now + timedelta(days=365)).timestamp()),  # Token válido por 1 ano
                'iat': int(now.timestamp()),
                'type': 'participante'
            },
            settings.SECRET_KEY,
            algorithm='HS256'
        )
        acompanhantes_response = [
            {k: v for k, v in acomp.items() if k != 'inscricao'}
            for acomp in inscricoes_acompanhantes
        ]
        response_data = {
            'success': True,
            'novo_cadastro': novo_cadastro,
            'message': 'Inscrição realizada com sucesso!' if not evento.evento_pago else 'Inscrição realizada! Aguardando confirmação de pagamento.',
            'token': token,
            'participante': {'id': membro.id, 'nome': membro.nome, 'telefone': membro.telefone, 'email': membro.email},
            'inscricao': {
                'id': inscricao.id,
                'codigo': inscricao.codigo,
                'qrcode': inscricao.qrcode.url if inscricao.qrcode else None,
                'categoria': 'Adulto',
                'valor': valor_responsavel,
                'status_pagamento': status_pagamento,
            },
            'acompanhantes': acompanhantes_response,
            'evento': {
                'id': evento.id,
                'titulo': evento.titulo,
                'data_inicio': evento.data_inicio.strftime('%d/%m/%Y %H:%M'),
                'evento_pago': evento.evento_pago,
                'valor_inscricao': float(evento.valor_inscricao) if evento.valor_inscricao else None,
            },
            'valor_total': valor_total,
            'pagamento_pendente': evento.evento_pago,
            'cobranca': {
                'id': cobranca.id, 'codigo': cobranca.codigo, 'valor': float(cobranca.valor),
                'status': cobranca.status, 'descricao': cobranca.descricao,
            } if cobranca else None,
        }
        if novo_cadastro and senha_gerada:
            response_data['senha_gerada'] = senha_gerada
        elif getattr(membro, 'senha_texto', None):
            response_data['senha_existente'] = membro.senha_texto
            response_data['lembrete_senha'] = True
        return Response(response_data, status=status.HTTP_201_CREATED)
    
    # Criar inscrição do responsável (categoria Adulto, valor TOTAL do grupo)
    inscricao = Inscricao.objects.create(
        membro=membro,
        evento=evento,
        status=status_inscricao,
        is_acompanhante=False,
        categoria=categoria_adulto,  # Responsável é sempre Adulto
        valor_inscricao=valor_total,  # Valor total do grupo
        status_pagamento=status_pagamento
    )

    # Gravar respostas do formulário (se houver)
    _salvar_respostas_formulario(inscricao)

    # Criar inscrições para acompanhantes (valor = 0, pois responsável paga tudo)
    inscricoes_acompanhantes = []
    
    for acomp_info in acompanhantes_para_criar:
        nome_acomp = acomp_info['nome']
        categoria_acomp = acomp_info['categoria']
        valor_acomp = acomp_info['valor']  # Valor para referência, mas não cobra individualmente
        
        # Criar membro para acompanhante (sem telefone/login)
        membro_acomp = Membro.objects.create(
            nome=nome_acomp,
            telefone=None,  # Acompanhante não tem telefone
            is_acompanhante=True,
            responsavel=membro,
            status='visitante'
        )
        
        # Criar inscrição vinculada ao responsável (valor = 0, pois responsável paga tudo)
        inscricao_acomp = Inscricao.objects.create(
            membro=membro_acomp,
            evento=evento,
            status=status_inscricao,
            responsavel=membro,
            is_acompanhante=True,
            categoria=categoria_acomp,
            valor_inscricao=0,  # Acompanhante não paga individualmente
            status_pagamento=status_pagamento
        )
        
        inscricoes_acompanhantes.append({
            'id': inscricao_acomp.id,
            'inscricao': inscricao_acomp,  # Guardar referência para cobrança
            'nome': nome_acomp,
            'codigo': inscricao_acomp.codigo,
            'qrcode': inscricao_acomp.qrcode.url if inscricao_acomp.qrcode else None,
            'categoria': categoria_acomp.nome if categoria_acomp else None,
            'valor': valor_acomp,  # Valor para referência (mas não pago individualmente)
        })
    
    # Criar cobrança para eventos pagos
    cobranca = None
    if evento.evento_pago and valor_total > 0:
        # Criar descrição dos itens
        itens_desc = [f"{membro.nome} (Adulto)"]
        for acomp in acompanhantes_para_criar:
            cat_nome = acomp['categoria'].nome if acomp['categoria'] else 'Adulto'
            itens_desc.append(f"{acomp['nome']} ({cat_nome})")
        
        cobranca = Cobranca.objects.create(
            membro=membro,
            evento=evento,
            valor=valor_total,
            descricao=f"Inscrição: {', '.join(itens_desc)}",
            status='pendente'
        )
        
        # Adicionar item do responsável à cobrança
        CobrancaItem.objects.create(
            cobranca=cobranca,
            inscricao=inscricao,
            valor=valor_responsavel,
            descricao=f"{membro.nome} - Adulto"
        )
        
        # Adicionar itens dos acompanhantes à cobrança
        for acomp_data in inscricoes_acompanhantes:
            CobrancaItem.objects.create(
                cobranca=cobranca,
                inscricao=acomp_data['inscricao'],
                valor=acomp_data['valor'],
                descricao=f"{acomp_data['nome']} - {acomp_data['categoria'] or 'Adulto'}"
            )
    
    # Gerar token de login (exp/iat em timestamp numérico para sessão de 1 ano)
    # Token válido por 1 ano para evitar logout automático
    now = datetime.utcnow()
    payload = {
        'participante_id': membro.id,
        'telefone': membro.telefone,
        'nome': membro.nome,
        'exp': int((now + timedelta(days=365)).timestamp()),  # Token válido por 1 ano
        'iat': int(now.timestamp()),
        'type': 'participante'
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
    
    # Limpar referências de objeto dos acompanhantes (não serializáveis)
    acompanhantes_response = [
        {k: v for k, v in acomp.items() if k != 'inscricao'}
        for acomp in inscricoes_acompanhantes
    ]
    
    # Resposta
    response_data = {
        'success': True,
        'novo_cadastro': novo_cadastro,
        'message': 'Inscrição realizada com sucesso!' if not evento.evento_pago else 'Inscrição realizada! Aguardando confirmação de pagamento.',
        'token': token,
        'participante': {
            'id': membro.id,
            'nome': membro.nome,
            'telefone': membro.telefone,
            'email': membro.email,
        },
        'inscricao': {
            'id': inscricao.id,
            'codigo': inscricao.codigo,
            'qrcode': inscricao.qrcode.url if inscricao.qrcode else None,
            'categoria': 'Adulto',  # Responsável sempre é adulto
            'valor': valor_responsavel,
            'status_pagamento': status_pagamento,
        },
        'acompanhantes': acompanhantes_response,
        'evento': {
            'id': evento.id,
            'titulo': evento.titulo,
            'data_inicio': evento.data_inicio.strftime('%d/%m/%Y %H:%M'),
            'evento_pago': evento.evento_pago,
            'valor_inscricao': float(evento.valor_inscricao) if evento.valor_inscricao else None,
        },
        'valor_total': valor_total,
        'pagamento_pendente': evento.evento_pago,
        'cobranca': {
            'id': cobranca.id,
            'codigo': cobranca.codigo,
            'valor': float(cobranca.valor),
            'status': cobranca.status,
            'descricao': cobranca.descricao,
        } if cobranca else None,
    }
    
    # Incluir senha na resposta
    senha_para_webhook = None
    if novo_cadastro and senha_gerada:
        # Novo cadastro - senha recém gerada
        response_data['senha_gerada'] = senha_gerada
        senha_para_webhook = senha_gerada
    elif membro.senha_texto:
        # Membro existente - mostrar senha como lembrete
        response_data['senha_existente'] = membro.senha_texto
        response_data['lembrete_senha'] = True
        senha_para_webhook = membro.senha_texto
    
    # Formatar telefone para exibição
    telefone_formatado = membro.telefone
    if len(membro.telefone) == 11:
        telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:7]}-{membro.telefone[7:]}"
    elif len(membro.telefone) == 10:
        telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:6]}-{membro.telefone[6:]}"
    
    # Função para converter data para fuso horário local (Brasil)
    def formatar_data_local(dt):
        if dt is None:
            return None
        from django.utils import timezone as tz
        if tz.is_aware(dt):
            dt_local = tz.localtime(dt)
        else:
            dt_local = dt
        return dt_local.strftime('%d/%m/%Y %H:%M')
    
    # Enviar webhook na inscrição: sempre (gratuito ou pago) para enviar a senha ao usuário
    # Para eventos pagos, o QR code ainda não existe; após pagamento outro webhook é disparado
    base_url = request.build_absolute_uri('/').rstrip('/')
    dados_webhook = {
        'base_url': base_url,
        'participante_id': membro.id,
        'nome': membro.nome,
        'telefone': membro.telefone,
        'telefone_formatado': telefone_formatado,
        'email': membro.email,
        'senha': senha_para_webhook,
        'novo_cadastro': novo_cadastro,
        'inscricao_id': inscricao.id,
        'codigo': inscricao.codigo,
        'qrcode_path': inscricao.qrcode.url if inscricao.qrcode else None,
        'evento_id': evento.id,
        'evento_titulo': evento.titulo,
        'evento_data_inicio': formatar_data_local(evento.data_inicio),
        'evento_data_fim': formatar_data_local(evento.data_fim),
        'evento_local': evento.local,
        'evento_endereco': evento.endereco,
        'evento_pago': evento.evento_pago,
        'evento_valor': float(evento.valor_inscricao) if evento.valor_inscricao else None,
        'valor_total': float(valor_total) if valor_total else 0,
        'pagamento_confirmado': not evento.evento_pago,
        'acompanhantes': inscricoes_acompanhantes,
        'total_inscritos': 1 + len(inscricoes_acompanhantes),
    }
    
    thread = threading.Thread(target=enviar_webhook_inscricao, args=(dados_webhook,))
    thread.daemon = True
    thread.start()
    
    return Response(response_data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([AllowAny])
def participante_perfil(request):
    """
    Retorna o perfil e ingressos do participante logado.
    Aceita token no header Authorization ou na query ?token= (para evitar perda no F5).
    """
    import jwt
    from django.conf import settings
    
    auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION') or ''
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
    else:
        token = (request.query_params.get('token') or request.GET.get('token') or '').strip()
    
    if not token:
        return Response(
            {'error': 'Token não fornecido'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        
        if payload.get('type') != 'participante':
            raise jwt.InvalidTokenError('Token inválido')
        
        membro = Membro.objects.get(id=payload['participante_id'])
        
    except jwt.ExpiredSignatureError:
        return Response(
            {'error': 'Token expirado. Faça login novamente.'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    except (jwt.InvalidTokenError, Membro.DoesNotExist):
        return Response(
            {'error': 'Token inválido'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    return Response({
        'participante': {
            'id': membro.id,
            'nome': membro.nome,
            'telefone': membro.telefone,
            'email': membro.email,
        },
        'ingressos': _serializar_ingressos(membro)
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def meus_ingressos(request):
    """
    Consulta ingressos por telefone (para recuperação).
    Retorna apenas se encontrou, sem mostrar dados sensíveis.
    """
    telefone = request.data.get('telefone', '')
    
    if not telefone:
        return Response(
            {'error': 'Telefone é obrigatório'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    telefone_normalizado = Membro.normalizar_telefone(telefone)
    
    try:
        membro = Membro.objects.get(telefone=telefone_normalizado)
    except Membro.DoesNotExist:
        return Response(
            {'error': 'Nenhum cadastro encontrado para este telefone', 'encontrado': False},
            status=status.HTTP_404_NOT_FOUND
        )
    
    return Response({
        'encontrado': True,
        'nome': membro.nome,
        'telefone_parcial': f"****{membro.telefone[-4:]}",
        'message': 'Cadastro encontrado! Faça login para acessar Meus Ingressos.',
        # Permite acesso mesmo sem inscrições; frontend exibirá estado vazio.
        'tem_inscricoes': Inscricao.objects.filter(
            membro=membro,
            status__in=['confirmada', 'pendente']
        ).exists(),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """Retorna estatísticas para o dashboard administrativo."""
    from django.db.models import Count, Q
    
    agora = timezone.now()
    
    total_eventos = Evento.objects.count()
    
    # Eventos que ainda não terminaram (mesma lógica da listagem pública)
    eventos_futuros = Evento.objects.filter(
        Q(data_fim__gte=agora) | Q(data_fim__isnull=True, data_inicio__gte=agora)
    ).count()
    
    # Mesmo critério da tela /admin/membros: todos os membros (Membro.objects.all())
    total_membros = Membro.objects.count()
    total_inscricoes = Inscricao.objects.filter(status='confirmada').count()
    contatos_nao_lidos = Contato.objects.filter(lido=False).count()
    
    # Próximos eventos (que ainda não terminaram)
    proximos_eventos = Evento.objects.filter(
        Q(data_fim__gte=agora) | Q(data_fim__isnull=True, data_inicio__gte=agora)
    ).order_by('data_inicio')[:5]
    
    return Response({
        'total_eventos': total_eventos,
        'eventos_futuros': eventos_futuros,
        'total_membros': total_membros,
        'total_inscricoes': total_inscricoes,
        'contatos_nao_lidos': contatos_nao_lidos,
        'proximos_eventos': EventoListaSerializer(proximos_eventos, many=True).data
    })


class MembroViewSet(viewsets.ModelViewSet):
    """ViewSet para operações CRUD de Membros."""
    
    queryset = Membro.objects.all()
    serializer_class = MembroSerializer
    
    def get_serializer_class(self):
        if self.action == 'list':
            return MembroResumoSerializer
        return MembroSerializer
    
    def get_queryset(self):
        queryset = Membro.objects.all()
        
        # Filtro por status
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        
        # Busca por nome
        nome = self.request.query_params.get('nome')
        if nome:
            queryset = queryset.filter(nome__icontains=nome)
        
        return queryset


def _aplicar_imagem_padrao_evento(evento):
    """Aplica a imagem padrão ao evento quando não possui imagem."""
    if evento.imagem:
        return
    from pathlib import Path
    from django.core.files import File
    default_path = Path(__file__).resolve().parent / 'evento-default.png'
    if default_path.exists():
        ext = default_path.suffix or '.png'
        with open(default_path, 'rb') as f:
            evento.imagem.save(f'evento-{evento.id}{ext}', File(f), save=True)


class EventoViewSet(viewsets.ModelViewSet):
    """ViewSet para operações CRUD de Eventos."""
    
    queryset = Evento.objects.all()
    serializer_class = EventoSerializer
    
    def perform_create(self, serializer):
        serializer.save()
        evento = serializer.instance
        _aplicar_imagem_padrao_evento(evento)
        thread = threading.Thread(target=enviar_webhook_evento, args=(evento, 'criado'))
        thread.start()
    
    def perform_update(self, serializer):
        serializer.save()
        thread = threading.Thread(target=enviar_webhook_evento, args=(serializer.instance, 'atualizado'))
        thread.start()
    
    def perform_destroy(self, instance):
        snapshot = {
            'id': instance.id,
            'titulo': instance.titulo,
            'tipo': instance.tipo,
            'data_inicio': instance.data_inicio.isoformat() if instance.data_inicio else None,
            'data_fim': instance.data_fim.isoformat() if instance.data_fim else None,
            'local': instance.local,
            'endereco': instance.endereco or '',
            'vagas': instance.vagas,
            'status': instance.status,
            'evento_pago': instance.evento_pago,
            'valor_inscricao': str(instance.valor_inscricao) if instance.valor_inscricao is not None else None,
            'inscricao_inicio': instance.inscricao_inicio.isoformat() if instance.inscricao_inicio else None,
            'inscricao_fim': instance.inscricao_fim.isoformat() if instance.inscricao_fim else None,
            'destaque': instance.destaque,
        }
        instance.delete()
        thread = threading.Thread(target=enviar_webhook_evento, args=(snapshot, 'excluido'))
        thread.start()
    
    def create(self, request, *args, **kwargs):
        """Override create para capturar e logar erros 500 (ex.: permissão em /media)."""
        try:
            return super().create(request, *args, **kwargs)
        except Exception as e:
            logger.exception("Erro ao criar evento: %s", e)
            return Response(
                {'error': 'Erro ao criar evento.', 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def get_permissions(self):
        """
        Permite leitura para todos, mas exige autenticação para criar/editar/excluir.
        """
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [AllowAny]
        return [permission() for permission in permission_classes]
    
    def get_serializer_class(self):
        if self.action == 'list':
            return EventoListaSerializer
        return EventoSerializer
    
    def list(self, request, *args, **kwargs):
        """Override list para adicionar tratamento de erros."""
        try:
            return super().list(request, *args, **kwargs)
        except Exception as e:
            logger.error(f"Erro ao listar eventos: {e}", exc_info=True)
            return Response(
                {'error': 'Erro ao carregar eventos', 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def get_queryset(self):
        try:
            queryset = Evento.objects.all()
            
            # Filtro por tipo
            tipo = self.request.query_params.get('tipo')
            if tipo:
                queryset = queryset.filter(tipo=tipo)
            
            # Filtro por status
            status_param = self.request.query_params.get('status')
            if status_param:
                queryset = queryset.filter(status=status_param)
            
            # Apenas eventos em destaque
            destaque = self.request.query_params.get('destaque')
            if destaque and destaque.lower() == 'true':
                queryset = queryset.filter(destaque=True)
            
            # Apenas eventos futuros (que ainda não terminaram)
            futuros = self.request.query_params.get('futuros')
            if futuros and futuros.lower() == 'true':
                from django.db.models import Q
                agora = timezone.now()
                # Se tem data_fim: mostra se ainda não terminou
                # Se não tem data_fim: mostra se ainda não começou
                queryset = queryset.filter(
                    Q(data_fim__gte=agora) | Q(data_fim__isnull=True, data_inicio__gte=agora)
                )
            
            return queryset
        except Exception as e:
            logger.error(f"Erro ao filtrar eventos: {e}", exc_info=True)
            return Evento.objects.none()
    
    @action(detail=False, methods=['get'])
    def proximos(self, request):
        """Retorna os próximos eventos (que ainda não terminaram)."""
        from django.db.models import Q
        agora = timezone.now()
        
        # Eventos que ainda não terminaram:
        # - Se tem data_fim: data_fim >= agora
        # - Se não tem data_fim: data_inicio >= agora
        eventos = Evento.objects.filter(
            Q(data_fim__gte=agora) | Q(data_fim__isnull=True, data_inicio__gte=agora),
            status__in=['agendado', 'em_andamento']
        ).order_by('data_inicio')[:5]
        serializer = EventoListaSerializer(eventos, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def destaques(self, request):
        """Retorna eventos em destaque (que ainda não terminaram)."""
        try:
            from django.db.models import Q
            agora = timezone.now()
            
            # Eventos em destaque que ainda não terminaram
            eventos = Evento.objects.filter(
                Q(data_fim__gte=agora) | Q(data_fim__isnull=True, data_inicio__gte=agora),
                destaque=True,
                status__in=['agendado', 'em_andamento']
            ).order_by('data_inicio')
            serializer = EventoListaSerializer(eventos, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao buscar eventos em destaque: {e}", exc_info=True)
            return Response(
                {'error': 'Erro ao carregar eventos em destaque'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def em_andamento(self, request):
        """Retorna eventos que estão ocorrendo agora (para check-in manual).
        Período: data_inicio <= agora <= data_fim (ou sem data_fim, desde que já começou).
        """
        from django.db.models import Q
        agora = timezone.now()
        # Já começou e ainda não terminou (ou não tem data_fim)
        eventos = Evento.objects.filter(
            status__in=EVENTO_STATUS_ATIVOS,
            data_inicio__lte=agora,
        ).filter(
            Q(data_fim__isnull=True) | Q(data_fim__gte=agora)
        ).order_by('data_inicio')
        serializer = EventoListaSerializer(eventos, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def inscritos(self, request, pk=None):
        """Lista os inscritos em um evento específico."""
        evento = self.get_object()
        inscricoes = evento.inscricoes.filter(status='confirmada')
        serializer = InscricaoSerializer(inscricoes, many=True)
        return Response(serializer.data)


class InscricaoViewSet(viewsets.ModelViewSet):
    """ViewSet para operações de Inscrições."""
    
    queryset = Inscricao.objects.all()
    serializer_class = InscricaoSerializer
    
    def get_queryset(self):
        queryset = Inscricao.objects.all()
        
        # Filtro por evento
        evento_id = self.request.query_params.get('evento')
        if evento_id:
            queryset = queryset.filter(evento_id=evento_id)
        
        # Filtro por membro
        membro_id = self.request.query_params.get('membro')
        if membro_id:
            queryset = queryset.filter(membro_id=membro_id)
        
        # Filtro por status
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def confirmar(self, request, pk=None):
        """Confirma uma inscrição."""
        inscricao = self.get_object()
        inscricao.status = 'confirmada'
        inscricao.save()
        serializer = InscricaoSerializer(inscricao)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        """
        Cancela a inscrição. Na cobrança, se for a única inscrição, grava status *cancelado*
        (e valor zerado) mantendo o registo; com mais de um, remove só o item e recalcula.
        """
        inscricao = self.get_object()
        inscricao.status = 'cancelada'
        if inscricao.status_pagamento == 'pendente':
            inscricao.status_pagamento = 'nao_aplicavel'
        inscricao.save()
        ajustar_cobrancas_ao_cancelar_inscricao(inscricao)
        inscricao.refresh_from_db()
        serializer = InscricaoSerializer(inscricao)
        return Response(serializer.data)

    def _disparar_webhook_pagamento(self, request, inscricao):
        """Helper para disparar webhook após confirmação de pagamento."""
        membro = inscricao.membro
        evento = inscricao.evento
        
        # Formatar telefone
        telefone_formatado = membro.telefone
        if len(membro.telefone) == 11:
            telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:7]}-{membro.telefone[7:]}"
        elif len(membro.telefone) == 10:
            telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:6]}-{membro.telefone[6:]}"
        
        # Função para formatar data
        def formatar_data_local(dt):
            if dt is None:
                return None
            from django.utils import timezone as tz
            if tz.is_aware(dt):
                dt_local = tz.localtime(dt)
            else:
                dt_local = dt
            return dt_local.strftime('%d/%m/%Y %H:%M')
        
        # Buscar acompanhantes (se for responsável)
        acompanhantes_lista = []
        if not inscricao.is_acompanhante:
            acompanhantes_qs = Inscricao.objects.filter(
                responsavel=membro,
                evento=evento,
                is_acompanhante=True
            ).select_related('membro', 'categoria')
            
            for acomp in acompanhantes_qs:
                acompanhantes_lista.append({
                    'id': acomp.id,
                    'nome': acomp.membro.nome,
                    'codigo': acomp.codigo,
                    'qrcode': acomp.qrcode.url if acomp.qrcode else None,
                    'categoria': acomp.categoria.nome if acomp.categoria else 'Adulto',
                    'valor': float(acomp.valor_inscricao) if acomp.valor_inscricao else 0,
                })
        
        # Calcular valor total
        valor_total = float(inscricao.valor_inscricao or 0)
        for acomp in acompanhantes_lista:
            valor_total += acomp['valor']
        
        dados_webhook = {
            'base_url': request.build_absolute_uri('/').rstrip('/'),
            'participante_id': membro.id,
            'nome': membro.nome,
            'telefone': membro.telefone,
            'telefone_formatado': telefone_formatado,
            'email': membro.email,
            'senha': membro.senha_texto,
            'novo_cadastro': False,
            'inscricao_id': inscricao.id,
            'codigo': inscricao.codigo,
            'qrcode_path': inscricao.qrcode.url if inscricao.qrcode else None,
            'evento_id': evento.id,
            'evento_titulo': evento.titulo,
            'evento_data_inicio': formatar_data_local(evento.data_inicio),
            'evento_data_fim': formatar_data_local(evento.data_fim),
            'evento_local': evento.local,
            'evento_endereco': evento.endereco,
            'evento_pago': evento.evento_pago,
            'evento_valor': float(evento.valor_inscricao) if evento.valor_inscricao else None,
            'valor_total': valor_total,
            'pagamento_confirmado': True,
            'acompanhantes': acompanhantes_lista,
            'total_inscritos': 1 + len(acompanhantes_lista),
        }
        
        # Dispara webhook em background
        thread = threading.Thread(target=enviar_webhook_inscricao, args=(dados_webhook,))
        thread.daemon = True
        thread.start()
    
    @action(detail=True, methods=['post'])
    def confirmar_pagamento(self, request, pk=None):
        """Confirma o pagamento de uma inscrição e libera o ingresso (gera QR code).
        Se for responsável, também confirma todos os acompanhantes."""
        inscricao = self.get_object()
        inscricao.status_pagamento = 'pago'
        inscricao.data_pagamento = timezone.now()
        inscricao.status = 'confirmada'  # Libera o ingresso
        inscricao.save()  # save() vai gerar o QR code automaticamente
        
        # Garantir que o QR code foi gerado
        if not inscricao.qrcode:
            inscricao.gerar_qrcode()
        
        # Se for responsável, confirmar todos os acompanhantes também
        total_confirmados = 1
        if not inscricao.is_acompanhante:
            acompanhantes = Inscricao.objects.filter(
                responsavel=inscricao.membro,
                evento=inscricao.evento,
                is_acompanhante=True
            )
            for acomp in acompanhantes:
                acomp.status_pagamento = 'pago'
                acomp.data_pagamento = timezone.now()
                acomp.status = 'confirmada'
                acomp.save()
                if not acomp.qrcode:
                    acomp.gerar_qrcode()
                total_confirmados += 1
        
        # Disparar webhook
        self._disparar_webhook_pagamento(request, inscricao)
        
        serializer = InscricaoSerializer(inscricao)
        return Response({
            'success': True,
            'message': f'Pagamento confirmado! {total_confirmados} ingresso(s) liberado(s).',
            'inscricao': serializer.data,
            'total_confirmados': total_confirmados
        })
    
    @action(detail=True, methods=['post'])
    def isentar_pagamento(self, request, pk=None):
        """Marca uma inscrição como isenta de pagamento (gera QR code).
        Se for responsável, também isenta todos os acompanhantes."""
        inscricao = self.get_object()
        inscricao.status_pagamento = 'isento'
        inscricao.valor_inscricao = 0
        inscricao.status = 'confirmada'  # Libera o ingresso
        inscricao.save()  # save() vai gerar o QR code automaticamente
        
        # Garantir que o QR code foi gerado
        if not inscricao.qrcode:
            inscricao.gerar_qrcode()
        
        # Se for responsável, isentar todos os acompanhantes também
        total_confirmados = 1
        if not inscricao.is_acompanhante:
            acompanhantes = Inscricao.objects.filter(
                responsavel=inscricao.membro,
                evento=inscricao.evento,
                is_acompanhante=True
            )
            for acomp in acompanhantes:
                acomp.status_pagamento = 'isento'
                acomp.valor_inscricao = 0
                acomp.status = 'confirmada'
                acomp.save()
                if not acomp.qrcode:
                    acomp.gerar_qrcode()
                total_confirmados += 1
        
        # Disparar webhook
        self._disparar_webhook_pagamento(request, inscricao)
        
        serializer = InscricaoSerializer(inscricao)
        return Response({
            'success': True,
            'message': f'Inscrição isenta! {total_confirmados} ingresso(s) liberado(s).',
            'inscricao': serializer.data,
            'total_confirmados': total_confirmados
        })
    
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def confirmar_pagamento_grupo(self, request):
        """Confirma pagamento de múltiplas inscrições de um grupo (responsável + acompanhantes)."""
        responsavel_id = request.data.get('responsavel_id')
        evento_id = request.data.get('evento_id')
        
        if not responsavel_id or not evento_id:
            return Response({'error': 'IDs necessários'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Buscar inscrição do responsável
        try:
            inscricao_principal = Inscricao.objects.get(
                membro_id=responsavel_id, 
                evento_id=evento_id,
                is_acompanhante=False
            )
        except Inscricao.DoesNotExist:
            return Response({'error': 'Inscrição não encontrada'}, status=status.HTTP_404_NOT_FOUND)
        
        # Confirmar pagamento do responsável
        inscricao_principal.status_pagamento = 'pago'
        inscricao_principal.data_pagamento = timezone.now()
        inscricao_principal.status = 'confirmada'
        inscricao_principal.save()  # Gera QR code
        if not inscricao_principal.qrcode:
            inscricao_principal.gerar_qrcode()
        
        # Confirmar pagamento dos acompanhantes (um a um para gerar QR codes)
        acompanhantes_qs = Inscricao.objects.filter(
            responsavel_id=responsavel_id,
            evento_id=evento_id,
            is_acompanhante=True
        ).select_related('membro', 'categoria')
        
        acompanhantes_lista = []
        for acomp in acompanhantes_qs:
            acomp.status_pagamento = 'pago'
            acomp.data_pagamento = timezone.now()
            acomp.status = 'confirmada'
            acomp.save()  # Gera QR code
            if not acomp.qrcode:
                acomp.gerar_qrcode()
            
            # Preparar dados do acompanhante para o webhook
            acompanhantes_lista.append({
                'id': acomp.id,
                'nome': acomp.membro.nome,
                'codigo': acomp.codigo,
                'qrcode': acomp.qrcode.url if acomp.qrcode else None,
                'categoria': acomp.categoria.nome if acomp.categoria else 'Adulto',
                'valor': float(acomp.valor_inscricao) if acomp.valor_inscricao else 0,
            })
        
        # Disparar webhook após confirmação de pagamento
        membro = inscricao_principal.membro
        evento = inscricao_principal.evento
        
        # Formatar telefone
        telefone_formatado = membro.telefone
        if len(membro.telefone) == 11:
            telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:7]}-{membro.telefone[7:]}"
        elif len(membro.telefone) == 10:
            telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:6]}-{membro.telefone[6:]}"
        
        # Função para formatar data
        def formatar_data_local(dt):
            if dt is None:
                return None
            from django.utils import timezone as tz
            if tz.is_aware(dt):
                dt_local = tz.localtime(dt)
            else:
                dt_local = dt
            return dt_local.strftime('%d/%m/%Y %H:%M')
        
        # Calcular valor total
        valor_total = float(inscricao_principal.valor_inscricao or 0)
        for acomp in acompanhantes_lista:
            valor_total += acomp['valor']
        
        dados_webhook = {
            'base_url': request.build_absolute_uri('/').rstrip('/'),
            'participante_id': membro.id,
            'nome': membro.nome,
            'telefone': membro.telefone,
            'telefone_formatado': telefone_formatado,
            'email': membro.email,
            'senha': membro.senha_texto,  # Senha em texto (se disponível)
            'novo_cadastro': False,  # Pagamento confirmado não é novo cadastro
            'inscricao_id': inscricao_principal.id,
            'codigo': inscricao_principal.codigo,
            'qrcode_path': inscricao_principal.qrcode.url if inscricao_principal.qrcode else None,
            'evento_id': evento.id,
            'evento_titulo': evento.titulo,
            'evento_data_inicio': formatar_data_local(evento.data_inicio),
            'evento_data_fim': formatar_data_local(evento.data_fim),
            'evento_local': evento.local,
            'evento_endereco': evento.endereco,
            'evento_pago': True,
            'evento_valor': float(evento.valor_inscricao) if evento.valor_inscricao else None,
            'valor_total': valor_total,
            'pagamento_confirmado': True,
            'acompanhantes': acompanhantes_lista,
            'total_inscritos': 1 + len(acompanhantes_lista),
        }
        
        # Dispara webhook em background
        thread = threading.Thread(target=enviar_webhook_inscricao, args=(dados_webhook,))
        thread.daemon = True
        thread.start()
        
        return Response({
            'success': True,
            'message': f'Pagamento confirmado para {1 + len(acompanhantes_lista)} pessoa(s)!',
            'total_confirmados': 1 + len(acompanhantes_lista)
        })
    
    @action(detail=True, methods=['post'])
    def marcar_presenca(self, request, pk=None):
        """Marca presença em uma inscrição."""
        inscricao = self.get_object()
        inscricao.presente = True
        inscricao.data_checkin = timezone.now()
        inscricao.save()
        serializer = InscricaoSerializer(inscricao)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def checkin(self, request):
        """
        Realiza check-in via QR Code.
        Espera: { "codigo": "uuid-do-qrcode" }
        """
        codigo = request.data.get('codigo')
        
        if not codigo:
            return Response(
                {'error': 'Código não fornecido'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            inscricao = Inscricao.objects.select_related('membro', 'evento').get(codigo=codigo)
        except Inscricao.DoesNotExist:
            return Response(
                {'error': 'Inscrição não encontrada', 'valido': False},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Invalidar QR code de eventos inativos (finalizado/cancelado)
        if inscricao.evento.status not in EVENTO_STATUS_ATIVOS:
            return Response({
                'error': 'Evento inativo ou encerrado. Este QR Code não é mais válido.',
                'valido': False,
                'evento_inativo': True,
                'inscricao': InscricaoSerializer(inscricao).data
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Só permitir check-in no período do evento (entre data_inicio e data_fim)
        evento = inscricao.evento
        agora = timezone.now()
        inicio = evento.data_inicio
        fim = evento.data_fim
        if timezone.is_naive(inicio):
            inicio = timezone.make_aware(inicio)
        if fim is not None and timezone.is_naive(fim):
            fim = timezone.make_aware(fim)
        if agora < inicio:
            return Response({
                'error': 'O evento ainda não começou. O check-in só pode ser feito durante a realização do evento.',
                'valido': False,
                'evento_nao_iniciado': True,
                'inscricao': InscricaoSerializer(inscricao).data,
                'data_inicio_evento': timezone.localtime(evento.data_inicio).strftime('%d/%m/%Y %H:%M'),
            }, status=status.HTTP_400_BAD_REQUEST)
        if fim is not None and agora > fim:
            return Response({
                'error': 'O evento já encerrou. Não é mais possível fazer check-in.',
                'valido': False,
                'evento_encerrado': True,
                'inscricao': InscricaoSerializer(inscricao).data,
                'data_fim_evento': timezone.localtime(evento.data_fim).strftime('%d/%m/%Y %H:%M'),
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Verificar se já fez check-in
        if inscricao.presente:
            return Response({
                'error': 'Check-in já realizado',
                'valido': False,
                'ja_checkin': True,
                'inscricao': InscricaoSerializer(inscricao).data,
                'data_checkin': timezone.localtime(inscricao.data_checkin).strftime('%d/%m/%Y %H:%M:%S') if inscricao.data_checkin else None
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Verificar se pagamento está pendente
        if inscricao.status_pagamento == 'pendente':
            return Response({
                'error': 'Pagamento pendente! O participante precisa confirmar o pagamento antes do check-in.',
                'valido': False,
                'pagamento_pendente': True,
                'inscricao': InscricaoSerializer(inscricao).data
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Verificar status da inscrição
        if inscricao.status != 'confirmada':
            return Response({
                'error': f'Inscrição com status: {inscricao.get_status_display()}',
                'valido': False,
                'inscricao': InscricaoSerializer(inscricao).data
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Realizar check-in
        inscricao.presente = True
        inscricao.data_checkin = timezone.now()
        inscricao.save()
        
        return Response({
            'success': True,
            'valido': True,
            'message': 'Check-in realizado com sucesso!',
            'inscricao': InscricaoSerializer(inscricao).data,
            'participante': {
                'nome': inscricao.membro.nome,
                'email': inscricao.membro.email,
            },
            'evento': {
                'titulo': inscricao.evento.titulo,
                'data': timezone.localtime(inscricao.evento.data_inicio).strftime('%d/%m/%Y %H:%M'),
            },
            'data_checkin': timezone.localtime(inscricao.data_checkin).strftime('%d/%m/%Y %H:%M:%S')
        })
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def buscar_por_codigo(self, request):
        """
        Busca inscrição por código (sem fazer check-in).
        Útil para verificar antes de confirmar.
        """
        codigo = request.query_params.get('codigo')
        
        if not codigo:
            return Response(
                {'error': 'Código não fornecido'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            inscricao = Inscricao.objects.select_related('membro', 'evento').get(codigo=codigo)
        except Inscricao.DoesNotExist:
            return Response(
                {'error': 'Inscrição não encontrada', 'encontrada': False},
                status=status.HTTP_404_NOT_FOUND
            )
        
        evento_ativo = inscricao.evento.status in EVENTO_STATUS_ATIVOS
        
        return Response({
            'encontrada': True,
            'evento_ativo': evento_ativo,
            'inscricao': InscricaoSerializer(inscricao).data,
            'participante': {
                'nome': inscricao.membro.nome,
                'email': inscricao.membro.email,
                'telefone': inscricao.membro.telefone,
            },
            'evento': {
                'id': inscricao.evento.id,
                'titulo': inscricao.evento.titulo,
                'data': timezone.localtime(inscricao.evento.data_inicio).strftime('%d/%m/%Y %H:%M'),
                'local': inscricao.evento.local,
            },
            'status': inscricao.status,
            'status_display': inscricao.get_status_display(),
            'ja_checkin': inscricao.presente,
            'data_checkin': timezone.localtime(inscricao.data_checkin).strftime('%d/%m/%Y %H:%M:%S') if inscricao.data_checkin else None
        })

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def buscar_para_checkin(self, request):
        """
        Busca inscritos de um evento (em andamento) por nome para check-in manual.
        Query params: evento_id (obrigatório), nome (opcional - primeiro nome ou parte do nome).
        Retorna apenas inscrições confirmadas com pagamento ok; evento deve estar em andamento.
        """
        from django.db.models import Q
        evento_id = request.query_params.get('evento_id')
        nome = (request.query_params.get('nome') or '').strip()
        if not evento_id:
            return Response(
                {'error': 'evento_id é obrigatório'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            evento = Evento.objects.get(pk=evento_id)
        except Evento.DoesNotExist:
            return Response(
                {'error': 'Evento não encontrado'},
                status=status.HTTP_404_NOT_FOUND
            )
        # Só permitir se o evento está em andamento
        agora = timezone.now()
        if evento.status not in EVENTO_STATUS_ATIVOS:
            return Response(
                {'error': 'Este evento não está disponível para check-in no momento.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        inicio = evento.data_inicio
        fim = evento.data_fim
        if timezone.is_naive(inicio):
            inicio = timezone.make_aware(inicio)
        if fim is not None and timezone.is_naive(fim):
            fim = timezone.make_aware(fim)
        if agora < inicio:
            return Response(
                {'error': 'O evento ainda não começou.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if fim is not None and agora > fim:
            return Response(
                {'error': 'O evento já encerrou.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        # Inscrições confirmadas; excluir pendência de pagamento (salvo evento gratuito)
        queryset = Inscricao.objects.filter(
            evento=evento,
            status='confirmada'
        ).select_related('membro', 'evento')
        if evento.evento_pago:
            queryset = queryset.exclude(status_pagamento='pendente')
        if nome:
            if len(nome) < 2:
                return Response(
                    {'error': 'Digite ao menos 2 caracteres para buscar.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            queryset = queryset.filter(membro__nome__icontains=nome)
        queryset = queryset.order_by('membro__nome')
        lista = []
        for ins in queryset:
            lista.append({
                'id': ins.id,
                'membro_nome': ins.membro.nome,
                'presente': ins.presente,
                'data_checkin': timezone.localtime(ins.data_checkin).strftime('%d/%m/%Y %H:%M:%S') if ins.data_checkin else None,
                'is_acompanhante': ins.is_acompanhante,
                'evento_titulo': ins.evento.titulo,
            })
        return Response({
            'evento_id': evento.id,
            'evento_titulo': evento.titulo,
            'inscricoes': lista,
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def marcar_presenca_manual(self, request, pk=None):
        """
        Marca presença manualmente (check-in sem QR Code).
        Valida: evento em andamento, pagamento ok, inscrição confirmada.
        """
        inscricao = self.get_object()
        evento = inscricao.evento
        if inscricao.status != 'confirmada':
            return Response(
                {'error': f'Inscrição com status: {inscricao.get_status_display()}. Não é possível fazer check-in.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if evento.evento_pago and inscricao.status_pagamento == 'pendente':
            return Response(
                {'error': 'Pagamento pendente. Confirme o pagamento antes do check-in.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if inscricao.presente:
            return Response({
                'error': 'Check-in já realizado',
                'ja_checkin': True,
                'data_checkin': timezone.localtime(inscricao.data_checkin).strftime('%d/%m/%Y %H:%M:%S') if inscricao.data_checkin else None
            }, status=status.HTTP_400_BAD_REQUEST)
        # Evento em andamento
        agora = timezone.now()
        inicio = evento.data_inicio
        fim = evento.data_fim
        if timezone.is_naive(inicio):
            inicio = timezone.make_aware(inicio)
        if fim is not None and timezone.is_naive(fim):
            fim = timezone.make_aware(fim)
        if agora < inicio:
            return Response({'error': 'O evento ainda não começou.'}, status=status.HTTP_400_BAD_REQUEST)
        if fim is not None and agora > fim:
            return Response({'error': 'O evento já encerrou.'}, status=status.HTTP_400_BAD_REQUEST)
        if evento.status not in EVENTO_STATUS_ATIVOS:
            return Response({'error': 'Evento inativo ou encerrado.'}, status=status.HTTP_400_BAD_REQUEST)
        inscricao.presente = True
        inscricao.data_checkin = timezone.now()
        inscricao.save()
        return Response({
            'success': True,
            'message': 'Check-in realizado com sucesso!',
            'inscricao': InscricaoSerializer(inscricao).data,
            'participante': {'nome': inscricao.membro.nome},
            'evento': {'titulo': evento.titulo},
            'data_checkin': timezone.localtime(inscricao.data_checkin).strftime('%d/%m/%Y %H:%M:%S')
        })


class ContatoViewSet(viewsets.ModelViewSet):
    """ViewSet para mensagens de Contato."""
    
    queryset = Contato.objects.all()
    serializer_class = ContatoSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head']
    
    def get_queryset(self):
        queryset = Contato.objects.all()
        
        # Filtro por lido
        lido = self.request.query_params.get('lido')
        if lido is not None:
            queryset = queryset.filter(lido=lido.lower() == 'true')
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def marcar_lido(self, request, pk=None):
        """Marca uma mensagem como lida."""
        contato = self.get_object()
        contato.lido = True
        contato.save(update_fields=['lido'])
        return Response({'success': True, 'message': 'Mensagem marcada como lida'})
    
    @action(detail=True, methods=['post'])
    def marcar_nao_lido(self, request, pk=None):
        """Marca uma mensagem como não lida."""
        contato = self.get_object()
        contato.lido = False
        contato.save(update_fields=['lido'])
        return Response({'success': True, 'message': 'Mensagem marcada como não lida'})


# ============================================
# CATEGORIAS DE PARTICIPANTES
# ============================================

class CategoriaParticipanteViewSet(viewsets.ModelViewSet):
    """ViewSet para operações CRUD de Categorias de Participantes."""
    
    queryset = CategoriaParticipante.objects.all()
    serializer_class = CategoriaParticipanteSerializer
    
    def get_permissions(self):
        """
        Permite leitura pública (para o formulário de inscrição),
        mas requer autenticação para modificações.
        """
        if self.action in ['list', 'retrieve', 'ativas']:
            return [AllowAny()]
        return [IsAuthenticated()]
    
    def get_queryset(self):
        queryset = CategoriaParticipante.objects.all()
        
        # Filtro por ativo
        ativo = self.request.query_params.get('ativo')
        if ativo is not None:
            queryset = queryset.filter(ativo=ativo.lower() == 'true')
        
        return queryset.order_by('ordem', 'nome')
    
    @action(detail=False, methods=['get'])
    def ativas(self, request):
        """Retorna apenas as categorias ativas (para uso no formulário)."""
        categorias = CategoriaParticipante.objects.filter(ativo=True).order_by('ordem', 'nome')
        serializer = CategoriaParticipanteSerializer(categorias, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def calcular_valor(self, request, pk=None):
        """Calcula o valor para esta categoria baseado no valor do evento."""
        categoria = self.get_object()
        valor_evento = request.data.get('valor_evento', 0)
        
        try:
            valor_evento = float(valor_evento)
        except (ValueError, TypeError):
            valor_evento = 0
        
        valor_calculado = categoria.calcular_valor(valor_evento)
        
        return Response({
            'categoria': categoria.nome,
            'valor_evento': valor_evento,
            'valor_calculado': valor_calculado,
            'valor_formatado': f'R$ {valor_calculado:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
        })


# ============================================
# CONFIGURAÇÕES DO SITE
# ============================================

@api_view(['GET'])
@permission_classes([AllowAny])
def configuracao_publica(request):
    """
    Retorna as configurações públicas do site.
    Endpoint público para uso no frontend.
    """
    from django.db import connection
    from django.db.utils import OperationalError

    def _get_config():
        config = ConfiguracaoSite.get_config()
        serializer = ConfiguracaoSitePublicSerializer(config)
        return Response(serializer.data)

    try:
        return _get_config()
    except OperationalError as e:
        if 'closed the connection' in str(e).lower() or 'connection' in str(e).lower():
            connection.close()
            try:
                return _get_config()
            except Exception as retry_e:
                logger.error(f"Retry falhou em configuracao_publica: {retry_e}", exc_info=True)
                raise
        raise
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        logger.error(f"Erro ao buscar configuração pública: {e}\n{error_detail}", exc_info=True)
        # Em desenvolvimento, retornar detalhes do erro para debug
        error_response = {
            'error': 'Erro ao carregar configurações',
            'detail': str(e)
        }
        if settings.DEBUG:
            error_response['traceback'] = error_detail
        return Response(
            error_response,
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def configuracao_admin(request):
    """
    Retorna ou atualiza as configurações do site.
    Requer autenticação de administrador.
    """
    config = ConfiguracaoSite.get_config()
    
    if request.method == 'GET':
        serializer = ConfiguracaoSiteSerializer(config)
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        partial = request.method == 'PATCH'
        serializer = ConfiguracaoSiteSerializer(config, data=request.data, partial=partial)
        
        if serializer.is_valid():
            instance = serializer.save()
            # Webhook unificado: URLs legadas não são mais usadas (evita resíduo no banco)
            ConfiguracaoSite.objects.filter(pk=instance.pk).update(
                webhook_reset_senha=None,
                webhook_eventos=None,
            )
            # Remover quadriculado de logos (substituir fundo por azul do header)
            if 'logo' in request.FILES and config.logo:
                try:
                    substituir_fundo_logo_por_navy(config.logo.path)
                except Exception:
                    pass
            if 'logo_branco' in request.FILES and config.logo_branco:
                try:
                    substituir_fundo_logo_por_navy(config.logo_branco.path)
                except Exception:
                    pass
            # Reprocessar logos existentes (remover quadriculado) se solicitado
            reprocess_logo = request.data.get('reprocess_logo') in (True, 'true', 'True', '1')
            if reprocess_logo:
                try:
                    if config.logo:
                        substituir_fundo_logo_por_navy(config.logo.path)
                    if config.logo_branco:
                        substituir_fundo_logo_por_navy(config.logo_branco.path)
                except Exception:
                    pass
            # Limpar logos se o admin solicitou remoção
            clear_logo = request.data.get('clear_logo') in (True, 'true', 'True', '1')
            clear_logo_branco = request.data.get('clear_logo_branco') in (True, 'true', 'True', '1')
            if clear_logo and config.logo:
                config.logo = None
                config.save(update_fields=['logo'])
            if clear_logo_branco and config.logo_branco:
                config.logo_branco = None
                config.save(update_fields=['logo_branco'])
            clear_banner = request.data.get('clear_imagem_banner') in (True, 'true', 'True', '1')
            if clear_banner and config.imagem_banner:
                config.imagem_banner = None
                config.save(update_fields=['imagem_banner'])
            config.refresh_from_db()
            return Response(ConfiguracaoSiteSerializer(config).data)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ============================================
# COBRANÇAS
# ============================================

class CobrancaViewSet(viewsets.ModelViewSet):
    """ViewSet para operações CRUD de Cobranças."""
    
    queryset = Cobranca.objects.all()
    serializer_class = CobrancaSerializer
    
    def get_permissions(self):
        """
        Permite leitura pública (para página de pagamento),
        mas requer autenticação para modificações.
        """
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAuthenticated()]
    
    def get_queryset(self):
        queryset = Cobranca.objects.all().select_related('membro', 'evento').prefetch_related('itens__inscricao__membro')
        
        # Filtro por evento
        evento_id = self.request.query_params.get('evento')
        if evento_id:
            queryset = queryset.filter(evento_id=evento_id)
        
        # Filtro por status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filtro por membro
        membro_id = self.request.query_params.get('membro')
        if membro_id:
            queryset = queryset.filter(membro_id=membro_id)
        
        return queryset.order_by('-data_criacao')
    
    @action(detail=True, methods=['post'])
    def confirmar_pagamento(self, request, pk=None):
        """Confirma o pagamento de uma cobrança."""
        cobranca = self.get_object()
        
        if cobranca.status == 'pago':
            return Response(
                {'error': 'Esta cobrança já foi paga'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Atualizar cobrança
        cobranca.status = 'pago'
        cobranca.data_pagamento = timezone.now()
        cobranca.metodo_pagamento = request.data.get('metodo_pagamento', 'Manual')
        cobranca.referencia_externa = request.data.get('referencia_externa', '')
        cobranca.save()
        
        # Atualizar inscrições vinculadas
        for item in cobranca.itens.all():
            inscricao = item.inscricao
            inscricao.status_pagamento = 'pago'
            inscricao.status = 'confirmada'
            inscricao.data_pagamento = timezone.now()
            inscricao.save()  # Isso vai gerar o QR Code
        
        # Disparar webhook com mesmo payload do MP (QR codes etc.), tipo confirmado_pagamento_manual
        _disparar_webhook_cobranca_confirmada(cobranca, tipo='confirmado_pagamento_manual', request=request)
        
        serializer = CobrancaSerializer(cobranca)
        return Response({
            'success': True,
            'message': 'Pagamento confirmado com sucesso!',
            'cobranca': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        """Cancela uma cobrança."""
        cobranca = self.get_object()
        
        if cobranca.status == 'pago':
            return Response(
                {'error': 'Não é possível cancelar uma cobrança já paga'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        cobranca.status = 'cancelado'
        cobranca.save()
        
        # Cancelar inscrições vinculadas
        for item in cobranca.itens.all():
            inscricao = item.inscricao
            inscricao.status = 'cancelada'
            inscricao.status_pagamento = 'cancelado' if inscricao.status_pagamento == 'pendente' else inscricao.status_pagamento
            inscricao.save()
        
        serializer = CobrancaSerializer(cobranca)
        return Response({
            'success': True,
            'message': 'Cobrança cancelada',
            'cobranca': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def isentar(self, request, pk=None):
        """Isenta uma cobrança (não cobra)."""
        cobranca = self.get_object()
        
        if cobranca.status == 'pago':
            return Response(
                {'error': 'Esta cobrança já foi paga'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        cobranca.status = 'isento'
        cobranca.data_pagamento = timezone.now()
        cobranca.save()
        
        # Atualizar inscrições vinculadas como isentas
        for item in cobranca.itens.all():
            inscricao = item.inscricao
            inscricao.status_pagamento = 'isento'
            inscricao.status = 'confirmada'
            inscricao.data_pagamento = timezone.now()
            inscricao.save()  # Isso vai gerar o QR Code
        
        # Disparar webhook com mesmo payload do MP (QR codes etc.), tipo isento
        _disparar_webhook_cobranca_confirmada(cobranca, tipo='isento', request=request)
        
        serializer = CobrancaSerializer(cobranca)
        return Response({
            'success': True,
            'message': 'Cobrança isenta com sucesso!',
            'cobranca': serializer.data
        })
    
    def _atualizar_status_cobranca_apos_itens(self, cobranca):
        """Recalcula valor e status da cobrança após alteração em um item."""
        recalcular_cobranca_apos_mudanca_itens(
            cobranca, request=self.request, disparar_webhook=True
        )
    
    @action(detail=True, methods=['post'], url_path='itens/(?P<item_id>[^/.]+)/confirmar')
    def confirmar_item(self, request, pk=None, item_id=None):
        """Confirma pagamento de um único participante (item) da cobrança."""
        cobranca = self.get_object()
        item = get_object_or_404(CobrancaItem, cobranca=cobranca, id=item_id)
        inscricao = item.inscricao
        if inscricao.status_pagamento not in ('pendente',):
            return Response(
                {'error': f'Inscrição já está com status {inscricao.status_pagamento}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        inscricao.status_pagamento = 'pago'
        inscricao.status = 'confirmada'
        inscricao.data_pagamento = timezone.now()
        inscricao.save()
        self._atualizar_status_cobranca_apos_itens(cobranca)
        serializer = CobrancaSerializer(cobranca)
        return Response({
            'success': True,
            'message': f'Pagamento de {inscricao.membro.nome} confirmado.',
            'cobranca': serializer.data
        })
    
    @action(detail=True, methods=['post'], url_path='itens/(?P<item_id>[^/.]+)/isentar')
    def isentar_item(self, request, pk=None, item_id=None):
        """Isenta um único participante (item) da cobrança."""
        cobranca = self.get_object()
        item = get_object_or_404(CobrancaItem, cobranca=cobranca, id=item_id)
        inscricao = item.inscricao
        if inscricao.status_pagamento not in ('pendente',):
            return Response(
                {'error': f'Inscrição já está com status {inscricao.status_pagamento}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        inscricao.status_pagamento = 'isento'
        inscricao.status = 'confirmada'
        inscricao.data_pagamento = timezone.now()
        inscricao.save()
        self._atualizar_status_cobranca_apos_itens(cobranca)
        serializer = CobrancaSerializer(cobranca)
        return Response({
            'success': True,
            'message': f'{inscricao.membro.nome} isento(a).',
            'cobranca': serializer.data
        })
    
    @action(detail=True, methods=['post'], url_path='itens/(?P<item_id>[^/.]+)/cancelar')
    def cancelar_item(self, request, pk=None, item_id=None):
        """Cancela inscrição de um único participante (item) na cobrança."""
        cobranca = self.get_object()
        item = get_object_or_404(CobrancaItem, cobranca=cobranca, id=item_id)
        inscricao = item.inscricao
        if inscricao.status_pagamento == 'cancelado':
            return Response(
                {'error': 'Inscrição já está cancelada'},
                status=status.HTTP_400_BAD_REQUEST
            )
        inscricao.status = 'cancelada'
        inscricao.status_pagamento = 'cancelado'
        inscricao.save()
        self._atualizar_status_cobranca_apos_itens(cobranca)
        serializer = CobrancaSerializer(cobranca)
        return Response({
            'success': True,
            'message': f'Inscrição de {inscricao.membro.nome} cancelada.',
            'cobranca': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def pendentes(self, request):
        """Retorna cobranças pendentes."""
        queryset = self.get_queryset().filter(status='pendente')
        serializer = CobrancaSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def por_evento(self, request):
        """Retorna cobranças agrupadas por evento."""
        evento_id = request.query_params.get('evento_id')
        if not evento_id:
            return Response(
                {'error': 'evento_id é obrigatório'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        queryset = self.get_queryset().filter(evento_id=evento_id)
        serializer = CobrancaSerializer(queryset, many=True)
        
        # Calcular totais
        total_pendente = sum(float(c.valor) for c in queryset.filter(status='pendente'))
        total_pago = sum(float(c.valor) for c in queryset.filter(status='pago'))
        total_isento = sum(float(c.valor) for c in queryset.filter(status='isento'))
        
        return Response({
            'cobrancas': serializer.data,
            'totais': {
                'pendente': total_pendente,
                'pago': total_pago,
                'isento': total_isento,
                'total': total_pendente + total_pago + total_isento
            }
        })


# ============================================
# MERCADO PAGO - INTEGRAÇÃO DE PAGAMENTOS
# ============================================

import mercadopago
from .mercadopago_sdk import get_mercadopago_sdk


@api_view(['POST'])
@permission_classes([AllowAny])
def criar_pagamento_pix(request):
    """
    Cria uma preferência de pagamento no Mercado Pago (Checkout Pro).
    Retorna o link de pagamento para o usuário.
    Reutiliza preferência existente se já houver uma criada.
    Espera: { "cobranca_id": 1 }
    """
    cobranca_id = request.data.get('cobranca_id')
    
    if not cobranca_id:
        return Response(
            {'error': 'cobranca_id é obrigatório'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        cobranca = Cobranca.objects.select_related('membro', 'evento').prefetch_related('itens__inscricao__membro').get(id=cobranca_id)
    except Cobranca.DoesNotExist:
        return Response(
            {'error': 'Cobrança não encontrada'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    if cobranca.status != 'pendente':
        return Response(
            {'error': f'Cobrança já está com status: {cobranca.get_status_display()}'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Verificar se MP está configurado
    config = ConfiguracaoSite.get_config()
    if not config.mp_ativo:
        return Response(
            {'error': 'Mercado Pago não está ativo nas configurações'},
            status=status.HTTP_400_BAD_REQUEST
        )
    # PIX exige produção; se "cartão em sandbox" estiver ativo, usar produção para criar preferência
    sdk = get_mercadopago_sdk('production') if getattr(config, 'mp_cartao_em_sandbox', False) else get_mercadopago_sdk()
    if not sdk:
        return Response(
            {'error': 'Mercado Pago não configurado corretamente'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
    # ========================================
    # REUTILIZAR PREFERÊNCIA EXISTENTE
    # ========================================
    # Se já existe uma referência externa (preferência criada), buscar o link existente
    if cobranca.referencia_externa:
        try:
            print(f"[MP] Reutilizando preferência existente: {cobranca.referencia_externa}")
            preference_response = sdk.preference().get(cobranca.referencia_externa)
            preference = preference_response.get("response", {})
            
            if preference_response.get("status") in [200, 201] and preference.get("init_point"):
                print(f"[MP] Link existente encontrado: {preference.get('init_point')}")
                env = 'production' if getattr(config, 'mp_cartao_em_sandbox', False) else config.mp_ambiente
                return Response({
                    'success': True,
                    'preference_id': cobranca.referencia_externa,
                    'init_point': preference.get("init_point"),
                    'sandbox_init_point': preference.get("sandbox_init_point"),
                    'is_sandbox': env == 'sandbox',
                    'valor': float(cobranca.valor),
                    'cobranca': {'id': cobranca.id, 'codigo': cobranca.codigo},
                    'reutilizado': True,
                })
        except Exception as e:
            # Se falhar ao buscar preferência existente, criar uma nova
            print(f"[MP] Erro ao buscar preferência existente, criando nova: {str(e)}")
            cobranca.referencia_externa = ''
            cobranca.save(update_fields=['referencia_externa'])
    
    # ========================================
    # CRIAR NOVA PREFERÊNCIA
    # ========================================
    # Montar dados do pagamento
    membro = cobranca.membro
    evento = cobranca.evento
    
    # Formatar data do evento
    data_evento = evento.data_inicio.strftime('%d/%m/%Y às %H:%M') if evento.data_inicio else ''
    
    # Nomes das pessoas (titular + acompanhantes) — uma linha só (Mercado Pago não quebra linha na descrição)
    # Doc MP: title e description têm limite de 256 caracteres cada
    MP_MAX_CHARS = 256
    nomes_pessoas = [item.inscricao.membro.nome for item in cobranca.itens.all() if item.inscricao and item.inscricao.membro]
    if not nomes_pessoas:
        nomes_pessoas = [membro.nome]
    descricao_pagamento = f"{evento.titulo} — {', '.join(nomes_pessoas)}"
    if len(descricao_pagamento) > MP_MAX_CHARS:
        descricao_pagamento = descricao_pagamento[: MP_MAX_CHARS - 3] + "..."
    titulo_item = (evento.titulo or "Inscrição")[:MP_MAX_CHARS]
    
    # URL da imagem do evento (se existir)
    imagem_url = None
    if evento.imagem:
        try:
            imagem_url = request.build_absolute_uri(evento.imagem.url)
        except:
            pass
    
    # Um único item no Mercado Pago (evita "Pedido de X produtos" — mostra como 1 pedido com a descrição do evento e nomes)
    valor_total = float(cobranca.valor)
    item_data = {
        "title": titulo_item,
        "description": descricao_pagamento,
        "quantity": 1,
        "unit_price": valor_total,
        "currency_id": "BRL",
        "category_id": "tickets",
    }
    if imagem_url:
        item_data["picture_url"] = imagem_url
    items = [item_data]
    
    # Email do pagador
    # Em ambiente de teste (localhost), usar email placeholder para evitar conflito com conta do vendedor
    base_url = request.build_absolute_uri('/')
    is_localhost = 'localhost' in base_url or '127.0.0.1' in base_url
    
    if is_localhost:
        # Usar email único baseado no telefone para testes
        email_pagador = f"teste{membro.telefone}@testepagamento.com"
    else:
        email_pagador = membro.email if membro.email else f"participante{membro.telefone}@email.com"
    
    # Dados da preferência (Checkout Pro) — apenas PIX e cartão (sem boleto)
    preference_data = {
        "items": items,
        "payer": {
            "email": email_pagador,
            "name": membro.nome,
        },
        "external_reference": cobranca.codigo,
        "statement_descriptor": "IGREJA",
        "payment_methods": {
            "excluded_payment_methods": [],
            # Excluir boleto: apenas PIX e cartão de crédito/débito
            "excluded_payment_types": [{"id": "ticket"}],
            "installments": 12,  # Parcelamento no cartão (1 a 36)
            "default_installments": 1,
        },
        # Informações adicionais
        "additional_info": f"Evento: {evento.titulo} | Data: {data_evento} | Local: {evento.local or 'A definir'}",
        # Metadados personalizados
        "metadata": {
            "evento_id": evento.id,
            "evento_titulo": evento.titulo,
            "evento_data": data_evento,
            "evento_local": evento.local or "",
            "cobranca_id": cobranca.id,
            "membro_nome": membro.nome,
        },
    }
    
    # Adicionar notification_url apenas se não for localhost
    webhook_url = request.build_absolute_uri('/api/mercadopago/webhook/')
    if 'localhost' not in webhook_url and '127.0.0.1' not in webhook_url:
        preference_data["notification_url"] = webhook_url
    
    try:
        print(f"[MP] Criando preferência: {preference_data}")
        
        # Criar preferência no Mercado Pago
        preference_response = sdk.preference().create(preference_data)
        preference = preference_response.get("response", {})
        
        print(f"[MP] Resposta: {preference_response}")
        
        if preference_response.get("status") not in [200, 201]:
            error_msg = preference.get("message", "Erro ao criar link de pagamento")
            logger.error(f"Erro MP: {preference_response}")
            return Response(
                {'error': error_msg, 'details': preference},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Atualizar cobrança com referência do MP
        cobranca.referencia_externa = str(preference.get("id", ""))
        cobranca.metodo_pagamento = "Mercado Pago"
        cobranca.save()
        
        # Retornar links de pagamento (is_sandbox para o frontend exibir dica de cartão de teste)
        env = 'production' if getattr(config, 'mp_cartao_em_sandbox', False) else config.mp_ambiente
        return Response({
            'success': True,
            'preference_id': preference.get("id"),
            'init_point': preference.get("init_point"),
            'sandbox_init_point': preference.get("sandbox_init_point"),
            'is_sandbox': env == 'sandbox',
            'valor': float(cobranca.valor),
            'cobranca': {
                'id': cobranca.id,
                'codigo': cobranca.codigo,
            }
        })
        
    except Exception as e:
        logger.error(f"Erro ao criar preferência MP: {str(e)}")
        return Response(
            {'error': f'Erro ao processar pagamento: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def _eh_payload_simulacao_mp(request):
    """Identifica o payload da ferramenta 'Simular notificações' do painel MP (não envia assinatura)."""
    data = request.data or {}
    rid = data.get('id') or (data.get('data') or {}).get('id')
    return (
        data.get('live_mode') is False
        and data.get('type') == 'payment'
        and data.get('action') == 'payment.updated'
        and str(rid) == '123456'
    )


def _verificar_assinatura_webhook_mp(request):
    """
    Verifica a assinatura do webhook do Mercado Pago (HMAC-SHA256).
    Documentação: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
    Retorna True se válida, False caso contrário.
    """
    import hmac
    import hashlib

    x_signature = request.headers.get('x-signature', '')
    x_request_id = request.headers.get('x-request-id', '')
    parts = dict(p.split('=', 1) for p in x_signature.split(',') if '=' in p)
    ts = parts.get('ts', '').strip()
    v1 = parts.get('v1', '').strip()

    # data.id: do body ou query (MP pode enviar como query param)
    data_id = ''
    if request.data:
        data_id = str((request.data.get('data') or {}).get('id') or request.data.get('id') or '')
    if not data_id and hasattr(request, 'query_params'):
        data_id = str((request.query_params.get('data.id') or request.query_params.get('data_id') or ''))
    if data_id and data_id.isalnum():
        data_id = data_id.lower()

    config = ConfiguracaoSite.get_config()
    secret = (getattr(config, 'mp_webhook_secret', None) or '').strip()

    if not x_signature:
        # Simulação do painel MP ("Simular notificações") às vezes não envia assinatura
        if _eh_payload_simulacao_mp(request):
            logger.info("Webhook MP: aceitando payload de simulação do painel (sem assinatura)")
            return True
        if config.mp_ambiente == 'production':
            logger.warning("Webhook MP sem assinatura em produção")
            return False
        return True

    if not ts or not v1:
        logger.warning("Webhook MP: assinatura com formato inválido")
        if config.mp_ambiente == 'production':
            return False
        return True

    if not secret:
        if config.mp_ambiente == 'production':
            logger.warning("Webhook MP: secret não configurado em produção")
            return False
        logger.info("Webhook MP: secret não configurado, aceitando em sandbox")
        return True

    # Manifest: id:...;request-id:...;ts:...; (conforme doc MP)
    manifest = f"id:{data_id};request-id:{x_request_id};ts:{ts};"
    expected = hmac.new(
        secret.encode('utf-8'),
        manifest.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected, v1):
        logger.warning("Webhook MP: assinatura HMAC inválida")
        return False
    return True


def _processar_webhook_mp_pagamento(resource_id):
    """Processa um pagamento MP em background (chamado em thread)."""
    sdk = get_mercadopago_sdk()
    if not sdk:
        logger.error("MP não configurado para webhook")
        return
    try:
        payment_response = sdk.payment().get(resource_id)
        payment = payment_response.get("response", {})
        if payment_response.get("status") != 200:
            logger.error(f"Erro ao buscar pagamento: {payment_response}")
            return
        payment_status = payment.get("status")
        external_reference = payment.get("external_reference")
        logger.info(f"Pagamento {resource_id}: status={payment_status}, ref={external_reference}")
        if not external_reference:
            return
        try:
            cobranca = Cobranca.objects.get(codigo=external_reference)
        except Cobranca.DoesNotExist:
            cobranca = None
        if cobranca is not None:
            if payment_status == 'approved':
                if cobranca.status != 'pago':
                    cobranca.status = 'pago'
                    cobranca.data_pagamento = timezone.now()
                    cobranca.referencia_externa = str(resource_id)
                    cobranca.save()
                    for item in cobranca.itens.all():
                        inscricao = item.inscricao
                        inscricao.status_pagamento = 'pago'
                        inscricao.status = 'confirmada'
                        inscricao.data_pagamento = timezone.now()
                        inscricao.save()
                    _disparar_webhook_cobranca_confirmada(cobranca)
                    logger.info(f"Cobrança {cobranca.codigo} confirmada via MP!")
            elif payment_status in ['cancelled', 'rejected']:
                if cobranca.status == 'pendente':
                    cobranca.status = 'cancelado'
                    cobranca.save()
                    logger.info(f"Cobrança {cobranca.codigo} cancelada/rejeitada")
            return

        # Cobrança de loja / cantina (tabela loja_cobrancaloja)
        from loja.models import CobrancaLoja, Venda
        from loja.estoque import baixar_estoque_venda

        try:
            c_loja = CobrancaLoja.objects.get(codigo=external_reference)
        except CobrancaLoja.DoesNotExist:
            logger.warning(f"Cobrança (evento ou loja) não encontrada: {external_reference}")
            return
        if payment_status == 'approved':
            if c_loja.status != 'pago':
                with transaction.atomic():
                    c2 = CobrancaLoja.objects.select_for_update().select_related('venda').get(pk=c_loja.pk)
                    if c2.status == 'pago':
                        logger.info(
                            f"CobrancaLoja {c2.codigo} já paga (idempotente no webhook), ignorando."
                        )
                    else:
                        c2.status = 'pago'
                        c2.data_pagamento = timezone.now()
                        c2.referencia_externa = str(resource_id)
                        c2.metodo_pagamento = c2.metodo_pagamento or 'Mercado Pago'
                        c2.save()
                        v2 = Venda.objects.select_for_update().get(pk=c2.venda_id)
                        v2.status = 'pago'
                        v2.save()
                        baixar_estoque_venda(v2)
                logger.info(f"CobrancaLoja {c_loja.codigo} confirmada via MP!")
        elif payment_status in ['cancelled', 'rejected']:
            if c_loja.status == 'pendente':
                c_loja.status = 'cancelado'
                c_loja.save()
                logger.info(f"CobrancaLoja {c_loja.codigo} cancelada/rejeitada")
    except Exception as e:
        logger.error(f"Erro no webhook MP (background): {str(e)}", exc_info=True)


@api_view(['POST'])
@permission_classes([AllowAny])
def mercadopago_webhook(request):
    """
    Webhook para receber notificações do Mercado Pago.
    Responde 200 rápido (idempotência + assinatura) e processa o pagamento em background.
    """
    if not _verificar_assinatura_webhook_mp(request):
        logger.warning("Webhook MP rejeitado - assinatura inválida")
        return Response({'error': 'Invalid signature'}, status=status.HTTP_403_FORBIDDEN)

    payload = request.data or {}
    topic = payload.get('topic') or payload.get('type')
    resource_id = payload.get('id') or (payload.get('data') or {}).get('id')

    if topic not in ('payment', 'merchant_order'):
        return Response({'status': 'ignored', 'topic': topic or 'unknown'})
    if not resource_id:
        return Response({'status': 'no_id'})

    request_id = request.headers.get('x-request-id') or f"webhook-{topic}-{resource_id}"

    # Idempotência: já processado?
    if WebhookEventLog.objects.filter(request_id=request_id).exists():
        return Response({'status': 'ok'})

    try:
        WebhookEventLog.objects.create(request_id=request_id)
    except Exception:
        return Response({'status': 'ok'})

    # Resposta rápida; processar em background
    import threading
    threading.Thread(target=_processar_webhook_mp_pagamento, args=(resource_id,), daemon=True).start()
    return Response({'status': 'accepted'})


def _disparar_webhook_cobranca_confirmada(cobranca, tipo='pagamento_confirmado', request=None):
    """
    Dispara webhook quando uma cobrança é confirmada (via MP, manual ou isento).
    Mesmo payload com QR codes; tipo define: 'pagamento_confirmado' | 'confirmado_pagamento_manual' | 'isento'.
    """
    config = ConfiguracaoSite.get_config()
    config.refresh_from_db()
    if not config.webhook_ativo or not config.webhook_inscricao:
        print('[WEBHOOK] Webhook inativo ou não configurado')
        return
    
    base_url = request.build_absolute_uri('/').rstrip('/') if request else 'http://localhost:8000'
    membro = cobranca.membro
    evento = cobranca.evento
    
    # Formatar telefone
    telefone_formatado = membro.telefone or ''
    if membro.telefone and len(membro.telefone) == 11:
        telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:7]}-{membro.telefone[7:]}"
    elif membro.telefone and len(membro.telefone) == 10:
        telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:6]}-{membro.telefone[6:]}"
    
    def formatar_data_local(dt):
        if dt is None:
            return None
        if timezone.is_aware(dt):
            dt_local = timezone.localtime(dt)
        else:
            dt_local = dt
        return dt_local.strftime('%d/%m/%Y %H:%M')
    
    # Buscar TODAS as inscrições: responsável + acompanhantes
    inscricoes_lista = []
    inscricoes_ids_processadas = set()
    
    def url_qrcode(inscricao):
        if inscricao.qrcode:
            path = inscricao.qrcode.url if not inscricao.qrcode.url.startswith('http') else inscricao.qrcode.url
            return f"{base_url}{path}" if not path.startswith('http') else path
        return None
    
    # 1. Inscrições vinculadas à cobrança
    for item in cobranca.itens.all():
        inscricao = item.inscricao
        if inscricao.id in inscricoes_ids_processadas:
            continue
        inscricoes_ids_processadas.add(inscricao.id)
        inscricoes_lista.append({
            'id': inscricao.id,
            'nome': inscricao.membro.nome,
            'codigo': inscricao.codigo,
            'qrcode_url': url_qrcode(inscricao),
            'categoria': inscricao.categoria.nome if inscricao.categoria else 'Adulto',
            'valor': float(item.valor),
            'is_acompanhante': inscricao.is_acompanhante,
        })
    
    # 2. Acompanhantes do mesmo evento
    acompanhantes_inscricoes = Inscricao.objects.filter(
        evento=evento,
        responsavel=membro,
        is_acompanhante=True
    ).select_related('membro', 'categoria')
    
    for inscricao in acompanhantes_inscricoes:
        if inscricao.id in inscricoes_ids_processadas:
            continue
        inscricoes_ids_processadas.add(inscricao.id)
        inscricoes_lista.append({
            'id': inscricao.id,
            'nome': inscricao.membro.nome,
            'codigo': inscricao.codigo,
            'qrcode_url': url_qrcode(inscricao),
            'categoria': inscricao.categoria.nome if inscricao.categoria else None,
            'valor': float(inscricao.valor_inscricao) if inscricao.valor_inscricao else 0,
            'is_acompanhante': True,
        })
    
    # 3. Inscrição principal do responsável se não estiver na lista
    try:
        inscricao_responsavel = Inscricao.objects.get(
            evento=evento,
            membro=membro,
            is_acompanhante=False
        )
        if inscricao_responsavel.id not in inscricoes_ids_processadas:
            inscricoes_lista.insert(0, {
                'id': inscricao_responsavel.id,
                'nome': inscricao_responsavel.membro.nome,
                'codigo': inscricao_responsavel.codigo,
                'qrcode_url': url_qrcode(inscricao_responsavel),
                'categoria': inscricao_responsavel.categoria.nome if inscricao_responsavel.categoria else 'Adulto',
                'valor': float(inscricao_responsavel.valor_inscricao) if inscricao_responsavel.valor_inscricao else 0,
                'is_acompanhante': False,
            })
    except Inscricao.DoesNotExist:
        pass
    
    payload = {
        'tipo': tipo,
        'timestamp': timezone.now().isoformat(),
        'cobranca': {
            'id': cobranca.id,
            'codigo': cobranca.codigo,
            'valor': float(cobranca.valor),
            'status': cobranca.status,
        },
        'responsavel': {
            'id': membro.id,
            'nome': membro.nome,
            'telefone': membro.telefone,
            'telefone_formatado': telefone_formatado,
            'email': membro.email,
            'senha': membro.senha_texto,
        },
        'evento': {
            'id': evento.id,
            'titulo': evento.titulo,
            'data_inicio': formatar_data_local(evento.data_inicio),
            'data_fim': formatar_data_local(evento.data_fim),
            'local': evento.local,
            'endereco': evento.endereco,
        },
        'inscricoes': inscricoes_lista,
        'valor_total': float(cobranca.valor),
        'total_inscritos': len(inscricoes_lista),
    }
    evo_json = _evolution_integracao_json(config)
    if evo_json:
        payload['integracao_evolution'] = evo_json
    
    def enviar():
        try:
            # Preparar headers com informações da Evolution API
            headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'ChampionsChurch-Webhook/1.0'
            }
            
            # Adicionar informações da Evolution API nos headers
            if config.evolution_api_url:
                headers['X-Evolution-API-URL'] = config.evolution_api_url
            if config.evolution_api_key:
                headers['X-Evolution-API-Key'] = config.evolution_api_key
            if config.evolution_api_instance:
                headers['X-Evolution-Instance'] = config.evolution_api_instance
            
            print(f'[WEBHOOK] Enviando para: {config.webhook_inscricao} (tipo={tipo})')
            response = requests.post(
                config.webhook_inscricao,
                json=payload,
                headers=headers,
                timeout=30
            )
            print(f'[WEBHOOK] Status: {response.status_code} - {response.text}')
        except Exception as e:
            print(f'[WEBHOOK] Erro: {str(e)}')
    
    thread = threading.Thread(target=enviar)
    thread.daemon = True
    thread.start()


@api_view(['GET'])
@permission_classes([AllowAny])
def verificar_pagamento(request, cobranca_id):
    """
    Verifica o status de um pagamento no Mercado Pago.
    Usado pelo frontend para polling.
    """
    try:
        cobranca = Cobranca.objects.get(id=cobranca_id)
    except Cobranca.DoesNotExist:
        return Response(
            {'error': 'Cobrança não encontrada'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Se já está pago localmente, retornar
    if cobranca.status == 'pago':
        return Response({
            'status': 'pago',
            'cobranca_status': cobranca.status,
            'data_pagamento': cobranca.data_pagamento.strftime('%d/%m/%Y %H:%M:%S') if cobranca.data_pagamento else None,
        })
    
    # Se não tem referência externa, ainda não foi gerado PIX
    if not cobranca.referencia_externa:
        return Response({
            'status': 'aguardando_pix',
            'cobranca_status': cobranca.status,
        })
    
    # Consultar no Mercado Pago (mesmo ambiente do PIX = produção quando cartão em sandbox)
    config = ConfiguracaoSite.get_config()
    sdk = get_mercadopago_sdk('production') if getattr(config, 'mp_cartao_em_sandbox', False) else get_mercadopago_sdk()
    if not sdk:
        return Response({
            'status': cobranca.status,
            'cobranca_status': cobranca.status,
            'mp_error': 'MP não configurado'
        })
    
    try:
        # Buscar pagamentos pelo external_reference (código da cobrança)
        import requests
        env = 'production' if getattr(config, 'mp_cartao_em_sandbox', False) else config.mp_ambiente
        access_token = config.get_mp_access_token_for(env)
        
        # Buscar pagamentos com o external_reference igual ao código da cobrança
        search_url = f"https://api.mercadopago.com/v1/payments/search?external_reference={cobranca.codigo}"
        headers = {
            "Authorization": f"Bearer {access_token}"
        }
        
        response = requests.get(search_url, headers=headers)
        data = response.json()
        
        print(f"[MP] Verificando pagamento para cobrança {cobranca.codigo}: {data}")
        
        results = data.get("results", [])
        mp_status = "pending"
        
        # Verificar se algum pagamento foi aprovado
        for payment in results:
            if payment.get("status") == "approved":
                mp_status = "approved"
                break
            elif payment.get("status") in ["pending", "in_process"]:
                mp_status = payment.get("status")
        
        # Se pagamento aprovado no MP mas não localmente, atualizar
        if mp_status == 'approved' and cobranca.status != 'pago':
            cobranca.status = 'pago'
            cobranca.data_pagamento = timezone.now()
            cobranca.save()
            
            # Confirmar inscrições e gerar QR codes
            for item in cobranca.itens.all():
                inscricao = item.inscricao
                inscricao.status_pagamento = 'pago'
                inscricao.status = 'confirmada'
                inscricao.data_pagamento = timezone.now()
                
                # Gerar QR Code se não existir
                if not inscricao.qrcode:
                    inscricao.gerar_qrcode()
                
                inscricao.save()
            
            _disparar_webhook_cobranca_confirmada(cobranca)
        
        return Response({
            'status': 'pago' if mp_status == 'approved' else mp_status,
            'cobranca_status': cobranca.status,
            'mp_status': mp_status,
            'data_pagamento': cobranca.data_pagamento.strftime('%d/%m/%Y %H:%M:%S') if cobranca.data_pagamento else None,
        })
        
    except Exception as e:
        logger.error(f"Erro ao verificar pagamento: {str(e)}")
        print(f"[MP] Erro ao verificar: {str(e)}")
        return Response({
            'status': cobranca.status,
            'cobranca_status': cobranca.status,
            'mp_error': str(e)
        })


@api_view(['POST'])
@permission_classes([AllowAny])
def pagar_cartao(request):
    """
    Cria pagamento com cartão (Checkout Transparente / Card Payment Brick).
    Cliente não precisa ter conta no Mercado Pago.
    Espera: cobranca_id, token, payment_method_id, installments, payer (email, identification).
    Opcional: issuer_id.
    """
    import uuid
    cobranca_id = request.data.get('cobranca_id')
    token = request.data.get('token')
    payment_method_id = request.data.get('payment_method_id')
    installments = request.data.get('installments', 1)
    issuer_id = request.data.get('issuer_id')
    payer = request.data.get('payer') or {}

    if not cobranca_id or not token or not payment_method_id:
        return Response(
            {'error': 'cobranca_id, token e payment_method_id são obrigatórios'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        cobranca = Cobranca.objects.get(id=cobranca_id)
    except Cobranca.DoesNotExist:
        return Response({'error': 'Cobrança não encontrada'}, status=status.HTTP_404_NOT_FOUND)

    if cobranca.status != 'pendente':
        return Response(
            {'error': f'Cobrança não está pendente (status: {cobranca.get_status_display()})'},
            status=status.HTTP_400_BAD_REQUEST
        )

    config = ConfiguracaoSite.get_config()
    if not config.mp_ativo:
        return Response({'error': 'Mercado Pago não está ativo'}, status=status.HTTP_400_BAD_REQUEST)
    # Cartão: se "cartão em sandbox" ativo, usar sandbox para testar sem cobrança real
    sdk = get_mercadopago_sdk('sandbox') if getattr(config, 'mp_cartao_em_sandbox', False) else get_mercadopago_sdk()
    if not sdk:
        return Response({'error': 'Mercado Pago não configurado'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    email = payer.get('email') or (cobranca.membro.email if cobranca.membro else '')
    if not email:
        email = f"pagador{cobranca.membro.telefone}@email.com" if cobranca.membro else "pagador@email.com"
    identification = payer.get('identification') or {}
    id_type = identification.get('type') or 'CPF'
    id_number = identification.get('number') or ''

    transaction_amount = float(cobranca.valor)
    # Mercado Pago não aceita cartão para valores muito baixos (ex.: R$ 0,04)
    VALOR_MINIMO_CARTAO = 0.50
    if round(transaction_amount, 2) < VALOR_MINIMO_CARTAO:
        return Response(
            {'error': f'Valor mínimo para pagamento com cartão é R$ {VALOR_MINIMO_CARTAO:.2f}. Para valores menores, use PIX.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    payment_data = {
        "transaction_amount": round(transaction_amount, 2),
        "token": token,
        "installments": int(installments) if installments else 1,
        "payment_method_id": payment_method_id,
        "payer": {
            "email": email,
            "identification": {"type": id_type, "number": str(id_number).replace('.', '').replace('-', '').replace('/', '')},
        },
        "external_reference": cobranca.codigo,
        "description": f"Inscrição: {cobranca.evento.titulo}",
    }
    if issuer_id:
        payment_data["issuer_id"] = str(issuer_id)

    idempotency_key = str(uuid.uuid4())
    try:
        request_options = getattr(mercadopago, 'config', None) and getattr(mercadopago.config, 'RequestOptions', None)
        if request_options:
            opts = request_options()
            opts.custom_headers = {'x-idempotency-key': idempotency_key}
            payment_response = sdk.payment().create(payment_data, opts)
        else:
            payment_response = sdk.payment().create(payment_data)
    except Exception as e:
        logger.exception("Erro ao criar pagamento cartão MP")
        err_msg = str(e)
        if hasattr(e, 'response') and getattr(e.response, 'json', None):
            try:
                err_msg = e.response.json()
            except Exception:
                pass
        err_str = str(err_msg).lower() if err_msg else ''
        if 'no valid payment type for this amount' in err_str or 'try sending a larger amount' in err_str:
            return Response(
                {'error': 'Valor mínimo para pagamento com cartão é R$ 0,50. Para este valor, use PIX.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            {'error': 'Erro ao processar cartão', 'details': err_msg},
            status=status.HTTP_400_BAD_REQUEST
        )

    payment = payment_response.get("response", {}) if isinstance(payment_response, dict) else {}
    status_mp = payment.get("status")
    payment_id = payment.get("id")

    if status_mp == 'approved':
        cobranca.status = 'pago'
        cobranca.data_pagamento = timezone.now()
        cobranca.referencia_externa = str(payment_id or '')
        cobranca.metodo_pagamento = 'Mercado Pago (cartão)'
        cobranca.save()
        for item in cobranca.itens.all():
            inscricao = item.inscricao
            inscricao.status_pagamento = 'pago'
            inscricao.status = 'confirmada'
            inscricao.data_pagamento = timezone.now()
            inscricao.save()
        _disparar_webhook_cobranca_confirmada(cobranca)
        logger.info(f"Cobrança {cobranca.codigo} paga com cartão (payment_id={payment_id})")

    return Response({
        'success': status_mp in ('approved', 'pending', 'in_process'),
        'status': status_mp,
        'payment_id': payment_id,
        'message': 'Pagamento aprovado!' if status_mp == 'approved' else 'Pagamento em processamento.',
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def mercadopago_config_publica(request):
    """
    Retorna configurações públicas do Mercado Pago (para o frontend).
    Query param: for=card — quando mp_cartao_em_sandbox está ativo, retorna public_key e is_sandbox do sandbox (para o Brick de cartão).
    """
    config = ConfiguracaoSite.get_config()
    use_card_sandbox = (
        config.mp_ativo
        and getattr(config, 'mp_cartao_em_sandbox', False)
        and request.query_params.get('for') == 'card'
    )
    if use_card_sandbox:
        public_key = config.get_mp_public_key_for('sandbox')
        return Response({
            'ativo': bool(public_key),
            'public_key': public_key or None,
            'ambiente': 'sandbox',
            'is_sandbox': True,
        })
    return Response({
        'ativo': config.mp_ativo,
        'public_key': config.mp_public_key if config.mp_ativo else None,
        'ambiente': config.mp_ambiente if config.mp_ativo else None,
        'is_sandbox': config.mp_is_sandbox if config.mp_ativo else None,
    })


# ============================================
# GERENCIAMENTO DE USUÁRIOS E PERMISSÕES
# ============================================

class PermissaoMenuViewSet(viewsets.ModelViewSet):
    """ViewSet para gerenciar permissões de menu."""
    
    queryset = PermissaoMenu.objects.all()
    serializer_class = PermissaoMenuSerializer
    permission_classes = [IsAuthenticated]
    
    def list(self, request, *args, **kwargs):
        """Lista permissões (sem paginação), garantindo sincronização automática dos menus."""
        # Sincronizar menus automaticamente antes de listar
        PermissaoMenu.garantir_sincronizacao()
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    def get_queryset(self):
        """Retorna apenas permissões ativas por padrão, a menos que seja solicitado todas."""
        queryset = super().get_queryset()
        if self.request.query_params.get('incluir_inativos') != 'true':
            queryset = queryset.filter(ativo=True)
        return queryset.order_by('ordem', 'nome')


class GrupoViewSet(viewsets.ModelViewSet):
    """ViewSet para gerenciar grupos de usuários."""
    
    queryset = Grupo.objects.all()
    serializer_class = GrupoSerializer
    permission_classes = [IsAuthenticated]
    
    def list(self, request, *args, **kwargs):
        """Lista grupos, garantindo sincronização automática dos menus."""
        # Sincronizar menus automaticamente antes de listar
        PermissaoMenu.garantir_sincronizacao()
        return super().list(request, *args, **kwargs)
    
    def retrieve(self, request, *args, **kwargs):
        """Retorna um grupo específico, garantindo sincronização automática dos menus."""
        # Sincronizar menus automaticamente antes de recuperar
        PermissaoMenu.garantir_sincronizacao()
        return super().retrieve(request, *args, **kwargs)
    
    def create(self, request, *args, **kwargs):
        """Cria um grupo, garantindo sincronização automática dos menus."""
        # Sincronizar menus automaticamente antes de criar
        PermissaoMenu.garantir_sincronizacao()
        return super().create(request, *args, **kwargs)
    
    def update(self, request, *args, **kwargs):
        """Atualiza um grupo, garantindo sincronização automática dos menus."""
        # Sincronizar menus automaticamente antes de atualizar
        PermissaoMenu.garantir_sincronizacao()
        return super().update(request, *args, **kwargs)
    
    def get_queryset(self):
        """Retorna apenas grupos ativos por padrão."""
        queryset = super().get_queryset()
        if self.request.query_params.get('incluir_inativos') != 'true':
            queryset = queryset.filter(ativo=True)
        return queryset.prefetch_related('permissoes', 'usuarios').order_by('nome')


class UsuarioAdminViewSet(viewsets.ModelViewSet):
    """ViewSet para gerenciar usuários administrativos."""
    
    queryset = User.objects.filter(is_staff=True).order_by('username')
    serializer_class = UsuarioAdminSerializer
    permission_classes = [IsAuthenticated]
    
    # Usuário admin padrão que não pode ser excluído
    ADMIN_USERNAME = 'admin'
    
    def get_queryset(self):
        """Retorna usuários administrativos com seus grupos."""
        return super().get_queryset().prefetch_related('grupos_admin')
    
    def perform_create(self, serializer):
        """Garante que usuários criados sejam staff."""
        user = serializer.save(is_staff=True)
        return user
    
    def perform_destroy(self, instance):
        """Impede a exclusão do usuário admin padrão."""
        if instance.username == self.ADMIN_USERNAME:
            raise ValidationError(
                {'detail': f'O usuário "{self.ADMIN_USERNAME}" não pode ser excluído por questões de segurança.'}
            )
        super().perform_destroy(instance)
    
    def perform_update(self, serializer):
        """Protege o usuário admin de perder permissões críticas."""
        instance = serializer.instance
        if instance.username == self.ADMIN_USERNAME:
            # Garante que o admin sempre seja superusuário e staff
            serializer.save(is_superuser=True, is_staff=True)
        else:
            serializer.save()
    
    @action(detail=True, methods=['post'])
    def alterar_senha(self, request, pk=None):
        """Endpoint para alterar senha de um usuário."""
        usuario = self.get_object()
        nova_senha = request.data.get('password')
        
        if not nova_senha:
            return Response(
                {'error': 'Senha é obrigatória'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        usuario.set_password(nova_senha)
        usuario.save()
        
        return Response({'message': 'Senha alterada com sucesso'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def verificar_permissao_menu(request, codigo_menu):
    """
    Verifica se o usuário autenticado tem permissão para acessar um menu específico.
    """
    tem_permissao = Grupo.usuario_tem_permissao_menu(request.user, codigo_menu)
    return Response({
        'codigo_menu': codigo_menu,
        'tem_permissao': tem_permissao
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def menus_permitidos(request):
    """
    Retorna lista de menus que o usuário autenticado pode acessar.
    Sincroniza automaticamente os menus antes de retornar.
    """
    # Garantir sincronização automática dos menus
    PermissaoMenu.garantir_sincronizacao()
    
    menus_codigos = Grupo.get_menus_permitidos_usuario(request.user)
    menus = PermissaoMenu.objects.filter(
        codigo__in=menus_codigos,
        ativo=True
    ).order_by('ordem', 'nome')
    
    serializer = PermissaoMenuSerializer(menus, many=True)
    return Response({
        'menus': serializer.data,
        'codigos': menus_codigos
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def popular_permissoes_menu(request):
    """
    Endpoint para sincronizar as permissões de menu.
    Requer autenticação e que o usuário seja superusuário.
    Agora usa sincronização automática do modelo.
    """
    if not request.user.is_superuser:
        return Response(
            {'erro': 'Apenas superusuários podem executar este comando.'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    try:
        # Usar o método de sincronização automática do modelo
        criadas, atualizadas = PermissaoMenu.garantir_sincronizacao()
        
        return Response({
            'sucesso': True,
            'mensagem': 'Permissões de menu sincronizadas com sucesso!',
            'criadas': criadas,
            'atualizadas': atualizadas,
            'total_menus': len(PermissaoMenu.MENUS_DISPONIVEIS)
        })
    except Exception as e:
        logger.error(f'Erro ao sincronizar permissões: {str(e)}', exc_info=True)
        return Response(
            {
                'erro': 'Erro ao sincronizar permissões',
                'detalhes': str(e)
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# =====================================================================
# Formulários de inscrição (admin) e acesso admin a respostas
# =====================================================================


def _admin_tem_permissao_formularios(user):
    """Verifica se o usuário admin tem permissão para gerenciar formulários.

    Superusuários sempre têm acesso. Demais usuários precisam ser staff e ter
    o menu ``formularios_inscricao`` permitido via grupos.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if not user.is_staff:
        return False
    try:
        return Grupo.usuario_tem_permissao_menu(user, 'formularios_inscricao')
    except Exception:
        return False


def _admin_tem_permissao_inscricoes(user):
    """Permissão para listar/exportar inscrições (menu ``inscricoes``)."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if not user.is_staff:
        return False
    try:
        return Grupo.usuario_tem_permissao_menu(user, 'inscricoes')
    except Exception:
        return False


def _export_evento_data_str(evento):
    if evento and evento.data_inicio:
        return timezone.localtime(evento.data_inicio).strftime('%d/%m/%Y %H:%M')
    return ''


def _export_format_valor_campo(resp: RespostaCampoInscricao) -> str:
    from datetime import datetime, date
    campo = resp.campo
    t = campo.tipo
    v = resp.valor
    if t == 'arquivo':
        if resp.arquivo:
            if isinstance(v, dict) and v.get('nome_original'):
                return str(v['nome_original'])
            name = resp.arquivo.name
            return name.rsplit('/', 1)[-1] if name else 'Arquivo anexado'
        return ''
    if t == 'boolean':
        return 'Sim' if v else 'Não'
    if v is None or v == '':
        return ''
    if t == 'select_multiplo' and isinstance(v, list):
        return ', '.join(str(x) for x in v)
    if t == 'data':
        if isinstance(v, date) and not isinstance(v, datetime):
            return v.strftime('%d/%m/%Y')
        if isinstance(v, datetime):
            dt = timezone.localtime(v) if timezone.is_aware(v) else v
            return dt.strftime('%d/%m/%Y %H:%M')
        s = str(v).strip()
        if not s:
            return ''
        try:
            s2 = s.replace('Z', '+00:00')
            dtp = datetime.fromisoformat(s2)
            dtp = timezone.localtime(dtp) if timezone.is_aware(dtp) else dtp
            return dtp.strftime('%d/%m/%Y %H:%M')
        except (ValueError, TypeError, OSError):
            return s
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_exportar_inscricoes_xlsx(request):
    """Exporta inscrições filtradas para XLSX, uma linha por inscrição, com colunas do formulário.

    Query params (mesma ideia do admin em tela):
        q — busca por nome do membro ou título do evento
        status — pendente, confirmada, ... ou ``todos`` (omitir)
        status_pagamento — idem
        evento_id — restringe ao evento (id numérico)
    """
    if not _admin_tem_permissao_inscricoes(request.user):
        return Response(
            {'detail': 'Sem permissão para exportar inscrições.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    q_text = (request.query_params.get('q') or '').strip()
    status_f = (request.query_params.get('status') or '').strip()
    pag_f = (request.query_params.get('status_pagamento') or '').strip()
    evento_id = (request.query_params.get('evento_id') or '').strip()

    respostas_qs = RespostaCampoInscricao.objects.select_related('campo').order_by(
        'campo__ordem', 'campo__id'
    )
    qs = (
        Inscricao.objects.all()
        .select_related('membro', 'evento', 'categoria', 'responsavel')
        .prefetch_related(Prefetch('respostas', queryset=respostas_qs))
    )

    if q_text:
        qs = qs.filter(
            Q(membro__nome__icontains=q_text) | Q(evento__titulo__icontains=q_text)
        )
    if status_f and status_f != 'todos':
        qs = qs.filter(status=status_f)
    if pag_f and pag_f != 'todos':
        qs = qs.filter(status_pagamento=pag_f)
    if evento_id and evento_id != 'todos':
        try:
            qs = qs.filter(evento_id=int(evento_id))
        except (TypeError, ValueError):
            pass

    inscricoes = list(qs.order_by('data_inscricao', 'id'))
    campo_por_id = {}
    for insc in inscricoes:
        for r in insc.respostas.all():
            if r.campo_id not in campo_por_id:
                campo_por_id[r.campo_id] = r.campo
    dynamic_ids = sorted(
        campo_por_id.keys(),
        key=lambda cid: (
            campo_por_id[cid].formulario_id,
            campo_por_id[cid].ordem,
            cid,
        ),
    )
    labels = [campo_por_id[cid].label or f'Campo {cid}' for cid in dynamic_ids]
    cnt = Counter(labels)

    def header_campo(cid):
        lab = campo_por_id[cid].label or f'Campo {cid}'
        if cnt[lab] > 1:
            return f'{lab} (id {cid})'
        return lab

    fixed_headers = [
        'ID',
        'Código',
        'Nome',
        'E-mail',
        'Telefone',
        'Evento',
        'Data do evento',
        'Data inscrição',
        'Status',
        'Pagamento',
        'Categoria',
        'Valor inscrição',
        'Presente',
        'Acompanhante',
        'Responsável',
    ]
    dynamic_headers = [header_campo(cid) for cid in dynamic_ids]
    all_headers = fixed_headers + dynamic_headers

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = 'Inscrições'
    ws.append(all_headers)

    for insc in inscricoes:
        m = insc.membro
        ev = insc.evento
        valor_f = insc.valor_inscricao
        if valor_f is None or float(valor_f) == 0:
            valor_str = 'Gratuito' if insc.status_pagamento in ('isento', 'nao_aplicavel') else 'R$ 0,00'
        else:
            valor_str = f'R$ {float(valor_f):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
        by_cid = {r.campo_id: _export_format_valor_campo(r) for r in insc.respostas.all()}

        row = [
            insc.id,
            str(insc.codigo),
            m.nome if m else '',
            (m.email or '') if m else '',
            (m.telefone or '') if m else '',
            ev.titulo if ev else '',
            _export_evento_data_str(ev),
            timezone.localtime(insc.data_inscricao).strftime('%d/%m/%Y %H:%M:%S') if insc.data_inscricao else '',
            insc.get_status_display(),
            insc.get_status_pagamento_display(),
            insc.categoria.nome if insc.categoria else '',
            valor_str,
            'Sim' if insc.presente else 'Não',
            'Sim' if insc.is_acompanhante else 'Não',
            insc.responsavel.nome if insc.is_acompanhante and insc.responsavel else '',
        ]
        row.extend(by_cid.get(cid, '') for cid in dynamic_ids)
        ws.append(row)

    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    stamp = timezone.now().strftime('%Y-%m-%d_%H%M')
    filename = f'inscricoes_champions_{stamp}.xlsx'
    response = HttpResponse(
        bio.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


class FormularioInscricaoViewSet(viewsets.ModelViewSet):
    """CRUD de formulários de inscrição reaproveitáveis.

    - Lista usa serializer resumido.
    - Detalhe/escrita usa serializer completo com os campos aninhados.
    - Edição com inscrições existentes é permitida; campos sincronizados por id
      na API (ou duplicar para clonar tudo de uma vez).
    - Action ``duplicar`` gera um novo formulário a partir de um existente.
    """

    queryset = FormularioInscricao.objects.all().order_by('-atualizado_em', '-id')
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return FormularioInscricaoResumoSerializer
        return FormularioInscricaoSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        incluir_inativos = self.request.query_params.get('incluir_inativos')
        if incluir_inativos != 'true':
            qs = qs.filter(ativo=True)
        return qs.prefetch_related('campos')

    def _checar_permissao(self):
        if not _admin_tem_permissao_formularios(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Usuário sem permissão para gerenciar formulários de inscrição.')

    def list(self, request, *args, **kwargs):
        self._checar_permissao()
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        self._checar_permissao()
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        self._checar_permissao()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._checar_permissao()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._checar_permissao()
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._checar_permissao()
        instance = self.get_object()
        if instance.tem_inscricoes:
            return Response(
                {'detail': 'Formulário possui inscrições associadas. Desative-o em vez de excluir.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='duplicar')
    def duplicar(self, request, pk=None):
        """Duplica o formulário atual em uma nova versão editável."""
        self._checar_permissao()
        formulario = self.get_object()
        novo = formulario.duplicar()
        serializer = FormularioInscricaoSerializer(novo, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_respostas_inscricao(request, inscricao_id):
    """Retorna as respostas de formulário de uma inscrição (apenas admin).

    Não expõe arquivos diretamente: devolve URL protegida via endpoint
    ``admin_arquivo_resposta`` para download seguro.
    """
    if not _admin_tem_permissao_formularios(request.user):
        return Response(
            {'detail': 'Sem permissão para visualizar respostas de formulários.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    inscricao = get_object_or_404(Inscricao.objects.select_related('evento', 'evento__formulario_inscricao'), id=inscricao_id)
    respostas = RespostaCampoInscricao.objects.filter(inscricao=inscricao).select_related('campo').order_by('campo__ordem', 'campo__id')

    serializer = RespostaCampoInscricaoAdminSerializer(respostas, many=True, context={'request': request})
    return Response({
        'inscricao': {
            'id': inscricao.id,
            'codigo': inscricao.codigo,
            'participante': inscricao.membro.nome if inscricao.membro else None,
        },
        'evento': {
            'id': inscricao.evento.id,
            'titulo': inscricao.evento.titulo,
        },
        'formulario': (
            {
                'id': inscricao.evento.formulario_inscricao.id,
                'nome': inscricao.evento.formulario_inscricao.nome,
            }
            if inscricao.evento and inscricao.evento.formulario_inscricao else None
        ),
        'respostas': serializer.data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_arquivo_resposta(request, inscricao_id, campo_id):
    """Download protegido de arquivo anexado em resposta de formulário.

    Usa ``FileResponse`` para não expor diretamente a URL de MEDIA.
    """
    from django.http import FileResponse, Http404

    if not _admin_tem_permissao_formularios(request.user):
        return Response(
            {'detail': 'Sem permissão para baixar arquivos de respostas.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    resposta = get_object_or_404(
        RespostaCampoInscricao.objects.select_related('campo', 'inscricao'),
        inscricao_id=inscricao_id,
        campo_id=campo_id,
    )

    if not resposta.arquivo:
        raise Http404('Arquivo não encontrado para esta resposta.')

    try:
        arquivo = resposta.arquivo.open('rb')
    except FileNotFoundError:
        raise Http404('Arquivo não encontrado no storage.')

    nome_original = (resposta.valor or {}).get('nome_original') if isinstance(resposta.valor, dict) else None
    filename = nome_original or resposta.arquivo.name.split('/')[-1]

    response = FileResponse(arquivo, as_attachment=True, filename=filename)
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_inscricao_detalhe(request, inscricao_id):
    """Retorna detalhes completos de uma inscrição incluindo as respostas do formulário.

    Endpoint dedicado para a tela admin que mostra tudo junto.
    """
    if not _admin_tem_permissao_formularios(request.user) and not request.user.is_staff:
        return Response(
            {'detail': 'Sem permissão.'}, status=status.HTTP_403_FORBIDDEN
        )

    inscricao = get_object_or_404(
        Inscricao.objects.select_related(
            'membro', 'evento', 'evento__formulario_inscricao', 'categoria'
        ).prefetch_related('respostas__campo'),
        id=inscricao_id,
    )
    serializer = InscricaoAdminSerializer(inscricao, context={'request': request})
    return Response(serializer.data)
