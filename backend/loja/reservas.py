"""Lógica de reservas (status ao pagar / cancelar venda)."""
from .models import ReservaLoja


def marcar_reservas_venda_paga(venda) -> int:
    """Venda paga: reservas vinculadas a esta venda (em cobrança) passam a 'pago'."""
    if venda is None or not venda.pk or venda.status != 'pago':
        return 0
    return ReservaLoja.objects.filter(
        venda_id=venda.pk, status='em_cobranca'
    ).update(status='pago')


def liberar_reservas_ao_cancelar_venda(venda) -> int:
    """Venda cancelada: reservas nessa venda deixam a fila (voltam a pendentes)."""
    if venda is None or not venda.pk or venda.status != 'cancelado':
        return 0
    return ReservaLoja.objects.filter(
        venda_id=venda.pk, status='em_cobranca',
    ).update(venda_id=None, status='pendente')
