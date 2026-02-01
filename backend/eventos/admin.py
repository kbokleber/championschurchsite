"""
Configuração do Django Admin para Champions Church.
"""

from django.contrib import admin
from .models import Membro, Evento, Inscricao, Contato


@admin.register(Membro)
class MembroAdmin(admin.ModelAdmin):
    list_display = ['nome', 'email', 'telefone', 'status', 'data_cadastro']
    list_filter = ['status', 'sexo', 'data_cadastro']
    search_fields = ['nome', 'email', 'telefone']
    ordering = ['nome']
    readonly_fields = ['data_cadastro']
    
    fieldsets = (
        ('Informações Pessoais', {
            'fields': ('nome', 'email', 'telefone', 'data_nascimento', 'sexo', 'foto')
        }),
        ('Endereço', {
            'fields': ('endereco',)
        }),
        ('Status', {
            'fields': ('status', 'observacoes', 'data_cadastro')
        }),
    )


@admin.register(Evento)
class EventoAdmin(admin.ModelAdmin):
    list_display = ['titulo', 'tipo', 'data_inicio', 'local', 'status', 'destaque', 'valor_info', 'vagas_info', 'inscricao_status']
    list_filter = ['tipo', 'status', 'destaque', 'data_inicio']
    search_fields = ['titulo', 'descricao', 'local']
    ordering = ['-data_inicio']
    readonly_fields = ['criado_em', 'atualizado_em']
    list_editable = ['destaque', 'status']
    
    fieldsets = (
        ('Informações do Evento', {
            'fields': ('titulo', 'descricao', 'tipo', 'imagem')
        }),
        ('Data e Local', {
            'fields': ('data_inicio', 'data_fim', 'local', 'endereco')
        }),
        ('Período de Inscrição', {
            'fields': ('inscricao_inicio', 'inscricao_fim'),
            'description': 'Defina o período em que as inscrições estarão disponíveis'
        }),
        ('Valor do Evento', {
            'fields': ('evento_pago', 'valor_inscricao'),
            'description': 'Defina se o evento é pago e o valor da inscrição'
        }),
        ('Configurações', {
            'fields': ('vagas', 'status', 'destaque')
        }),
        ('Registro', {
            'fields': ('criado_em', 'atualizado_em'),
            'classes': ('collapse',)
        }),
    )
    
    def valor_info(self, obj):
        if not obj.evento_pago or obj.valor_inscricao is None:
            return "Gratuito"
        return f"R$ {obj.valor_inscricao:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    valor_info.short_description = "Valor"
    
    def vagas_info(self, obj):
        if obj.vagas is None:
            return "Ilimitadas"
        return f"{obj.vagas_disponiveis}/{obj.vagas}"
    vagas_info.short_description = "Vagas Disponíveis"
    
    def inscricao_status(self, obj):
        status_map = {
            'aberto': '🟢 Aberto',
            'nao_iniciado': '🟡 Não iniciado',
            'encerrado': '🔴 Encerrado',
            'lotado': '🔴 Lotado',
            'evento_encerrado': '⚫ Evento encerrado',
        }
        return status_map.get(obj.status_inscricao, obj.status_inscricao)
    inscricao_status.short_description = "Inscrições"


@admin.register(Inscricao)
class InscricaoAdmin(admin.ModelAdmin):
    list_display = ['membro', 'evento', 'status', 'presente', 'data_inscricao']
    list_filter = ['status', 'presente', 'data_inscricao', 'evento']
    search_fields = ['membro__nome', 'evento__titulo']
    ordering = ['-data_inscricao']
    readonly_fields = ['data_inscricao']
    list_editable = ['status', 'presente']
    autocomplete_fields = ['membro', 'evento']


@admin.register(Contato)
class ContatoAdmin(admin.ModelAdmin):
    list_display = ['nome', 'email', 'assunto', 'data_envio', 'lido', 'respondido']
    list_filter = ['lido', 'respondido', 'data_envio']
    search_fields = ['nome', 'email', 'assunto', 'mensagem']
    ordering = ['-data_envio']
    readonly_fields = ['data_envio']
    list_editable = ['lido', 'respondido']
    
    fieldsets = (
        ('Remetente', {
            'fields': ('nome', 'email', 'telefone')
        }),
        ('Mensagem', {
            'fields': ('assunto', 'mensagem')
        }),
        ('Status', {
            'fields': ('lido', 'respondido', 'data_envio')
        }),
    )


# Customização do Admin Site
admin.site.site_header = "Champions Church - Administração"
admin.site.site_title = "Champions Church Admin"
admin.site.index_title = "Painel de Controle"
