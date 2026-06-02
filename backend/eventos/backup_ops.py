"""Geração e restauração de pacotes de backup (PostgreSQL + mídia)."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.db import connections
from django.utils import timezone

logger = logging.getLogger(__name__)


def postgres_config() -> dict[str, str]:
    return {
        'host': os.environ.get('POSTGRES_HOST', ''),
        'port': os.environ.get('POSTGRES_PORT', '5432'),
        'db': os.environ.get('POSTGRES_DB', ''),
        'user': os.environ.get('POSTGRES_USER', ''),
        'password': os.environ.get('POSTGRES_PASSWORD', ''),
    }


def database_engine_kind() -> str:
    engine = (settings.DATABASES.get('default', {}).get('ENGINE') or '').lower()
    if 'postgresql' in engine:
        return 'postgresql'
    if 'sqlite' in engine:
        return 'sqlite'
    return engine or 'desconhecido'


def validar_requisitos_backup(mode: str = 'export') -> str | None:
    engine_kind = database_engine_kind()
    if mode == 'export':
        if engine_kind != 'postgresql':
            return 'Exportação de backup suportada apenas quando o banco atual é PostgreSQL.'
        cfg = postgres_config()
        faltando = [k for k, v in cfg.items() if not v]
        if faltando:
            return f"Configuração PostgreSQL incompleta: {', '.join(sorted(faltando))}"
        if shutil.which('pg_dump') is None:
            return 'Comando pg_dump não encontrado no servidor.'
    elif mode == 'import':
        if engine_kind == 'postgresql':
            cfg = postgres_config()
            faltando = [k for k, v in cfg.items() if not v]
            if faltando:
                return f"Configuração PostgreSQL incompleta: {', '.join(sorted(faltando))}"
            if shutil.which('pg_restore') is None:
                return 'Comando pg_restore não encontrado no servidor.'
        elif engine_kind != 'sqlite':
            return f'Tipo de banco atual não suportado para importação: {engine_kind}'

    media_root = Path(settings.MEDIA_ROOT)
    if not media_root.exists():
        return f'MEDIA_ROOT não existe: {media_root}'
    if not media_root.is_dir():
        return f'MEDIA_ROOT inválido (não é diretório): {media_root}'
    if not os.access(media_root, os.R_OK):
        return f'Sem permissão de leitura em MEDIA_ROOT: {media_root}'
    return None


def run_command(args, env=None):
    result = subprocess.run(
        args,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        stderr = (result.stderr or '').strip()
        raise RuntimeError(stderr or f'Falha ao executar comando: {" ".join(args)}')
    return result


def backup_host_label(host_header: str) -> str:
    host = (host_header or '').strip().lower()
    host = host.split(':', 1)[0]
    if not host:
        return 'championschurch'
    safe = ''.join(ch if ch.isalnum() or ch in '.-' else '-' for ch in host).strip('.-')
    return safe or 'championschurch'


def safe_extract_tar(tar, target_dir: Path):
    target_dir = target_dir.resolve()
    for member in tar.getmembers():
        member_target = (target_dir / member.name).resolve()
        if not str(member_target).startswith(str(target_dir)):
            raise RuntimeError('Arquivo de backup inválido: caminho inseguro detectado.')
    tar.extractall(path=target_dir)


def restaurar_media_de_backup(media_src_path: Path, media_root: Path, *, prefixo: str | None = None) -> dict:
    media_root = Path(media_root).resolve()
    media_src_path = Path(media_src_path).resolve()
    media_root.mkdir(parents=True, exist_ok=True)

    copiados = 0
    for src in media_src_path.rglob('*'):
        if not src.is_file():
            continue
        rel = src.relative_to(media_src_path)
        rel_posix = rel.as_posix()
        if prefixo and not rel_posix.startswith(prefixo.rstrip('/') + '/'):
            continue
        dest = media_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        copiados += 1

    loja_dir = media_root / 'loja' / 'produtos'
    n_loja = sum(1 for _ in loja_dir.iterdir()) if loja_dir.is_dir() else 0
    return {
        'arquivos_copiados': copiados,
        'loja_produtos_no_disco': n_loja,
        'media_root': str(media_root),
    }


def substituir_media_de_backup(media_src_path: Path, media_root: Path) -> dict:
    """Substitui MEDIA_ROOT pelo conteúdo do backup (restore completo, não merge).

    Evita shutil.rmtree na raiz de MEDIA_ROOT — no Windows arquivos abertos pelo
    runserver impedem apagar a pasta inteira e derrubam o import com PermissionError.
    """
    media_root = Path(media_root).resolve()
    media_src_path = Path(media_src_path).resolve()
    media_root.mkdir(parents=True, exist_ok=True)

    backup_files = {
        p.relative_to(media_src_path)
        for p in media_src_path.rglob('*')
        if p.is_file()
    }

    copiados = 0
    for rel in backup_files:
        src = media_src_path / rel
        dest = media_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        copiados += 1

    removidos = 0
    for dest in media_root.rglob('*'):
        if not dest.is_file():
            continue
        if dest.relative_to(media_root) not in backup_files:
            try:
                dest.unlink()
                removidos += 1
            except OSError as exc:
                logger.warning('Não foi possível remover arquivo órfão em media: %s (%s)', dest, exc)

    for directory in sorted(
        (p for p in media_root.rglob('*') if p.is_dir()),
        key=lambda p: len(p.parts),
        reverse=True,
    ):
        try:
            directory.rmdir()
        except OSError:
            pass

    loja_dir = media_root / 'loja' / 'produtos'
    n_loja = sum(1 for _ in loja_dir.iterdir()) if loja_dir.is_dir() else 0
    return {
        'arquivos_copiados': copiados,
        'arquivos_removidos': removidos,
        'loja_produtos_no_disco': n_loja,
        'media_root': str(media_root),
    }


def restaurar_sqlite_de_fixture(db_fixture_path: Path, sqlite_backup_path: Path) -> None:
    """Restaura SQLite a partir do database.json do backup (dev local / Windows)."""
    from django.core.management.base import CommandError

    db_fixture_path = Path(db_fixture_path)
    if not db_fixture_path.is_file():
        raise ValueError('Backup não contém fixture JSON para restauração em SQLite.')

    fixture_mb = db_fixture_path.stat().st_size / (1024 * 1024)
    logger.info('Import SQLite: carregando fixture %.2f MB de %s', fixture_mb, db_fixture_path)

    call_command('migrate', '--no-input', verbosity=0)

    db_name = settings.DATABASES.get('default', {}).get('NAME')
    if not db_name:
        raise ValueError('Configuração SQLite inválida: DATABASES.default.NAME ausente.')
    sqlite_db_path = Path(str(db_name))
    connections['default'].close()
    if sqlite_db_path.exists():
        shutil.copy2(sqlite_db_path, sqlite_backup_path)

    call_command('flush', '--no-input', verbosity=0)

    try:
        call_command('loaddata', str(db_fixture_path), verbosity=0)
    except CommandError as exc:
        msg = str(exc).strip()
        hint = ''
        lower = msg.lower()
        if 'no such table' in lower:
            hint = ' Atualize o código (git pull), rode "python manage.py migrate" e tente de novo.'
        elif 'problem installing fixture' in lower or 'integrity' in lower:
            hint = (
                ' O backup pode ser de uma versão diferente do sistema. '
                'Confirme que o backend local está na mesma versão do deploy de produção.'
            )
        raise ValueError(f'Falha ao carregar dados no SQLite.{hint} Detalhe: {msg}') from exc


def regenerar_qrcodes_inscricoes_ausentes() -> dict:
    """Recria PNGs de QR Code quando o banco referencia arquivo ausente após restore."""
    from eventos.models import Inscricao

    media_root = Path(settings.MEDIA_ROOT)
    qrcodes_dir = media_root / 'qrcodes'
    qrcodes_dir.mkdir(parents=True, exist_ok=True)

    regenerados = 0
    ja_presentes = 0
    erros = 0

    for ins in Inscricao.objects.filter(status__in=['confirmada', 'pendente']).iterator():
        if ins.status_pagamento == 'pendente':
            continue
        rel = (ins.qrcode.name if ins.qrcode else '').strip()
        if rel and (media_root / rel).is_file():
            ja_presentes += 1
            continue
        if not ins.codigo:
            continue
        try:
            ins.gerar_qrcode()
            regenerados += 1
        except Exception as exc:
            erros += 1
            logger.warning('Falha ao regenerar QR da inscrição %s: %s', ins.pk, exc)

    n_disk = sum(1 for f in qrcodes_dir.iterdir() if f.is_file()) if qrcodes_dir.is_dir() else 0
    result = {
        'regenerados': regenerados,
        'ja_presentes': ja_presentes,
        'qrcodes_no_disco': n_disk,
    }
    if erros:
        result['erros'] = erros
    return result


def gerar_backup_package(host_header: str) -> tuple[bytes, str]:
    erro = validar_requisitos_backup(mode='export')
    if erro:
        raise ValueError(erro)

    cfg = postgres_config()
    media_root = Path(settings.MEDIA_ROOT)
    timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
    host_label = backup_host_label(host_header)
    backup_filename = f'{host_label}_backup_{timestamp}.tar.gz'

    with tempfile.TemporaryDirectory(prefix='champions_backup_') as tmpdir:
        tmp_path = Path(tmpdir)
        db_dump_path = tmp_path / 'database.dump'
        db_fixture_path = tmp_path / 'database.json'
        media_copy_path = tmp_path / 'media'
        manifest_path = tmp_path / 'manifest.json'
        package_path = tmp_path / backup_filename

        env = os.environ.copy()
        env['PGPASSWORD'] = cfg['password']

        run_command(
            [
                'pg_dump',
                '--host', cfg['host'],
                '--port', cfg['port'],
                '--username', cfg['user'],
                '--dbname', cfg['db'],
                '--format=custom',
                '--no-owner',
                '--no-privileges',
                '--file', str(db_dump_path),
            ],
            env=env,
        )
        with open(db_fixture_path, 'w', encoding='utf-8') as fixture_file:
            call_command(
                'dumpdata',
                '--natural-foreign',
                '--natural-primary',
                '--verbosity=0',
                stdout=fixture_file,
            )

        shutil.copytree(media_root, media_copy_path)
        manifest = {
            'version': 1,
            'created_at': timezone.now().isoformat(),
            'database_file': 'database.dump',
            'database_format': 'pg_custom',
            'database_fixture_file': 'database.json',
            'media_dir': 'media',
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

        with tarfile.open(package_path, 'w:gz') as tar:
            tar.add(db_dump_path, arcname='database.dump')
            tar.add(db_fixture_path, arcname='database.json')
            tar.add(media_copy_path, arcname='media')
            tar.add(manifest_path, arcname='manifest.json')

        return package_path.read_bytes(), backup_filename


def importar_backup_de_arquivo(backup_file: Path) -> dict:
    erro = validar_requisitos_backup(mode='import')
    if erro:
        raise ValueError(erro)

    cfg = postgres_config()
    engine_kind = database_engine_kind()
    media_root = Path(settings.MEDIA_ROOT)
    media_stats = None
    qrcode_stats = None

    with tempfile.TemporaryDirectory(prefix='champions_restore_') as tmpdir:
        tmp_path = Path(tmpdir)
        extract_dir = tmp_path / 'extracted'
        extract_dir.mkdir(parents=True, exist_ok=True)

        try:
            with tarfile.open(backup_file, 'r:gz') as tar:
                safe_extract_tar(tar, extract_dir)
        except Exception as exc:
            raise ValueError('Não foi possível ler o arquivo de backup.') from exc

        manifest_path = extract_dir / 'manifest.json'
        db_dump_path = extract_dir / 'database.dump'
        media_src_path = extract_dir / 'media'

        if not manifest_path.exists() or not media_src_path.exists():
            raise ValueError('Estrutura de backup inválida. Esperado: manifest.json e pasta media.')

        try:
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        except Exception as exc:
            raise ValueError('Manifesto do backup inválido.') from exc

        if manifest.get('media_dir') != 'media':
            raise ValueError('Manifesto incompatível com este importador.')

        media_backup_path = tmp_path / 'media_before_restore'
        sqlite_backup_path = tmp_path / 'sqlite_before_restore.sqlite3'

        try:
            if engine_kind == 'postgresql':
                if not db_dump_path.exists():
                    raise ValueError('Backup sem arquivo database.dump para restauração PostgreSQL.')
                env = os.environ.copy()
                env['PGPASSWORD'] = cfg['password']
                try:
                    run_command(
                        [
                            'pg_restore',
                            '--host', cfg['host'],
                            '--port', cfg['port'],
                            '--username', cfg['user'],
                            '--dbname', cfg['db'],
                            '--clean',
                            '--if-exists',
                            '--no-owner',
                            '--no-privileges',
                            str(db_dump_path),
                        ],
                        env=env,
                    )
                except RuntimeError as exc:
                    raise ValueError(f'Falha ao restaurar PostgreSQL: {exc}') from exc
            elif engine_kind == 'sqlite':
                fixture_file_name = manifest.get('database_fixture_file') or 'database.json'
                db_fixture_from_manifest = extract_dir / fixture_file_name
                restaurar_sqlite_de_fixture(db_fixture_from_manifest, sqlite_backup_path)

            if media_root.exists():
                shutil.copytree(media_root, media_backup_path, dirs_exist_ok=True)
            media_stats = substituir_media_de_backup(media_src_path, media_root)
            try:
                qrcode_stats = regenerar_qrcodes_inscricoes_ausentes()
            except Exception as exc:
                logger.warning('Regeneração parcial de QR Codes após import: %s', exc, exc_info=True)
                qrcode_stats = {
                    'regenerados': 0,
                    'ja_presentes': 0,
                    'qrcodes_no_disco': 0,
                    'aviso': str(exc),
                }
        except Exception:
            if engine_kind == 'sqlite' and sqlite_backup_path.exists():
                try:
                    db_name = settings.DATABASES.get('default', {}).get('NAME')
                    if db_name:
                        sqlite_db_path = Path(str(db_name))
                        connections['default'].close()
                        sqlite_db_path.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(sqlite_backup_path, sqlite_db_path)
                except Exception:
                    logger.error('Falha ao restaurar SQLite anterior após erro de import.', exc_info=True)
            if media_backup_path.exists():
                try:
                    substituir_media_de_backup(media_backup_path, media_root)
                except Exception:
                    logger.error('Falha ao restaurar mídia anterior após erro de import.', exc_info=True)
            raise

    detail = 'Backup importado com sucesso.'
    if media_stats:
        detail += (
            f" Mídia: {media_stats['arquivos_copiados']} arquivo(s) copiado(s); "
            f"{media_stats['loja_produtos_no_disco']} foto(s) em loja/produtos."
        )
    if qrcode_stats:
        detail += (
            f" QR Codes: {qrcode_stats.get('qrcodes_no_disco', 0)} no disco; "
            f"{qrcode_stats.get('regenerados', 0)} regenerado(s)."
        )
        aviso = qrcode_stats.get('aviso')
        if aviso:
            detail += f" Aviso QR: {aviso}"
    return {'detail': detail, 'media': media_stats, 'qrcodes': qrcode_stats}
