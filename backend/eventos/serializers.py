"""
Serializers para a API REST da Champions Church.
"""

from rest_framework import serializers
from django.contrib.auth.models import User
from django.utils import timezone
from .models import (
    Membro, Evento, Inscricao, Contato, ConfiguracaoSite, 
    CategoriaParticipante, Cobranca, CobrancaItem,
    PermissaoMenu, Grupo
)


class UserSerializer(serializers.ModelSerializer):
    """Serializer para o modelo User do Django."""
    
    grupos = serializers.SerializerMethodField()
    menus_permitidos = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 
            'is_staff', 'is_superuser', 'grupos', 'menus_permitidos'
        ]
        read_only_fields = ['id', 'is_staff', 'is_superuser', 'grupos', 'menus_permitidos']
    
    def get_grupos(self, obj):
        """Retorna os grupos ativos do usuário."""
        grupos = obj.grupos_admin.filter(ativo=True)
        return [{'id': g.id, 'nome': g.nome} for g in grupos]
    
    def get_menus_permitidos(self, obj):
        """Retorna os códigos de menus que o usuário pode acessar."""
        return Grupo.get_menus_permitidos_usuario(obj)


class PermissaoMenuSerializer(serializers.ModelSerializer):
    """Serializer para o modelo PermissaoMenu."""
    
    class Meta:
        model = PermissaoMenu
        fields = [
            'id', 'codigo', 'nome', 'descricao', 'ordem', 'ativo', 'criado_em'
        ]
        read_only_fields = ['id', 'criado_em']


class GrupoSerializer(serializers.ModelSerializer):
    """Serializer para o modelo Grupo."""
    
    permissoes_detalhes = PermissaoMenuSerializer(source='permissoes', many=True, read_only=True)
    permissoes_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=PermissaoMenu.objects.all(),
        source='permissoes',
        write_only=True,
        required=False
    )
    usuarios_count = serializers.SerializerMethodField()
    usuarios_detalhes = serializers.SerializerMethodField()
    
    class Meta:
        model = Grupo
        fields = [
            'id', 'nome', 'descricao', 'permissoes', 'permissoes_ids',
            'permissoes_detalhes', 'usuarios', 'usuarios_count', 'usuarios_detalhes',
            'ativo', 'criado_em', 'atualizado_em'
        ]
        read_only_fields = ['id', 'criado_em', 'atualizado_em', 'usuarios_count', 'usuarios_detalhes']
    
    def get_usuarios_count(self, obj):
        """Retorna a quantidade de usuários no grupo."""
        return obj.usuarios.count()
    
    def get_usuarios_detalhes(self, obj):
        """Retorna detalhes dos usuários do grupo."""
        usuarios = obj.usuarios.all()
        return [
            {
                'id': u.id,
                'username': u.username,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'email': u.email
            }
            for u in usuarios
        ]


class UsuarioAdminSerializer(serializers.ModelSerializer):
    """Serializer para criação/edição de usuários administrativos."""
    
    password = serializers.CharField(write_only=True, required=False)
    grupos_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Grupo.objects.all(),
        source='grupos_admin',
        write_only=True,
        required=False
    )
    grupos = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'password', 'is_staff', 'is_superuser', 'grupos_ids', 'grupos'
        ]
        read_only_fields = ['id']
    
    def get_grupos(self, obj):
        """Retorna os grupos do usuário."""
        grupos = obj.grupos_admin.all()
        return [{'id': g.id, 'nome': g.nome} for g in grupos]
    
    def create(self, validated_data):
        """Cria um novo usuário com senha criptografada."""
        grupos_ids = validated_data.pop('grupos_admin', [])
        password = validated_data.pop('password', None)
        
        if not password:
            raise serializers.ValidationError({'password': 'Senha é obrigatória para criar usuário'})
        
        user = User.objects.create_user(
            password=password,
            **validated_data
        )
        
        # Adicionar grupos
        if grupos_ids:
            user.grupos_admin.set(grupos_ids)
        
        return user
    
    def update(self, instance, validated_data):
        """Atualiza um usuário existente."""
        grupos_ids = validated_data.pop('grupos_admin', None)
        password = validated_data.pop('password', None)
        
        # Atualizar senha se fornecida
        if password:
            instance.set_password(password)
        
        # Atualizar outros campos
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        instance.save()
        
        # Atualizar grupos se fornecidos
        if grupos_ids is not None:
            instance.grupos_admin.set(grupos_ids)
        
        return instance


