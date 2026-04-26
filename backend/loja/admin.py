from django.contrib import admin
from .models import Produto, Venda, ItemVenda, CobrancaLoja, ReservaLoja


class ItemVendaInline(admin.TabularInline):
    model = ItemVenda
    extra = 0


@admin.register(Produto)
class ProdutoAdmin(admin.ModelAdmin):
    list_display = (
        'nome', 'categoria', 'segmento_cantina', 'preco', 'controla_estoque', 'estoque', 'tem_foto', 'ativo',
        'data_criacao',
    )
    list_filter = ('categoria', 'segmento_cantina', 'ativo', 'controla_estoque')
    readonly_fields = ('data_criacao', 'data_atualizacao')

    @admin.display(boolean=True, description='Foto')
    def tem_foto(self, obj):
        return bool(obj.imagem)


@admin.register(Venda)
class VendaAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'data_criacao', 'status', 'meio_pagamento', 'total', 'estoque_baixado', 'criado_por',
    )
    list_filter = ('status', 'meio_pagamento', 'estoque_baixado')
    inlines = (ItemVendaInline,)


@admin.register(CobrancaLoja)
class CobrancaLojaAdmin(admin.ModelAdmin):
    list_display = ('codigo', 'venda', 'valor', 'status', 'data_criacao')
    list_filter = ('status',)


@admin.register(ReservaLoja)
class ReservaLojaAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'data', 'produto', 'nome', 'quantidade', 'status', 'venda', 'criado_por', 'data_criacao',
    )
    list_filter = ('status', 'data', 'produto__categoria')
    search_fields = ('nome',)
    date_hierarchy = 'data'
