import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Sum


class Produto(models.Model):
    CATEGORIA_CHOICES = [
        ('cantina', 'Cantina'),
        ('loja', 'Loja'),
    ]
    SEGMENTO_CANTINA_CHOICES = [
        ('comida', 'Comidas'),
        ('bebida', 'Bebidas'),
    ]

    nome = models.CharField(max_length=200, verbose_name='Nome')
    descricao = models.TextField(blank=True, verbose_name='Descrição')
    categoria = models.CharField(
        max_length=20,
        choices=CATEGORIA_CHOICES,
        db_index=True,
        verbose_name='Categoria',
    )
    segmento_cantina = models.CharField(
        max_length=20,
        choices=SEGMENTO_CANTINA_CHOICES,
        blank=True,
        null=True,
        db_index=True,
        verbose_name='Comidas ou bebidas',
        help_text='Só na cantina: separa o cardápio em comidas e bebidas. Em produtos de loja fica vazio.',
    )
    preco = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='Preço')
    imagem = models.ImageField(
        upload_to='loja/produtos/',
        blank=True,
        null=True,
        verbose_name='Foto',
        help_text='Ex.: JPG ou PNG; melhora a leitura no balcão e no PDV.',
    )
    ativo = models.BooleanField(default=True, db_index=True, verbose_name='Ativo')
    controla_estoque = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name='Controlar estoque',
        help_text='Se ativo, a quantidade é validada e baixada ao concluir a venda paga.',
    )
    estoque = models.PositiveIntegerField(
        default=0,
        verbose_name='Quantidade em estoque',
        help_text='Unidades (considerado só se “Controlar estoque” estiver ativo).',
    )
    data_criacao = models.DateTimeField(auto_now_add=True, verbose_name='Criado em')
    data_atualizacao = models.DateTimeField(auto_now=True, verbose_name='Atualizado em')

    class Meta:
        ordering = ['nome']
        verbose_name = 'Produto'
        verbose_name_plural = 'Produtos'
        indexes = [
            models.Index(fields=['categoria', 'ativo']),
            models.Index(fields=['categoria', 'segmento_cantina', 'ativo']),
        ]

    def save(self, *args, **kwargs):
        if self.categoria == 'loja':
            self.segmento_cantina = None
        elif self.categoria == 'cantina' and not self.segmento_cantina:
            self.segmento_cantina = 'comida'
        super().save(*args, **kwargs)

    def elegivel_reserva(self) -> bool:
        """Reserva: cantina ou loja ativa; com estoque controlado precisa de saldo > 0."""
        if self.categoria not in ('cantina', 'loja') or not self.ativo:
            return False
        if self.controla_estoque:
            return self.estoque > 0
        return True

    def elegivel_reserva_cantina(self) -> bool:
        """Compatibilidade: mesma regra de elegivel_reserva (cantina e loja)."""
        return self.elegivel_reserva()

    def limite_unidades_reserva_por_dia(self):
        """Soma máx. de unidades reserváveis no dia, ou None (sem teto) se não controla estoque."""
        if not self.elegivel_reserva_cantina() or not self.controla_estoque:
            return None
        return int(self.estoque)

    def __str__(self):
        return self.nome


class Venda(models.Model):
    STATUS_CHOICES = [
        ('rascunho', 'Rascunho'),
        ('pendente_pagamento', 'Pendente pagamento'),
        ('pago', 'Pago'),
        ('cancelado', 'Cancelado'),
    ]
    MEIO_PAGAMENTO_CHOICES = [
        ('dinheiro', 'Dinheiro'),
        ('pix_mp', 'PIX (Mercado Pago)'),
        ('cartao_mp', 'Cartão (Mercado Pago)'),
    ]

    data_criacao = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='Criado em')
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default='rascunho',
        db_index=True,
        verbose_name='Status',
    )
    meio_pagamento = models.CharField(
        max_length=20,
        choices=MEIO_PAGAMENTO_CHOICES,
        default='dinheiro',
        verbose_name='Meio de pagamento',
    )
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='vendas_loja',
        verbose_name='Criado por',
    )
    observacao = models.TextField(blank=True, verbose_name='Observação')
    comprador_nome = models.CharField(max_length=200, blank=True, verbose_name='Comprador (balcão)')
    total = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        verbose_name='Total',
    )
    estoque_baixado = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name='Estoque baixado',
        help_text='Interno: evita baixar estoque duas vezes se o pagamento for confirmado por mais de um canal.',
    )

    class Meta:
        ordering = ['-data_criacao']
        verbose_name = 'Venda'
        verbose_name_plural = 'Vendas'
        indexes = [
            models.Index(fields=['-data_criacao', 'status']),
        ]

    def __str__(self):
        return f'Venda #{self.pk} — {self.get_status_display()} — R$ {self.total}'

    def recalcular_total(self):
        agg = self.itens.aggregate(s=Sum('subtotal'))['s']
        self.total = agg if agg is not None else Decimal('0.00')
        return self.total


class ItemVenda(models.Model):
    venda = models.ForeignKey(
        Venda,
        on_delete=models.CASCADE,
        related_name='itens',
        verbose_name='Venda',
    )
    produto = models.ForeignKey(
        Produto,
        on_delete=models.PROTECT,
        related_name='itens_venda',
        verbose_name='Produto',
    )
    quantidade = models.PositiveIntegerField(verbose_name='Quantidade')
    preco_unitario = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='Preço unitário')
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='Subtotal')

    class Meta:
        verbose_name = 'Item de venda'
        verbose_name_plural = 'Itens de venda'

    def save(self, *args, **kwargs):
        self.subtotal = (self.preco_unitario * self.quantidade).quantize(Decimal('0.01'))
        super().save(*args, **kwargs)
        if self.venda_id:
            self.venda.recalcular_total()
            self.venda.save(update_fields=['total'])

    def delete(self, *args, **kwargs):
        v = self.venda
        super().delete(*args, **kwargs)
        v.recalcular_total()
        v.save(update_fields=['total'])


