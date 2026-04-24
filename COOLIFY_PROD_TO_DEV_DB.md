# Copiar banco de produção para dev (Coolify)

Guia para fazer backup do PostgreSQL de produção e restaurar no ambiente dev.

---

## Passo 1: Fazer backup do banco de produção

### Opção A: Pelo Coolify (PostgreSQL de prod)

1. No Coolify, abra o **PostgreSQL do projeto de produção**
2. Clique em **Exec** (ou Terminal)
3. Execute o dump:

```bash
# Dump em formato SQL (texto, fácil de inspecionar)
pg_dump -U postgres championschurch > /tmp/backup_prod.sql

# Ou dump em formato custom (menor, mais rápido para restore)
pg_dump -U postgres -Fc championschurch > /tmp/backup_prod.dump
```

4. **Baixar o arquivo:** No Coolify, use a opção de download de arquivos do container, ou copie o conteúdo. Se não houver, use `cat` e copie a saída (só para dumps pequenos).

### Opção B: De fora do Coolify (se tiver acesso à rede)

Se o PostgreSQL de prod tiver porta exposta ou você tiver túnel:

```bash
# Substitua HOST_PROD pela URL/IP do PostgreSQL de prod
pg_dump -h HOST_PROD -U postgres -p 5432 championschurch > backup_prod.sql
```

### Opção C: Coolify – Backup nativo

Se o Coolify tiver recurso de **Backup** no PostgreSQL:
1. Vá no PostgreSQL de prod → Backup
2. Crie um backup e baixe o arquivo gerado

---

## Passo 2: Levar o arquivo para o ambiente dev

- Se fez o dump **dentro** do container de prod: baixe o arquivo ou use `scp`/SFTP
- Se fez **localmente**: o arquivo já está na sua máquina

---

## Passo 3: Restaurar no PostgreSQL de dev

### Se o dump está no seu PC

1. No Coolify, abra o **PostgreSQL do projeto dev**
2. **Exec** → faça upload do arquivo ou use outra forma de colocar o dump no container
3. No terminal do container do PostgreSQL de dev:

```bash
# Primeiro, limpar o banco (ou dropar e recriar)
psql -U postgres -c "DROP DATABASE IF EXISTS championschurch;"
psql -U postgres -c "CREATE DATABASE championschurch;"

# Restaurar dump SQL
psql -U postgres -d championschurch < /caminho/para/backup_prod.sql

# OU, se for formato custom (.dump):
pg_restore -U postgres -d championschurch -c /caminho/para/backup_prod.dump
```

### Se o dump está em outro container/servidor

Use `pg_dump` direto de prod para dev (pipe):

```bash
# No container do PostgreSQL de DEV, conectando no PostgreSQL de PROD
# (só funciona se dev conseguir acessar prod na rede)
pg_dump -h HOST_POSTGRES_PROD -U postgres championschurch | psql -U postgres -d championschurch
```

**No Coolify:** normalmente prod e dev estão em redes diferentes. O mais comum é:
1. Fazer dump em prod
2. Baixar o arquivo
3. Fazer upload no PostgreSQL de dev (ou em um volume compartilhado)
4. Restaurar no container de dev

---

## Passo 4: Resetar senha do admin

Após o restore, use as credenciais de prod ou resete o admin:

```bash
# No container da APLICAÇÃO dev (não do PostgreSQL)
python manage.py reset_admin admin
```

Login: `admin` / `admin123`

---

## Passo 5: Reiniciar a aplicação dev

No Coolify, reinicie o container da aplicação dev para limpar conexões antigas com o banco.

---

## Resumo rápido

| Etapa | Onde | Comando |
|-------|------|---------|
| 1. Backup prod | Container PostgreSQL prod | `pg_dump -U postgres championschurch > backup.sql` |
| 2. Transferir | Download/Upload | Baixar de prod, subir para dev |
| 3. Restore dev | Container PostgreSQL dev | `psql -U postgres -d championschurch < backup.sql` |
| 4. Reset admin | Container aplicação dev | `python manage.py reset_admin admin` |
| 5. Reiniciar | Coolify UI | Restart do serviço da aplicação |

---

## Dica: script de uma linha (prod → dev na mesma rede)

Se prod e dev estiverem na mesma rede Docker e você tiver os hostnames:

```bash
pg_dump -h POSTGRES_PROD_HOST -U postgres championschurch | \
  psql -h POSTGRES_DEV_HOST -U postgres -d championschurch
```

Substitua `POSTGRES_PROD_HOST` e `POSTGRES_DEV_HOST` pelos hostnames internos do Coolify.
