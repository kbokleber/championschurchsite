#!/bin/bash
# Script de Preparação da VPS - Champions Church

echo "--- Criando redes Overlay (se não existirem) ---"
docker network create --driver overlay nginx_network || true
docker network create --driver overlay postgres_network || true

echo "--- Construindo Imagens Localmente na VPS ---"
# O Swarm stack deploy não aceita 'build', então fazemos manual
docker build -t championschurch/backend:latest ./backend
docker build -t championschurch/frontend:latest ./frontend

echo "--- Pronto para o Deploy ---"
echo "Agora execute: docker stack deploy -c docker-compose.prod.yml championschurch"
