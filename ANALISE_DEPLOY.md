# Análise do deploy – Champions Church no Coolify

## 1. Arquitetura da aplicação

```
[Browser] --> http://frontend-sslip.io (Nginx:80)
                    |
                    |  /api/*, /admin/*, /media/*, /static/*
                    v
            [Backend Django - Gunicorn:8000]
                    |
                    v
            [PostgreSQL]
```

- **Frontend**: React (Vite), servido por **Nginx** dentro do container. Nginx faz proxy de `/api/`, `/admin/`, `/media/`, `/static/` para o backend.
- **Backend**: Django + Gunicorn na porta 8000. Coolify expõe na porta padrão (80) via proxy reverso.
- **Banco**: PostgreSQL (interno do Coolify ou externo).

---

## 2. O que já está correto no código

| Componente | Status | Observação |
|------------|--------|------------|
| Backend Dockerfile | OK | Python 3.11, entrypoint com migrações, admin, collectstatic, Gunicorn |
| Frontend Dockerfile | OK | Build Node → runtime Nginx, envsubst para BACKEND_URL/BACKEND_HOST |
| Backend entrypoint.sh | OK | Testa DB, migra, cria config e admin, sobe Gunicorn |
| Frontend docker-entrypoint-custom.sh | OK | Extrai host/porta, envsubst, testa conectividade com backend |
| nginx.conf (frontend) | OK | proxy_pass com ${BACKEND_URL}, Host ${BACKEND_HOST}, SPA fallback, /health |
| settings.py – DB | OK | Usa POSTGRES_* se definido, senão SQLite |
| settings.py – ALLOWED_HOSTS | OK | Se DJANGO_ALLOWED_HOSTS vazio → `['*']` |
| settings.py – CORS / CSRF | OK | CORS e CSRF_TRUSTED_ORIGINS via env |

---

## 3. Problemas que estavam impedindo o deploy

### 3.1 ALLOWED_HOSTS (principal causa dos 400)

- **Sintoma**: `Invalid HTTP_HOST header: 's8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io'`, respostas 400 em `/api/configuracao/` e `/api/eventos/destaques/`.
- **Causa**: O Django só aceita hosts listados em `ALLOWED_HOSTS`. No Coolify, o host do backend é um subdomínio sslip.io gerado dinamicamente.
- **O que foi feito no código**: Se `DJANGO_ALLOWED_HOSTS` não estiver definida, `ALLOWED_HOSTS = ['*']`.
- **O que você precisa fazer**:
  - **Opção A (recomendada para testar)**: No Coolify → Backend → Environment Variables, **não definir** `DJANGO_ALLOWED_HOSTS` (ou remover se existir). Assim o backend usa `['*']`.
  - **Opção B (produção)**: Definir `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,.154.12.227.87.sslip.io` (o ponto no início aceita qualquer subdomínio).

### 3.2 BACKEND_URL no frontend

- O Nginx do frontend precisa saber para onde mandar `/api/`, `/admin/`, etc.
- **Obrigatório** no Coolify → Frontend → Environment Variables:
  - `BACKEND_URL=http://<dominio-do-backend>.154.12.227.87.sslip.io`
  - **Sem** `:8000` (Coolify já faz o roteamento na porta 80).
  - Exemplo: `BACKEND_URL=http://s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io`

### 3.3 Entrypoint padrão do Nginx sobrescrevendo a config

- O script `20-envsubst-on-templates.sh` do image oficial do Nginx roda **depois** do nosso entrypoint e regera `/etc/nginx/conf.d/default.conf` a partir do **template**.
- Para o resultado ficar certo, o nosso entrypoint **exporta** `BACKEND_URL` e `BACKEND_HOST` e também **roda o envsubst** antes. Assim, tanto nossa geração quanto a do entrypoint padrão usam as mesmas variáveis e a config final fica correta (desde que `BACKEND_URL` esteja definida no Coolify).

### 3.4 Frontend: URL da API no browser

- Com o setup atual (Nginx fazendo proxy de `/api/` no **mesmo** domínio do frontend), o ideal é o frontend usar **URL relativa** (`/api`).
- No build de produção com o Dockerfile, **não** é obrigatório definir `VITE_API_URL`: sem ela, o código usa `''` e `API_BASE_URL` vira `'/api'`, e as requisições vão para o mesmo host do frontend e são proxyadas pelo Nginx. **Ou** você pode definir `VITE_API_URL` com a URL do **frontend** (mesmo domínio que o usuário acessa), e o resultado é o mesmo.
- **Erro a evitar**: usar `VITE_API_URL` apontando direto para o backend (outro subdomínio) sem necessidade; o proxy no Nginx já resolve.

