# Copiar catálogo da loja (DEV → PROD)

Guia para levar **produtos** (loja + cantina), preços, estoque e **fotos** do ambiente de desenvolvimento para produção, **sem** substituir o restante do banco (eventos, membros, etc.).

Ferramenta: comando Django `sync_loja_catalogo`.

---

## O que é copiado

| Incluído | Não incluído |
|----------|----------------|
| Nome, descrição, preço, categoria, segmento cantina | Vendas, itens de venda |
| Estoque, controle de estoque, ativo/inativo | Reservas, cobranças MP |
| Fotos (`media/loja/produtos/`) | Auditoria da loja |

Produtos já existentes em PROD com o **mesmo nome + categoria + segmento** são **atualizados**. Novos são criados.

---

## Passo 1 — Exportar no DEV

No **container/backend do projeto DEV** no Coolify (ou na sua máquina com `backend/.env` apontando para o Postgres de dev):

```bash
cd /app   # ou pasta do backend no container
python manage.py sync_loja_catalogo export -o /tmp/loja_catalogo_dev.tar.gz
```

Só produtos da **loja** (sem cantina):

```bash
python manage.py sync_loja_catalogo export -o /tmp/loja_catalogo_dev.tar.gz --categoria loja
```

Baixe o arquivo `loja_catalogo_dev.tar.gz` (Coolify: terminal + download, ou `scp`).

---

## Passo 2 — Backup de PROD (obrigatório)

Antes de importar:

1. Admin → **Backup / Importar** → exportar backup de PROD, **ou**
2. `pg_dump` do PostgreSQL de produção (ver `COOLIFY_RESTORE_BACKUP.md`).

---

## Passo 3 — Importar no PROD

Copie `loja_catalogo_dev.tar.gz` para o container de **produção** e execute:

```bash
# Simular primeiro (recomendado)
python manage.py sync_loja_catalogo import /tmp/loja_catalogo_dev.tar.gz --dry-run

# Aplicar de verdade
python manage.py sync_loja_catalogo import /tmp/loja_catalogo_dev.tar.gz
```

Só criar produtos que **ainda não existem** em PROD (não atualiza os existentes):

```bash
python manage.py sync_loja_catalogo import /tmp/loja_catalogo_dev.tar.gz --somente-novos
```

---

## Passo 4 — Conferir

1. Admin → Loja → Produtos (filtro loja / cantina).
2. Abrir alguns itens e verificar foto e preço.
3. PDV / reservas: testar um produto novo.

---

## Desenvolvimento local (Windows)

Se o Postgres de dev for acessível da sua máquina:

1. Copie as credenciais de dev para `backend/.env` (`POSTGRES_HOST`, etc.).
2. No PowerShell:

```powershell
cd C:\Projetos\ChampionsChurch\backend
.\venv\Scripts\python.exe manage.py sync_loja_catalogo export -o C:\temp\loja_catalogo_dev.tar.gz
```

3. No servidor de prod, use o mesmo comando com `import`.

O hostname interno do Coolify (`sc8kgkocw04gc80ockko4ks4`, etc.) **só funciona dentro da rede do Coolify** — por isso o export costuma ser feito **dentro do container DEV**.

---

## Solução de problemas

| Problema | O que fazer |
|----------|-------------|
| `Nenhum produto encontrado` | Confirme que está no banco certo (`POSTGRES_*` / ambiente DEV). |
| Fotos não aparecem | Verifique se o `.tar.gz` contém `media/loja/produtos/` e se `MEDIA_ROOT` em prod está persistido (volume). |
| Duplicou produto | Nome/categoria/segmento diferentes do existente; ajuste no admin ou unifique manualmente. |
| Quer substituir tudo | Apague produtos antigos no admin de PROD e importe de novo (ou use backup completo — ver `AdminBackupImport`). |
