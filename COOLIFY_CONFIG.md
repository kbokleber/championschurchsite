# Configuração Coolify - Champions Church

Este projeto possui **duas aplicações separadas** (Backend Django e Frontend React). Você pode configurar de duas formas no Coolify:

## Opção 1: Duas Aplicações Separadas (Recomendado)

### Aplicação 1: Backend (Django)

**Configurações Gerais:**
- **Base Directory:** `/backend`
- **Publish Directory:** `/backend` (ou deixe vazio)
- **Port:** `8000`

**Build Pack:** Nixpacks (detecta Python automaticamente)

**Comandos de Build:**
- **Install Command:** (deixe vazio - Nixpacks detecta automaticamente)
- **Build Command:** (deixe vazio - Nixpacks detecta automaticamente)
- **Start Command:** 
  ```
  gunicorn --bind 0.0.0.0:8000 --workers 4 --threads 2 --timeout 60 --access-logfile - --error-logfile - champions_backend.wsgi:application
  ```

**Variáveis de Ambiente Necessárias:**
```
DJANGO_SECRET_KEY=sua-chave-secreta-aqui
DJANGO_DEBUG=False
DJANGO_ENVIRONMENT=production
DJANGO_ALLOWED_HOSTS=seu-dominio.com,www.seu-dominio.com
POSTGRES_HOST=seu-postgres-host
POSTGRES_PORT=5432
POSTGRES_DB=championschurch
POSTGRES_USER=seu-usuario
POSTGRES_PASSWORD=sua-senha
CORS_ALLOWED_ORIGINS=https://seu-dominio.com,https://www.seu-dominio.com
```

**Após o Deploy:**
Execute as migrações do banco de dados:
```bash
python manage.py migrate
python manage.py collectstatic --noinput
```

---

### Aplicação 2: Frontend (React)

**⚠️ IMPORTANTE:** Configure o **Base Directory** como `frontend` no Coolify!

**Configurações Gerais:**
- **Base Directory:** `frontend` ⬅️ **ESSENCIAL - configure isso!**
- **Publish Directory:** `dist` (diretório onde o Vite gera os arquivos estáticos)
- **Port:** `80`

**Build Pack:** Nixpacks

**Comandos de Build:**
- **Install Command:** 
  ```
  npm ci
  ```
- **Build Command:** 
  ```
  npm run build
  ```
- **Start Command:** 
  ```
  npx vite preview --host 0.0.0.0 --port 80 --allowedHosts all
  ```
  
  **⚠️ IMPORTANTE:** Adicione a flag `--allowedHosts all` no comando de start para permitir todos os hosts!

**Nota:** Um arquivo `nixpacks.toml` foi criado na pasta `frontend/` para ajudar o Nixpacks a detectar corretamente a aplicação.

**Variáveis de Ambiente:**
```
NODE_ENV=production
# Opcional se Nginx faz proxy /api na mesma origem (recomendado):
# VITE_API_URL=https://api.seu-dominio.com
VITE_GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
```

**Google Drive (backup admin):** use o mesmo `VITE_GOOGLE_CLIENT_ID` nos builds de **dev.championschurch.com.br** e **championschurch.com.br**. Rebuild obrigatório após alterar. No Google Cloud, adicione cada domínio HTTPS (e `http://localhost:5174`) em Origens JavaScript autorizadas e habilite a Google Drive API.

---

## Opção 2: Usando Dockerfile (Alternativa)

Se preferir usar Dockerfiles ao invés de Nixpacks:

### Backend

**Build Pack:** Dockerfile
**Dockerfile Path:** `/backend/Dockerfile`
**Docker Context:** `/backend`

O Dockerfile já está configurado e inclui todos os comandos necessários.

### Frontend

**Build Pack:** Dockerfile
**Dockerfile Path:** `/frontend/Dockerfile`
**Docker Context:** `/frontend`

O Dockerfile já está configurado e inclui todos os comandos necessários.

---

## Opção 3: Monorepo com Build Separado

Se o Coolify suportar múltiplos serviços em um único repositório:

**Base Directory:** `/` (raiz do projeto)

**Backend Service:**
- **Working Directory:** `backend`
- **Build Command:** (vazio - usa Dockerfile)
- **Start Command:** (definido no Dockerfile)

**Frontend Service:**
- **Working Directory:** `frontend`
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npx vite preview --host 0.0.0.0 --port 80`

---

## Recomendações

1. **Use a Opção 1** (duas aplicações separadas) se o Coolify permitir múltiplas aplicações do mesmo repositório
2. **Use a Opção 2** (Dockerfile) se quiser mais controle sobre o processo de build
3. Configure o **Nginx reverso** no Coolify para rotear:
   - `/api/*` → Backend (porta 8000)
   - `/*` → Frontend (porta 80)

## Notas Importantes

- O backend precisa de acesso ao **PostgreSQL** - configure a conexão via variáveis de ambiente
- O frontend precisa saber a URL da API - configure via `VITE_API_URL`
- Execute as **migrações** do Django após o primeiro deploy do backend
- O backend usa **Gunicorn** como servidor WSGI em produção
- O frontend gera arquivos estáticos que podem ser servidos por Nginx ou Vite Preview
