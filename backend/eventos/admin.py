"""
Configuração do Django Admin para Champions Church.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models import (
    Membro, Evento, Inscricao, Contato,
    FormularioInscricao, CampoFormulario, RespostaCampoInscricao,
)


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
        ('Formulário de Inscrição (opcional)', {
            'fields': ('formulario_inscricao',),
            'description': 'Selecione um formulário reaproveitável para coletar informações extras no ato da inscrição. As respostas ficam visíveis apenas para administradores.',
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


class RespostaCampoInscricaoInline(admin.TabularInline):
    """Inline somente-leitura para exibir respostas do formulário na Inscrição."""
    model = RespostaCampoInscricao
    extra = 0
    can_delete = False
    fields = ('campo', 'valor_display', 'arquivo_link')
    readonly_fields = ('campo', 'valor_display', 'arquivo_link')

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def valor_display(self, obj):
        if obj.campo and obj.campo.tipo == 'arquivo':
            return '-'
        if isinstance(obj.valor, (list, dict)):
            try:
                import json as _json
                return _json.dumps(obj.valor, ensure_ascii=False)
            except Exception:
                return str(obj.valor)
        return '' if obj.valor is None else str(obj.valor)
    valor_display.short_description = 'Valor'

    def arquivo_link(self, obj):
        if obj.arquivo:
            nome = obj.arquivo.name.split('/')[-1]
            return format_html('<a href="{}" target="_blank">{}</a>', obj.arquivo.url, nome)
        return '-'
    arquivo_link.short_description = 'Arquivo'


@admin.register(Inscricao)
class InscricaoAdmin(admin.ModelAdmin):
    list_display = ['membro', 'evento', 'status', 'presente', 'data_inscricao']
    list_filter = ['status', 'presente', 'data_inscricao', 'evento']
    search_fields = ['membro__nome', 'evento__titulo']
    ordering = ['-data_inscricao']
    readonly_fields = ['data_inscricao']
    list_editable = ['status', 'presente']
    autocomplete_fields = ['membro', 'evento']
    inlines = [RespostaCampoInscricaoInline]


class CampoFormularioInline(admin.TabularInline):
    """Inline para editar campos dentro de um FormularioInscricao."""
    model = CampoFormulario
    extra = 1
    fields = ('ordem', 'label', 'tipo', 'obrigatorio', 'placeholder', 'help_text', 'opcoes', 'tamanho_max')
    ordering = ('ordem', 'id')

    def get_readonly_fields(self, request, obj=None):
        return super().get_readonly_fields(request, obj)


@admin.register(FormularioInscricao)
class FormularioInscricaoAdmin(admin.ModelAdmin):
    list_display = ('nome', 'ativo', 'total_campos_admin', 'tem_inscricoes_admin', 'atualizado_em')
    list_filter = ('ativo',)
    search_fields = ('nome', 'descricao')
    readonly_fields = ('criado_em', 'atualizado_em', 'tem_inscricoes_admin', 'total_inscricoes_admin')
    inlines = [CampoFormularioInline]

    fieldsets = (
        ('Formulário', {
            'fields': ('nome', 'descricao', 'ativo')
        }),
        ('Uso', {
            'fields': ('tem_inscricoes_admin', 'total_inscricoes_admin'),
            'description': 'Com inscrições, ainda é possível editar no painel React. Duplicar cria uma cópia sem vínculos.',
        }),
        ('Registro', {
            'fields': ('criado_em', 'atualizado_em'),
            'classes': ('collapse',),
        }),
    )

    def total_campos_admin(self, obj):
        return obj.campos.count()
    total_campos_admin.short_description = 'Campos'

    def tem_inscricoes_admin(self, obj):
        return obj.tem_inscricoes if obj.pk else False
    tem_inscricoes_admin.boolean = True
    tem_inscricoes_admin.short_description = 'Em uso'

    def total_inscricoes_admin(self, obj):
        return obj.total_inscricoes if obj.pk else 0
    total_inscricoes_admin.short_description = 'Total de inscrições'

    def get_readonly_fields(self, request, obj=None):
        return list(super().get_readonly_fields(request, obj))


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
