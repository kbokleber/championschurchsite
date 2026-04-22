# Runbook de Estabilizacao PROD (Coolify)

Este runbook define como medir, operar e responder incidentes para reduzir quedas intermitentes no backend.

## 1) Janela de baseline (5-7 dias)

Objetivo: capturar dados reais antes de mudanças maiores de arquitetura.

- Coletar diariamente:
  - reinicios do container backend
  - erros 5xx em `/api/*`
  - latencia p95/p99 das requests
  - falhas de readiness (`/api/health/ready/`)
- Fonte de dados:
  - logs do app (`eventos.requests`)
  - eventos do serviço no Coolify (restart/OOM/crashloop)

## 2) Endpoints de saude

- `GET /api/health/live/` -> valida processo vivo
- `GET /api/health/ready/` -> valida app + banco

Use `ready` para readiness/liveness do deploy e alertas.

## 3) Variaveis recomendadas (backend)

- `DJANGO_ENVIRONMENT=production`
- `DJANGO_DEBUG=False`
- `REQUEST_LOG_LEVEL=INFO`
- `DB_CONN_MAX_AGE=300`
- `DB_CONNECT_TIMEOUT=10`
- `DB_KEEPALIVES_IDLE=30`
- `DB_KEEPALIVES_INTERVAL=10`
- `DB_KEEPALIVES_COUNT=5`

## 4) Startup hardening

O startup ficou focado em:
- validar DB
- migrar
- collectstatic
- subir Gunicorn

Tarefas administrativas pesadas foram movidas para comando manual:

```bash
python manage.py bootstrap_prod
```

No Coolify, execute como comando pos-deploy (ou shell manual) quando necessario.

Se quiser manter no startup (nao recomendado para estabilidade), use:

- `RUN_BOOTSTRAP_TASKS=true`

## 5) Gunicorn tuning recomendado

Parametros configuraveis por env:

- `WEB_CONCURRENCY`
- `MAX_WEB_CONCURRENCY` (default: 8)
- `GUNICORN_THREADS` (default: 2)
- `GUNICORN_TIMEOUT` (default: 90)
- `GUNICORN_GRACEFUL_TIMEOUT` (default: 30)
- `GUNICORN_KEEPALIVE` (default: 5)
- `GUNICORN_MAX_REQUESTS` (default: 1000)
- `GUNICORN_MAX_REQUESTS_JITTER` (default: 50)

## 6) Alertas minimos (SLO operacional)

Criar alertas para:

- restart loop: >= 3 reinicios em 10 minutos
- readiness failing: >= 3 falhas consecutivas
- erro 5xx: > 0.5% por 5 minutos
- latencia p95: > 1500ms por 10 minutos

## 7) Checklist de deploy e rollback

### Deploy

1. Confirmar variaveis de ambiente do backend
2. Deploy no Coolify
3. Validar `/api/health/live/` e `/api/health/ready/`
4. Executar smoke test:
   - login admin
   - carregar configuracao publica
   - listar eventos destacados

### Rollback

1. Reverter para release anterior no Coolify
2. Validar health endpoints
3. Validar fluxo de login
4. Monitorar 15 minutos

## 8) Criterios de sucesso

- 0 indisponibilidades percebidas no login por 14 dias
- erro 5xx em `/api` < 0.5%
- MTTR < 15 minutos
