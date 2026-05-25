# Configuração do Frontend no Coolify

## Problema Atual

O frontend está dando timeout porque não consegue conectar ao backend. Isso acontece porque:

1. O Vite Preview **não suporta proxy** como o servidor de desenvolvimento
2. A variável `VITE_API_URL` precisa estar disponível **durante o BUILD**, não apenas no runtime
3. Se `VITE_API_URL` não estiver definida, o frontend tenta usar `/api` (proxy relativo) que não funciona no preview

## Solução

### Passo 1: Configurar Variável de Ambiente no Coolify

No Coolify → **Frontend** → **Environment Variables**, adicione:

**Nome:** `VITE_API_URL`  
**Valor:** `http://s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io`

**⚠️ IMPORTANTE:** 
- Substitua pela URL real do seu backend
- A URL deve ser acessível do frontend (mesmo domínio ou CORS configurado)
- **Não** inclua `/api` no final - o código já adiciona isso

### Passo 2: Verificar Build Command

No Coolify → **Frontend** → **Build Command**, certifique-se de que está:

```bash
npm ci && npm run build
```

Isso garante que a variável `VITE_API_URL` seja incluída no build.

### Passo 3: Verificar Start Command

No Coolify → **Frontend** → **Start Command**, deve estar:

```bash
npx vite preview --host 0.0.0.0 --port 80
```

Ou usando o script:

```bash
sh start-preview.sh
```

### Passo 4: Fazer Rebuild

**IMPORTANTE:** Após adicionar a variável `VITE_API_URL`, você **DEVE fazer um rebuild completo** do frontend, pois as variáveis do Vite são incluídas no momento do build.

1. Vá para o Frontend no Coolify
2. Clique em **"Redeploy"** ou **"Rebuild"**
3. Aguarde o build completar

### Passo 5: Verificar Logs

Após o deploy, verifique os logs do frontend. Você deve ver no console do navegador:

```
API Base URL: http://s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io/api
VITE_API_URL: http://s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io
```

Se aparecer `VITE_API_URL: undefined`, significa que a variável não foi passada durante o build.

## ⚠️ RECOMENDAÇÃO: Usar Dockerfile com Nginx (Solução Mais Confiável)

O Vite Preview tem limitações com proxy em containers separados. **Recomendo usar o Dockerfile com Nginx** que já está no projeto:

### Passo 1: Mudar Build Pack no Coolify

1. No Coolify → **Frontend** → **Settings**
2. Mude o **Build Pack** de **Nixpacks** para **Dockerfile**
3. **Dockerfile Path:** `frontend/Dockerfile`
4. **Docker Context:** `frontend`

### Passo 2: Configurar Variável de Ambiente

No Coolify → **Frontend** → **Environment Variables**, adicione:

**Nome:** `BACKEND_URL`  
**Valor:** `http://s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io` (URL do backend SEM porta)

**Importante:** 
- Não inclua a porta `:8000` pois o Coolify já faz o roteamento
- O Coolify roteia automaticamente na porta padrão (80/443)

### Passo 3: Atualizar nginx.conf (se necessário)

O `nginx.conf` já está configurado para usar `http://backend:8000`. Se o nome do seu serviço backend no Coolify for diferente, você pode:

1. Editar `frontend/nginx.conf` linha 24: `proxy_pass http://backend:8000;`
2. Ou usar variável de ambiente no Dockerfile (requer ajuste)

### Passo 4: Fazer Deploy

Após configurar, faça um novo deploy. O Nginx vai fazer proxy corretamente para o backend.

## Troubleshooting

### Erro: "timeout of 10000ms exceeded"
- ✅ Verifique se `VITE_API_URL` está configurada corretamente
- ✅ Verifique se fez rebuild após adicionar a variável
- ✅ Verifique se o backend está acessível na URL configurada
- ✅ Verifique os logs do console do navegador para ver qual URL está sendo usada

### Erro: "ECONNREFUSED"
- ✅ O frontend não está conseguindo resolver o hostname do backend
- ✅ Verifique se a URL do backend está correta
- ✅ Verifique se o backend está rodando

### Erro: "CORS"
- ✅ Verifique se `CORS_ALLOWED_ORIGINS` no backend inclui a URL do frontend
- ✅ Exemplo: `CORS_ALLOWED_ORIGINS=http://sgock8888s8sco48488gg0gs.154.12.227.87.sslip.io`

## Exemplo de Configuração Completa

### Backend (Coolify)
```
POSTGRES_HOST=r84kgwsswc4c0o0ck0wc44go
POSTGRES_PORT=5432
POSTGRES_DB=championschurch
POSTGRES_USER=postgres
POSTGRES_PASSWORD=sua-senha
DJANGO_SECRET_KEY=sua-chave-secreta
DJANGO_DEBUG=False
DJANGO_ENVIRONMENT=production
DJANGO_ALLOWED_HOSTS=s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io
CORS_ALLOWED_ORIGINS=http://sgock8888s8sco48488gg0gs.154.12.227.87.sslip.io
```

### Frontend (Coolify)
```
# Com Nginx/Dockerfile na mesma origem, omita VITE_API_URL (usa /api)
VITE_GOOGLE_CLIENT_ID=278138141726-xxxx.apps.googleusercontent.com
```

**Backup Google Drive:** defina `VITE_GOOGLE_CLIENT_ID` no build do frontend **dev** e **prod**, depois **rebuild**. No Google Cloud, cadastre as origens JavaScript de cada domínio (`https://dev.championschurch.com.br`, `https://championschurch.com.br`, etc.) e habilite a Drive API.

**Nota:** As URLs podem ser diferentes se frontend e backend estão em containers/domínios diferentes no Coolify.
