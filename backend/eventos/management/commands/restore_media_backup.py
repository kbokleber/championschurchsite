"""
Restaura apenas arquivos de mídia a partir de um backup .tar.gz (sem tocar no banco).

Uso (no container de PROD):
  python manage.py restore_media_backup /caminho/dev.championschurch.com.br_backup_20260521_220308.tar.gz

Só fotos da loja:
  python manage.py restore_media_backup /caminho/backup.tar.gz --only-loja
"""
import json
import tarfile
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from eventos.backup_ops import restaurar_media_de_backup, safe_extract_tar


class Command(BaseCommand):
    help = 'Restaura pasta media/ de um backup .tar.gz (fotos, logos, etc.) sem alterar o banco.'

    def add_arguments(self, parser):
        parser.add_argument('arquivo', help='Caminho do .tar.gz exportado pelo admin')
        parser.add_argument(
            '--only-loja',
            action='store_true',
            help='Copiar apenas media/loja/produtos/',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Lista o que seria copiado, sem gravar',
        )

    def handle(self, *args, **options):
        inp = Path(options['arquivo']).resolve()
        if not inp.is_file():
            raise CommandError(f'Arquivo não encontrado: {inp}')

        prefixo = 'loja/produtos' if options['only_loja'] else None
        media_root = Path(settings.MEDIA_ROOT)

        with tempfile.TemporaryDirectory(prefix='champions_media_restore_') as tmpdir:
            extract_dir = Path(tmpdir) / 'extracted'
            extract_dir.mkdir(parents=True, exist_ok=True)

            with tarfile.open(inp, 'r:gz') as tar:
                safe_extract_tar(tar, extract_dir)

            manifest_path = extract_dir / 'manifest.json'
            media_src = extract_dir / 'media'
            if not media_src.is_dir():
                raise CommandError('Backup sem pasta media/')

            if manifest_path.is_file():
                manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
                if manifest.get('media_dir') != 'media':
                    raise CommandError('Manifesto incompatível')

            if options['dry_run']:
                total = 0
                for src in media_src.rglob('*'):
                    if not src.is_file():
                        continue
                    rel = src.relative_to(media_src).as_posix()
                    if prefixo and not rel.startswith(prefixo.rstrip('/') + '/'):
                        continue
                    total += 1
                    self.stdout.write(f'  {rel}')
                self.stdout.write(self.style.SUCCESS(f'[dry-run] {total} arquivo(s) seriam copiados.'))
                return

            stats = restaurar_media_de_backup(media_src, media_root, prefixo=prefixo)
            self.stdout.write(self.style.SUCCESS(
                f"Concluído: {stats['arquivos_copiados']} arquivo(s) → {stats['media_root']}"
            ))
            self.stdout.write(f"Fotos em loja/produtos no disco: {stats['loja_produtos_no_disco']}")
