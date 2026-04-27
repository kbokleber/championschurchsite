from rest_framework import serializers

from django.db import transaction

from .estoque import validar_estoque_disponivel
from .estoque_reserva import empenhar_ao_salvar_reserva
from .models import Produto, Venda, ItemVenda, CobrancaLoja, ReservaLoja, LojaAuditoria


class ProdutoSerializer(serializers.ModelSerializer):
    """Suporta JSON (sem arquivo) e multipart (upload de foto)."""
    remover_imagem = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Produto
        fields = (
            'id',
            'nome',
            'descricao',
            'categoria',
            'segmento_cantina',
            'preco',
            'imagem',
            'controla_estoque',
            'estoque',
            'ativo',
            'data_criacao',
            'data_atualizacao',
            'remover_imagem',
        )
        read_only_fields = ('data_criacao', 'data_atualizacao')

    def validate(self, attrs):
        inst = self.instance
        categoria = attrs.get('categoria', getattr(inst, 'categoria', None) if inst else None)
        if categoria == 'loja':
            attrs['segmento_cantina'] = None
        elif categoria == 'cantina':
            seg = attrs.get('segmento_cantina', getattr(inst, 'segmento_cantina', None) if inst else None)
            if not seg:
                attrs['segmento_cantina'] = 'comida'
        return attrs

    def create(self, validated_data):
        validated_data.pop('remover_imagem', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        remover = bool(validated_data.pop('remover_imagem', False))
        if remover:
            validated_data.pop('imagem', None)
            if instance.imagem:
                instance.imagem.delete(save=False)
            validated_data['imagem'] = None
        elif validated_data.get('imagem') and instance.imagem:
            old = instance.imagem
            old.delete(save=False)
        return super().update(instance, validated_data)


class ItemVendaSerializer(serializers.ModelSerializer):
    produto_nome = serializers.CharField(source='produto.nome', read_only=True)
    produto_categoria = serializers.CharField(source='produto.categoria', read_only=True)
    produto_imagem = serializers.ImageField(source='produto.imagem', read_only=True, allow_null=True)

    class Meta:
        model = ItemVenda
        fields = (
            'id',
            'produto',
            'produto_nome',
            'produto_categoria',
            'produto_imagem',
            'quantidade',
            'preco_unitario',
            'subtotal',
        )
        read_only_fields = ('subtotal', 'produto_nome', 'produto_categoria', 'produto_imagem')


class ItemVendaInputSerializer(serializers.Serializer):
    produto = serializers.IntegerField()
    quantidade = serializers.IntegerField(min_value=1)


class VendaListSerializer(serializers.ModelSerializer):
    criado_por_nome = serializers.SerializerMethodField()
    itens = ItemVendaSerializer(many=True, read_only=True)
    tem_cobranca_mp = serializers.SerializerMethodField()
    cobranca_loja_id = serializers.SerializerMethodField()

    class Meta:
        model = Venda
        fields = (
            'id',
            'data_criacao',
            'status',
            'meio_pagamento',
            'criado_por',
            'criado_por_nome',
            'observacao',
            'comprador_nome',
            'total',
            'itens',
            'tem_cobranca_mp',
            'cobranca_loja_id',
        )

    def get_criado_por_nome(self, obj):
        u = obj.criado_por
        if not u:
            return None
        try:
            return u.get_full_name() or u.get_username()
        except Exception:
            return getattr(u, 'username', None)

    def get_tem_cobranca_mp(self, obj):
        return hasattr(obj, 'cobranca_mp') and obj.cobranca_mp is not None

    def get_cobranca_loja_id(self, obj):
        if hasattr(obj, 'cobranca_mp') and obj.cobranca_mp is not None:
            return obj.cobranca_mp.id
        return None


class VendaDetailSerializer(VendaListSerializer):
    class Meta(VendaListSerializer.Meta):
        pass


class VendaCreateSerializer(serializers.Serializer):
    itens = ItemVendaInputSerializer(many=True)
    meio_pagamento = serializers.ChoiceField(
        choices=[m[0] for m in Venda.MEIO_PAGAMENTO_CHOICES],
        default='dinheiro',
    )
    observacao = serializers.CharField(required=False, allow_blank=True, default='')
    comprador_nome = serializers.CharField(required=False, allow_blank=True, default='')
    status = serializers.ChoiceField(
        choices=[c[0] for c in Venda.STATUS_CHOICES],
        default='rascunho',
        required=False,
    )

    def validate_itens(self, value):
        if not value:
            raise serializers.ValidationError('Informe ao menos um item.')
        return value

    def create(self, validated_data):
        user = self.context['request'].user
        itens = validated_data.pop('itens')
        validar_estoque_disponivel(itens)
        status = validated_data.pop('status', 'rascunho')
        meio = validated_data.get('meio_pagamento', 'dinheiro')
        venda = Venda.objects.create(
            criado_por=user,
            meio_pagamento=meio,
            status=status,
            observacao=validated_data.get('observacao', ''),
            comprador_nome=validated_data.get('comprador_nome', ''),
        )
        for line in itens:
            try:
                prod = Produto.objects.get(pk=line['produto'], ativo=True)
            except Produto.DoesNotExist:
                raise serializers.ValidationError(
                    {'itens': f"Produto {line['produto']} inexistente ou inativo."}
                )
            ItemVenda.objects.create(
                venda=venda,
                produto=prod,
                quantidade=line['quantidade'],
                preco_unitario=prod.preco,
            )
        venda.recalcular_total()
        venda.save(update_fields=['total'])
        return venda

    def update(self, instance, validated_data):
        raise NotImplementedError


class ReservaLojaListSerializer(serializers.ModelSerializer):
    produto_nome = serializers.CharField(source='produto.nome', read_only=True)
    categoria = serializers.CharField(source='produto.categoria', read_only=True)

    class Meta:
        model = ReservaLoja
        fields = (
            'id',
            'produto',
            'produto_nome',
            'categoria',
            'data',
            'nome',
            'quantidade',
            'status',
            'venda',
            'observacao',
            'data_criacao',
        )
        read_only_fields = (
            'status',
            'venda',
        )


class ReservaLojaCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReservaLoja
        fields = ('id', 'produto', 'data', 'nome', 'quantidade', 'observacao')
        read_only_fields = ('id',)

    def validate_nome(self, v):
        v = (v or '').strip()
        if not v or len(v) < 2:
            raise serializers.ValidationError('Informe o nome (identificação).')
        return v

    def validate(self, attrs):
        prod = attrs.get('produto')
        if not prod:
            raise serializers.ValidationError({'produto': 'Obrigatório.'})
        if not prod.ativo:
            raise serializers.ValidationError({'produto': 'Produto inativo.'})
        if not prod.elegivel_reserva_cantina():
            raise serializers.ValidationError(
                {
                    'produto': 'Reserva só para itens da cantina ativos, com estoque (se o item controla estoque) '
                    'ou sem limite de estoque (venda aberta).',
                }
            )
        q = int(attrs.get('quantidade') or 0)
        if q < 1:
            raise serializers.ValidationError({'quantidade': 'Mínimo 1.'})
        if prod.controla_estoque and prod.estoque < q:
            raise serializers.ValidationError(
                {
                    'quantidade': f'Disponível: {prod.estoque} un.; a reserva pede {q} un. de «{prod.nome}».',
                }
            )
        return attrs

    def create(self, validated_data):
        validated_data['criado_por'] = self.context['request'].user
        with transaction.atomic():
            r = super().create(validated_data)
            r = empenhar_ao_salvar_reserva(r)
        return r


class ReservaLojaLoteItemSerializer(serializers.Serializer):
    produto = serializers.IntegerField(min_value=1)
    quantidade = serializers.IntegerField(min_value=1)


class ReservaLojaLoteSerializer(serializers.Serializer):
    """Uma pessoa, uma data, vários produtos (como carrinho). Cria N registros de ReservaLoja."""

    data = serializers.DateField()
    nome = serializers.CharField(max_length=200)
    observacao = serializers.CharField(allow_blank=True, required=False, default='')
    itens = ReservaLojaLoteItemSerializer(many=True)

    def validate_nome(self, v):
        v = (v or '').strip()
        if not v or len(v) < 2:
            raise serializers.ValidationError('Informe o nome (identificação).')
        return v

    def validate_itens(self, itens):
        if not itens:
            raise serializers.ValidationError('Inclua ao menos um item na lista.')
        return itens

    def validate(self, attrs):
        itens = attrs.get('itens') or []
        merged = {}
        for it in itens:
            pid = it['produto']
            merged[pid] = merged.get(pid, 0) + int(it['quantidade'])
        attrs['itens'] = [
            {'produto': pid, 'quantidade': q} for pid, q in sorted(merged.items(), key=lambda x: x[0])
        ]
        return attrs


class CobrancaLojaSerializer(serializers.ModelSerializer):
    venda = serializers.IntegerField(source='venda_id', read_only=True)

    class Meta:
        model = CobrancaLoja
        fields = (
            'id',
            'codigo',
            'venda',
            'valor',
            'status',
            'data_criacao',
            'data_pagamento',
            'metodo_pagamento',
            'referencia_externa',
        )
        read_only_fields = (
            'id',
            'codigo',
            'venda',
            'valor',
            'status',
            'data_criacao',
            'data_pagamento',
            'metodo_pagamento',
            'referencia_externa',
        )


class LojaAuditoriaSerializer(serializers.ModelSerializer):
    usuario_nome = serializers.SerializerMethodField()
    venda_total = serializers.DecimalField(source='venda.total', max_digits=10, decimal_places=2, read_only=True)
    produto_nome = serializers.CharField(source='produto.nome', read_only=True)

    class Meta:
        model = LojaAuditoria
        fields = (
            'id',
            'data_evento',
            'tipo_evento',
            'usuario',
            'usuario_nome',
            'venda',
            'venda_total',
            'produto',
            'produto_nome',
            'detalhes',
        )

    def get_usuario_nome(self, obj):
        u = obj.usuario
        if not u:
            return 'Sistema'
        try:
            return u.get_full_name() or u.get_username()
        except Exception:
            return getattr(u, 'username', None) or f'Usuário #{u.id}'
