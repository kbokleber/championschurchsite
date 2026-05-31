"""Rate limits por endpoint sensível."""

from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle


class LoginRateThrottle(ScopedRateThrottle):
    scope = 'login'


class ParticipanteLoginRateThrottle(ScopedRateThrottle):
    scope = 'participante_login'


class ParticipanteBuscaRateThrottle(ScopedRateThrottle):
    scope = 'participante_busca'


class MercadoPagoPagamentoRateThrottle(ScopedRateThrottle):
    scope = 'mp_pagamento'


class GlobalAnonRateThrottle(AnonRateThrottle):
    rate = '100/minute'
