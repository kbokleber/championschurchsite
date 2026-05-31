# Script para iniciar o sistema em modo desenvolvimento
Write-Host "=== Iniciando Champions Church em modo desenvolvimento ===" -ForegroundColor Green

$backendDir = Join-Path $PSScriptRoot "backend"
$frontendDir = Join-Path $PSScriptRoot "frontend"
$venvPython = Join-Path $backendDir "venv\Scripts\python.exe"
$venvPip = Join-Path $backendDir "venv\Scripts\pip.exe"

# Garantir venv do backend com todas as dependências (ex.: openpyxl para exportar planilhas)
Write-Host "`n[Backend] Preparando ambiente Python..." -ForegroundColor Cyan
if (-not (Test-Path $venvPython)) {
    Write-Host "  Criando venv em backend\venv ..." -ForegroundColor Gray
    python -m venv (Join-Path $backendDir "venv")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERRO: falha ao criar venv. Verifique se Python 3 está instalado." -ForegroundColor Red
        exit 1
    }
}

Write-Host "  Sincronizando pip install -r requirements.txt ..." -ForegroundColor Gray
& $venvPip install -r (Join-Path $backendDir "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERRO: falha ao instalar dependências do backend." -ForegroundColor Red
    exit 1
}

# Verificar se as portas estão em uso
$port5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
$port5174 = Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue
$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if ($port5173 -or $port5174) {
    Write-Host "AVISO: Porta 5173/5174 já está em uso (frontend)." -ForegroundColor Yellow
}

if ($port8000) {
    Write-Host "AVISO: Porta 8000 já está em uso (backend)." -ForegroundColor Yellow
}

# Iniciar Backend (sempre com o Python do venv)
Write-Host "`n[1/2] Iniciando Backend Django..." -ForegroundColor Cyan
$backendCmd = @"
Set-Location '$backendDir'
Write-Host 'Backend Django (venv) iniciando...' -ForegroundColor Green
& '$venvPython' manage.py runserver 127.0.0.1:8000
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# Aguardar um pouco antes de iniciar o frontend
Start-Sleep -Seconds 3

# Iniciar Frontend (porta 5174 — padrão local; proxy /api → :8000)
Write-Host "[2/2] Iniciando Frontend React..." -ForegroundColor Cyan
$frontendCmd = @"
Set-Location '$frontendDir'
Write-Host 'Frontend React (Vite) iniciando em http://localhost:5174 ...' -ForegroundColor Green
npx vite --host localhost --port 5174
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host "`n=== Servidores iniciados! ===" -ForegroundColor Green
Write-Host "Backend: http://localhost:8000 (venv)" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:5174" -ForegroundColor Yellow
Write-Host "`nAguarde alguns segundos para os servidores iniciarem completamente." -ForegroundColor Gray
