# Script para iniciar o sistema em modo desenvolvimento
Write-Host "=== Iniciando Champions Church em modo desenvolvimento ===" -ForegroundColor Green

# Verificar se as portas estão em uso
$port5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if ($port5173) {
    Write-Host "AVISO: Porta 5173 já está em uso!" -ForegroundColor Yellow
}

if ($port8000) {
    Write-Host "AVISO: Porta 8000 já está em uso!" -ForegroundColor Yellow
}

# Iniciar Backend
Write-Host "`n[1/2] Iniciando Backend Django..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\backend'; Write-Host 'Backend Django iniciando...' -ForegroundColor Green; python manage.py runserver"

# Aguardar um pouco antes de iniciar o frontend
Start-Sleep -Seconds 3

# Iniciar Frontend
Write-Host "[2/2] Iniciando Frontend React..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\frontend'; Write-Host 'Frontend React iniciando...' -ForegroundColor Green; npm run dev"

Write-Host "`n=== Servidores iniciados! ===" -ForegroundColor Green
Write-Host "Backend: http://localhost:8000" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "`nAguarde alguns segundos para os servidores iniciarem completamente." -ForegroundColor Gray
