from django.apps import AppConfig


class EventosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'eventos'
    verbose_name = 'Eventos e Membros'

    def ready(self):
        # Importa handlers para registrar no registry HANDLERS da fila.
        from . import whatsapp_queue  # noqa: F401
        from . import loja_queue  # noqa: F401
