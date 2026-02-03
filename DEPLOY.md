# Deploy Champions Church - Guia Completo

## Pré-requisitos

- Docker instalado e rodando
- Docker Swarm inicializado
- Redes Docker externas criadas:
  - Rede do Nginx
  - Rede do PostgreSQL
- PostgreSQL rodando e acessível

## Passo 1: Verificar Redes Docker Existentes

Primeiro, identifique os nomes exatos das suas redes Docker:

```bash
docker network ls
```

Você deve ver suas redes do Nginx e PostgreSQL listadas. Anote os nomes exatos.

## Passo 2: Configurar Variáveis de Ambiente

Copie o arquivo de exemplo e edite com suas configurações:

```bash
cp .env.example .env
nano .env  # ou use seu editor preferido
```

**Variáveis importantes para configurar:**

```bash
# Django
DJANGO_SECRET_KEY=gere-uma-chave-secreta-forte-aqui
DJANGO_ALLOWED_HOSTS=seu-dominio.com.br,www.seu-dominio.com.br

# PostgreSQL - ajuste conforme seu banco
POSTGRES_HOST=postgres  # nome do serviço ou IP
POSTGRES_PORT=5432
POSTGRES_DB=championschurch
POSTGRES_USER=postgres
POSTGRES_PASSWORD=sua-senha-forte

# Redes Docker - USE OS NOMES EXATOS DAS SUAS REDES
NGINX_NETWORK_NAME=nome_da_sua_rede_nginx
POSTGRES_NETWORK_NAME=nome_da_sua_rede_postgres
```

## Passo 3: Criar Banco de Dados no PostgreSQL

Conecte ao seu PostgreSQL e crie o banco:

```bash
# Conectar ao container do PostgreSQL
docker exec -it <postgres_container> psql -U postgres

# Dentro do psql:
CREATE DATABASE championschurch;
CREATE USER championschurch_user WITH PASSWORD 'sua-senha';
GRANT ALL PRIVILEGES ON DATABASE championschurch TO championschurch_user;
\q
```

## Passo 4: Modificar docker-compose.yml (se necessário)

Abra o `docker-compose.yml` e verifique/ajuste:

1. **Nomes das redes externas** (linhas finais do arquivo):
   ```yaml
   networks:
     nginx_network:
       external: true
       name: ${NGINX_NETWORK_NAME:-nginx_network}  # Ajuste o nome padrão
     
     postgres_network:
       external: true
       name: ${POSTGRES_NETWORK_NAME:-postgres_network}  # Ajuste o nome padrão
   ```

2. **Host do PostgreSQL** no serviço backend:
   ```yaml
   - POSTGRES_HOST=${POSTGRES_HOST:-postgres}  # Use o nome do serviço ou IP
   ```

## Passo 5: Executar Script de Deploy

O script `deploy.sh` foi atualizado para **automatizar todo o processo**:
1. Verifica/Inicia o Docker Swarm
2. Cria automaticamente as redes necessárias (se não existirem)
3. Faz o build das imagens
4. Faz o deploy do stack usando `docker-compose.prod.yml`
5. Aguarda os serviços iniciarem
6. Executa as migrações do banco de dados

Para rodar (no Linux/Bash):

```bash
# Dar permissão de execução (apenas na primeira vez)
chmod +x deploy.sh

# Rodar o deploy
./deploy.sh
```

**Se tudo correu bem, você verá "Deploy Concluído!" no final.**

### Se precisar rodar manualmente (Caso o script falhe):

1. **Build das imagens:**
   ```bash
   docker build -t championschurch/backend:latest ./backend
   docker build -t championschurch/frontend:latest ./frontend
   ```

2. **Deploy:**
   ```bash
   docker stack deploy -c docker-compose.prod.yml championschurch
   ```

3. **Migrations:**
   ```bash
   # Pegar ID do container
   ID=$(docker ps -q -f name=championschurch_backend | head -n 1)
   docker exec $ID python manage.py migrate
   ```

## Passo 10: Configurar Nginx Externo

No seu Nginx externo, adicione a configuração para proxy reverso:

```nginx
server {
    listen 80;
    server_name championschurch.com.br www.championschurch.com.br;

    location / {
        proxy_pass http://championschurch_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Nota**: `championschurch_frontend` é o nome do serviço no Swarm. O Nginx precisa estar na mesma rede overlay.

## Comandos Úteis

### Gerenciamento do Stack

```bash
# Listar stacks
docker stack ls

# Ver serviços do stack
docker stack services championschurch

# Ver tasks (containers) do stack
docker stack ps championschurch

# Remover stack
docker stack rm championschurch
```

### Atualização da Aplicação

```bash
# Rebuild das imagens
docker build -t championschurch/backend:latest ./backend
docker build -t championschurch/frontend:latest ./frontend

# Atualizar serviço (rolling update)
docker service update --image championschurch/backend:latest championschurch_backend
docker service update --image championschurch/frontend:latest championschurch_frontend
```

### Escalar Serviços

```bash
# Aumentar replicas do backend
docker service scale championschurch_backend=4

# Aumentar replicas do frontend
docker service scale championschurch_frontend=3
```

### Logs e Debug

```bash
# Logs de um serviço
docker service logs championschurch_backend -f

# Inspecionar serviço
docker service inspect championschurch_backend

# Ver tasks com erros
docker stack ps championschurch --no-trunc
```

## Troubleshooting

### Serviço não inicia

```bash
# Ver logs detalhados
docker service logs championschurch_backend --tail 100

# Ver tasks com erro
docker stack ps championschurch --filter "desired-state=running"
```

### Erro de conexão com PostgreSQL

1. Verifique se o backend está na rede correta do PostgreSQL
2. Teste conectividade:
   ```bash
   docker exec <backend_container> ping postgres
   ```

### Erro de rede externa não encontrada

Crie as redes manualmente:
```bash
docker network create --driver overlay nginx_network
docker network create --driver overlay postgres_network
```

## Backup e Restore

### Backup do Banco de Dados

```bash
docker exec <postgres_container> pg_dump -U postgres championschurch > backup.sql
```

### Restore do Banco de Dados

```bash
docker exec -i <postgres_container> psql -U postgres championschurch < backup.sql
```

## Monitoramento

Considere adicionar:
- **Portainer** - Interface web para gerenciar Docker Swarm
- **Prometheus + Grafana** - Monitoramento de métricas
- **ELK Stack** - Centralização de logs
