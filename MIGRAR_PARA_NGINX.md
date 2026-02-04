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

No Coolify → **Frontend** → **Environment Variables**, adicione **apenas**:

**Nome:** `BACKEND_URL`  
**Valor:** `http://s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io`

**Importante:** 
- Use a URL completa do seu backend (com `http://` mas SEM porta, pois o Coolify faz o roteamento)
- **Não defina** `VITE_API_URL` no frontend: o código usa `/api` na mesma origem e o Nginx faz proxy. Isso evita `ERR_CERT_AUTHORITY_INVALID` (certificado HTTPS inválido no backend)
- O Coolify já faz o roteamento na porta padrão (80/443)

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

### Erro: "ERR_CERT_AUTHORITY_INVALID" ou "Network Error" nas chamadas da API
- ✅ **Não defina** `VITE_API_URL` no frontend: o build já usa URL relativa `/api` (mesma origem). O Nginx faz proxy para o backend, então o navegador não acessa o backend diretamente e não há problema de certificado.
- ✅ Faça um **novo build e deploy** do frontend após essa alteração.
