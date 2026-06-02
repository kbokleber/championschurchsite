"""
Serializers para a API REST da Champions Church.
"""

from rest_framework import serializers
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
import uuid
from .permissions import usuario_tem_menu_ou_superuser
from .models import (
    Membro, Evento, Inscricao, Contato, ConfiguracaoSite, 
    DestaqueHomeItem,
    CategoriaParticipante, Cobranca, CobrancaItem,
    GrupoCategoria,
    PermissaoMenu, Grupo,
    FormularioInscricao, CampoFormulario, RespostaCampoInscricao
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
            'sexo', 'endereco', 'data_cadastro', 'status', 'foto',
        ]
        read_only_fields = ['id', 'data_cadastro']


class MembroResumoSerializer(serializers.ModelSerializer):
    """Serializer resumido para listagem de membros."""
    
    class Meta:
        model = Membro
        fields = ['id', 'nome', 'email', 'telefone', 'status']


class CampoFormularioSerializer(serializers.ModelSerializer):
    """Serializer público/admin para a ESTRUTURA de um campo.

    Usado tanto pelo admin quanto pelo público: contém apenas a definição do
    campo, NUNCA as respostas. Respostas são expostas apenas via endpoints
    admin (vide ``InscricaoAdminSerializer``).

    O ``id`` é opcional na escrita: usado no admin para manter o mesmo registro
    ao editar o formulário (evita apagar e recriar, o que conflitava com
    respostas e ``PROTECT`` em respostas).
    """

    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = CampoFormulario
        fields = [
            'id', 'ordem', 'label', 'tipo', 'tipo_display', 'obrigatorio',
            'placeholder', 'help_text', 'opcoes', 'tamanho_max',
        ]
        read_only_fields = ['tipo_display']

    def validate(self, data):
        tipo = data.get('tipo') or (self.instance.tipo if self.instance else None)
        opcoes = data.get('opcoes')
        if opcoes is None and self.instance is not None:
            opcoes = self.instance.opcoes

        if tipo in CampoFormulario.TIPOS_COM_OPCOES:
            if not isinstance(opcoes, list) or len(opcoes) < 2:
                raise serializers.ValidationError({
                    'opcoes': 'Campos de seleção precisam de pelo menos 2 opções.'
                })
            normalizadas = []
            seen = set()
            for op in opcoes:
                if op is None:
                    continue
                texto = str(op).strip()
                if not texto or texto in seen:
                    continue
                seen.add(texto)
                normalizadas.append(texto)
            if len(normalizadas) < 2:
                raise serializers.ValidationError({
                    'opcoes': 'Informe pelo menos 2 opções distintas e não vazias.'
                })
            data['opcoes'] = normalizadas
        else:
            data['opcoes'] = []
        return data


