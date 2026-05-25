"""Roadmap de evolução (histórico Git) — apenas superusuários."""

from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .git_roadmap import agrupar_por_data, fetch_roadmap_commits

logger = logging.getLogger(__name__)


def _exige_superuser(request):
    if not request.user.is_authenticated:
        return Response({'detail': 'Autenticação necessária.'}, status=status.HTTP_401_UNAUTHORIZED)
    if not request.user.is_superuser:
        return Response({'detail': 'Apenas super administradores podem ver o roadmap.'}, status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_roadmap_commits(request):
    denied = _exige_superuser(request)
    if denied:
        return denied

    branch = request.query_params.get('branch', 'dev')
    try:
        page = int(request.query_params.get('page', 1))
        per_page = int(request.query_params.get('per_page', 30))
    except (TypeError, ValueError):
        return Response({'detail': 'Parâmetros page/per_page inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

    agrupar = str(request.query_params.get('agrupar', '1')).lower() in ('1', 'true', 'yes')

    try:
        payload = fetch_roadmap_commits(branch=branch, page=page, per_page=per_page)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except RuntimeError as exc:
        logger.error('Roadmap indisponível: %s', exc)
        return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as exc:
        logger.error('Erro ao carregar roadmap: %s', exc, exc_info=True)
        return Response({'detail': 'Falha ao carregar histórico de commits.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if agrupar:
        payload['grupos'] = agrupar_por_data(payload.get('commits') or [])

    return Response(payload)
