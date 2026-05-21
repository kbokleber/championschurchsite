"""
Exporta / importa o catálogo da loja (Produto + fotos) entre ambientes.

Uso típico DEV → PROD:
  1. No backend DEV (Django apontando para o Postgres de dev):
       python manage.py sync_loja_catalogo export -o loja_catalogo_dev.tar.gz

  2. Copie loja_catalogo_dev.tar.gz para o servidor/container de PROD.

  3. No backend PROD (faça backup antes):
       python manage.py sync_loja_catalogo import loja_catalogo_dev.tar.gz

Opções:
  --categoria loja|cantina|all   (padrão: all)
  --dry-run                      (import: só simula)
  --somente-novos                (import: não atualiza produtos já existentes)
"""
from __future__ import annotations

import json
import shutil
import tarfile
import tempfile
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from loja.models import Produto

MANIFEST_NAME = 'manifest.json'
PRODUTOS_NAME = 'produtos.json'
MEDIA_PREFIX = 'media/'


def _produto_key(nome: str, categoria: str, segmento) -> tuple:
    seg = segmento or ''
    return (nome.strip().lower(), categoria, seg)


def _decimal_to_str(value) -> str:
    if value is None:
        return '0.00'
    return str(Decimal(value).quantize(Decimal('0.01')))


def _serialize_produto(p: Produto) -> dict:
    imagem = ''
    if p.imagem:
        imagem = p.imagem.name  # ex.: loja/produtos/foto.jpg
    return {
        'nome': p.nome,
        'descricao': p.descricao or '',
        'categoria': p.categoria,
        'segmento_cantina': p.segmento_cantina,
        'preco': _decimal_to_str(p.preco),
        'imagem': imagem,
        'ativo': p.ativo,
        'controla_estoque': p.controla_estoque,
        'estoque': int(p.estoque or 0),
    }


