#!/bin/sh
# Script para iniciar Vite Preview permitindo todos os hosts
export VITE_PREVIEW_ALLOWED_HOSTS=all
exec npx vite preview --host 0.0.0.0 --port 80
