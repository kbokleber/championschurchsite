"""
Views para servir o frontend React (SPA) quando o backend serve o build em produção.
"""
import os
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.views import View
from django.views.static import serve as static_serve


def get_frontend_root():
    """Diretório onde está o build do frontend (ex: frontend_dist)."""
    root = getattr(settings, 'FRONTEND_ROOT', None)
    if root is None:
        return None
    path = Path(root)
    return path if path.is_dir() else None


class ServeSPAView(View):
    """
    Serve index.html para rotas da SPA (fallback).
    Para /assets/* e outros arquivos estáticos do build, tenta servir o arquivo;
    se não existir, retorna index.html para o cliente fazer roteamento.
    """

    def get(self, request, path=''):
        frontend_root = get_frontend_root()
        if not frontend_root:
            raise Http404('Frontend not configured')

        # path pode ser vazio (/) ou algo como 'eventos', 'admin', etc.
        file_path = frontend_root / path.strip('/') if path else frontend_root

        # Se for um arquivo que existe, servir
        if file_path.is_file():
            return FileResponse(
                open(file_path, 'rb'),
                as_attachment=False,
                filename=file_path.name,
            )

        # Diretório (ex: assets): não listar, servir index.html
        if file_path.is_dir():
            index = file_path / 'index.html'
            if index.is_file():
                return FileResponse(
                    open(index, 'rb'),
                    as_attachment=False,
                    filename='index.html',
                )

        # Fallback SPA: qualquer rota não encontrada retorna index.html
        index_html = frontend_root / 'index.html'
        if index_html.is_file():
            return FileResponse(
                open(index_html, 'rb'),
                as_attachment=False,
                filename='index.html',
                content_type='text/html',
            )
        raise Http404('index.html not found')


def serve_frontend_asset(request, path):
    """Serve um arquivo estático do build do frontend (ex: /assets/xxx.js)."""
    frontend_root = get_frontend_root()
    if not frontend_root:
        raise Http404('Frontend not configured')
    # path é o que vem depois de /assets/ (ex: index-abc123.js)
    assets_dir = frontend_root / 'assets'
    return static_serve(request, path, document_root=str(assets_dir))