class Command(BaseCommand):
    help = 'Exporta ou importa produtos da loja/cantina (JSON + imagens) entre DEV e PROD.'

    def add_arguments(self, parser):
        parser.add_argument(
            'acao',
            choices=['export', 'import'],
            help='export: gera .tar.gz | import: lê .tar.gz no banco atual',
        )
        parser.add_argument(
            'arquivo',
            nargs='?',
            default='loja_catalogo_export.tar.gz',
            help='Caminho do .tar.gz (export: -o; import: arquivo de entrada)',
        )
        parser.add_argument(
            '-o', '--output',
            dest='output',
            help='Arquivo de saída no export (substitui posicional)',
        )
        parser.add_argument(
            '--categoria',
            choices=['loja', 'cantina', 'all'],
            default='all',
            help='Filtrar produtos por categoria (padrão: all)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Import: apenas mostra o que faria, sem gravar',
        )
        parser.add_argument(
            '--somente-novos',
            action='store_true',
            help='Import: não atualiza produtos que já existem (mesmo nome/categoria/segmento)',
        )

    def handle(self, *args, **options):
        acao = options['acao']
        if acao == 'export':
            out = options.get('output') or options['arquivo']
            self._export(out, options['categoria'])
        else:
            self._import(options['arquivo'], options)

    def _queryset(self, categoria: str):
        qs = Produto.objects.all().order_by('categoria', 'nome')
        if categoria != 'all':
            qs = qs.filter(categoria=categoria)
        return qs

    def _export(self, output_path: str, categoria: str):
        out = Path(output_path).resolve()
        media_root = Path(settings.MEDIA_ROOT)
        produtos = list(self._queryset(categoria))
        if not produtos:
            raise CommandError('Nenhum produto encontrado para exportar.')

        payload = [_serialize_produto(p) for p in produtos]
        manifest = {
            'tipo': 'loja_catalogo',
            'versao': 1,
            'categoria_filtro': categoria,
            'total': len(payload),
        }

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / PRODUTOS_NAME).write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding='utf-8',
            )
            (tmp_path / MANIFEST_NAME).write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2),
                encoding='utf-8',
            )

            media_dir = tmp_path / 'media' / 'loja' / 'produtos'
            media_dir.mkdir(parents=True, exist_ok=True)
            copiadas = 0
            for p in produtos:
                if not p.imagem:
                    continue
                src = media_root / p.imagem.name
                if not src.is_file():
                    self.stdout.write(self.style.WARNING(f'Imagem ausente: {src}'))
                    continue
                dest = media_dir / src.name
                shutil.copy2(src, dest)
                copiadas += 1

            out.parent.mkdir(parents=True, exist_ok=True)
            with tarfile.open(out, 'w:gz') as tar:
                tar.add(tmp_path / MANIFEST_NAME, arcname=MANIFEST_NAME)
                tar.add(tmp_path / PRODUTOS_NAME, arcname=PRODUTOS_NAME)
                media_loja = tmp_path / 'media' / 'loja'
                if media_loja.exists():
                    tar.add(media_loja, arcname='media/loja')

        self.stdout.write(self.style.SUCCESS(
            f'Exportado {len(payload)} produto(s), {copiadas} imagem(ns) → {out}'
        ))

    def _import(self, input_path: str, options):
        inp = Path(input_path).resolve()
        if not inp.is_file():
            raise CommandError(f'Arquivo não encontrado: {inp}')

        media_root = Path(settings.MEDIA_ROOT)
        dry_run = options['dry_run']
        somente_novos = options['somente_novos']

        with tempfile.TemporaryDirectory() as tmp:
            with tarfile.open(inp, 'r:gz') as tar:
                tar.extractall(path=tmp)

            tmp_path = Path(tmp)
            manifest_path = tmp_path / MANIFEST_NAME
            produtos_path = tmp_path / PRODUTOS_NAME
            if not produtos_path.is_file():
                raise CommandError(f'Pacote inválido: falta {PRODUTOS_NAME}')

            if manifest_path.is_file():
                manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
                if manifest.get('tipo') != 'loja_catalogo':
                    raise CommandError('Pacote inválido: manifest.tipo incorreto')

            payload = json.loads(produtos_path.read_text(encoding='utf-8'))
            if not isinstance(payload, list):
                raise CommandError('produtos.json deve ser uma lista')

            existentes = {
                _produto_key(p.nome, p.categoria, p.segmento_cantina): p
                for p in Produto.objects.all()
            }

            criados = atualizados = ignorados = erros = 0

            @transaction.atomic
            def _run():
                nonlocal criados, atualizados, ignorados, erros
                for row in payload:
                    try:
                        nome = (row.get('nome') or '').strip()
                        if not nome:
                            erros += 1
                            continue
                        categoria = row.get('categoria') or 'loja'
                        segmento = row.get('segmento_cantina')
                        if categoria == 'loja':
                            segmento = None

                        key = _produto_key(nome, categoria, segmento)
                        inst = existentes.get(key)

                        if inst and somente_novos:
                            ignorados += 1
                            self.stdout.write(f'  = ignorado (já existe): {nome}')
                            continue

                        fields = {
                            'nome': nome,
                            'descricao': row.get('descricao') or '',
                            'categoria': categoria,
                            'segmento_cantina': segmento,
                            'preco': Decimal(row.get('preco') or '0'),
                            'ativo': bool(row.get('ativo', True)),
                            'controla_estoque': bool(row.get('controla_estoque', False)),
                            'estoque': int(row.get('estoque') or 0),
                        }

                        imagem_rel = (row.get('imagem') or '').strip()
                        imagem_src = None
                        if imagem_rel:
                            # pacote: media/loja/produtos/arquivo.jpg
                            rel = imagem_rel
                            if rel.startswith('loja/'):
                                candidato = tmp_path / 'media' / rel
                            else:
                                candidato = tmp_path / MEDIA_PREFIX / rel
                            if candidato.is_file():
                                imagem_src = candidato

                        if dry_run:
                            acao = 'criar' if not inst else 'atualizar'
                            self.stdout.write(f'  [dry-run] {acao}: {nome} ({categoria})')
                            if inst:
                                atualizados += 1
                            else:
                                criados += 1
                            continue

                        if inst:
                            for k, v in fields.items():
                                setattr(inst, k, v)
                            if imagem_src:
                                if inst.imagem:
                                    inst.imagem.delete(save=False)
                                with imagem_src.open('rb') as fh:
                                    inst.imagem.save(imagem_src.name, File(fh), save=False)
                            inst.save()
                            atualizados += 1
                            self.stdout.write(self.style.WARNING(f'  ~ atualizado: {nome}'))
                        else:
                            inst = Produto(**fields)
                            if imagem_src:
                                with imagem_src.open('rb') as fh:
                                    inst.imagem.save(imagem_src.name, File(fh), save=False)
                            inst.save()
                            existentes[key] = inst
                            criados += 1
                            self.stdout.write(self.style.SUCCESS(f'  + criado: {nome}'))

                    except Exception as exc:
                        erros += 1
                        self.stdout.write(self.style.ERROR(f'  ! erro em {row.get("nome")}: {exc}'))

            if dry_run:
                _run()
            else:
                _run()

        prefix = '[DRY-RUN] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'{prefix}Importação concluída: {criados} criado(s), {atualizados} atualizado(s), '
            f'{ignorados} ignorado(s), {erros} erro(s).'
        ))
        if not dry_run:
            self.stdout.write(
                'MEDIA_ROOT: ' + str(media_root)
            )