class CobrancaLoja(models.Model):
    STATUS_CHOICES = [
        ('pendente', 'Pendente'),
        ('pago', 'Pago'),
        ('cancelado', 'Cancelado'),
    ]

    codigo = models.CharField(
        max_length=36,
        unique=True,
        editable=False,
        verbose_name='Código',
    )
    venda = models.OneToOneField(
        Venda,
        on_delete=models.CASCADE,
        related_name='cobranca_mp',
        verbose_name='Venda',
    )
    valor = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='Valor')
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pendente',
        db_index=True,
        verbose_name='Status',
    )
    data_criacao = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='Criado em')
    data_pagamento = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Data do pagamento',
    )
    metodo_pagamento = models.CharField(
        max_length=80,
        blank=True,
        verbose_name='Método de pagamento',
    )
    referencia_externa = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Referência externa (MP)',
    )

    class Meta:
        verbose_name = 'Cobrança (loja)'
        verbose_name_plural = 'Cobranças (loja)'
        ordering = ['-data_criacao']
        indexes = [
            models.Index(fields=['-data_criacao', 'status']),
        ]

    def __str__(self):
        return f'CobrancaLoja {self.codigo} — {self.get_status_display()}'

    def save(self, *args, **kwargs):
        if not self.codigo:
            self.codigo = str(uuid.uuid4())
        super().save(*args, **kwargs)


class ReservaLoja(models.Model):
    """
    Reserva de produto (ex.: coxinhas) por dia de culto, identificada por nome;
    a cobrança cria/usa um rascunho de venda (PDV).
    """

    STATUS_CHOICES = [
        ('pendente', 'Pendente (só reserva)'),
        ('em_cobranca', 'Na fila (venda rascunho)'),
        ('pago', 'Pago'),
        ('cancelada', 'Cancelada'),
    ]

    produto = models.ForeignKey(
        Produto,
        on_delete=models.CASCADE,
        related_name='reservas',
        verbose_name='Produto',
    )
    data = models.DateField(
        db_index=True,
        verbose_name='Dia (culto)',
        help_text='Só a data; o limite da cota incide nesse dia.',
    )
    nome = models.CharField(
        max_length=200,
        verbose_name='Nome (identificação)',
    )
    whatsapp = models.CharField(
        max_length=20,
        blank=True,
        default='',
        verbose_name='WhatsApp',
        help_text='Telefone opcional para lembrete (somente dígitos, com DDI quando informado).',
    )
    lote_reserva = models.UUIDField(
        db_index=True,
        verbose_name='Lote da reserva',
        help_text='Itens confirmados juntos na mesma operação compartilham o mesmo lote.',
    )
    quantidade = models.PositiveIntegerField(default=1, verbose_name='Quantidade')
    em_estoque_empenhado = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name='Empenho de estoque aplicado',
        help_text='Se true, a quantidade já foi abatida do saldo de Produto.estoque ao reservar.',
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pendente',
        db_index=True,
        verbose_name='Status',
    )
    venda = models.ForeignKey(
        Venda,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reservas_vinculadas',
        verbose_name='Venda (rascunho ou paga)',
    )
    observacao = models.TextField(blank=True, verbose_name='Observação')
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='reservas_cantina',
        verbose_name='Registrado por',
    )
    data_criacao = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='Criado em')

    class Meta:
        ordering = ['-data', '-data_criacao', 'id']
        verbose_name = 'Reserva (loja/cantina)'
        verbose_name_plural = 'Reservas (loja/cantina)'
        indexes = [
            models.Index(fields=['produto', 'data', 'status']),
        ]

    def __str__(self):
        return f'Reserva {self.nome} — {self.data} — {self.get_status_display()}'


class LojaAuditoria(models.Model):
    TIPO_EVENTO_CHOICES = [
        ('produto_criado', 'Produto criado'),
        ('produto_atualizado', 'Produto atualizado'),
        ('produto_preco_alterado', 'Preço de produto alterado'),
        ('venda_criada', 'Venda criada'),
        ('venda_itens_alterados', 'Itens da venda alterados'),
        ('venda_pagamento_dinheiro', 'Venda paga em dinheiro'),
        ('venda_pagamento_mp', 'Venda paga no Mercado Pago'),
        ('venda_cancelada', 'Venda cancelada'),
    ]

    data_evento = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='Data do evento')
    tipo_evento = models.CharField(
        max_length=40,
        choices=TIPO_EVENTO_CHOICES,
        db_index=True,
        verbose_name='Tipo do evento',
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='logs_loja_auditoria',
        verbose_name='Usuário',
    )
    venda = models.ForeignKey(
        Venda,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='logs_auditoria',
        verbose_name='Venda',
    )
    produto = models.ForeignKey(
        Produto,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='logs_auditoria',
        verbose_name='Produto',
    )
    detalhes = models.JSONField(default=dict, blank=True, verbose_name='Detalhes')

    class Meta:
        ordering = ['-data_evento', '-id']
        verbose_name = 'Log de auditoria da loja'
        verbose_name_plural = 'Logs de auditoria da loja'
        indexes = [
            models.Index(fields=['-data_evento', 'tipo_evento']),
            models.Index(fields=['venda', '-data_evento']),
            models.Index(fields=['produto', '-data_evento']),
        ]

    def __str__(self):
        return f'[{self.data_evento}] {self.get_tipo_evento_display()}'
