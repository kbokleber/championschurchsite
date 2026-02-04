# Guia Rápido: Migrar Frontend para Dockerfile com Nginx

## Por que migrar?

O Vite Preview tem limitações com proxy em containers separados. O Dockerfile com Nginx resolve isso de forma mais confiável.

## Passo a Passo no Coolify

### 1. Acessar Configurações do Frontend

No Coolify → **Frontend** → **Settings** (ou **Configuration**)

### 2. Mudar Build Pack

- **Build Pack:** Mude de **Nixpacks** para **Dockerfile**
- **Dockerfile Path:** `frontend/Dockerfile`
- **Docker Context:** `frontend`

### 3. Configurar Variável de Ambiente

No Coolify → **Frontend** → **Environment Variables**, adicione:

**Nome:** `BACKEND_URL`  
**Valor:** `http://s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io:8000`

**Importante:** 
- Use a URL completa do seu backend (com `http://` e porta `:8000`)
- Se os containers estão na mesma rede Docker do Coolify, você pode usar o nome do serviço: `http://s8o8s80sw0gswkockswkw084:8000`

### 4. Limpar Comandos de Build/Start

Deixe vazios ou remova:
- **Install Command:** (vazio)
- **Build Command:** (vazio) 
- **Start Command:** (vazio)

O Dockerfile já define tudo isso.

### 5. Configurar Porta

- **Port:** `80`
- **Port Mappings:** `80:80` (ou deixe vazio)

### 6. Fazer Deploy

Clique em **"Deploy"** ou **"Redeploy"**

## Como Funciona

1. O Dockerfile faz o build do React (`npm run build`)
2. Copia os arquivos estáticos para o Nginx
3. O Nginx serve os arquivos estáticos
4. O Nginx faz proxy de `/api/*` para o backend usando `BACKEND_URL`
5. O código JavaScript usa `/api` (proxy relativo) que funciona perfeitamente com Nginx

## Vantagens

✅ Proxy funciona corretamente  
✅ Não precisa de `VITE_API_URL` no build  
✅ Mais rápido e confiável  
✅ Melhor para produção  
✅ Suporta SPA routing automaticamente  

## Troubleshooting

### Erro: "502 Bad Gateway"
- ✅ Verifique se `BACKEND_URL` está configurada corretamente
- ✅ Verifique se o backend está rodando e acessível
- ✅ Verifique os logs do frontend no Coolify

### Erro: "404 Not Found" em rotas do React Router
- ✅ O `nginx.conf` já está configurado para SPA routing
- ✅ Deve funcionar automaticamente

### Erro: "Connection refused" no proxy
- ✅ Verifique se `BACKEND_URL` aponta para o backend correto
- ✅ Se usar nome de serviço, verifique se está na mesma rede Docker
