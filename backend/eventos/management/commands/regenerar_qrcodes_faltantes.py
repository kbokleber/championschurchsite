"""Recria imagens de QR Code ausentes no disco (útil após restore de backup)."""

from django.core.management.base import BaseCommand

from eventos.backup_ops import regenerar_qrcodes_inscricoes_ausentes


class Command(BaseCommand):
    help = 'Regenera PNGs de QR Code para inscrições pagas cujo arquivo não existe em MEDIA_ROOT.'

    def handle(self, *args, **options):
        stats = regenerar_qrcodes_inscricoes_ausentes()
        self.stdout.write(
            self.style.SUCCESS(
                f"QR Codes: {stats['ja_presentes']} ok; "
                f"{stats['regenerados']} regenerado(s); "
                f"{stats['qrcodes_no_disco']} arquivo(s) em media/qrcodes/."
            )
        )
