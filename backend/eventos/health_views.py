"""
Healthcheck endpoints para liveness/readiness em produção.
"""

import time
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def health_live(request):
    """
    Liveness probe: confirma que o processo Django está vivo.
    """
    return JsonResponse({"status": "ok", "check": "live"})


@require_GET
def health_ready(request):
    """
    Readiness probe: confirma que app e banco respondem.
    """
    started = time.perf_counter()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        return JsonResponse(
            {
                "status": "ok",
                "check": "ready",
                "db": "ok",
                "duration_ms": duration_ms,
            }
        )
    except Exception as exc:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        return JsonResponse(
            {
                "status": "error",
                "check": "ready",
                "db": "error",
                "duration_ms": duration_ms,
                "error": exc.__class__.__name__,
            },
            status=503,
        )
