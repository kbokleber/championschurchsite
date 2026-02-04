# Deploy em um único app no Coolify (Backend serve o Frontend)

Esta abordagem usa **um único serviço** no Coolify: o backend Django serve o build do React e a API. Assim não há proxy entre apps, nem CORS nem problemas de certificado entre frontend e backend.

## Pré-requisitos

- Repositório com `backend/` e `frontend/`
- PostgreSQL no Coolify (ou externo) com as variáveis de ambiente do backend

## Passo a passo no Coolify

### 1. Criar um único aplicativo

- **Build Pack:** Dockerfile  
- **Dockerfile Path:** `backend/Dockerfile`  
- **Build Context:** raiz do repositório (pasta onde estão `backend/` e `frontend/`)

Importante: o build deve ser executado a partir da **raiz do repositório**, não da pasta `backend/`. No Coolify, isso costuma ser o padrão quando o repositório é clonado na raiz.

### 2. Porta

- **Port:** `8000`  
- O Gunicorn escuta em 8000; o Coolify faz o roteamento na porta pública (80/443).

### 3. Variáveis de ambiente (Backend)

Configure apenas as do backend, por exemplo:

| Nome | Valor | Obrigatório |
|------|--------|-------------|
| `POSTGRES_HOST` | hostname do PostgreSQL no Coolify | Sim |
| `POSTGRES_DB` | nome do banco | Sim |
| `POSTGRES_USER` | usuário | Sim |
| `POSTGRES_PASSWORD` | senha | Sim |
| `POSTGRES_PORT` | `5432` | Sim |
| `DJANGO_SECRET_KEY` | chave secreta forte | Sim |
| `DJANGO_DEBUG` | `False` | Sim |
| `DJANGO_ENVIRONMENT` | `production` | Recomendado |
| `DJANGO_ALLOWED_HOSTS` | (opcional) domínio do app, ex: `seudominio.com` | Não |
| `CSRF_TRUSTED_ORIGINS` | `https://seudominio.com` (se usar HTTPS) | Se usar admin/API via browser |

Não é necessário `DJANGO_BEHIND_PROXY`: o usuário acessa só este app; o Coolify cuida do HTTPS na borda.

### 4. Volume persistente para mídia (uploads e imagens)

Para que imagens e arquivos enviados pelo sistema **não se percam** em redeploys ou restarts do container:

1. No Coolify, abra o aplicativo Champions Church.
2. Vá na aba **Storage** (ou **Volumes** / **Persistent Storage** / **Mounts**, conforme a versão do Coolify).
3. Adicione um volume:
   - **Container Path:** `/app/media`
   - **Volume Name:** por exemplo `champions-media` (ou deixe o Coolify gerar).
   - Se houver opção **Source** (host path): pode deixar vazio para volume nomeado, ou usar um caminho do servidor, ex.: `/data/champions-media`.

Assim o diretório `/app/media` do container fica persistido no host; o Django já usa esse caminho para `MEDIA_ROOT`.

### 5. Comandos de build/start

Deixe vazios; o Dockerfile e o `entrypoint.sh` definem o build e o start.

### 6. Deploy

Clique em **Deploy** / **Redeploy**.

## Como funciona

1. O **Dockerfile** faz em um único build:
   - Build do frontend (Node: `npm ci` e `npm run build`).
   - Build do backend (Python, Gunicorn).
   - Cópia de `frontend/dist` para `frontend_dist` dentro da imagem.
2. O **Django**:
   - Serve a API em `/api/` e o admin do Django em `/django-admin/` (a SPA usa `/admin/`).
   - Se existir o diretório `frontend_dist`, serve os estáticos do frontend em `/assets/*` e devolve `index.html` para as rotas da SPA (fallback).
3. O frontend em produção usa **URLs relativas** (`/api`, `/media`), então tudo é mesma origem e não há problema de CORS nem de certificado.

## Desenvolvimento local

- Backend: `python manage.py runserver` (ou Gunicorn) na pasta `backend/`.
- Frontend: `npm run dev` na pasta `frontend/` (proxy do Vite para `/api`).

Em dev não existe `frontend_dist` no backend, então as rotas da SPA não são ativadas e o backend continua só API + admin.

## Build local (testar imagem)

Na raiz do repositório (onde estão `backend/` e `frontend/`):

```powershell
docker build -f backend/Dockerfile -t champions-app .
docker run -p 8000:8000 -e POSTGRES_HOST=... -e POSTGRES_DB=... ...
```

## Vantagens desta abordagem

- Um único app no Coolify (menos configuração e menos pontos de falha).
- Sem proxy entre frontend e backend; sem `ERR_CERT_AUTHORITY_INVALID` entre eles.
- Sem CORS entre frontend e API (mesma origem).
- Comportamento alinhado entre dev (dois processos) e prod (um container servindo tudo).

## Troubleshooting

- **404 em rotas do React (ex.: /eventos):** confirme que o build do frontend rodou e que `frontend_dist` existe na imagem (rota catch-all do Django que devolve `index.html`).
- **500 ou “Invalid Host”:** ajuste `DJANGO_ALLOWED_HOSTS` ou use `*` (já suportado pelo projeto quando a variável não está definida).
- **API não responde:** verifique variáveis do PostgreSQL e logs do container (migrações e Gunicorn).
- **Painel Django (tabelas, usuários):** use **`/django-admin/`** (não `/admin/`). O `/admin/` é o painel React (SPA).
