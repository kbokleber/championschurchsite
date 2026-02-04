# Configuração de ALLOWED_HOSTS e CSRF no Coolify

## Problema

O Django está rejeitando requisições com erro `Invalid HTTP_HOST header` porque o host não está em `ALLOWED_HOSTS`.

## Solução

### Opção 1: Aceitar qualquer host (Recomendado para desenvolvimento/teste)

**Não configure nenhuma variável de ambiente** `DJANGO_ALLOWED_HOSTS` no backend.

O código já está configurado para aceitar qualquer host (`ALLOWED_HOSTS = ['*']`) quando `DJANGO_ALLOWED_HOSTS` não está definida.

### Opção 2: Configurar hosts específicos (Recomendado para produção)

No Coolify → **Backend** → **Environment Variables**, adicione:

**Nome:** `DJANGO_ALLOWED_HOSTS`  
**Valor:** `localhost,127.0.0.1,.154.12.227.87.sslip.io`

**Importante:** 
- O ponto no início (`.154.12.227.87.sslip.io`) faz o Django aceitar qualquer subdomínio
- Isso permite que o Coolify gere subdomínios dinâmicos como `s8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io`

### Evitar ERR_CERT_AUTHORITY_INVALID (backend atrás do proxy)

Se o frontend faz proxy de `/api` para o backend e o backend redireciona para HTTPS, o navegador pode tentar acessar o backend direto e falhar com certificado inválido. Configure:

**Nome:** `DJANGO_BEHIND_PROXY`  
**Valor:** `true`

Com isso, o Django não redireciona para HTTPS e não define cookies seguros; o browser só fala com o frontend.

### Opção 3: Configurar CSRF_TRUSTED_ORIGINS (Opcional, mas recomendado)

Se você fizer POSTs (formulários/admin) a partir do frontend, configure:

**Nome:** `CSRF_TRUSTED_ORIGINS`  
**Valor:** `http://sgock8888s8sco48488gg0gs.154.12.227.87.sslip.io,https://sgock8888s8sco48488gg0gs.154.12.227.87.sslip.io`

**Importante:**
- Substitua `sgock8888s8sco48488gg0gs` pelo domínio real do seu frontend
- Inclua tanto `http://` quanto `https://` se usar ambos
- Desde o Django 4.0, as entradas precisam ter esquema (`http://` ou `https://`)

## Passo a Passo

1. **Acesse o Backend no Coolify**
2. **Vá em Environment Variables**
3. **Verifique se `DJANGO_ALLOWED_HOSTS` está definida:**
   - Se estiver definida, remova ou deixe vazia (para aceitar qualquer host)
   - Ou configure com: `localhost,127.0.0.1,.154.12.227.87.sslip.io`
4. **Opcionalmente, configure `CSRF_TRUSTED_ORIGINS`** com o domínio do frontend
5. **Faça um novo deploy do backend**
6. **Verifique os logs** - você deve ver:
   ```
   🔧 DEBUG ALLOWED_HOSTS:
      DJANGO_ALLOWED_HOSTS: '...'
      ALLOWED_HOSTS final: ['*'] ou [lista de hosts]
   ```

## Verificação

Após o deploy, acesse o frontend e verifique no DevTools → Network:
- As chamadas para `/api/eventos/destaques/` e `/api/configuracao/` devem retornar `200` em vez de `400`
- Não deve mais aparecer o erro `Invalid HTTP_HOST header`

## Troubleshooting

### Ainda está dando erro 400?

1. Verifique os logs do backend - procure por `🔧 DEBUG ALLOWED_HOSTS:`
2. Confirme que `ALLOWED_HOSTS final` contém `['*']` ou o host correto
3. Verifique se o backend foi atualizado com a última versão do código
4. Faça um novo deploy completo (não apenas restart)

### Como verificar qual host está sendo enviado?

Nos logs do backend, você verá:
```
Invalid HTTP_HOST header: 's8o8s80sw0gswkockswkw084.154.12.227.87.sslip.io'
```

Esse é o host que precisa estar em `ALLOWED_HOSTS` ou você precisa usar `['*']` para aceitar qualquer host.
