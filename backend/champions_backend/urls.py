"""
URL configuration for Champions Church project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static

from .spa_views import ServeSPAView, serve_frontend_asset, get_frontend_root

# Admin do Django em /django-admin/ para não conflitar com a SPA em /admin
urlpatterns = [
    path('django-admin/', admin.site.urls),
    path('api/', include('eventos.urls')),
]

# Servir arquivos de mídia (dev e prod quando backend é o único app)
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
if settings.DEBUG and settings.STATICFILES_DIRS:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])

# Quando o backend serve o frontend (produção single-app): /assets/* e SPA fallback (por último)
frontend_root = get_frontend_root()
if frontend_root:
    print(f"[URLS] Frontend detectado, adicionando rotas SPA. Root: {frontend_root}")
    urlpatterns += [
        path('assets/<path:path>', serve_frontend_asset),
        re_path(r'^.*$', ServeSPAView.as_view()),
    ]
else:
    print("[URLS] Frontend NÃO detectado, rotas SPA não serão adicionadas")