---

## 4. Variáveis de ambiente – resumo

### Backend (Coolify)

| Variável | Obrigatória | Valor sugerido / Observação |
|----------|-------------|-----------------------------|
| POSTGRES_HOST | Sim (para produção) | Host do PostgreSQL no Coolify ou IP externo |
| POSTGRES_DB | Sim | Ex: `championschurch` |
| POSTGRES_USER | Sim | Ex: `postgres` |
| POSTGRES_PASSWORD | Sim | Senha do banco |
| DJANGO_SECRET_KEY | Sim | Chave longa e aleatória |
| DJANGO_DEBUG | Não | `False` em produção |
| DJANGO_ENVIRONMENT | Não | `production` em produção |
| DJANGO_ALLOWED_HOSTS | Não* | Deixe **vazio** para aceitar qualquer host; ou `.154.12.227.87.sslip.io` |
| CORS_ALLOWED_ORIGINS | Recomendado | URL do frontend, ex: `http://sgock8888s8sco48488gg0gs.154.12.227.87.sslip.io` |
| CSRF_TRUSTED_ORIGINS | Opcional (forms/admin) | Mesmo que CORS, com `http://` e `https://` |

\* Se vazia ou ausente, o código usa `ALLOWED_HOSTS = ['*']`.

### Frontend (Coolify)

| Variável | Obrigatória | Valor |
|----------|-------------|--------|
| BACKEND_URL | Sim | `http://<dominio-backend>.154.12.227.87.sslip.io` (sem porta) |
| VITE_API_URL | Não* | Pode omitir (frontend usa `/api` e o Nginx faz proxy) |

\* Se quiser que o frontend chame a API por URL absoluta, use a URL do **frontend** (mesmo domínio).

---

## 5. Ordem recomendada de deploy

1. **PostgreSQL**: Criar serviço/banco no Coolify e anotar host, porta, db, user, senha.
2. **Backend**:
   - Build Pack: **Dockerfile**
   - Dockerfile path: `backend/Dockerfile`
   - Context: `backend` (ou base directory onde está o backend)
   - Port: 8000 (ou o que o Coolify mapear para 80)
   - Env: POSTGRES_*, DJANGO_SECRET_KEY, e **não** definir DJANGO_ALLOWED_HOSTS (ou usar `.154.12.227.87.sslip.io`).
   - Deploy e verificar logs: migrações, “Conexão com banco de dados OK”, “Gunicorn” ativo.
3. **Frontend**:
   - Build Pack: **Dockerfile**
   - Dockerfile path: `frontend/Dockerfile`
   - Context: `frontend`
   - Port: 80
   - Env: **BACKEND_URL** = URL pública do backend (sem :8000).
   - Deploy e verificar logs: “BACKEND_HOST substituído corretamente”, “Backend está acessível!”.
4. **Teste**: Abrir a URL do frontend; em Network (DevTools), `/api/configuracao/` e `/api/eventos/destaques/` devem retornar **200**.

---

## 6. Checklist rápido de diagnóstico

- [ ] Backend sobe sem erro de conexão ao PostgreSQL?
- [ ] Nos logs do backend aparece `ALLOWED_HOSTS final: ['*']` (ou lista com `.154.12.227.87.sslip.io`)?
- [ ] Frontend tem `BACKEND_URL` definida com a URL do backend (sem :8000)?
- [ ] Logs do frontend mostram “BACKEND_HOST substituído corretamente” e “Backend está acessível!”?
- [ ] No browser, requisições para `/api/...` vão para o **mesmo** domínio do frontend (proxy Nginx)?
- [ ] Se ainda 400: conferir se não há `DJANGO_ALLOWED_HOSTS` com valor antigo no backend e fazer **redeploy** após alterar env.

---

## 7. Documentos relacionados

- `COOLIFY_ALLOWED_HOSTS.md` – Detalhes de ALLOWED_HOSTS e CSRF.
- `COOLIFY_POSTGRES_SETUP.md` – Como pegar dados do PostgreSQL no Coolify.
- `MIGRAR_PARA_NGINX.md` – Uso do Dockerfile com Nginx no frontend.

---

**Conclusão**: O código está preparado para subir no Coolify. O bloqueio principal era o Django rejeitar o host (ALLOWED_HOSTS). Garantindo `DJANGO_ALLOWED_HOSTS` vazia (ou com `.154.12.227.87.sslip.io`) no backend e `BACKEND_URL` correta no frontend, o deploy deve funcionar. Use o checklist acima para validar cada etapa.
