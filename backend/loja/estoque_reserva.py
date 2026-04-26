"""Estoque: empenho na reserva (abaixa o saldo) e evita baixa em duplicidade no pagamento."""
from collections import defaultdict
from typing import List

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import CobrancaLoja, ItemVenda, Produto, ReservaLoja, Venda


@transaction.atomic
def empenhar_ao_salvar_reserva(reserva: ReservaLoja) -> ReservaLoja:
    """Com estoque controlado, reduz `Produto.estoque` (uma vez) e marca o empenho."""
    r = ReservaLoja.objects.select_for_update().get(pk=reserva.pk)
    p = Produto.objects.select_for_update().get(pk=r.produto_id)
    if not p.controla_estoque:
        return r
    q = int(r.quantidade)
    if p.estoque < q:
        raise serializers.ValidationError(
            {
                'quantidade': (
                    f'Estoque insuficiente para «{p.nome}». Disponível: {p.estoque} un.;'
                    f' necessário: {q}.'
                )
            }
        )
    p.estoque -= q
    agora = timezone.now()
    p.data_atualizacao = agora
    p.save(update_fields=['estoque', 'data_atualizacao'])
    r.em_estoque_empenhado = True
    r.save(update_fields=['em_estoque_empenhado'])
    return r


@transaction.atomic
def devolver_empenho_reserva_se_aplicavel(reserva: ReservaLoja) -> None:
    """Recoloca no saldo se a reserva ainda tiver empenho ativo (a cancelar)."""
    r = ReservaLoja.objects.select_for_update().get(pk=reserva.pk)
    if r.status in ('pago', 'cancelada') or not r.em_estoque_empenhado:
        return
    p = Produto.objects.select_for_update().get(pk=r.produto_id)
    if p.controla_estoque:
        q = int(r.quantidade)
        p.estoque += q
        p.data_atualizacao = timezone.now()
        p.save(update_fields=['estoque', 'data_atualizacao'])
    r.em_estoque_empenhado = False
    r.save(update_fields=['em_estoque_empenhado'])


def soma_empenho_por_venda_cobranca(v: Venda) -> dict[int, int]:
    out: dict[int, int] = defaultdict(int)
    for r in v.reservas_vinculadas.filter(status='em_cobranca').only('produto_id', 'quantidade'):
        out[int(r.produto_id)] += int(r.quantidade)
    return dict(out)


@transaction.atomic
def excluir_reserva_cobranca_sincroniza_venda(reserva: ReservaLoja) -> None:
    if reserva.status not in ('em_cobranca',) or not reserva.venda_id:
        raise serializers.ValidationError('Apenas reservas "na fila" (venda rascunho) podem ser excluídas aqui.')
    v_id = int(reserva.venda_id)
    v = Venda.objects.select_for_update().get(pk=v_id)
    if v.status not in ('rascunho', 'pendente_pagamento'):
        raise serializers.ValidationError('A venda não está aberta; use o fluxo do caixa se necessário.')
    r = ReservaLoja.objects.select_for_update().get(pk=reserva.pk)
    if r.status != 'em_cobranca' or int(r.venda_id or 0) != v_id:
        raise serializers.ValidationError('Estado desatualizado. Atualize a página e tente de novo.')
    devolver_empenho_reserva_se_aplicavel(r)
    r = ReservaLoja.objects.get(pk=reserva.pk)
    r.venda = None
    r.status = 'cancelada'
    r.save(update_fields=['venda', 'status'])
    rest = list(
        ReservaLoja.objects.filter(venda_id=v_id, status='em_cobranca').select_for_update()
    )
    need: dict[int, int] = defaultdict(int)
    for o in rest:
        need[int(o.produto_id)] += int(o.quantidade)
    v = Venda.objects.select_for_update().get(pk=v_id)
    v.itens.all().delete()
    if not need:
        v.status = 'cancelado'
        v.save(update_fields=['status'])
        v.recalcular_total()
        v.save(update_fields=['total'])
        CobrancaLoja.objects.filter(venda_id=v_id, status='pendente').update(status='cancelado')
        return
    for pid, q in need.items():
        prod = Produto.objects.get(pk=pid, ativo=True)
        ItemVenda.objects.create(
            venda=v,
            produto=prod,
            quantidade=int(q),
            preco_unitario=prod.preco,
        )
    v = Venda.objects.get(pk=v_id)
    v.recalcular_total()
    v.save(update_fields=['total'])


def _need_from_itens_data(itens: List[dict]) -> dict[int, int]:
    out: dict[int, int] = defaultdict(int)
    for line in itens:
        pid = int(line['produto'])
        out[pid] += int(line['quantidade'])
    return dict(out)


def validar_estoque_extra_para_venda_rascunho(v: Venda, itens: List[dict]) -> None:
    need = _need_from_itens_data(itens)
    emp = soma_empenho_por_venda_cobranca(v)
    for pid, q_emp in emp.items():
        n = int(need.get(pid, 0))
        if n < int(q_emp):
            p = Produto.objects.get(pk=pid)
            raise serializers.ValidationError(
                {
                    'itens': (
                        f'Quantidade de «{p.nome}» no rascunho (menor que o já reservado) não permitida. '
                        f'Reservado nesta venda: {q_emp}; ajuste pedida: {n}. Cancele uma reserva de linha, '
                        f'ou ajuste no PDV para não ficar abaixo do reservado.'
                    )
                }
            )
    for pid, n in need.items():
        p = Produto.objects.get(pk=pid)
        if not p.controla_estoque:
            continue
        e = int(emp.get(int(pid), 0))
        extra = max(0, int(n) - e)
        if p.estoque < extra:
            raise serializers.ValidationError(
                {
                    'itens': (
                        f'Estoque insuficiente para «{p.nome}» (acrescer além do já reservado). '
                        f'Disponível: {p.estoque} un.; a mais: {extra}.'
                    )
                }
            )