class MembroSerializer(serializers.ModelSerializer):
    """Serializer para o modelo Membro."""
    
    class Meta:
        model = Membro
        fields = [
            'id', 'nome', 'email', 'telefone', 'data_nascimento',
            'sexo', 'endereco', 'data_cadastro', 'status', 'foto', 'senha_texto'
        ]
        read_only_fields = ['id', 'data_cadastro', 'senha_texto']


class MembroResumoSerializer(serializers.ModelSerializer):
    """Serializer resumido para listagem de membros."""
    
    class Meta:
        model = Membro
        fields = ['id', 'nome', 'email', 'telefone', 'status', 'senha_texto']


class EventoSerializer(serializers.ModelSerializer):
    """Serializer para o modelo Evento."""
    
    vagas_disponiveis = serializers.ReadOnlyField()
    esta_lotado = serializers.ReadOnlyField()
    inscricoes_abertas = serializers.ReadOnlyField()
    status_inscricao = serializers.ReadOnlyField()
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    # Campos formatados em português
    data_inicio_formatada = serializers.SerializerMethodField()
    data_fim_formatada = serializers.SerializerMethodField()
    inscricao_inicio_formatada = serializers.SerializerMethodField()
    inscricao_fim_formatada = serializers.SerializerMethodField()
    criado_em_formatado = serializers.SerializerMethodField()
    
    # Campo formatado para valor
    valor_inscricao_formatado = serializers.SerializerMethodField()
    
    class Meta:
        model = Evento
        fields = [
            'id', 'titulo', 'descricao', 'tipo', 'tipo_display',
            'data_inicio', 'data_fim', 'data_inicio_formatada', 'data_fim_formatada',
            'local', 'endereco', 'vagas', 'vagas_disponiveis', 'esta_lotado',
            'inscricao_inicio', 'inscricao_fim', 'inscricao_inicio_formatada', 'inscricao_fim_formatada',
            'inscricoes_abertas', 'status_inscricao',
            'evento_pago', 'valor_inscricao', 'valor_inscricao_formatado',
            'imagem', 'status', 'status_display', 'destaque',
            'criado_em', 'atualizado_em', 'criado_em_formatado'
        ]
        read_only_fields = ['id', 'criado_em', 'atualizado_em']
    
    def to_internal_value(self, data):
        """Converte strings vazias em None para campos que podem ser nulos."""
        # Campos que podem ser nulos e devem aceitar string vazia como null
        nullable_fields = [
            'data_fim', 'inscricao_inicio', 'inscricao_fim', 
            'vagas', 'valor_inscricao', 'endereco', 'imagem'
        ]
        
        # Criar cópia mutável dos dados
        if hasattr(data, '_mutable'):
            data._mutable = True
        
        for field in nullable_fields:
            if field in data and data[field] == '':
                data[field] = None
        
        return super().to_internal_value(data)
    
    def _formatar_data(self, data):
        """Formata data no padrão brasileiro DD/MM/YYYY HH:MM:SS com fuso horário local."""
        if data is None:
            return None
        from django.utils import timezone
        dt = timezone.localtime(data)
        return dt.strftime('%d/%m/%Y %H:%M:%S')
    
    def get_data_inicio_formatada(self, obj):
        return self._formatar_data(obj.data_inicio)
    
    def get_data_fim_formatada(self, obj):
        return self._formatar_data(obj.data_fim)
    
    def get_inscricao_inicio_formatada(self, obj):
        return self._formatar_data(obj.inscricao_inicio)
    
    def get_inscricao_fim_formatada(self, obj):
        return self._formatar_data(obj.inscricao_fim)
    
    def get_criado_em_formatado(self, obj):
        return self._formatar_data(obj.criado_em)
    
    def get_valor_inscricao_formatado(self, obj):
        """Formata valor no padrão brasileiro R$ X.XXX,XX"""
        if obj.valor_inscricao is None or not obj.evento_pago:
            return 'Gratuito'
        return f'R$ {obj.valor_inscricao:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')

    def to_representation(self, instance):
        """Garantir que a URL da imagem sempre comece com / para o frontend resolver corretamente."""
        data = super().to_representation(instance)
        if data.get('imagem') and not data['imagem'].startswith(('http://', 'https://', '/')):
            data['imagem'] = '/' + data['imagem']
        return data


