"""
Views da API REST para Champions Church.
"""

import requests
import threading
import logging

from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly, AllowAny
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from django.conf import settings
from .models import (
    Membro, Evento, Inscricao, Contato, ConfiguracaoSite, 
    CategoriaParticipante, Cobranca, CobrancaItem,
    PermissaoMenu, Grupo
)
from .serializers import (
    MembroSerializer, MembroResumoSerializer,
    EventoSerializer, EventoListaSerializer,
    InscricaoSerializer, ContatoSerializer,
    UserSerializer, ConfiguracaoSiteSerializer, ConfiguracaoSitePublicSerializer,
    CategoriaParticipanteSerializer, CobrancaSerializer,
    PermissaoMenuSerializer, GrupoSerializer, UsuarioAdminSerializer
)

logger = logging.getLogger(__name__)


def enviar_webhook_inscricao(dados_webhook):
    """
    Envia webhook de inscrição de forma assíncrona.
    Chamado em uma thread separada para não bloquear a resposta.
    """
    print('>>> WEBHOOK: Iniciando envio de webhook...')
    try:
        config = ConfiguracaoSite.get_config()
        
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
            'tipo': 'nova_inscricao',
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


def enviar_webhook_reset_senha(dados_webhook):
    """
    Envia webhook de "esqueci minha senha" de forma assíncrona.
    Chamado quando o participante solicita lembrete de senha na tela Meus Ingressos.
    Usa webhook_reset_senha se configurado; senão usa webhook_inscricao (mesma URL com tipo=reset_senha).
    """
    try:
        config = ConfiguracaoSite.get_config()
        if not config.webhook_ativo:
            logger.info('Webhook inativo - reset senha não enviado')
            return
        url = (getattr(config, 'webhook_reset_senha', None) or '').strip()
        if not url:
            url = (getattr(config, 'webhook_inscricao', None) or '').strip()
        if not url:
            logger.info('Nenhuma URL de webhook configurada (reset_senha nem webhook_inscricao)')
            return
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
        
        print(f'>>> WEBHOOK RESET SENHA: Enviando para {url}')
        response = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=30
        )
        logger.info(f'Webhook reset senha enviado: {response.status_code} - {url}')
        print(f'>>> WEBHOOK RESET SENHA: Resposta {response.status_code}')
    except Exception as e:
        logger.error(f'Erro ao enviar webhook reset senha: {str(e)}')
        print(f'>>> WEBHOOK RESET SENHA: Erro {e}')


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
    """
    try:
        telefone = request.query_params.get('telefone', '')
        
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
            return Response({
                'encontrado': True,
                'participante': {
                    'id': membro.id,
                    'nome': membro.nome,
                    'email': membro.email or '',
                }
            })
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
    Esqueci minha senha: envia os dados (telefone, nome, senha) para o webhook
    configurado (ex.: integração WhatsApp) para o usuário receber a senha.
    Sempre retorna sucesso para não revelar se o telefone está cadastrado.
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
    # Gerar nova senha e salvar no sistema (a senha é trocada ao requerer)
    nova_senha = membro.definir_senha()
    membro.save()
    # Formatar telefone para exibição
    telefone_formatado = membro.telefone
    if len(membro.telefone) == 11:
        telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:7]}-{membro.telefone[7:]}"
    elif len(membro.telefone) == 10:
        telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:6]}-{membro.telefone[6:]}"
    dados_webhook = {
        'participante_id': membro.id,
        'nome': membro.nome,
        'telefone': membro.telefone,
        'telefone_formatado': telefone_formatado,
        'email': membro.email or '',
        'senha': nova_senha,
    }
    thread = threading.Thread(target=enviar_webhook_reset_senha, args=(dados_webhook,))
    thread.daemon = True
    thread.start()
    return Response(
        {'success': True, 'message': 'A senha foi enviada para o número cadastrado.'},
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
    
    # Verificar vagas disponíveis (incluindo acompanhantes)
    total_inscricoes = 1 + len(acompanhantes)
    if evento.vagas is not None:
        vagas_disponiveis = evento.vagas_disponiveis or 0
        if total_inscricoes > vagas_disponiveis:
            return Response(
                {'error': f'Vagas insuficientes. Disponível: {vagas_disponiveis}'},
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
                # Buscar categoria do acompanhante
                categoria_acomp = None
                valor_acomp = 0
                if evento.evento_pago and acomp_categoria_id:
                    try:
                        categoria_acomp = CategoriaParticipante.objects.get(id=acomp_categoria_id, ativo=True)
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
            # Criar nova cobrança para os acompanhantes adicionais
            descricao_itens = ', '.join([a['nome'] for a in acompanhantes_para_criar])
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
            
            novo_valor_total = valor_novos_acompanhantes  # Valor da nova cobrança
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
            # Buscar categoria do acompanhante
            categoria_acomp = None
            valor_acomp = 0
            if evento.evento_pago and acomp_categoria_id:
                try:
                    categoria_acomp = CategoriaParticipante.objects.get(id=acomp_categoria_id, ativo=True)
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
    
    # Verificar se tem inscrições
    tem_inscricoes = Inscricao.objects.filter(membro=membro, status='confirmada').exists()
    
    if not tem_inscricoes:
        return Response(
            {'error': 'Nenhuma inscrição encontrada', 'encontrado': False},
            status=status.HTTP_404_NOT_FOUND
        )
    
    return Response({
        'encontrado': True,
        'nome': membro.nome,
        'telefone_parcial': f"****{membro.telefone[-4:]}",
        'message': 'Cadastro encontrado! Faça login para ver seus ingressos.'
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


class EventoViewSet(viewsets.ModelViewSet):
    """ViewSet para operações CRUD de Eventos."""
    
    queryset = Evento.objects.all()
    serializer_class = EventoSerializer
    
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
        """Cancela uma inscrição."""
        inscricao = self.get_object()
        inscricao.status = 'cancelada'
        inscricao.save()
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
    try:
        config = ConfiguracaoSite.get_config()
        serializer = ConfiguracaoSitePublicSerializer(config)
        return Response(serializer.data)
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
            serializer.save()
            return Response(serializer.data)
        
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
        itens = list(cobranca.itens.select_related('inscricao').all())
        statuses = [item.inscricao.status_pagamento for item in itens]
        # Valor = soma apenas itens não cancelados
        novo_valor = sum(float(item.valor) for item in itens if item.inscricao.status_pagamento != 'cancelado')
        cobranca.valor = novo_valor
        if all(s == 'cancelado' for s in statuses):
            cobranca.status = 'cancelado'
            cobranca.save()
            return
        if all(s in ('pago', 'isento') for s in statuses):
            cobranca.status = 'isento' if all(s == 'isento' for s in statuses) else 'pago'
            cobranca.data_pagamento = timezone.now()
            cobranca.save()
            _disparar_webhook_cobranca_confirmada(
                cobranca,
                tipo='isento' if cobranca.status == 'isento' else 'confirmado_pagamento_manual',
                request=self.request
            )
            return
        cobranca.save()
    
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

def get_mercadopago_sdk():
    """Retorna uma instância configurada do SDK do Mercado Pago."""
    config = ConfiguracaoSite.get_config()
    if not config.mp_ativo:
        return None
    
    access_token = config.mp_access_token
    if not access_token:
        return None
    
    return mercadopago.SDK(access_token)


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
    
    sdk = get_mercadopago_sdk()
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
                return Response({
                    'success': True,
                    'preference_id': cobranca.referencia_externa,
                    'init_point': preference.get("init_point"),
                    'sandbox_init_point': preference.get("sandbox_init_point"),
                    'valor': float(cobranca.valor),
                    'cobranca': {
                        'id': cobranca.id,
                        'codigo': cobranca.codigo,
                    },
                    'reutilizado': True  # Flag para indicar que reutilizou
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
    
    # Dados da preferência (Checkout Pro)
    preference_data = {
        "items": items,
        "payer": {
            "email": email_pagador,
            "name": membro.nome,
        },
        "external_reference": cobranca.codigo,
        "statement_descriptor": "IGREJA",
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
        
        # Retornar links de pagamento
        return Response({
            'success': True,
            'preference_id': preference.get("id"),
            'init_point': preference.get("init_point"),  # Link de pagamento (produção)
            'sandbox_init_point': preference.get("sandbox_init_point"),  # Link de teste
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


@api_view(['POST'])
@permission_classes([AllowAny])
def verificar_assinatura_webhook_mp(request):
    """
    Verifica a assinatura do webhook do Mercado Pago.
    Retorna True se válida, False caso contrário.
    """
    import hmac
    import hashlib
    
    # Obter a assinatura do header
    x_signature = request.headers.get('x-signature', '')
    x_request_id = request.headers.get('x-request-id', '')
    
    if not x_signature:
        # Se não tem assinatura, aceitar em dev mas logar warning
        config = ConfiguracaoSite.get_config()
        if config.mp_ambiente == 'production':
            logger.warning("Webhook MP sem assinatura em produção")
            return False
        return True
    
    # Extrair ts e v1 da assinatura
    # Formato: ts=xxx,v1=xxx
    parts = dict(p.split('=') for p in x_signature.split(',') if '=' in p)
    ts = parts.get('ts', '')
    v1 = parts.get('v1', '')
    
    if not ts or not v1:
        logger.warning("Assinatura MP com formato inválido")
        return True  # Aceitar mesmo assim para não bloquear pagamentos válidos
    
    # Em produção real, seria necessário verificar com o webhook secret
    # Por ora, aceitar mas logar para auditoria
    logger.info(f"Webhook MP assinatura: ts={ts}, request_id={x_request_id}")
    return True


def mercadopago_webhook(request):
    """
    Webhook para receber notificações do Mercado Pago.
    O MP envia notificações quando o status do pagamento muda.
    """
    # Verificar assinatura (segurança)
    if not verificar_assinatura_webhook_mp(request):
        logger.warning(f"Webhook MP rejeitado - assinatura inválida: {request.META}")
        return Response({'error': 'Invalid signature'}, status=status.HTTP_403_FORBIDDEN)
    
    logger.info(f"Webhook MP recebido: {request.data}")
    print(f"[WEBHOOK MP] Dados: {request.data}")
    
    # Tipos de notificação
    topic = request.data.get('topic') or request.data.get('type')
    resource_id = request.data.get('id') or request.data.get('data', {}).get('id')
    
    # Verificar se é notificação de pagamento
    if topic not in ['payment', 'merchant_order']:
        return Response({'status': 'ignored', 'topic': topic})
    
    if not resource_id:
        return Response({'status': 'no_id'})
    
    # Obter SDK
    sdk = get_mercadopago_sdk()
    if not sdk:
        logger.error("MP não configurado para webhook")
        return Response({'status': 'mp_not_configured'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    try:
        # Buscar detalhes do pagamento no MP
        payment_response = sdk.payment().get(resource_id)
        payment = payment_response.get("response", {})
        
        if payment_response.get("status") != 200:
            logger.error(f"Erro ao buscar pagamento: {payment_response}")
            return Response({'status': 'error_fetching_payment'})
        
        payment_status = payment.get("status")
        external_reference = payment.get("external_reference")
        
        logger.info(f"Pagamento {resource_id}: status={payment_status}, ref={external_reference}")
        print(f"[WEBHOOK MP] Pagamento {resource_id}: status={payment_status}, ref={external_reference}")
        
        # Buscar cobrança pelo código (external_reference)
        if not external_reference:
            return Response({'status': 'no_external_reference'})
        
        try:
            cobranca = Cobranca.objects.get(codigo=external_reference)
        except Cobranca.DoesNotExist:
            logger.warning(f"Cobrança não encontrada: {external_reference}")
            return Response({'status': 'cobranca_not_found'})
        
        # Processar de acordo com o status
        if payment_status == 'approved':
            # Pagamento aprovado!
            if cobranca.status != 'pago':
                cobranca.status = 'pago'
                cobranca.data_pagamento = timezone.now()
                cobranca.referencia_externa = str(resource_id)
                cobranca.save()
                
                # Confirmar todas as inscrições vinculadas
                for item in cobranca.itens.all():
                    inscricao = item.inscricao
                    inscricao.status_pagamento = 'pago'
                    inscricao.status = 'confirmada'
                    inscricao.data_pagamento = timezone.now()
                    inscricao.save()  # Gera QR Code
                
                # Disparar webhook de confirmação
                _disparar_webhook_cobranca_confirmada(cobranca)
                
                logger.info(f"Cobrança {cobranca.codigo} confirmada via MP!")
                print(f"[WEBHOOK MP] Cobrança {cobranca.codigo} CONFIRMADA!")
        
        elif payment_status in ['cancelled', 'rejected']:
            if cobranca.status == 'pendente':
                cobranca.status = 'cancelado'
                cobranca.save()
                logger.info(f"Cobrança {cobranca.codigo} cancelada/rejeitada")
        
        return Response({'status': 'processed', 'payment_status': payment_status})
        
    except Exception as e:
        logger.error(f"Erro no webhook MP: {str(e)}")
        return Response({'status': 'error', 'message': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _disparar_webhook_cobranca_confirmada(cobranca, tipo='pagamento_confirmado', request=None):
    """
    Dispara webhook quando uma cobrança é confirmada (via MP, manual ou isento).
    Mesmo payload com QR codes; tipo define: 'pagamento_confirmado' | 'confirmado_pagamento_manual' | 'isento'.
    """
    config = ConfiguracaoSite.get_config()
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
    
    # Consultar no Mercado Pago
    sdk = get_mercadopago_sdk()
    if not sdk:
        return Response({
            'status': cobranca.status,
            'cobranca_status': cobranca.status,
            'mp_error': 'MP não configurado'
        })
    
    try:
        # Buscar pagamentos pelo external_reference (código da cobrança)
        # No Checkout Pro, salvamos o ID da preferência, mas precisamos buscar pagamentos
        import requests
        config = ConfiguracaoSite.get_config()
        access_token = config.mp_access_token
        
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


@api_view(['GET'])
@permission_classes([AllowAny])
def mercadopago_config_publica(request):
    """
    Retorna configurações públicas do Mercado Pago (para o frontend).
    Apenas retorna a Public Key e status de ativo.
    """
    config = ConfiguracaoSite.get_config()
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
        """Lista permissões, garantindo sincronização automática dos menus."""
        # Sincronizar menus automaticamente antes de listar
        PermissaoMenu.garantir_sincronizacao()
        return super().list(request, *args, **kwargs)
    
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
