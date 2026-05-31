from django.db.models.signals import pre_delete
from django.dispatch import receiver

from .models import Venda
from .reservas import liberar_reservas_venda_excluida


@receiver(pre_delete, sender=Venda)
def liberar_reservas_antes_excluir_venda(sender, instance, **kwargs):
    liberar_reservas_venda_excluida(instance)