class EventoListaSerializer(serializers.ModelSerializer):
    """Serializer resumido para listagem de eventos."""
    
    vagas_disponiveis = serializers.ReadOnlyField()
    inscricoes_abertas = serializers.ReadOnlyField()
    status_inscricao = serializers.ReadOnlyField()
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    data_inicio_formatada = serializers.SerializerMethodField()
    valor_inscricao_formatado = serializers.SerializerMethodField()
    
    class Meta:
        model = Evento
        fields = [
            'id', 'titulo', 'tipo', 'tipo_display', 'data_inicio', 'data_inicio_formatada',
            'local', 'vagas_disponiveis', 'imagem', 'destaque',
            'inscricoes_abertas', 'status_inscricao',
            'inscricao_inicio', 'inscricao_fim',
            'evento_pago', 'valor_inscricao', 'valor_inscricao_formatado'
        ]
    
    def get_data_inicio_formatada(self, obj):
        if obj.data_inicio is None:
            return None
        return timezone.localtime(obj.data_inicio).strftime('%d/%m/%Y %H:%M:%S')
    
    def get_valor_inscricao_formatado(self, obj):
        """Formata valor no padrão brasileiro R$ X.XXX,XX"""
        if obj.valor_inscricao is None or not obj.evento_pago:
            return 'Gratuito'
        return f'R$ {obj.valor_inscricao:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get('imagem') and not data['imagem'].startswith(('http://', 'https://', '/')):
            data['imagem'] = '/' + data['imagem']
        return data


