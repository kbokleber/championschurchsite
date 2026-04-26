"""Instância do SDK Mercado Pago reutilizável (ConfiguracaoSite)."""
import mercadopago
from .models import ConfiguracaoSite


def get_mercadopago_sdk(ambiente=None):
    """
    Retorna uma instância do SDK do Mercado Pago.
    ambiente: None = usa config.mp_ambiente; 'production' ou 'sandbox' = força o ambiente.
    Quando mp_cartao_em_sandbox está ativo, PIX usa production e cartão usa sandbox.
    """
    config = ConfiguracaoSite.get_config()
    if not config.mp_ativo:
        return None
    env = ambiente if ambiente in ('sandbox', 'production') else config.mp_ambiente
    access_token = config.get_mp_access_token_for(env)
    if not access_token:
        return None
    return mercadopago.SDK(access_token)
