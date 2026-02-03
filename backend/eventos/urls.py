"""
URLs da API REST para Champions Church.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    MembroViewSet, EventoViewSet, InscricaoViewSet, ContatoViewSet,
    CategoriaParticipanteViewSet, CobrancaViewSet,
    get_current_user, dashboard_stats, meus_ingressos,
    participante_login, participante_esqueci_senha, participante_registro, participante_perfil,
    buscar_participante_por_telefone,
    configuracao_publica, configuracao_admin,
    # Mercado Pago
    criar_pagamento_pix, mercadopago_webhook, verificar_pagamento, mercadopago_config_publica
)

# Criando o router e registrando os viewsets
router = DefaultRouter()
router.register(r'membros', MembroViewSet, basename='membro')
router.register(r'eventos', EventoViewSet, basename='evento')
router.register(r'inscricoes', InscricaoViewSet, basename='inscricao')
router.register(r'contatos', ContatoViewSet, basename='contato')
router.register(r'categorias', CategoriaParticipanteViewSet, basename='categoria')
router.register(r'cobrancas', CobrancaViewSet, basename='cobranca')

urlpatterns = [
    # Autenticação JWT
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', get_current_user, name='current_user'),
    
    # Dashboard
    path('dashboard/stats/', dashboard_stats, name='dashboard_stats'),
    
    # Autenticação de participantes
    path('participante/login/', participante_login, name='participante_login'),
    path('participante/esqueci-senha/', participante_esqueci_senha, name='participante_esqueci_senha'),
    path('participante/registro/', participante_registro, name='participante_registro'),
    path('participante/perfil/', participante_perfil, name='participante_perfil'),
    path('participante/consultar/', meus_ingressos, name='meus_ingressos'),
    path('participante/buscar/', buscar_participante_por_telefone, name='buscar_participante'),
    
    # Configurações do site
    path('configuracao/', configuracao_publica, name='configuracao_publica'),
    path('admin/configuracao/', configuracao_admin, name='configuracao_admin'),
    
    # Mercado Pago
    path('mercadopago/criar-pix/', criar_pagamento_pix, name='mp_criar_pix'),
    path('mercadopago/webhook/', mercadopago_webhook, name='mp_webhook'),
    path('mercadopago/verificar/<int:cobranca_id>/', verificar_pagamento, name='mp_verificar'),
    path('mercadopago/config/', mercadopago_config_publica, name='mp_config'),
    
    # Router URLs
    path('', include(router.urls)),
]
