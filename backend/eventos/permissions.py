"""Permissões reutilizáveis da API."""

from rest_framework.permissions import BasePermission

from .models import Grupo


class HasMenuPermission(BasePermission):
    """Exige autenticação e permissão de menu via grupos do admin."""

    message = 'Sem permissão para acessar este recurso.'

    def __init__(self, codigo_menu):
        self.codigo_menu = codigo_menu

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return Grupo.usuario_tem_permissao_menu(user, self.codigo_menu)


def usuario_tem_menu_ou_superuser(user, codigo_menu):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return Grupo.usuario_tem_permissao_menu(user, codigo_menu)
