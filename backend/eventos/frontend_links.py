"""URLs públicas do frontend (inscrição, etc.) — dev Vite vs produção."""

from urllib.parse import urlsplit, urlunsplit

from django.conf import settings


def resolve_frontend_base_url(request):
    """
    Base do site público (React), não da API Django.
    Ordem: FRONTEND_BASE_URL → FRONTEND_PUBLIC_URL → Origin → Referer.
    """
    base = (getattr(settings, 'FRONTEND_BASE_URL', '') or '').strip().rstrip('/')
    if not base:
        base = (getattr(settings, 'FRONTEND_PUBLIC_URL', '') or '').strip().rstrip('/')
    if not base and request:
        origin = (request.META.get('HTTP_ORIGIN') or '').strip().rstrip('/')
        if origin.startswith('http'):
            base = origin
    if not base and request:
        referer = (request.META.get('HTTP_REFERER') or '').strip()
        if referer:
            try:
                parts = urlsplit(referer)
                if parts.scheme and parts.netloc:
                    base = urlunsplit((parts.scheme, parts.netloc, '', '', '')).rstrip('/')
            except Exception:
                pass
    return base or ''


def build_inscricao_evento_url(request, link_acesso):
    """URL completa para /inscricao/{uuid} no frontend."""
    if not link_acesso:
        return None
    path = f'/inscricao/{link_acesso}'
    base = resolve_frontend_base_url(request)
    if base:
        return f'{base}{path}'
    if request:
        return request.build_absolute_uri(path)
    return path
