# Checklist de deploy – Coolify (Champions Church)

Siga na ordem. Marque cada item ao concluir.

---

## Antes de começar

- [ ] Repositório atualizado no GitHub (último código)
- [ ] Coolify acessível e você tem as URLs/domínios do backend e do frontend (ex.: `*.154.12.227.87.sslip.io`)

---

## 1. PostgreSQL

- [ ] Serviço PostgreSQL criado no Coolify (ou dados de um Postgres externo)
- [ ] Anotado: **Host**, **Porta**, **Database**, **User**, **Password**
- [ ] Banco `championschurch` (ou o nome que for usar) criado, se necessário

---

## 2. Backend (Django)

### 2.1 Aplicação no Coolify

- [ ] Nova aplicação → fonte: repositório do projeto
- [ ] **Build Pack:** Dockerfile
- [ ] **Dockerfile path:** `backend/Dockerfile`
- [ ] **Build context / Base directory:** `backend` (pasta onde está o Dockerfile)
- [ ] **Port:** 8000 (ou o que o Coolify indicar; às vezes ele mapeia para 80)
- [ ] Deploy inicial para gerar a **URL pública do backend** (ex.: `http://xxxx.154.12.227.87.sslip.io`)

### 2.2 Variáveis de ambiente (Backend)

- [ ] `POSTGRES_HOST` = host do PostgreSQL
- [ ] `POSTGRES_PORT` = 5432 (ou a porta correta)
- [ ] `POSTGRES_DB` = championschurch (ou o nome do banco)
- [ ] `POSTGRES_USER` = usuário do banco
- [ ] `POSTGRES_PASSWORD` = senha do banco
- [ ] `DJANGO_SECRET_KEY` = string longa e aleatória
- [ ] `DJANGO_DEBUG` = False
- [ ] `DJANGO_ENVIRONMENT` = production
- [ ] **Não definir** `DJANGO_ALLOWED_HOSTS` (para aceitar qualquer host) **OU** definir:
  - `DJANGO_ALLOWED_HOSTS` = `localhost,127.0.0.1,.154.12.227.87.sslip.io`
- [ ] `DJANGO_BEHIND_PROXY` = `true` (evita redirect para HTTPS e ERR_CERT_AUTHORITY_INVALID quando o backend é acessado só pelo Nginx do frontend)
- [ ] `CORS_ALLOWED_ORIGINS` = URL do frontend (ex.: `http://sgock8888s8sco48488gg0gs.154.12.227.87.sslip.io`)

### 2.3 Deploy e checagem do backend

- [ ] Deploy / Redeploy do backend
- [ ] Logs mostram: "Conexão com banco de dados OK"
- [ ] Logs mostram: "Migrações executadas com sucesso"
- [ ] Logs mostram: "Iniciando servidor Gunicorn"
- [ ] Logs mostram algo como: `ALLOWED_HOSTS final: ['*']` (ou lista com `.sslip.io`)
- [ ] Acesso à URL do backend (ex.: `http://backend-sslip.io/admin/`) não retorna 400 por host

---

## 3. Frontend (React + Nginx)

### 3.1 Aplicação no Coolify

- [ ] Nova aplicação → mesmo repositório
- [ ] **Build Pack:** Dockerfile
- [ ] **Dockerfile path:** `frontend/Dockerfile`
- [ ] **Build context / Base directory:** `frontend`
- [ ] **Port:** 80

### 3.2 Variáveis de ambiente (Frontend)

- [ ] `BACKEND_URL` = URL pública do backend **sem porta**
  - Exemplo: `http://s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io`
  - **Não** usar `http://...:8000`

### 3.3 Deploy e checagem do frontend

- [ ] Deploy / Redeploy do frontend
- [ ] Logs mostram: "BACKEND_HOST substituído corretamente"
- [ ] Logs mostram: "Backend está acessível!" (ou aviso de conectividade, mas container sobe)
- [ ] Logs mostram: "proxy_set_header Host ...sslip.io"

---

## 4. Teste no navegador

- [ ] Abrir a URL do **frontend** no navegador
- [ ] Abrir DevTools → Aba **Network**
- [ ] Recarregar a página
- [ ] Requisições para `/api/configuracao/` e `/api/eventos/destaques/` retornam **200** (não 400 nem 502)
- [ ] Página inicial carrega sem erros de “Erro ao carregar configurações” / “Erro ao carregar eventos”
- [ ] Login no admin: acessar `http://frontend-sslip.io/admin/` e entrar com admin / admin123

---

## 5. Se ainda der erro

### 400 Bad Request nas chamadas /api/...

- [ ] Confirmar nos logs do **backend** o valor de `ALLOWED_HOSTS final`
- [ ] Se não for `['*']` nem incluir o host do backend: remover `DJANGO_ALLOWED_HOSTS` ou definir `.154.12.227.87.sslip.io`
- [ ] Redeploy do backend (não só restart)

### 502 Bad Gateway

- [ ] Backend está rodando e saudável?
- [ ] `BACKEND_URL` no frontend está exatamente com a URL do backend (sem :8000)?
- [ ] Nos logs do frontend aparece "Backend está acessível!"? Se não, redeploy do backend e depois do frontend.

### Erro de banco (relation does not exist, connection refused)

- [ ] Revisar POSTGRES_* no backend
- [ ] Ver `COOLIFY_POSTGRES_SETUP.md` para pegar host/senha corretos no Coolify

---

## Resumo mínimo

1. **Backend**: POSTGRES_* + DJANGO_SECRET_KEY; **não** definir DJANGO_ALLOWED_HOSTS (ou usar `.154.12.227.87.sslip.io`).
2. **Frontend**: **só** BACKEND_URL = URL do backend (sem :8000).
3. **Ordem**: PostgreSQL → Backend → Frontend; depois testar no browser e conferir Network (200 em /api/...).

Para análise detalhada, consulte `ANALISE_DEPLOY.md`.
