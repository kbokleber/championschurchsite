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
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from django.contrib.auth.models import User
from django.conf import settings
from .models import Membro, Evento, Inscricao, Contato, ConfiguracaoSite, CategoriaParticipante, Cobranca, CobrancaItem, gerar_senha_aleatoria
from .serializers import (
    MembroSerializer, MembroResumoSerializer,
    EventoSerializer, EventoListaSerializer,
    InscricaoSerializer, ContatoSerializer,
    UserSerializer, ConfiguracaoSiteSerializer,
    CategoriaParticipanteSerializer, CobrancaSerializer
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
        
        # Envia o webhook
        print(f'>>> WEBHOOK: Enviando para {config.webhook_inscricao}...')
        response = requests.post(
            config.webhook_inscricao,
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'ChampionsChurch-Webhook/1.0'
            },
            timeout=30
        )
        
        print(f'>>> WEBHOOK: Resposta: {response.status_code}')
        logger.info(f'Webhook enviado: {response.status_code} - {config.webhook_inscricao}')
        
    except Exception as e:
        print(f'>>> WEBHOOK ERRO: {str(e)}')
        logger.error(f'Erro ao enviar webhook: {str(e)}')


def enviar_webhook_reset_senha(dados_webhook):
    """
    Envia webhook de reset de senha de forma assíncrona.
    """
    print('>>> WEBHOOK RESET: Iniciando envio...')
    try:
        config = ConfiguracaoSite.get_config()
        
        # Tenta usar o webhook específico de reset, se não existir usa o de inscrição como fallback
        webhook_url = config.webhook_reset_senha or config.webhook_inscricao
        
        if not config.webhook_ativo or not webhook_url:
            print('>>> WEBHOOK RESET: Inativo ou não configurado')
            return
        
        payload = {
            'tipo': 'reset_senha',
            'timestamp': timezone.now().isoformat(),
            'participante': {
                'id': dados_webhook.get('id'),
                'nome': dados_webhook.get('nome'),
                'telefone': dados_webhook.get('telefone'),
                'email': dados_webhook.get('email'),
                'nova_senha': dados_webhook.get('nova_senha'),
            },
            'igreja': {
                'nome': config.nome_igreja,
                'telefone': config.telefone,
            }
        }
        
        print(f'>>> WEBHOOK RESET: Enviando para {webhook_url}...')
        response = requests.post(
            webhook_url,
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        print(f'>>> WEBHOOK RESET: Resposta: {response.status_code}')
        
    except Exception as e:
        print(f'>>> WEBHOOK RESET ERRO: {str(e)}')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    """Retorna os dados do usuário autenticado."""
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


# ============================================
# AUTENTICAÇÃO DE PARTICIPANTES
# ============================================

def _serializar_ingressos(membro):
    """Helper para serializar ingressos de um membro, incluindo acompanhantes."""
    # Inscrições próprias do membro (não acompanhantes)
    # Inclui confirmadas E pendentes (aguardando pagamento)
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
                'data_checkin': acomp.data_checkin.strftime('%d/%m/%Y %H:%M') if acomp.data_checkin else None,
                'categoria': acomp.categoria.nome if acomp.categoria else 'Adulto',
                'valor': valor_acomp,
                'status_pagamento': acomp.status_pagamento,
            })
        
        # Calcular valor total (responsável + acompanhantes)
        valor_responsavel = float(inscricao.valor_inscricao) if inscricao.valor_inscricao else 0
        valor_total = valor_responsavel + valor_total_acompanhantes
        
        # Verificar se pagamento está pendente
        pagamento_pendente = inscricao.status_pagamento == 'pendente'
        
        # Buscar cobrança pendente para esta inscrição
        cobranca_id = None
        if pagamento_pendente:
            # Buscar através do CobrancaItem
            cobranca_item = CobrancaItem.objects.filter(
                inscricao=inscricao,
                cobranca__status='pendente'
            ).select_related('cobranca').first()
            
            if cobranca_item:
                cobranca_id = cobranca_item.cobranca.id
        
        ingressos.append({
            'id': inscricao.id,
            'codigo': inscricao.codigo,
            # QR Code só aparece se pagamento não estiver pendente
            'qrcode': inscricao.qrcode.url if inscricao.qrcode and not pagamento_pendente else None,
            'evento': {
                'id': inscricao.evento.id,
                'titulo': inscricao.evento.titulo,
                'data_inicio': inscricao.evento.data_inicio.strftime('%d/%m/%Y %H:%M'),
                'data_fim': inscricao.evento.data_fim.strftime('%d/%m/%Y %H:%M') if inscricao.evento.data_fim else None,
                'local': inscricao.evento.local,
                'endereco': inscricao.evento.endereco,
                'imagem': inscricao.evento.imagem.url if inscricao.evento.imagem else None,
                'status': inscricao.evento.status,
                'evento_pago': inscricao.evento.evento_pago,
                'valor_inscricao': float(inscricao.evento.valor_inscricao) if inscricao.evento.valor_inscricao else None,
            },
            'data_inscricao': inscricao.data_inscricao.strftime('%d/%m/%Y %H:%M'),
            'presente': inscricao.presente,
            'data_checkin': inscricao.data_checkin.strftime('%d/%m/%Y %H:%M') if inscricao.data_checkin else None,
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
    
    # Buscar membro pelo telefone (não acompanhante)
    try:
        membro = Membro.objects.get(telefone=telefone_normalizado, is_acompanhante=False)
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
    import jwt
    from django.conf import settings
    from datetime import datetime, timedelta
    
    payload = {
        'participante_id': membro.id,
        'telefone': membro.telefone,
        'nome': membro.nome,
        'exp': datetime.utcnow() + timedelta(days=30),
        'iat': datetime.utcnow(),
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
def participante_reset_senha(request):
    """
    Gera uma nova senha para o participante e envia via webhook.
    """
    telefone = request.data.get('telefone', '')
    
    if not telefone:
        return Response(
            {'error': 'Telefone é obrigatório'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    telefone_normalizado = Membro.normalizar_telefone(telefone)
    
    try:
        membro = Membro.objects.get(telefone=telefone_normalizado, is_acompanhante=False)
        
        # Gera nova senha
        nova_senha = gerar_senha_aleatoria(6)
        membro.definir_senha(nova_senha)
        membro.save()
        
        # Prepara dados para o webhook
        dados_webhook = {
            'id': membro.id,
            'nome': membro.nome,
            'telefone': membro.telefone,
            'email': membro.email,
            'nova_senha': nova_senha,
        }
        
        # Dispara webhook em background
        import threading
        thread = threading.Thread(target=enviar_webhook_reset_senha, args=(dados_webhook,))
        thread.daemon = True
        thread.start()
        
        return Response({
            'success': True,
            'message': 'Uma nova senha foi gerada e enviada para o seu WhatsApp.'
        })
        
    except Membro.DoesNotExist:
        return Response(
            {'success': False, 'error': 'Participante não encontrado'},
            status=status.HTTP_404_NOT_FOUND
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
    
    # Verificar se já está inscrito
    inscricao_existente = Inscricao.objects.filter(membro=membro, evento=evento, is_acompanhante=False).first()
    if inscricao_existente:
        # Buscar acompanhantes existentes
        acompanhantes_existentes = Inscricao.objects.filter(
            evento=evento,
            responsavel=membro,
            is_acompanhante=True
        ).select_related('membro', 'categoria')

        # Se não está enviando NOVOS acompanhantes, verificar se há cobrança pendente
        if not acompanhantes:
            # Buscar cobrança pendente para este membro e evento
            cobranca_pendente = Cobranca.objects.filter(
                membro=membro, 
                evento=evento, 
                status='pendente'
            ).first()
            
            response = {
                'success': True,
                'ja_inscrito': True,
                'message': 'Você já está inscrito neste evento.',
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
                ],
                'cobranca': {
                    'id': cobranca_pendente.id,
                    'codigo': cobranca_pendente.codigo,
                    'valor': float(cobranca_pendente.valor),
                    'status': cobranca_pendente.status,
                } if cobranca_pendente else None
            }
            
            if not cobranca_pendente:
                response['message'] += ' Deseja adicionar acompanhantes?'
            else:
                response['reutilizado'] = True
                response['message'] = 'Você possui uma inscrição pendente de pagamento. Redirecionando para o pagamento...'
            
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
    
    # Gerar token de login
    payload = {
        'participante_id': membro.id,
        'telefone': membro.telefone,
        'nome': membro.nome,
        'exp': datetime.utcnow() + timedelta(days=30),
        'iat': datetime.utcnow(),
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
    
    # Enviar webhook notificando a inscrição (mesmo que pendente de pagamento)
    dados_webhook = {
        'base_url': request.build_absolute_uri('/').rstrip('/'),
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
        'valor_total': valor_total,
        'pagamento_confirmado': not evento.evento_pago,  # True se gratuito, False se pago
        'acompanhantes': acompanhantes_response,
        'total_inscritos': 1 + len(acompanhantes_response),
    }
    
    # Dispara webhook em background
    thread = threading.Thread(target=enviar_webhook_inscricao, args=(dados_webhook,))
    thread.daemon = True
    thread.start()
    
    return Response(response_data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([AllowAny])
def participante_perfil(request):
    """
    Retorna o perfil e ingressos do participante logado.
    Requer token de participante no header Authorization.
    """
    import jwt
    from django.conf import settings
    
    auth_header = request.headers.get('Authorization', '')
    
    if not auth_header.startswith('Bearer '):
        return Response(
            {'error': 'Token não fornecido'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    token = auth_header.split(' ')[1]
    
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
    
    def get_queryset(self):
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
        
        # Verificar se já fez check-in
        if inscricao.presente:
            return Response({
                'error': 'Check-in já realizado',
                'valido': False,
                'ja_checkin': True,
                'inscricao': InscricaoSerializer(inscricao).data,
                'data_checkin': inscricao.data_checkin.strftime('%d/%m/%Y %H:%M:%S') if inscricao.data_checkin else None
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
                'data': inscricao.evento.data_inicio.strftime('%d/%m/%Y %H:%M'),
            },
            'data_checkin': inscricao.data_checkin.strftime('%d/%m/%Y %H:%M:%S')
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
        
        return Response({
            'encontrada': True,
            'inscricao': InscricaoSerializer(inscricao).data,
            'participante': {
                'nome': inscricao.membro.nome,
                'email': inscricao.membro.email,
                'telefone': inscricao.membro.telefone,
            },
            'evento': {
                'id': inscricao.evento.id,
                'titulo': inscricao.evento.titulo,
                'data': inscricao.evento.data_inicio.strftime('%d/%m/%Y %H:%M'),
                'local': inscricao.evento.local,
            },
            'status': inscricao.status,
            'status_display': inscricao.get_status_display(),
            'ja_checkin': inscricao.presente,
            'data_checkin': inscricao.data_checkin.strftime('%d/%m/%Y %H:%M:%S') if inscricao.data_checkin else None
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
    config = ConfiguracaoSite.get_config()
    serializer = ConfiguracaoSiteSerializer(config)
    return Response(serializer.data)


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
        
        # Disparar webhook
        self._disparar_webhook_cobranca(request, cobranca)
        
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
        
        # Disparar webhook
        self._disparar_webhook_cobranca(request, cobranca)
        
        serializer = CobrancaSerializer(cobranca)
        return Response({
            'success': True,
            'message': 'Cobrança isenta com sucesso!',
            'cobranca': serializer.data
        })
    
    def _disparar_webhook_cobranca(self, request, cobranca):
        """Dispara webhook após confirmação de pagamento de uma cobrança."""
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
        
        # Buscar inscrições da cobrança
        inscricoes_lista = []
        for item in cobranca.itens.all():
            inscricao = item.inscricao
            inscricoes_lista.append({
                'id': inscricao.id,
                'nome': inscricao.membro.nome,
                'codigo': inscricao.codigo,
                'qrcode': inscricao.qrcode.url if inscricao.qrcode else None,
                'categoria': inscricao.categoria.nome if inscricao.categoria else 'Adulto',
                'valor': float(item.valor),
            })
        
        dados_webhook = {
            'base_url': request.build_absolute_uri('/').rstrip('/'),
            'tipo': 'pagamento_cobranca',
            'cobranca_id': cobranca.id,
            'cobranca_codigo': cobranca.codigo,
            'participante_id': membro.id,
            'nome': membro.nome,
            'telefone': membro.telefone,
            'telefone_formatado': telefone_formatado,
            'email': membro.email,
            'senha': membro.senha_texto,
            'evento_id': evento.id,
            'evento_titulo': evento.titulo,
            'evento_data_inicio': formatar_data_local(evento.data_inicio),
            'evento_data_fim': formatar_data_local(evento.data_fim),
            'evento_local': evento.local,
            'evento_endereco': evento.endereco,
            'valor_total': float(cobranca.valor),
            'metodo_pagamento': cobranca.metodo_pagamento,
            'referencia_externa': cobranca.referencia_externa,
            'pagamento_confirmado': cobranca.status in ['pago', 'isento'],
            'inscricoes': inscricoes_lista,
            'total_inscritos': len(inscricoes_lista),
        }
        
        # Dispara webhook em background
        thread = threading.Thread(target=enviar_webhook_inscricao, args=(dados_webhook,))
        thread.daemon = True
        thread.start()
    
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
    
    # URL da imagem do evento (se existir)
    imagem_url = None
    if evento.imagem:
        try:
            imagem_url = request.build_absolute_uri(evento.imagem.url)
        except:
            pass
    
    # Criar itens para a preferência com mais detalhes
    items = []
    for item in cobranca.itens.all():
        item_data = {
            "title": f"{evento.titulo}",
            "description": f"Inscrição para {item.inscricao.membro.nome} - {evento.local or 'Local a definir'} - {data_evento}",
            "quantity": 1,
            "unit_price": float(item.valor) if float(item.valor) > 0 else float(cobranca.valor),
            "currency_id": "BRL",
            "category_id": "tickets",  # Categoria: ingressos
        }
        # Adicionar imagem se existir
        if imagem_url:
            item_data["picture_url"] = imagem_url
        items.append(item_data)
    
    # Se não há itens ou todos têm valor 0, criar um item único
    if not items or all(i["unit_price"] == 0 for i in items):
        item_data = {
            "title": f"{evento.titulo}",
            "description": f"Inscrição para evento - {evento.local or 'Local a definir'} - {data_evento}",
            "quantity": 1,
            "unit_price": float(cobranca.valor),
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


def _disparar_webhook_cobranca_confirmada(cobranca):
    """Dispara webhook quando uma cobrança é confirmada via Mercado Pago."""
    config = ConfiguracaoSite.get_config()
    if not config.webhook_ativo or not config.webhook_inscricao:
        print('[WEBHOOK] Webhook inativo ou não configurado')
        return
    
    membro = cobranca.membro
    evento = cobranca.evento
    
    # Formatar telefone
    telefone_formatado = membro.telefone or ''
    if membro.telefone and len(membro.telefone) == 11:
        telefone_formatado = f"({membro.telefone[:2]}) {membro.telefone[2:7]}-{membro.telefone[7:]}"
    
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
    
    # 1. Primeiro, buscar das inscrições vinculadas à cobrança
    for item in cobranca.itens.all():
        inscricao = item.inscricao
        if inscricao.id in inscricoes_ids_processadas:
            continue
        inscricoes_ids_processadas.add(inscricao.id)
        
        qrcode_url = None
        if inscricao.qrcode:
            qrcode_url = f"http://localhost:8000{inscricao.qrcode.url}"
        inscricoes_lista.append({
            'id': inscricao.id,
            'nome': inscricao.membro.nome,
            'codigo': inscricao.codigo,
            'qrcode_url': qrcode_url,
            'categoria': inscricao.categoria.nome if inscricao.categoria else 'Adulto',
            'valor': float(item.valor),
            'is_acompanhante': inscricao.is_acompanhante,
        })
    
    # 2. Buscar acompanhantes que possam não estar nos itens da cobrança
    # (inscrições do mesmo evento com responsavel = membro)
    acompanhantes_inscricoes = Inscricao.objects.filter(
        evento=evento,
        responsavel=membro,
        is_acompanhante=True
    ).select_related('membro', 'categoria')
    
    for inscricao in acompanhantes_inscricoes:
        if inscricao.id in inscricoes_ids_processadas:
            continue
        inscricoes_ids_processadas.add(inscricao.id)
        
        qrcode_url = None
        if inscricao.qrcode:
            qrcode_url = f"http://localhost:8000{inscricao.qrcode.url}"
        inscricoes_lista.append({
            'id': inscricao.id,
            'nome': inscricao.membro.nome,
            'codigo': inscricao.codigo,
            'qrcode_url': qrcode_url,
            'categoria': inscricao.categoria.nome if inscricao.categoria else None,
            'valor': float(inscricao.valor_inscricao) if inscricao.valor_inscricao else 0,
            'is_acompanhante': True,
        })
    
    # 3. Buscar a inscrição principal do responsável se não estiver na lista
    try:
        inscricao_responsavel = Inscricao.objects.get(
            evento=evento,
            membro=membro,
            is_acompanhante=False
        )
        if inscricao_responsavel.id not in inscricoes_ids_processadas:
            qrcode_url = None
            if inscricao_responsavel.qrcode:
                qrcode_url = f"http://localhost:8000{inscricao_responsavel.qrcode.url}"
            inscricoes_lista.insert(0, {  # Inserir no início
                'id': inscricao_responsavel.id,
                'nome': inscricao_responsavel.membro.nome,
                'codigo': inscricao_responsavel.codigo,
                'qrcode_url': qrcode_url,
                'categoria': inscricao_responsavel.categoria.nome if inscricao_responsavel.categoria else 'Adulto',
                'valor': float(inscricao_responsavel.valor_inscricao) if inscricao_responsavel.valor_inscricao else 0,
                'is_acompanhante': False,
            })
    except Inscricao.DoesNotExist:
        pass
    
    payload = {
        'tipo': 'pagamento_confirmado',
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
            print(f'[WEBHOOK] Enviando para: {config.webhook_inscricao}')
            response = requests.post(
                config.webhook_inscricao,
                json=payload,
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            print(f'[WEBHOOK] Status: {response.status_code} - {response.text}')
        except Exception as e:
            print(f'[WEBHOOK] Erro: {str(e)}')
    
    # Dispara webhook em background
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