class InscricaoSerializer(serializers.ModelSerializer):
    """Serializer para o modelo Inscrição."""
    
    membro_nome = serializers.CharField(source='membro.nome', read_only=True)
    membro_email = serializers.CharField(source='membro.email', read_only=True)
    membro_telefone = serializers.CharField(source='membro.telefone', read_only=True)
    evento_titulo = serializers.CharField(source='evento.titulo', read_only=True)
    evento_data = serializers.SerializerMethodField()
    evento_pago = serializers.BooleanField(source='evento.evento_pago', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    status_pagamento_display = serializers.CharField(source='get_status_pagamento_display', read_only=True)
    categoria_nome = serializers.CharField(source='categoria.nome', read_only=True, allow_null=True)
    data_inscricao_formatada = serializers.SerializerMethodField()
    data_checkin_formatada = serializers.SerializerMethodField()
    data_pagamento_formatada = serializers.SerializerMethodField()
    valor_inscricao_formatado = serializers.SerializerMethodField()
    
    class Meta:
        model = Inscricao
        fields = [
            'id', 'membro', 'membro_nome', 'membro_email', 'membro_telefone',
            'evento', 'evento_titulo', 'evento_data', 'evento_pago',
            'categoria', 'categoria_nome',
            'codigo', 'qrcode',
            'data_inscricao', 'data_inscricao_formatada',
            'status', 'status_display', 'observacoes',
            'valor_inscricao', 'valor_inscricao_formatado',
            'status_pagamento', 'status_pagamento_display',
            'data_pagamento', 'data_pagamento_formatada',
            'presente', 'data_checkin', 'data_checkin_formatada',
            'is_acompanhante', 'responsavel'
        ]
        read_only_fields = ['id', 'data_inscricao', 'codigo', 'qrcode', 'data_checkin']
    
    def get_evento_data(self, obj):
        if obj.evento and obj.evento.data_inicio:
            return timezone.localtime(obj.evento.data_inicio).strftime('%d/%m/%Y %H:%M')
        return None
    
    def get_data_inscricao_formatada(self, obj):
        if obj.data_inscricao:
            return timezone.localtime(obj.data_inscricao).strftime('%d/%m/%Y %H:%M:%S')
        return None
    
    def get_data_checkin_formatada(self, obj):
        if obj.data_checkin:
            return timezone.localtime(obj.data_checkin).strftime('%d/%m/%Y %H:%M:%S')
        return None
    
    def get_data_pagamento_formatada(self, obj):
        if obj.data_pagamento:
            return timezone.localtime(obj.data_pagamento).strftime('%d/%m/%Y %H:%M:%S')
        return None
    
    def get_valor_inscricao_formatado(self, obj):
        if obj.valor_inscricao is None or obj.valor_inscricao == 0:
            return 'Gratuito'
        return f'R$ {obj.valor_inscricao:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    
    def validate(self, data):
        """Validação customizada para inscrição."""
        membro = data.get('membro')
        evento = data.get('evento')
        
        # Verifica se já existe inscrição
        if self.instance is None:  # Apenas para criação
            if Inscricao.objects.filter(membro=membro, evento=evento).exists():
                raise serializers.ValidationError(
                    "Este membro já está inscrito neste evento."
                )
        
        # Verifica se há vagas disponíveis
        if evento.esta_lotado and self.instance is None:
            raise serializers.ValidationError(
                "Este evento não possui vagas disponíveis."
            )
        
        # Verifica se as inscrições estão abertas
        if self.instance is None and not evento.inscricoes_abertas:
            status = evento.status_inscricao
            mensagens = {
                'nao_iniciado': 'As inscrições para este evento ainda não foram abertas.',
                'encerrado': 'As inscrições para este evento já foram encerradas.',
                'lotado': 'Este evento não possui vagas disponíveis.',
                'evento_encerrado': 'Este evento não está mais disponível para inscrições.',
            }
            raise serializers.ValidationError(
                mensagens.get(status, 'Não é possível se inscrever neste evento no momento.')
            )
        
        return data


class ContatoSerializer(serializers.ModelSerializer):
    """Serializer para o modelo Contato."""
    
    class Meta:
        model = Contato
        fields = [
            'id', 'nome', 'email', 'telefone', 'assunto',
            'mensagem', 'data_envio'
        ]
        read_only_fields = ['id', 'data_envio']


class CategoriaParticipanteSerializer(serializers.ModelSerializer):
    """Serializer para o modelo CategoriaParticipante."""
    
    tipo_valor_display = serializers.CharField(source='get_tipo_valor_display', read_only=True)
    valor_formatado = serializers.SerializerMethodField()
    
    class Meta:
        model = CategoriaParticipante
        fields = [
            'id', 'nome', 'descricao', 'tipo_valor', 'tipo_valor_display',
            'valor', 'valor_formatado', 'idade_minima', 'idade_maxima',
            'ordem', 'ativo', 'criado_em'
        ]
        read_only_fields = ['id', 'criado_em']
    
    def get_valor_formatado(self, obj):
        """Formata o valor de acordo com o tipo."""
        if obj.tipo_valor == 'fixo':
            return f'R$ {obj.valor:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
        return f'{obj.valor:.0f}%'


class ConfiguracaoSitePublicSerializer(serializers.ModelSerializer):
    """Serializer PÚBLICO para configurações do site (sem dados sensíveis)."""
    
    class Meta:
        model = ConfiguracaoSite
        fields = [
            'id', 'nome_igreja', 'slogan', 'descricao',
            'logo', 'logo_branco', 'favicon',
            'email', 'telefone', 'whatsapp',
            'endereco', 'cidade', 'estado', 'cep',
            'facebook', 'instagram', 'youtube', 'tiktok', 'twitter',
            'horarios', 'google_maps_embed',
            'atualizado_em'
        ]
        read_only_fields = fields  # Todos são somente leitura no público


class ConfiguracaoSiteSerializer(serializers.ModelSerializer):
    """Serializer ADMIN para configurações do site (com dados sensíveis)."""
    
    # Campos computados do Mercado Pago (só leitura)
    mp_public_key = serializers.ReadOnlyField()
    mp_is_sandbox = serializers.ReadOnlyField()
    
    # Mascarar tokens na leitura
    mp_access_token_sandbox_masked = serializers.SerializerMethodField()
    mp_access_token_production_masked = serializers.SerializerMethodField()
    
    class Meta:
        model = ConfiguracaoSite
        fields = [
            'id', 'nome_igreja', 'slogan', 'descricao',
            'logo', 'logo_branco', 'favicon',
            'email', 'telefone', 'whatsapp',
            'endereco', 'cidade', 'estado', 'cep',
            'facebook', 'instagram', 'youtube', 'tiktok', 'twitter',
            'horarios', 'google_maps_embed',
            'webhook_inscricao', 'webhook_ativo', 'webhook_reset_senha',
            # Mercado Pago
            'mp_ambiente', 'mp_ativo',
            'mp_public_key_sandbox', 'mp_access_token_sandbox',
            'mp_public_key_production', 'mp_access_token_production',
            'mp_access_token_sandbox_masked', 'mp_access_token_production_masked',
            'mp_public_key', 'mp_is_sandbox',  # Campos computados
            # WhatsApp Evolution API
            'evolution_api_url', 'evolution_api_key', 'evolution_api_instance',
            'atualizado_em'
        ]
        read_only_fields = ['id', 'atualizado_em', 'mp_public_key', 'mp_is_sandbox',
                           'mp_access_token_sandbox_masked', 'mp_access_token_production_masked']
        # Tokens retornados na leitura para o admin poder ver/copiar (endpoint já é restrito)
    
    def get_mp_access_token_sandbox_masked(self, obj):
        """Retorna token de sandbox mascarado."""
        if obj.mp_access_token_sandbox:
            return f"{obj.mp_access_token_sandbox[:15]}...{obj.mp_access_token_sandbox[-4:]}"
        return None
    
    def get_mp_access_token_production_masked(self, obj):
        """Retorna token de produção mascarado."""
        if obj.mp_access_token_production:
            return f"{obj.mp_access_token_production[:15]}...{obj.mp_access_token_production[-4:]}"
        return None


class CobrancaItemSerializer(serializers.ModelSerializer):
    """Serializer para itens de cobrança."""
    
    membro_nome = serializers.CharField(source='inscricao.membro.nome', read_only=True)
    categoria = serializers.CharField(source='inscricao.categoria.nome', read_only=True, allow_null=True)
    status_inscricao = serializers.CharField(source='inscricao.status_pagamento', read_only=True)
    
    class Meta:
        model = CobrancaItem
        fields = ['id', 'inscricao', 'membro_nome', 'categoria', 'valor', 'descricao', 'status_inscricao']
        read_only_fields = ['id']


class CobrancaSerializer(serializers.ModelSerializer):
    """Serializer para cobranças."""
    
    membro_nome = serializers.CharField(source='membro.nome', read_only=True)
    membro_telefone = serializers.CharField(source='membro.telefone', read_only=True)
    evento_titulo = serializers.CharField(source='evento.titulo', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    itens = CobrancaItemSerializer(many=True, read_only=True)
    data_criacao_formatada = serializers.SerializerMethodField()
    data_pagamento_formatada = serializers.SerializerMethodField()
    
    class Meta:
        model = Cobranca
        fields = [
            'id', 'codigo', 'membro', 'membro_nome', 'membro_telefone',
            'evento', 'evento_titulo', 'valor', 'descricao',
            'status', 'status_display', 'data_criacao', 'data_criacao_formatada',
            'data_pagamento', 'data_pagamento_formatada',
            'referencia_externa', 'metodo_pagamento', 'itens'
        ]
        read_only_fields = ['id', 'codigo', 'data_criacao']
    
    def _formatar_data(self, data):
        """Formata data no padrão brasileiro DD/MM/YYYY HH:MM:SS com fuso horário local"""
        if data is None:
            return None
        from django.utils import timezone
        if timezone.is_aware(data):
            data = timezone.localtime(data)
        return data.strftime('%d/%m/%Y %H:%M:%S')
    
    def get_data_criacao_formatada(self, obj):
        return self._formatar_data(obj.data_criacao)
    
    def get_data_pagamento_formatada(self, obj):
        return self._formatar_data(obj.data_pagamento)
