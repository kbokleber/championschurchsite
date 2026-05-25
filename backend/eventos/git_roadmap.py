"""Histórico de commits para o roadmap admin (Git local ou GitHub API)."""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)

COMMIT_TYPE_RE = re.compile(
    r'^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?:\s*',
    re.IGNORECASE,
)


def _repo_root() -> Path:
    return Path(getattr(settings, 'GIT_ROADMAP_REPO_ROOT', settings.BASE_DIR.parent))


def _github_repo() -> str:
    return (os.environ.get('GITHUB_REPO') or 'kbokleber/championschurchsite').strip().strip('/')


def _github_token() -> str:
    return (os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN') or '').strip()


def _classificar_commit(mensagem: str) -> str:
    m = (mensagem or '').strip()
    match = COMMIT_TYPE_RE.match(m)
    if match:
        return match.group(1).lower()
    lower = m.lower()
    if lower.startswith('fix'):
        return 'fix'
    if lower.startswith('feat'):
        return 'feat'
    return 'other'


def _formatar_commit(
    *,
    sha: str,
    sha_curto: str,
    mensagem: str,
    autor: str,
    email: str,
    data_iso: str,
    branch: str,
    url: str | None = None,
    fonte: str,
) -> dict:
    titulo = mensagem.splitlines()[0].strip() if mensagem else ''
    return {
        'sha': sha,
        'sha_curto': sha_curto,
        'mensagem': titulo,
        'corpo': '\n'.join(mensagem.splitlines()[1:]).strip() if mensagem else '',
        'tipo': _classificar_commit(titulo),
        'autor': autor,
        'email': email,
        'data': data_iso,
        'branch': branch,
        'url': url,
        'fonte': fonte,
    }


def _git_disponivel() -> bool:
    git_dir = _repo_root() / '.git'
    if not git_dir.exists():
        return False
    try:
        result = subprocess.run(
            ['git', '-C', str(_repo_root()), 'rev-parse', '--git-dir'],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def _commits_git_local(*, branch: str, page: int, per_page: int) -> dict:
    skip = max(page - 1, 0) * per_page
    args = [
        'git', '-C', str(_repo_root()), 'log',
        branch,
        f'--max-count={per_page}',
        f'--skip={skip}',
        '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%aI',
    ]
    result = subprocess.run(args, capture_output=True, text=True, timeout=30, check=False)
    if result.returncode != 0:
        stderr = (result.stderr or result.stdout or '').strip()
        raise RuntimeError(stderr or f'git log falhou para branch {branch}')

    repo = _github_repo()
    commits = []
    for line in (result.stdout or '').splitlines():
        if not line.strip():
            continue
        parts = line.split('\x1f')
        if len(parts) < 6:
            continue
        sha, sha_curto, mensagem, autor, email, data_iso = parts[:6]
        url = f'https://github.com/{repo}/commit/{sha}' if repo else None
        commits.append(
            _formatar_commit(
                sha=sha,
                sha_curto=sha_curto,
                mensagem=mensagem,
                autor=autor,
                email=email,
                data_iso=data_iso,
                branch=branch,
                url=url,
                fonte='git',
            )
        )

    total_args = ['git', '-C', str(_repo_root()), 'rev-list', '--count', branch]
    total_result = subprocess.run(total_args, capture_output=True, text=True, timeout=15, check=False)
    total = int((total_result.stdout or '0').strip() or 0) if total_result.returncode == 0 else len(commits)

    return {
        'commits': commits,
        'page': page,
        'per_page': per_page,
        'total': total,
        'has_next': skip + len(commits) < total,
        'branch': branch,
        'fonte': 'git',
        'repo': str(_repo_root()),
    }


def _commits_github(*, branch: str, page: int, per_page: int) -> dict:
    repo = _github_repo()
    if not repo:
        raise RuntimeError('GITHUB_REPO não configurado.')

    qs = urllib.parse.urlencode({'sha': branch, 'page': page, 'per_page': per_page})
    url = f'https://api.github.com/repos/{repo}/commits?{qs}'
    headers = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'ChampionsChurch-Roadmap',
    }
    token = _github_token()
    if token:
        headers['Authorization'] = f'Bearer {token}'

    req = urllib.request.Request(url, headers=headers, method='GET')
    link = ''
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            link = resp.headers.get('Link', '')
            payload = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode('utf-8', errors='replace')[:400]
        raise RuntimeError(f'GitHub API HTTP {exc.code}: {body}') from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f'GitHub API indisponível: {exc.reason}') from exc

    commits = []
    for item in payload if isinstance(payload, list) else []:
        commit = item.get('commit') or {}
        author = commit.get('author') or {}
        sha = item.get('sha') or ''
        mensagem = (commit.get('message') or '').strip()
        commits.append(
            _formatar_commit(
                sha=sha,
                sha_curto=sha[:7] if sha else '',
                mensagem=mensagem,
                autor=(author.get('name') or '').strip() or '—',
                email=(author.get('email') or '').strip(),
                data_iso=author.get('date') or '',
                branch=branch,
                url=item.get('html_url'),
                fonte='github',
            )
        )

    has_next = 'rel="next"' in link

    return {
        'commits': commits,
        'page': page,
        'per_page': per_page,
        'total': None,
        'has_next': has_next,
        'branch': branch,
        'fonte': 'github',
        'repo': f'https://github.com/{repo}',
    }


def fetch_roadmap_commits(*, branch: str = 'dev', page: int = 1, per_page: int = 30) -> dict:
    branch = (branch or 'dev').strip()
    if branch not in ('dev', 'main'):
        raise ValueError('Branch inválida. Use dev ou main.')

    page = max(int(page or 1), 1)
    per_page = max(1, min(int(per_page or 30), 100))

    prefer_github = os.environ.get('GIT_ROADMAP_SOURCE', '').lower() in ('github', 'auto', '')
    if prefer_github:
        try:
            return _commits_github(branch=branch, page=page, per_page=per_page)
        except Exception as exc:
            logger.warning('Roadmap via GitHub falhou (%s), tentando git local.', exc)
            if _git_disponivel():
                return _commits_git_local(branch=branch, page=page, per_page=per_page)
            raise

    if _git_disponivel():
        return _commits_git_local(branch=branch, page=page, per_page=per_page)
    return _commits_github(branch=branch, page=page, per_page=per_page)


def agrupar_por_data(commits: list[dict]) -> list[dict]:
    grupos: dict[str, list] = {}
    for c in commits:
        raw = c.get('data') or ''
        try:
            dia = datetime.fromisoformat(raw.replace('Z', '+00:00')).strftime('%Y-%m-%d')
        except ValueError:
            dia = raw[:10] if len(raw) >= 10 else '—'
        grupos.setdefault(dia, []).append(c)
    return [{'data': dia, 'commits': items} for dia, items in sorted(grupos.items(), reverse=True)]
