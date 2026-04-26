from django.apps import AppConfig


class LojaConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'loja'
    verbose_name = 'Loja / Cantina'

    def ready(self):
        # Permite que ImageField trate arquivos HEIC/HEIF (fotos comuns do iPhone)
        try:
            import pillow_heif

            pillow_heif.register_heif_opener()
        except ImportError:
            pass
