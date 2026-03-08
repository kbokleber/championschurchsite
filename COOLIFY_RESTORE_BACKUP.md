# Restaurar backup de produção no ambiente dev (Coolify)

Quando você restaura um backup do banco de produção no ambiente dev, siga estes passos:

## 1. Restaurar o backup no PostgreSQL

No Coolify, acesse o PostgreSQL do projeto dev e restaure o dump:

```bash
# Via psql (conecte no container do PostgreSQL)
psql -U postgres -d championschurch < backup_prod.sql

# Ou via pg_restore se for formato custom
pg_restore -U postgres -d championschurch backup_prod.dump
```

## 2. Resetar senha do admin

Após o restore, os usuários de produção substituem os do dev. Para acessar o admin:

**Opção A – Pelo terminal do Coolify (Exec no container da aplicação):**

```bash
python manage.py reset_admin admin
```

Isso define a senha do usuário `admin` como `admin123`.

**Opção B – Resetar outro usuário ou senha customizada:**

```bash
python manage.py reset_admin kleber --password MinhaSenha123
```

## 3. Reiniciar a aplicação

Depois do restore, reinicie o container da aplicação no Coolify para limpar conexões antigas com o banco.

## 4. Fazer login

- **URL:** `https://seu-dominio-dev.sslip.io/admin/login`
- **Usuário:** `admin` (ou o que você resetou)
- **Senha:** `admin123` (ou a que você definiu)

## Erros comuns

### "server closed the connection unexpectedly"

O PostgreSQL pode ter reiniciado durante o restore. Soluções:

1. Reiniciar a aplicação no Coolify
2. Aguardar alguns segundos e tentar de novo
3. O código já inclui retry automático e `CONN_HEALTH_CHECKS` para reduzir esse problema

### Login 401 (credenciais inválidas)

Execute `python manage.py reset_admin` no container da aplicação.

### POST /api/auth/refresh/ 500

Limpe os tokens no navegador (localStorage) e faça login de novo.