class FormularioInscricaoSerializer(serializers.ModelSerializer):
    """Serializer ADMIN de CRUD para formulários reaproveitáveis.

    Com inscrições existentes, ainda é possível editar (novos participantes
    passam a ver os campos atuais). A sincronização de campos preserva ``id``
    quando o cliente reenvia os existentes; campos removidos apagam as
    respostas vinculadas (``RespostaCampoInscricao``) antes de excluir o campo.
    """

    campos = CampoFormularioSerializer(many=True, required=False)
    tem_inscricoes = serializers.ReadOnlyField()
    total_inscricoes = serializers.ReadOnlyField()

    class Meta:
        model = FormularioInscricao
        fields = [
            'id', 'nome', 'descricao', 'ativo', 'campos',
            'tem_inscricoes', 'total_inscricoes',
            'criado_em', 'atualizado_em',
        ]
        read_only_fields = ['id', 'criado_em', 'atualizado_em', 'tem_inscricoes', 'total_inscricoes']

    def _criar_campos(self, formulario, campos_data):
        for idx, campo_data in enumerate(campos_data):
            if isinstance(campo_data, dict):
                campo_data = {**campo_data}
            campo_data.pop('id', None)
            campo_data.setdefault('ordem', idx)
            CampoFormulario.objects.create(formulario=formulario, **campo_data)

    def _sincronizar_campos(self, formulario, campos_data):
        """Cria/atualiza campos por id; remove os que saíram da lista (e respostas)."""
        present_ids = []
        for idx, raw in enumerate(campos_data):
            cdata = dict(raw)
            field_id = cdata.pop('id', None)
            cdata['ordem'] = idx
            if field_id is not None:
                try:
                    campo = formulario.campos.get(pk=field_id)
                except CampoFormulario.DoesNotExist:
                    raise serializers.ValidationError({
                        'campos': f'Campo id={field_id} não pertence a este formulário.',
                    })
                for k, v in cdata.items():
                    setattr(campo, k, v)
                campo.save()
                present_ids.append(campo.pk)
            else:
                novo = CampoFormulario.objects.create(formulario=formulario, **cdata)
                present_ids.append(novo.pk)

        for campo in formulario.campos.exclude(pk__in=present_ids):
            for resposta in RespostaCampoInscricao.objects.filter(campo=campo):
                resposta.delete()
            campo.delete()

    def create(self, validated_data):
        campos_data = validated_data.pop('campos', None)
        if not campos_data:
            raise serializers.ValidationError({'campos': 'Informe ao menos um campo no formulário.'})
        formulario = FormularioInscricao.objects.create(**validated_data)
        self._criar_campos(formulario, campos_data)
        return formulario

    @transaction.atomic
    def update(self, instance, validated_data):
        campos_data = validated_data.pop('campos', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if campos_data is not None:
            if len(campos_data) == 0:
                raise serializers.ValidationError(
                    {'campos': 'O formulário precisa de ao menos um campo. Use a action duplicar em vez de esvaziar.'}
                )
            self._sincronizar_campos(instance, campos_data)
        return instance


class FormularioInscricaoResumoSerializer(serializers.ModelSerializer):
    """Resumo para listagens (sem campos)."""

    tem_inscricoes = serializers.ReadOnlyField()
    total_inscricoes = serializers.ReadOnlyField()
    total_campos = serializers.SerializerMethodField()

    class Meta:
        model = FormularioInscricao
        fields = [
            'id', 'nome', 'descricao', 'ativo',
            'tem_inscricoes', 'total_inscricoes', 'total_campos',
            'criado_em', 'atualizado_em',
        ]
        read_only_fields = fields

    def get_total_campos(self, obj):
        return obj.campos.count()


class FormularioInscricaoPublicSerializer(serializers.ModelSerializer):
    """Serializer PÚBLICO para expor somente a ESTRUTURA do formulário.

    Nunca inclui respostas. Usado apenas para que o frontend possa renderizar
    os campos para o participante preencher.
    """

    campos = CampoFormularioSerializer(many=True, read_only=True)

    class Meta:
        model = FormularioInscricao
        fields = ['id', 'nome', 'descricao', 'campos']
        read_only_fields = fields


class RespostaCampoInscricaoAdminSerializer(serializers.ModelSerializer):
    """Serializer de RESPOSTAS — exclusivo para endpoints admin.

    Jamais deve ser usado em endpoints públicos. Retorna valor preenchido e
    URL protegida para download do arquivo (quando aplicável).
    """

    campo_id = serializers.IntegerField(source='campo.id', read_only=True)
    label = serializers.CharField(source='campo.label', read_only=True)
    tipo = serializers.CharField(source='campo.tipo', read_only=True)
    tipo_display = serializers.CharField(source='campo.get_tipo_display', read_only=True)
    ordem = serializers.IntegerField(source='campo.ordem', read_only=True)
    opcoes = serializers.JSONField(source='campo.opcoes', read_only=True)
    arquivo_url = serializers.SerializerMethodField()
    arquivo_nome = serializers.SerializerMethodField()

    class Meta:
        model = RespostaCampoInscricao
        fields = [
            'id', 'campo_id', 'label', 'tipo', 'tipo_display', 'ordem', 'opcoes',
            'valor', 'arquivo_url', 'arquivo_nome',
        ]
        read_only_fields = fields

    def get_arquivo_url(self, obj):
        if obj.campo.tipo != 'arquivo' or not obj.arquivo:
            return None
        # URL do endpoint admin protegido (não o MEDIA direto).
        return f'/api/admin/inscricoes/{obj.inscricao_id}/respostas/{obj.campo_id}/arquivo/'

    def get_arquivo_nome(self, obj):
        if obj.campo.tipo != 'arquivo' or not obj.arquivo:
            return None
        try:
            return obj.arquivo.name.rsplit('/', 1)[-1]
        except Exception:
            return None


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

    # Estrutura do formulário (só estrutura, NUNCA respostas)
    formulario_inscricao_detalhe = FormularioInscricaoPublicSerializer(
        source='formulario_inscricao', read_only=True
    )
    grupo_categorias_nome = serializers.CharField(
        source='grupo_categorias.nome', read_only=True, default=None,
    )
    link_acesso = serializers.UUIDField(read_only=True)
    link_inscricao_publico = serializers.SerializerMethodField()
    
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
            'formulario_inscricao', 'formulario_inscricao_detalhe', 'permite_acompanhantes',
            'permite_inscricao_adolescente', 'evento_particular', 'link_acesso', 'link_inscricao_publico',
            'grupo_categorias', 'grupo_categorias_nome',
            'criado_em', 'atualizado_em', 'criado_em_formatado'
        ]
        read_only_fields = ['id', 'criado_em', 'atualizado_em', 'link_acesso']
    
    def validate(self, attrs):
        permite = attrs.get(
            'permite_acompanhantes',
            getattr(self.instance, 'permite_acompanhantes', True) if self.instance else True,
        )
        if not permite:
            attrs['grupo_categorias'] = None

        evento_particular = attrs.get(
            'evento_particular',
            getattr(self.instance, 'evento_particular', False) if self.instance else False,
        )
        if evento_particular:
            attrs['destaque'] = False

        return attrs

    def _garantir_link_acesso(self, validated_data, instance=None):
        evento_particular = validated_data.get(
            'evento_particular',
            getattr(instance, 'evento_particular', False) if instance else False,
        )
        if evento_particular and not validated_data.get('link_acesso'):
            if instance and instance.link_acesso:
                validated_data.setdefault('link_acesso', instance.link_acesso)
            else:
                validated_data['link_acesso'] = uuid.uuid4()
        return validated_data

    def create(self, validated_data):
        validated_data = self._garantir_link_acesso(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data = self._garantir_link_acesso(validated_data, instance)
        return super().update(instance, validated_data)

    def get_link_inscricao_publico(self, obj):
        if not obj.evento_particular or not obj.link_acesso:
            return None
        from .frontend_links import build_inscricao_evento_url
        request = self.context.get('request')
        return build_inscricao_evento_url(request, obj.link_acesso)
    
    def to_internal_value(self, data):
        """Converte strings vazias em None para campos que podem ser nulos."""
        # Campos que podem ser nulos e devem aceitar string vazia como null
        nullable_fields = [
            'data_fim', 'inscricao_inicio', 'inscricao_fim', 
            'vagas', 'valor_inscricao', 'endereco', 'imagem',
            'formulario_inscricao', 'grupo_categorias',
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
    evento_particular = serializers.BooleanField(read_only=True)
    link_acesso = serializers.SerializerMethodField()
    
    class Meta:
        model = Evento
        fields = [
            'id', 'titulo', 'tipo', 'tipo_display', 'data_inicio', 'data_inicio_formatada',
            'local', 'vagas_disponiveis', 'imagem', 'destaque',
            'inscricoes_abertas', 'status_inscricao',
            'inscricao_inicio', 'inscricao_fim',
            'evento_pago', 'valor_inscricao', 'valor_inscricao_formatado',
            'evento_particular', 'link_acesso',
        ]

    def get_link_acesso(self, obj):
        request = self.context.get('request')
        if not request or not usuario_tem_menu_ou_superuser(request.user, 'eventos'):
            return None
        return str(obj.link_acesso) if obj.link_acesso else None
    
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


def _extensao_arquivo(nome):
    if not nome or '.' not in nome:
        return ''
    return nome.rsplit('.', 1)[-1].lower()


def _validar_cpf(cpf):
    """Valida CPF por dígito verificador. Retorna True se válido."""
    import re
    cpf = re.sub(r'\D', '', cpf or '')
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for i in (9, 10):
        soma = sum(int(cpf[num]) * ((i + 1) - num) for num in range(0, i))
        digito = (soma * 10) % 11
        if digito == 10:
            digito = 0
        if digito != int(cpf[i]):
            return False
    return True


def validar_respostas_formulario(evento, respostas_raw):
    """Valida a lista de respostas contra o formulário do evento.

    ``respostas_raw`` deve ser uma lista/dict no formato::

        [{"campo": <id>, "valor": <qualquer>}, ...]

    Retorna uma lista de dicts prontos para criação de ``RespostaCampoInscricao``
    (sem o campo ``arquivo``, que é tratado separadamente no fluxo de upload).

    Levanta ``serializers.ValidationError({'errors_por_campo': {campo_id: msg}})``
    quando houver erros.
    """
    import re
    from datetime import date as _date

    formulario = getattr(evento, 'formulario_inscricao', None)
    errors = {}

    if not formulario:
        # Evento sem formulário: ignora qualquer resposta enviada (por segurança).
        return []

    # Normaliza para dict {campo_id: valor}
    respostas_map = {}
    if isinstance(respostas_raw, dict):
        for k, v in respostas_raw.items():
            try:
                respostas_map[int(k)] = v
            except (TypeError, ValueError):
                continue
    elif isinstance(respostas_raw, list):
        for item in respostas_raw:
            if not isinstance(item, dict):
                continue
            cid = item.get('campo') or item.get('campo_id') or item.get('id')
            try:
                cid = int(cid)
            except (TypeError, ValueError):
                continue
            respostas_map[cid] = item.get('valor', item.get('value'))

    validadas = []
    campos = list(formulario.campos.all().order_by('ordem', 'id'))

    for campo in campos:
        valor = respostas_map.get(campo.id, None)
        # Detectar vazio conforme tipo
        vazio = valor is None or (isinstance(valor, str) and not valor.strip()) or (
            isinstance(valor, list) and len(valor) == 0
        )

        if campo.obrigatorio and vazio and campo.tipo != 'arquivo':
            errors[campo.id] = 'Campo obrigatório.'
            continue

        if vazio and campo.tipo != 'arquivo':
            # opcional e vazio: pula
            continue

        tipo = campo.tipo
        try:
            if tipo in ('texto_curto', 'texto_longo'):
                v = str(valor)
                if campo.tamanho_max and len(v) > campo.tamanho_max:
                    errors[campo.id] = f'Máximo de {campo.tamanho_max} caracteres.'
                    continue
                validadas.append({'campo': campo, 'valor': v})
            elif tipo == 'numero':
                try:
                    num = float(str(valor).replace(',', '.'))
                except (TypeError, ValueError):
                    errors[campo.id] = 'Informe um número válido.'
                    continue
                validadas.append({'campo': campo, 'valor': num})
            elif tipo == 'data':
                s = str(valor)
                try:
                    # Aceita ISO (YYYY-MM-DD) e dd/mm/yyyy
                    if re.match(r'^\d{4}-\d{2}-\d{2}$', s):
                        _date.fromisoformat(s)
                        iso = s
                    elif re.match(r'^\d{2}/\d{2}/\d{4}$', s):
                        d, m, y = s.split('/')
                        iso = _date(int(y), int(m), int(d)).isoformat()
                    else:
                        raise ValueError()
                except ValueError:
                    errors[campo.id] = 'Informe uma data válida (YYYY-MM-DD).'
                    continue
                validadas.append({'campo': campo, 'valor': iso})
            elif tipo == 'boolean':
                if isinstance(valor, bool):
                    b = valor
                else:
                    s = str(valor).strip().lower()
                    if s in ('true', '1', 'sim', 'yes', 's'):
                        b = True
                    elif s in ('false', '0', 'nao', 'não', 'no', 'n'):
                        b = False
                    else:
                        errors[campo.id] = 'Informe Sim ou Não.'
                        continue
                validadas.append({'campo': campo, 'valor': b})
            elif tipo == 'select_unico':
                v = str(valor)
                if v not in (campo.opcoes or []):
                    errors[campo.id] = 'Opção inválida.'
                    continue
                validadas.append({'campo': campo, 'valor': v})
            elif tipo == 'select_multiplo':
                if not isinstance(valor, list):
                    errors[campo.id] = 'Formato inválido.'
                    continue
                invalidos = [v for v in valor if v not in (campo.opcoes or [])]
                if invalidos:
                    errors[campo.id] = 'Uma ou mais opções são inválidas.'
                    continue
                validadas.append({'campo': campo, 'valor': list(valor)})
            elif tipo == 'email':
                s = str(valor).strip()
                if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', s):
                    errors[campo.id] = 'E-mail inválido.'
                    continue
                validadas.append({'campo': campo, 'valor': s})
            elif tipo == 'telefone':
                s = re.sub(r'\D', '', str(valor))
                if not (10 <= len(s) <= 13):
                    errors[campo.id] = 'Telefone inválido.'
                    continue
                validadas.append({'campo': campo, 'valor': s})
            elif tipo == 'cpf':
                s = re.sub(r'\D', '', str(valor))
                if not _validar_cpf(s):
                    errors[campo.id] = 'CPF inválido.'
                    continue
                validadas.append({'campo': campo, 'valor': s})
            elif tipo == 'arquivo':
                # Arquivos são validados/atribuídos no fluxo de upload.
                # Aqui apenas registramos o campo; a criação da RespostaCampoInscricao
                # para arquivo acontece externamente com o próprio FileField.
                continue
            else:
                validadas.append({'campo': campo, 'valor': valor})
        except Exception:
            errors[campo.id] = 'Valor inválido.'

    if errors:
        raise serializers.ValidationError({'errors_por_campo': errors})

    return validadas


class InscricaoSerializer(serializers.ModelSerializer):
    """Serializer PÚBLICO/ADMIN base para Inscrição.

    IMPORTANTE: este serializer NÃO expõe respostas. Para ver respostas use
    ``InscricaoAdminSerializer`` em rotas administrativas autenticadas.
    """
    
    membro_nome = serializers.CharField(source='membro.nome', read_only=True)
    membro_email = serializers.CharField(source='membro.email', read_only=True)
    membro_telefone = serializers.CharField(source='membro.telefone', read_only=True)
    evento_titulo = serializers.CharField(source='evento.titulo', read_only=True)
    evento_data = serializers.SerializerMethodField()
    evento_pago = serializers.BooleanField(source='evento.evento_pago', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    status_pagamento_display = serializers.CharField(source='get_status_pagamento_display', read_only=True)
    categoria_nome = serializers.SerializerMethodField()
    data_inscricao_formatada = serializers.SerializerMethodField()
    data_checkin_formatada = serializers.SerializerMethodField()
    data_pagamento_formatada = serializers.SerializerMethodField()
    valor_inscricao_formatado = serializers.SerializerMethodField()
    evento_tem_formulario = serializers.SerializerMethodField()
    
    class Meta:
        model = Inscricao
        fields = [
            'id', 'membro', 'membro_nome', 'membro_email', 'membro_telefone',
            'evento', 'evento_titulo', 'evento_data', 'evento_pago',
            'evento_tem_formulario',
            'categoria', 'categoria_nome',
            'codigo', 'qrcode',
            'data_inscricao', 'data_inscricao_formatada',
            'status', 'status_display', 'observacoes',
            'motivo_cancelamento',
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

    def get_categoria_nome(self, obj):
        if obj.categoria:
            return obj.categoria.nome
        if not obj.is_acompanhante:
            return 'Adulto'
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

    def get_evento_tem_formulario(self, obj):
        try:
            return bool(obj.evento and obj.evento.formulario_inscricao_id)
        except Exception:
            return False
    
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


class InscricaoAdminSerializer(InscricaoSerializer):
    """Serializer ADMIN que inclui as respostas aninhadas.

    Deve ser usado somente em views autenticadas (admin). Rotas públicas
    continuam usando ``InscricaoSerializer`` para não vazar respostas.
    """

    respostas = RespostaCampoInscricaoAdminSerializer(many=True, read_only=True)

    class Meta(InscricaoSerializer.Meta):
        fields = InscricaoSerializer.Meta.fields + ['respostas']
        read_only_fields = InscricaoSerializer.Meta.read_only_fields + ['respostas']


class ContatoSerializer(serializers.ModelSerializer):
    """Serializer para o modelo Contato."""
    
    class Meta:
        model = Contato
        fields = [
            'id', 'nome', 'email', 'telefone', 'assunto',
            'mensagem', 'data_envio', 'lido', 'respondido'
        ]
        read_only_fields = ['id', 'data_envio', 'lido', 'respondido']


class CategoriaParticipanteSerializer(serializers.ModelSerializer):
    """Serializer para faixas de um grupo de categorias."""
    
    tipo_valor_display = serializers.CharField(source='get_tipo_valor_display', read_only=True)
    valor_formatado = serializers.SerializerMethodField()
    grupo_nome = serializers.CharField(source='grupo.nome', read_only=True)
    
    class Meta:
        model = CategoriaParticipante
        fields = [
            'id', 'nome', 'descricao', 'tipo_valor', 'tipo_valor_display',
            'valor', 'valor_formatado', 'idade_minima', 'idade_maxima',
            'ordem', 'ativo', 'grupo', 'grupo_nome', 'padrao_sistema', 'criado_em',
        ]
        read_only_fields = ['id', 'criado_em', 'padrao_sistema']
    
    def get_valor_formatado(self, obj):
        """Formata o valor de acordo com o tipo."""
        if obj.tipo_valor == 'fixo':
            return f'R$ {obj.valor:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
        return f'{obj.valor:.0f}%'


class GrupoCategoriaSerializer(serializers.ModelSerializer):
    """Serializer para grupos de categorias (conjuntos de faixas por evento)."""

    categorias = CategoriaParticipanteSerializer(many=True, read_only=True)
    categorias_count = serializers.SerializerMethodField()

    class Meta:
        model = GrupoCategoria
        fields = [
            'id', 'nome', 'descricao', 'padrao_sistema', 'ativo',
            'criado_em', 'categorias', 'categorias_count',
        ]
        read_only_fields = ['id', 'criado_em', 'padrao_sistema']

    def get_categorias_count(self, obj):
        return obj.categorias.count()


class GrupoCategoriaResumoSerializer(serializers.ModelSerializer):
    """Serializer resumido sem nested categorias."""

    categorias_count = serializers.SerializerMethodField()

    class Meta:
        model = GrupoCategoria
        fields = ['id', 'nome', 'descricao', 'padrao_sistema', 'ativo', 'categorias_count']

    def get_categorias_count(self, obj):
        return obj.categorias.count()


class ConfiguracaoSitePublicSerializer(serializers.ModelSerializer):
    """Serializer PÚBLICO para configurações do site (sem dados sensíveis)."""
    destaques_home = serializers.SerializerMethodField()
    
    class Meta:
        model = ConfiguracaoSite
        fields = [
            'id', 'nome_igreja', 'slogan', 'descricao',
            'logo', 'logo_branco', 'favicon', 'imagem_banner', 'imagem_banner_mobile', 'cor_header', 'cor_rodape', 'cor_header_pagina',
            'email', 'telefone', 'whatsapp',
            'endereco', 'cidade', 'estado', 'cep',
            'facebook', 'instagram', 'youtube', 'tiktok', 'twitter',
            'horarios', 'google_maps_embed',
            'destaques_home',
            'atualizado_em'
        ]
        read_only_fields = fields  # Todos são somente leitura no público

    def get_destaques_home(self, obj):
        itens = obj.destaques_home.filter(ativo=True).order_by('ordem', 'id')
        return DestaqueHomeItemSerializer(itens, many=True).data


class ConfiguracaoSiteSerializer(serializers.ModelSerializer):
    """Serializer ADMIN para configurações do site (com dados sensíveis)."""
    destaques_home = serializers.SerializerMethodField()
    
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
            'logo', 'logo_branco', 'favicon', 'imagem_banner', 'imagem_banner_mobile', 'cor_header', 'cor_rodape', 'cor_header_pagina',
            'email', 'telefone', 'whatsapp',
            'endereco', 'cidade', 'estado', 'cep',
            'facebook', 'instagram', 'youtube', 'tiktok', 'twitter',
            'horarios', 'google_maps_embed',
            'webhook_inscricao', 'webhook_ativo', 'webhook_reset_senha', 'webhook_eventos',
            # Mercado Pago
            'mp_ambiente', 'mp_ativo', 'mp_cartao_em_sandbox',
            'mp_pix_habilitado', 'mp_cartao_habilitado',
            'reserva_pagamento_minutos',
            'mp_loja_pix_email', 'mp_loja_pix_cpf_cnpj',
            'mp_public_key_sandbox', 'mp_access_token_sandbox',
            'mp_public_key_production', 'mp_access_token_production',
            'mp_webhook_secret',
            'mp_access_token_sandbox_masked', 'mp_access_token_production_masked',
            'mp_public_key', 'mp_is_sandbox',  # Campos computados
            # WhatsApp Evolution API
            'evolution_api_url', 'evolution_api_key', 'evolution_global_api_key',
            'evolution_api_instance', 'evolution_api_instance_loja', 'evolution_api_key_loja',
            'wa_msg_recibo_loja', 'wa_msg_reserva_loja',
            'wa_msg_reset_senha', 'wa_msg_inscricao_gratis',
            'wa_msg_inscricao_paga_pendente', 'wa_msg_inscricao_paga_confirmada',
            'wa_msg_inscricao_isenta_admin',
            'destaques_home',
            'atualizado_em'
        ]
        read_only_fields = ['id', 'atualizado_em', 'mp_public_key', 'mp_is_sandbox',
                           'mp_access_token_sandbox_masked', 'mp_access_token_production_masked']
        # Tokens retornados na leitura para o admin poder ver/copiar (endpoint já é restrito)
    
    def validate(self, attrs):
        instance = getattr(self, 'instance', None)
        mp_ativo = attrs.get('mp_ativo', instance.mp_ativo if instance else False)
        mp_pix = attrs.get('mp_pix_habilitado', instance.mp_pix_habilitado if instance else True)
        mp_cartao = attrs.get('mp_cartao_habilitado', instance.mp_cartao_habilitado if instance else True)
        if mp_ativo and not mp_pix and not mp_cartao:
            raise serializers.ValidationError(
                'Com o Mercado Pago ativo, habilite pelo menos PIX ou cartão.'
            )
        minutos = attrs.get('reserva_pagamento_minutos')
        if minutos is not None:
            if minutos < 1:
                raise serializers.ValidationError(
                    {'reserva_pagamento_minutos': 'Informe pelo menos 1 minuto.'}
                )
            if minutos > 24 * 60:
                raise serializers.ValidationError(
                    {'reserva_pagamento_minutos': 'O máximo é 1440 minutos (24 horas).'}
                )
        return attrs

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

    def get_destaques_home(self, obj):
        itens = obj.destaques_home.all().order_by('ordem', 'id')
        return DestaqueHomeItemSerializer(itens, many=True).data


class DestaqueHomeItemSerializer(serializers.ModelSerializer):
    """Serializer para os itens configuráveis do carrossel da Home."""

    class Meta:
        model = DestaqueHomeItem
        fields = [
            'id', 'titulo', 'descricao', 'imagem',
            'ordem', 'ativo', 'criado_em', 'atualizado_em'
        ]
        read_only_fields = ['id', 'criado_em', 'atualizado_em']


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
    membro_email = serializers.EmailField(source='membro.email', read_only=True, allow_blank=True)
    membro_telefone = serializers.CharField(source='membro.telefone', read_only=True)
    evento_titulo = serializers.CharField(source='evento.titulo', read_only=True)
    evento_data = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    itens = CobrancaItemSerializer(many=True, read_only=True)
    data_criacao_formatada = serializers.SerializerMethodField()
    data_pagamento_formatada = serializers.SerializerMethodField()
    
    class Meta:
        model = Cobranca
        fields = [
            'id', 'codigo', 'membro', 'membro_nome', 'membro_email', 'membro_telefone',
            'evento', 'evento_titulo', 'evento_data', 'valor', 'descricao',
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

    def get_evento_data(self, obj):
        if obj.evento and obj.evento.data_inicio:
            from django.utils import timezone
            return timezone.localtime(obj.evento.data_inicio).strftime('%d/%m/%Y %H:%M')
        return None


class CobrancaPublicaSerializer(serializers.ModelSerializer):
    """Dados mínimos da cobrança para a página pública de pagamento."""

    membro_nome = serializers.CharField(source='membro.nome', read_only=True)
    membro_email = serializers.EmailField(source='membro.email', read_only=True, allow_blank=True)
    evento_titulo = serializers.CharField(source='evento.titulo', read_only=True)
    evento_data = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    itens = CobrancaItemSerializer(many=True, read_only=True)
    reserva_minutos = serializers.SerializerMethodField()

    class Meta:
        model = Cobranca
        fields = [
            'codigo', 'valor', 'descricao', 'status', 'status_display',
            'membro_nome', 'membro_email', 'evento_titulo', 'evento_data', 'itens',
            'reserva_expira_em', 'reserva_minutos',
        ]
        read_only_fields = fields

    def get_reserva_minutos(self, obj):
        from .reservas import get_reserva_pagamento_minutos
        return get_reserva_pagamento_minutos()

    def get_evento_data(self, obj):
        if obj.evento and obj.evento.data_inicio:
            from django.utils import timezone
            return timezone.localtime(obj.evento.data_inicio).strftime('%d/%m/%Y %H:%M')
        return None
