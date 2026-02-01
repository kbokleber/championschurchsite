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

## Passo 5: Build das Imagens

```bash
# Backend
docker build -t championschurch/backend:latest ./backend

# Frontend
docker build -t championschurch/frontend:latest ./frontend
```

## Passo 6: Inicializar Swarm (se ainda não estiver)

```bash
docker swarm init
```

Se já estiver inicializado, você verá uma mensagem informando.

## Passo 7: Deploy do Stack

```bash
docker stack deploy -c docker-compose.yml championschurch
```

## Passo 8: Verificar Serviços

```bash
# Ver status dos serviços
docker stack services championschurch

# Ver logs do backend
docker service logs championschurch_backend -f

# Ver logs do frontend
docker service logs championschurch_frontend -f
```

## Passo 9: Executar Migrations

Aguarde os containers ficarem prontos (status 2/2), depois execute:

```bash
# Pegar ID de um container do backend
BACKEND_CONTAINER=$(docker ps -q -f name=championschurch_backend | head -n 1)

# Executar migrations
docker exec $BACKEND_CONTAINER python manage.py migrate

# Criar superusuário (opcional)
docker exec -it $BACKEND_CONTAINER python manage.py createsuperuser
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
