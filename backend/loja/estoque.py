"""
Baixa de estoque na confirmação de pagamento (venda paga), com idempotência.
"""
from collections import defaultdict

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import Produto, Venda


def _necessidade_por_produto(venda: Venda) -> dict:
    need = defaultdict(int)
    for item in venda.itens.all():
        need[item.produto_id] += item.quantidade
    return dict(need)


def validar_estoque_disponivel(itens_data: list) -> None:
    """
    itens_data: lista de dicts com 'produto' (id) e 'quantidade' (soma se repetir produto).
    Levanta ValidationError se faltar estoque.
    """
    need = defaultdict(int)
    for line in itens_data:
        need[int(line['produto'])] += int(line['quantidade'])
    pids = list(need.keys())
    if not pids:
        return
    for p in Produto.objects.filter(pk__in=pids):
        if p.controla_estoque and p.estoque < need.get(p.id, 0):
            raise serializers.ValidationError(
                {
                    'itens': (
                        f'Estoque insuficiente para "{p.nome}". '
                        f'Disponível: {p.estoque} un.; necessário: {need[p.id]}.'
                    )
                }
            )


@transaction.atomic
def baixar_estoque_venda(venda: Venda) -> None:
    """
    Reduz `Produto.estoque` conforme itens, uma vez, quando a venda é paga.
    Idempotente: se `venda.estoque_baixado` já for True, não altera nada.
    Usa select_for update para evitar venda a mais do que o estoque.
    """
    venda = Venda.objects.select_for_update().get(pk=venda.pk)
    if venda.estoque_baixado:
        return
    if venda.status != 'pago':
        return

    need = _necessidade_por_produto(venda)
    if not need:
        venda.estoque_baixado = True
        venda.save(update_fields=['estoque_baixado'])
        return

    prod_ids = list(need.keys())
    produtos = {
        p.pk: p
        for p in Produto.objects.select_for_update().filter(pk__in=prod_ids)
    }

    for pid, q in need.items():
        p = produtos.get(pid)
        if not p:
            raise serializers.ValidationError(
                {'estoque': f'Produto {pid} não encontrado na baixa de estoque.'}
            )

    from .estoque_reserva import soma_empenho_por_venda_cobranca

    reserva_empenho = soma_empenho_por_venda_cobranca(venda)

    agora = timezone.now()
    for pid, q in need.items():
        p = produtos[pid]
        if not p.controla_estoque:
            continue
        qn = int(q)
        re = int(reserva_empenho.get(pid, 0))
        a_baixar = qn - re
        if a_baixar < 0:
            raise serializers.ValidationError(
                {
                    'estoque': (
                        f'Inconsistência: item «{p.nome}» na venda (menor que o reservado; '
                        'ajuste a venda rascunho com o atendente).'
                    )
                }
            )
        if a_baixar > 0:
            if p.estoque < a_baixar:
                raise serializers.ValidationError(
                    {
                        'estoque': (
                            f'Estoque insuficiente para «{p.nome}» no pagamento (venda a mais além do reservado). '
                            f'Disponível: {p.estoque} un.; necessário: {a_baixar}.'
                        )
                    }
                )
            p.estoque -= a_baixar
            p.data_atualizacao = agora
            p.save(update_fields=['estoque', 'data_atualizacao'])

    venda.estoque_baixado = True
    venda.save(update_fields=['estoque_baixado'])


def reverter_estoque_venda(venda: Venda) -> None:
    """
    Devolve quantidades ao estoque se a venda tiver `estoque_baixado` (paga com baixa feita).
    Chamar dentro de `transaction.atomic()` **antes** de apagar a venda (enquanto os itens existem).
    """
    v = Venda.objects.select_for_update().get(pk=venda.pk)
    if not v.estoque_baixado:
        return
    need = _necessidade_por_produto(v)
    if not need:
        return
    agora = timezone.now()
    for pid, q in need.items():
        p = Produto.objects.select_for_update().get(pk=pid)
        if p.controla_estoque:
            p.estoque += q
            p.data_atualizacao = agora
            p.save(update_fields=['estoque', 'data_atualizacao'])


def validar_estoque_ao_adicionar_itens(venda: Venda, linhas: list) -> None:
    """
    Soma itens atuais da venda (rascunho) com `linhas` e exige somente
    a parte **não** coberta pelo empenho das reservas `em_cobranca` desta venda.
    """
    from .estoque_reserva import validar_estoque_extra_para_venda_rascunho

    need = _necessidade_por_produto(venda)
    for line in linhas:
        need[line['produto']] = need.get(line['produto'], 0) + int(line['quantidade'])
    if not need:
        return
    lines_full = [
        {'produto': k, 'quantidade': v}
        for k, v in need.items()
    ]
    validar_estoque_extra_para_venda_rascunho(venda, lines_full)
