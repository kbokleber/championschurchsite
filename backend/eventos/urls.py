"""
URLs da API REST para Champions Church.
"""

from django.urls import path, include, reverse
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    MembroViewSet, EventoViewSet, InscricaoViewSet, ContatoViewSet,
    CategoriaParticipanteViewSet, CobrancaViewSet,
    PermissaoMenuViewSet, GrupoViewSet, UsuarioAdminViewSet,
    get_current_user, dashboard_stats, meus_ingressos,
    participante_login, participante_esqueci_senha, participante_registro, participante_perfil,
    buscar_participante_por_telefone,
    configuracao_publica, configuracao_admin,
    verificar_permissao_menu, menus_permitidos, popular_permissoes_menu,
    # Mercado Pago
    criar_pagamento_pix, pagar_cartao, mercadopago_webhook, verificar_pagamento, mercadopago_config_publica
)
from .health_views import health_live, health_ready

# Router que inclui Mercado Pago e outras rotas no Api Root
class ChampionsRouter(DefaultRouter):
    def get_api_root_view(self, api_urls=None):
        view = super().get_api_root_view(api_urls=api_urls)

        def wrapped_view(request, *args, **kwargs):
            response = view(request, *args, **kwargs)
            if response.status_code == 200 and hasattr(response, 'data'):
                response.data['mercadopago_webhook'] = request.build_absolute_uri(reverse('mp_webhook'))
                response.data['mercadopago_criar_pix'] = request.build_absolute_uri(reverse('mp_criar_pix'))
                response.data['mercadopago_pagar_cartao'] = request.build_absolute_uri(reverse('mp_pagar_cartao'))
                response.data['mercadopago_config'] = request.build_absolute_uri(reverse('mp_config'))
            return response
        return wrapped_view


router = ChampionsRouter()
router.register(r'membros', MembroViewSet, basename='membro')
router.register(r'eventos', EventoViewSet, basename='evento')
router.register(r'inscricoes', InscricaoViewSet, basename='inscricao')
router.register(r'contatos', ContatoViewSet, basename='contato')
router.register(r'categorias', CategoriaParticipanteViewSet, basename='categoria')
router.register(r'cobrancas', CobrancaViewSet, basename='cobranca')
router.register(r'permissoes-menu', PermissaoMenuViewSet, basename='permissaomenu')
router.register(r'grupos', GrupoViewSet, basename='grupo')
router.register(r'usuarios', UsuarioAdminViewSet, basename='usuario')

urlpatterns = [
    # Healthchecks (Coolify liveness/readiness)
    path('health/live/', health_live, name='health_live'),
    path('health/ready/', health_ready, name='health_ready'),

    # Autenticação JWT
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', get_current_user, name='current_user'),
    
    # Permissões e Menus
    path('auth/menus-permitidos/', menus_permitidos, name='menus_permitidos'),
    path('auth/verificar-permissao/<str:codigo_menu>/', verificar_permissao_menu, name='verificar_permissao'),
    path('admin/popular-permissoes/', popular_permissoes_menu, name='popular_permissoes_menu'),
    
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
    path('mercadopago/pagar-cartao/', pagar_cartao, name='mp_pagar_cartao'),
    path('mercadopago/webhook/', mercadopago_webhook, name='mp_webhook'),
    path('mercadopago/verificar/<int:cobranca_id>/', verificar_pagamento, name='mp_verificar'),
    path('mercadopago/config/', mercadopago_config_publica, name='mp_config'),
    
    # Router URLs
    path('', include(router.urls)),
]
