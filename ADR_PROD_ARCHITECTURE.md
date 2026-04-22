# ADR-001 - Arquitetura de producao no Coolify

- Status: Aprovado
- Data: 2026-04-22
- Contexto: quedas intermitentes em PROD, erros aparentes de CORS em momentos de indisponibilidade do backend e necessidade de reduzir pontos de falha.

## Decisao

Adotar e manter **single-app** no Coolify como arquitetura-alvo imediata:

- backend Django servindo API + SPA buildada
- frontend consumindo API por URL relativa (`/api`)
- mesma origem para browser (sem CORS cross-domain no fluxo nominal)

## Justificativa

1. Menor complexidade operacional (menos componentes/rede/proxy)
2. Menor superficie de falha para incidentes intermitentes
3. Menor custo de manutencao e troubleshooting no curto prazo
4. Alinha com o estado atual do repositorio (Dockerfile e docs ja preparados)

## Consequencias

### Positivas

- elimina classe de erros de CORS/certificado entre frontend e backend
- simplifica deploy/rollback
- reduz MTTR com diagnostico mais direto

### Negativas

- menor independencia de escala por camada
- pipeline de release acoplado (frontend + backend no mesmo artefato)

## Reavaliacao futura

Migrar para apps separados apenas se houver requisito forte de:

- escala independente por camada
- fronteira organizacional clara entre equipes
- necessidade de gateway dedicado com observabilidade madura

Se migrar, manter exposicao publica em dominio unico via gateway/reverse proxy para preservar same-origin no browser.
