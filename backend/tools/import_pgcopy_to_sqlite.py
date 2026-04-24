"""
Importa dados de um dump PostgreSQL (blocos COPY ... FROM stdin) para o SQLite
de dev. O schema deve existir via `python manage.py migrate` antes.

Uso (PowerShell, na pasta backend, venv ativado):
  $env:POSTGRES_HOST = ""
  $env:CHURCH_DB_PATH = "C:/temp/churchdb/db.sqlite3"
  python tools/import_pgcopy_to_sqlite.py C:/temp/churchdb/championschurch-restore.sql
"""
from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
import os  # noqa: E402

# Forçar SQLite (não conectar a Postgres)
for k in list(os.environ.keys()):
    if k.startswith("POSTGRES_"):
        os.environ[k] = ""
os.environ.setdefault("CHURCH_DB_PATH", "C:/temp/churchdb/db.sqlite3")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "champions_backend.settings")
import django  # noqa: E402

django.setup()
from django.conf import settings  # noqa: E402  # noqa: I001

_BOOL_COL = re.compile(
    r"^("
    r"is_.*|is_staff|is_superuser|is_active|ativo|lido|respondido|"
    r"destaque|presente|obrigatorio|bypass|webhook_ativo|"
    r"mp_cartao_em_sandbox|evento_pago"
    r")$",
    re.IGNORECASE,
)


def _cell_value(col: str, raw: str) -> str | int | None:
    if raw == r"\N":
        return None
    if _BOOL_COL.match(col) and raw in ("t", "f"):
        return 1 if raw == "t" else 0
    if re.match(r"^-?\d+$", raw) and (
        col in ("id", "action_flag", "ordem", "idade_minima", "idade_maxima")
        or col.endswith("_id")
    ):
        return int(raw)
    return raw


COPY_RE = re.compile(
    r"^COPY public\.([a-z0-9_]+) \(([^)]+)\) FROM stdin;\s*$", re.IGNORECASE
)
# Fim de bloco COPY (texto do pg_dump): linha exatamente \. (2 caracteres)
PSQL_COPY_END = r"\."


def clear_all_data(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    keep_seq = ("sqlite_sequence",)  # esvaziamos depois; recriar automaticamente
    names = [r[0] for r in cur.fetchall() if r[0] not in keep_seq]
    cur.execute("PRAGMA foreign_keys = OFF")
    for name in names:
        try:
            cur.execute(f'DELETE FROM "{name}"')
        except sqlite3.OperationalError as e:
            print(f"skip delete {name}: {e}", file=sys.stderr)
    if "sqlite_sequence" in [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")]:
        try:
            cur.execute("DELETE FROM sqlite_sequence")
        except sqlite3.OperationalError:
            pass
    cur.execute("PRAGMA foreign_keys = ON")
    conn.commit()


def import_copy_file(conn: sqlite3.Connection, path: Path) -> int:
    data = path.read_text(encoding="utf-8", errors="replace")
    lines = data.splitlines()
    rows = 0
    i = 0
    n = len(lines)
    while i < n:
        m = COPY_RE.match(lines[i].rstrip())
        if not m:
            i += 1
            continue
        table = m.group(1)
        col_str = m.group(2)
        columns = [c.strip().strip('"') for c in col_str.split(",")]
        ncols = len(columns)
        i += 1
        while i < n and lines[i].strip() != PSQL_COPY_END:
            if lines[i].strip() and not lines[i].startswith("COPY "):
                raw = lines[i]
                parts = raw.split("\t", ncols - 1)
                if len(parts) < ncols:
                    parts = parts + [""] * (ncols - len(parts))
                elif len(parts) > ncols:
                    parts = parts[:ncols]
                values = []
                for col, part in zip(columns, parts):
                    values.append(_cell_value(col, part))
                qs = ",".join(["?"] * ncols)
                names = ",".join(f'"{c}"' for c in columns)
                sql = f'INSERT OR REPLACE INTO "{table}" ({names}) VALUES ({qs})'
                try:
                    conn.execute(sql, values)
                except Exception as e:
                    print(
                        f"ERRO inserindo em {table} (linha {i+1}): {e}", file=sys.stderr
                    )
                    print(f"  colunas={ncols} parts={len(parts)}", file=sys.stderr)
                    raise
                rows += 1
            i += 1
        if i < n and lines[i].strip() == PSQL_COPY_END:
            i += 1
    conn.commit()
    return rows


def fix_sqlite_sequence(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    for (tbl,) in cur.fetchall():
        if tbl in ("sqlite_sequence", "django_migrations"):
            continue
        try:
            row = cur.execute(
                f'SELECT MAX("id") FROM "{tbl}"'
            ).fetchone()
        except Exception:
            continue
        if not row or row[0] is None:
            continue
        try:
            cur.execute(
                "INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)",
                (tbl, int(row[0])),
            )
        except sqlite3.OperationalError:
            pass
    conn.commit()


def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: import_pgcopy_to_sqlite.py <caminho/championschurch-restore.sql>")
        sys.exit(1)
    path = Path(sys.argv[1])
    if not path.is_file():
        print("Arquivo não encontrado:", path, file=sys.stderr)
        sys.exit(1)
    name = settings.DATABASES["default"]["NAME"]
    print("SQLite:", name)
    conn = sqlite3.connect(name)
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        clear_all_data(conn)
        print("Tabelas limpas (dados; schema mantido).")
        n = import_copy_file(conn, path)
        print("Linhas importadas (aprox.):", n)
        fix_sqlite_sequence(conn)
        print("sqlite_sequence ajustada onde possível.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
