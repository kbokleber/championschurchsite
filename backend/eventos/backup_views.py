"""Views de backup/restore (banco + mídia). Google Drive fica no navegador do usuário."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .backup_ops import gerar_backup_package, importar_backup_de_arquivo, validar_requisitos_backup
from .models import Grupo

logger = logging.getLogger(__name__)


def _admin_exige_backup_import(request):
    user = request.user
    if not user.is_authenticated:
        return Response({'detail': 'Autenticação necessária.'}, status=status.HTTP_401_UNAUTHORIZED)
    if user.is_superuser:
        return None
    if Grupo.usuario_tem_permissao_menu(user, 'backup_import'):
        return None
    return Response(
        {'detail': 'Sem permissão para backup e restore.'},
        status=status.HTTP_403_FORBIDDEN,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_backup_exportar(request):
    denied = _admin_exige_backup_import(request)
    if denied:
        return denied

    erro_validacao = validar_requisitos_backup(mode='export')
    if erro_validacao:
        return Response({'detail': erro_validacao}, status=status.HTTP_400_BAD_REQUEST)

    try:
        package_bytes, backup_filename = gerar_backup_package(request.get_host())
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        logger.error('Erro ao exportar backup completo: %s', exc, exc_info=True)
        return Response({'detail': f'Falha ao gerar backup: {exc}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    response = HttpResponse(package_bytes, content_type='application/gzip')
    response['Content-Disposition'] = f'attachment; filename="{backup_filename}"'
    return response


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_backup_importar(request):
    denied = _admin_exige_backup_import(request)
    if denied:
        return denied

    erro_validacao = validar_requisitos_backup(mode='import')
    if erro_validacao:
        return Response({'detail': erro_validacao}, status=status.HTTP_400_BAD_REQUEST)

    arquivo = request.FILES.get('arquivo')
    if not arquivo:
        return Response({'detail': 'Arquivo de backup é obrigatório.'}, status=status.HTTP_400_BAD_REQUEST)
    nome = (arquivo.name or '').lower()
    if not nome.endswith(('.tar.gz', '.tgz')):
        return Response({'detail': 'Formato inválido. Envie um arquivo .tar.gz.'}, status=status.HTTP_400_BAD_REQUEST)

    with tempfile.TemporaryDirectory(prefix='champions_restore_in_') as tmpdir:
        backup_file = Path(tmpdir) / 'backup.tar.gz'
        with open(backup_file, 'wb') as fp:
            for chunk in arquivo.chunks():
                fp.write(chunk)
        try:
            result = importar_backup_de_arquivo(backup_file)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            logger.error('Erro ao importar backup (pg_restore/comando): %s', exc, exc_info=True)
            return Response({'detail': f'Falha ao restaurar banco: {exc}'}, status=status.HTTP_400_BAD_REQUEST)
        except OSError as exc:
            logger.error('Erro ao importar backup (arquivo/mídia): %s', exc, exc_info=True)
            return Response(
                {'detail': f'Falha ao restaurar arquivos de mídia: {exc}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            logger.error('Erro ao importar backup completo: %s', exc, exc_info=True)
            return Response({'detail': f'Falha ao importar backup: {exc}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response(result)
