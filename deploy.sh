#!/bin/bash
# Script de Deploy para Docker Swarm - Champions Church

set -e

echo "=========================================="
echo "Champions Church - Deploy Script"
echo "=========================================="

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se .env existe
if [ ! -f .env ]; then
    echo -e "${RED}Erro: Arquivo .env não encontrado!${NC}"
    echo "Copie .env.example para .env e configure as variáveis."
    exit 1
fi

# Carregar variáveis de ambiente
source .env

echo -e "${GREEN}✓${NC} Arquivo .env carregado"

# Verificar se Swarm está inicializado
if ! docker info | grep -q "Swarm: active"; then
    echo -e "${YELLOW}Swarm não está ativo. Inicializando...${NC}"
    docker swarm init
    echo -e "${GREEN}✓${NC} Swarm inicializado"
else
    echo -e "${GREEN}✓${NC} Swarm já está ativo"
fi

# Build das imagens
echo ""
echo "=========================================="
echo "Building Docker Images"
echo "=========================================="

echo "Building backend..."
docker build -t championschurch/backend:latest ./backend
echo -e "${GREEN}✓${NC} Backend image built"

echo "Building frontend..."
docker build -t championschurch/frontend:latest ./frontend
echo -e "${GREEN}✓${NC} Frontend image built"

# Verificar/Criar redes externas
echo ""
echo "=========================================="
echo "Verifying Networks"
echo "=========================================="

NGINX_NET=${NGINX_NETWORK_NAME:-nginx_network}
POSTGRES_NET=${POSTGRES_NETWORK_NAME:-postgres_network}

if ! docker network ls | grep -q "$NGINX_NET"; then
    echo -e "${YELLOW}Rede $NGINX_NET não encontrada. Criando...${NC}"
    docker network create --driver overlay --attachable "$NGINX_NET"
    echo -e "${GREEN}✓${NC} Rede $NGINX_NET criada"
else
    echo -e "${GREEN}✓${NC} Rede $NGINX_NET já existe"
fi

if ! docker network ls | grep -q "$POSTGRES_NET"; then
    echo -e "${YELLOW}Rede $POSTGRES_NET não encontrada. Criando...${NC}"
    docker network create --driver overlay --attachable "$POSTGRES_NET"
    echo -e "${GREEN}✓${NC} Rede $POSTGRES_NET criada"
else
    echo -e "${GREEN}✓${NC} Rede $POSTGRES_NET já existe"
fi

# Deploy do stack
echo ""
echo "=========================================="
echo "Deploying Stack"
echo "=========================================="

docker stack deploy -c docker-compose.prod.yml championschurch
echo -e "${GREEN}✓${NC} Stack deployed"

# Aguardar serviços ficarem prontos
echo ""
echo "Aguardando serviços ficarem prontos..."
sleep 10

# Executar migrations
echo ""
echo "=========================================="
echo "Running Database Migrations"
echo "=========================================="

# Pegar ID de um container do backend
BACKEND_CONTAINER=$(docker ps -q -f name=championschurch_backend | head -n 1)

if [ -z "$BACKEND_CONTAINER" ]; then
    echo -e "${YELLOW}Aviso: Container do backend não encontrado ainda${NC}"
    echo "Execute manualmente: docker exec <container_id> python manage.py migrate"
else
    echo "Executando migrations..."
    docker exec $BACKEND_CONTAINER python manage.py migrate
    echo -e "${GREEN}✓${NC} Migrations executadas"
fi

# Mostrar status
echo ""
echo "=========================================="
echo "Status dos Serviços"
echo "=========================================="
docker stack services championschurch

echo ""
echo -e "${GREEN}=========================================="
echo "Deploy Concluído!"
echo "==========================================${NC}"
echo ""
echo "Comandos úteis:"
echo "  - Ver logs: docker service logs championschurch_backend -f"
echo "  - Ver status: docker stack services championschurch"
echo "  - Remover stack: docker stack rm championschurch"
echo ""
