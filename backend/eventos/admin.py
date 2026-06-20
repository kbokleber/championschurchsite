"""
Configuração do Django Admin para Champions Church.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models import (
    Membro, Evento, Inscricao, Contato,
    FormularioInscricao, CampoFormulario, RespostaCampoInscricao,
)
from .models_fila import JobFila, TentativaJob, WhatsappMensagem
from .fila import cancelar as fila_cancelar, reenviar as fila_reenviar


@admin.register(Membro)
class MembroAdmin(admin.ModelAdmin):
    list_display = ['nome', 'email', 'telefone', 'status', 'data_cadastro']
    list_filter = ['status', 'sexo', 'data_cadastro']
    search_fields = ['nome', 'email', 'telefone']
    ordering = ['nome']
    readonly_fields = ['data_cadastro']

    def get_queryset(self, request):
        return super().get_queryset(request).filter(is_acompanhante=False)
    
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
    readonly_fields = ['criado_em', 'atualizado_em', 'link_acesso']
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
            'fields': ('vagas', 'status', 'destaque', 'evento_particular', 'link_acesso')
        }),
        ('Formulário de Inscrição (opcional)', {
            'fields': ('formulario_inscricao', 'permite_inscricao_adolescente', 'permite_acompanhantes', 'grupo_categorias'),
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


@admin.register(JobFila)
class JobFilaAdmin(admin.ModelAdmin):
    list_display = ('id', 'tipo', 'fila', 'status_badge', 'tentativas', 'proxima_execucao_em', 'referencia', 'criado_em')
    list_filter = ('status', 'fila', 'tipo', 'criado_em')
    search_fields = ('referencia_id', 'ultimo_erro', 'job_id', 'payload')
    readonly_fields = ('tipo', 'fila', 'payload', 'tentativas', 'max_tentativas',
                       'ultima_execucao_em', 'duracao_ms', 'ultimo_erro',
                       'referencia_tipo', 'referencia_id', 'job_id',
                       'criado_em', 'atualizado_em', 'concluido_em')
    actions = ['reenviar_selecionados', 'cancelar_selecionados']
    ordering = ('-criado_em',)
    date_hierarchy = 'criado_em'

    def status_badge(self, obj):
        cores = {
            'pendente': '#f59e0b',
            'executando': '#3b82f6',
            'sucesso': '#10b981',
            'falha': '#ef4444',
            'cancelado': '#6b7280',
        }
        cor = cores.get(obj.status, '#6b7280')
        return format_html(
            '<span style="background:{};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">{}</span>',
            cor, obj.get_status_display(),
        )
    status_badge.short_description = 'Status'

    def referencia(self, obj):
        if obj.referencia_tipo:
            return f'{obj.referencia_tipo} #{obj.referencia_id}' if obj.referencia_id else obj.referencia_tipo
        return '-'
    referencia.short_description = 'Referencia'

    def has_add_permission(self, request):
        return False

    @admin.action(description='Reenviar jobs selecionados')
    def reenviar_selecionados(self, request, queryset):
        ok = 0
        for job in queryset.exclude(status__in=('executando',)):
            if fila_reenviar(job.id):
                ok += 1
        self.message_user(request, f'{ok} job(s) reenfileirado(s).')

    @admin.action(description='Cancelar jobs pendentes')
    def cancelar_selecionados(self, request, queryset):
        ok = 0
        for job in queryset.filter(status='pendente'):
            if fila_cancelar(job.id):
                ok += 1
        self.message_user(request, f'{ok} job(s) cancelado(s).')


@admin.register(TentativaJob)
class TentativaJobAdmin(admin.ModelAdmin):
    list_display = ('id', 'job', 'iniciado_em', 'terminou_em', 'sucesso', 'http_status')
    list_filter = ('sucesso', 'iniciado_em')
    search_fields = ('job__id', 'erro')
    readonly_fields = ('job', 'iniciado_em', 'terminou_em', 'sucesso', 'erro', 'http_status')

    def has_add_permission(self, request):
        return False


@admin.register(WhatsappMensagem)
class WhatsappMensagemAdmin(admin.ModelAdmin):
    list_display = ('id', 'tipo', 'telefone', 'job_status', 'criado_em')
    list_filter = ('tipo', 'job__status')
    search_fields = ('telefone', 'mensagem_renderizada', 'job__referencia_id')
    readonly_fields = ('job', 'tipo', 'telefone', 'mensagem_renderizada',
                       'instancia_override', 'api_key_override')

    def job_status(self, obj):
        return obj.job.get_status_display()
    job_status.short_description = 'Status'

    def criado_em(self, obj):
        return obj.job.criado_em
    criado_em.short_description = 'Criado em'

    def has_add_permission(self, request):
        return False
