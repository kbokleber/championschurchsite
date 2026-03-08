# Guia: Configurar PostgreSQL do Coolify e Domínio

## Passo 1: Encontrar as Informações do PostgreSQL no Coolify

1. **No Coolify, vá para o seu projeto**
2. **Procure pelo serviço PostgreSQL** (pode estar em "Databases" ou "Resources")
3. **Clique no PostgreSQL** para ver os detalhes
4. **Anote as seguintes informações:**
   - **Hostname interno** (ex: `r84kgwsswc4c0o0ck0wc44go` ou similar)
   - **Porta** (geralmente `5432`)
   - **Database Name** (ou crie um novo: `championschurch`)
   - **Username** (geralmente `postgres` ou um usuário específico)
   - **Password** (senha do banco de dados)

### Como encontrar o Hostname interno:

No Coolify, quando você clica no PostgreSQL, você verá algo como:
- **Internal Hostname:** `r84kgwsswc4c0o0ck0wc44go` (ou similar)
- **Port:** `5432`

**IMPORTANTE:** Use o **hostname interno** fornecido pelo Coolify, não um IP externo!

---

## Passo 2: Configurar Variáveis de Ambiente no Backend

No Coolify, vá para a aplicação do **Backend** → **Environment Variables** e adicione:

### Variáveis do PostgreSQL:

```
POSTGRES_HOST=r84kgwsswc4c0o0ck0wc44go
POSTGRES_PORT=5432
POSTGRES_DB=championschurch
POSTGRES_USER=postgres
POSTGRES_PASSWORD=sua-senha-aqui
```

**Substitua:**
- `r84kgwsswc4c0o0ck0wc44go` pelo hostname interno do seu PostgreSQL no Coolify
- `sua-senha-aqui` pela senha real do PostgreSQL

### Variáveis do Django:

```
DJANGO_SECRET_KEY=sua-chave-secreta-forte-aqui-minimo-50-caracteres
DJANGO_DEBUG=False
DJANGO_ENVIRONMENT=production
DJANGO_ALLOWED_HOSTS=seu-dominio.com,www.seu-dominio.com,*.sslip.io
```

**Substitua:**
- `seu-dominio.com` pelo seu domínio real (ex: `championschurch.com.br`)
- `sua-chave-secreta-forte-aqui-minimo-50-caracteres` por uma chave secreta forte

**Para gerar uma chave secreta:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

### Variáveis de CORS:

```
CORS_ALLOWED_ORIGINS=https://seu-dominio.com,https://www.seu-dominio.com,http://sgock8888s8sco48488gg0gs.154.12.227.87.sslip.io
```

**Substitua:**
- `seu-dominio.com` pelo seu domínio real
- `sgock8888s8sco48488gg0gs.154.12.227.87.sslip.io` pelo domínio temporário do Coolify (se ainda estiver usando)

---

## Passo 3: Criar o Banco de Dados (se necessário)

**Desde a versão atual, o entrypoint cria o banco automaticamente** se ele não existir. Ao duplicar o projeto no Coolify, o banco `championschurch` será criado na primeira execução.

Se precisar criar manualmente (ex.: erro antes do entrypoint rodar):

1. **No Coolify, vá para o PostgreSQL**
2. **Abra o terminal/shell do PostgreSQL**
3. **Execute:**

```sql
CREATE DATABASE championschurch;
```

Ou use o cliente psql:

```bash
psql -h r84kgwsswc4c0o0ck0wc44go -U postgres -c "CREATE DATABASE championschurch;"
```

---

## Passo 4: Verificar Conexão

Após configurar as variáveis de ambiente, faça um deploy do backend e verifique os logs:

1. **Deploy o backend**
2. **Verifique os logs** - você deve ver:
   - `✓ Configuração do site criada com sucesso!` ou `✓ Configuração do site já existe.`
   - `✓ Usuário admin existe`
   - Sem erros de conexão com PostgreSQL

Se houver erros de conexão, verifique:
- ✅ O hostname está correto?
- ✅ A porta está correta?
- ✅ O nome do banco existe?
- ✅ O usuário e senha estão corretos?
- ✅ O backend está na mesma rede do PostgreSQL (se aplicável)?

---

## Passo 5: Testar a Conexão Manualmente

Se quiser testar a conexão antes do deploy:

1. **No terminal do backend no Coolify**, execute:

```bash
python manage.py shell
```

2. **No shell do Django**, execute:

```python
from django.db import connection
cursor = connection.cursor()
cursor.execute("SELECT version();")
print(cursor.fetchone())
```

Se funcionar, você verá a versão do PostgreSQL!

---

## Resumo das Variáveis de Ambiente

**Copie e cole no Coolify (substituindo os valores):**

```
# PostgreSQL
POSTGRES_HOST=HOSTNAME_INTERNO_DO_COOLIFY
POSTGRES_PORT=5432
POSTGRES_DB=championschurch
POSTGRES_USER=postgres
POSTGRES_PASSWORD=SENHA_DO_POSTGRES

# Django
DJANGO_SECRET_KEY=CHAVE_SECRETA_FORTE_50_CARACTERES
DJANGO_DEBUG=False
DJANGO_ENVIRONMENT=production
DJANGO_ALLOWED_HOSTS=seu-dominio.com,www.seu-dominio.com,*.sslip.io

# CORS
CORS_ALLOWED_ORIGINS=https://seu-dominio.com,https://www.seu-dominio.com
```

---

## Troubleshooting

### Erro: "could not translate host name"
- ✅ Verifique se está usando o **hostname interno** do Coolify, não um IP externo
- ✅ Certifique-se de que o backend e PostgreSQL estão no mesmo projeto/rede

### Erro: "password authentication failed"
- ✅ Verifique se a senha está correta
- ✅ Verifique se o usuário está correto

### Erro: "database does not exist"
- ✅ Crie o banco de dados manualmente (Passo 3)
- ✅ Verifique se o nome do banco está correto na variável `POSTGRES_DB`

### Erro: "connection refused"
- ✅ Verifique se a porta está correta (geralmente 5432)
- ✅ Verifique se o PostgreSQL está rodando no Coolify
