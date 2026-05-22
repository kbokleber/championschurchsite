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
    FormularioInscricaoViewSet,
    admin_respostas_inscricao, admin_arquivo_resposta, admin_inscricao_detalhe,
    admin_exportar_inscricoes_xlsx,
    get_current_user, alterar_minha_senha, dashboard_stats, meus_ingressos,
    participante_login, participante_esqueci_senha, participante_registro, participante_perfil,
    buscar_participante_por_telefone,
    configuracao_publica, configuracao_admin,
    admin_testar_conexao_whatsapp, admin_testar_conexao_mercadopago,
    verificar_permissao_menu, menus_permitidos, popular_permissoes_menu,
    admin_backup_exportar, admin_backup_importar,
    # Mercado Pago
    criar_pagamento_pix,
    criar_pagamento_pix_embutido,
    pagar_cartao,
    mercadopago_webhook,
    verificar_pagamento,
    mercadopago_config_publica,
)
from loja.views import (
    ProdutoViewSet as LojaProdutoViewSet,
    VendaViewSet as LojaVendaViewSet,
    CobrancaLojaViewSet,
    LojaAuditoriaViewSet,
    ReservaLojaViewSet,
    verificar_pagamento_loja,
    pagar_cartao_loja,
    criar_pagamento_pix_embutido_loja,
    dashboard_financeiro_loja,
)
from loja.recibo import (
    recibo_loja_publico,
    enviar_recibo_whatsapp,
    enviar_lembrete_reserva_whatsapp,
)

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
router.register(r'formularios', FormularioInscricaoViewSet, basename='formulario')
router.register(r'loja/produtos', LojaProdutoViewSet, basename='loja-produto')
router.register(r'loja/vendas', LojaVendaViewSet, basename='loja-venda')
router.register(r'loja/cobrancas', CobrancaLojaViewSet, basename='loja-cobranca')
router.register(r'loja/reservas', ReservaLojaViewSet, basename='loja-reserva')
router.register(r'loja/auditoria', LojaAuditoriaViewSet, basename='loja-auditoria')

urlpatterns = [
    # Autenticação JWT
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', get_current_user, name='current_user'),
    path('auth/alterar-senha/', alterar_minha_senha, name='alterar_minha_senha'),
    
    # Permissões e Menus
    path('auth/menus-permitidos/', menus_permitidos, name='menus_permitidos'),
    path('auth/verificar-permissao/<str:codigo_menu>/', verificar_permissao_menu, name='verificar_permissao'),
    path('admin/popular-permissoes/', popular_permissoes_menu, name='popular_permissoes_menu'),
    path('admin/backup/exportar/', admin_backup_exportar, name='admin_backup_exportar'),
    path('admin/backup/importar/', admin_backup_importar, name='admin_backup_importar'),
    
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
    path('admin/whatsapp/testar-conexao/', admin_testar_conexao_whatsapp, name='admin_testar_conexao_whatsapp'),
    path('admin/mercadopago/testar-conexao/', admin_testar_conexao_mercadopago, name='admin_testar_conexao_mercadopago'),

    # Admin - exportar inscrições (planilha)
    path('admin/inscricoes/exportar/', admin_exportar_inscricoes_xlsx, name='admin_exportar_inscricoes'),
    # Admin - respostas de formulário por inscrição (privado)
    path(
        'admin/inscricoes/<int:inscricao_id>/detalhe/',
        admin_inscricao_detalhe,
        name='admin_inscricao_detalhe',
    ),
    path(
        'admin/inscricoes/<int:inscricao_id>/respostas/',
        admin_respostas_inscricao,
        name='admin_respostas_inscricao',
    ),
    path(
        'admin/inscricoes/<int:inscricao_id>/respostas/<int:campo_id>/arquivo/',
        admin_arquivo_resposta,
        name='admin_arquivo_resposta',
    ),
    
    # Mercado Pago
    path('mercadopago/criar-pix/', criar_pagamento_pix, name='mp_criar_pix'),
    path('mercadopago/criar-pix-embutido/', criar_pagamento_pix_embutido, name='mp_criar_pix_embutido'),
    path('mercadopago/pagar-cartao/', pagar_cartao, name='mp_pagar_cartao'),
    path('mercadopago/webhook/', mercadopago_webhook, name='mp_webhook'),
    path('mercadopago/verificar/<int:cobranca_id>/', verificar_pagamento, name='mp_verificar'),
    path('loja/mercadopago/verificar/<int:cobranca_loja_id>/', verificar_pagamento_loja, name='mp_verificar_loja'),
    path('loja/mercadopago/pagar-cartao/', pagar_cartao_loja, name='mp_pagar_cartao_loja'),
    path('loja/mercadopago/criar-pix-embutido/', criar_pagamento_pix_embutido_loja, name='mp_criar_pix_embutido_loja'),
    path('loja/dashboard-financeiro/', dashboard_financeiro_loja, name='loja_dashboard_financeiro'),
    path('loja/recibo/<str:codigo>/', recibo_loja_publico, name='loja_recibo_publico'),
    path('loja/recibo/<str:codigo>/enviar-whatsapp/', enviar_recibo_whatsapp, name='loja_recibo_enviar_whatsapp'),
    path(
        'loja/reservas/<int:reserva_id>/enviar-whatsapp/',
        enviar_lembrete_reserva_whatsapp,
        name='loja_reserva_enviar_whatsapp',
    ),
    path('mercadopago/config/', mercadopago_config_publica, name='mp_config'),
    
    # Router URLs
    path('', include(router.urls)),
]
