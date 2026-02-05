# Script para verificar status dos servidores
Write-Host "=== Verificando Status dos Servidores ===" -ForegroundColor Cyan
Write-Host ""

# Verificar Backend (porta 8000)
Write-Host "[Backend] Verificando porta 8000..." -ForegroundColor Yellow
$backend = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($backend) {
    Write-Host "  [OK] Backend esta rodando na porta 8000" -ForegroundColor Green
    Write-Host "  URL: http://localhost:8000" -ForegroundColor Gray
} else {
    Write-Host "  [ERRO] Backend NAO esta rodando na porta 8000" -ForegroundColor Red
    Write-Host "  Execute: cd backend; python manage.py runserver" -ForegroundColor Yellow
}

Write-Host ""

# Verificar Frontend (porta 5173)
Write-Host "[Frontend] Verificando porta 5173..." -ForegroundColor Yellow
$frontend = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($frontend) {
    Write-Host "  [OK] Frontend esta rodando na porta 5173" -ForegroundColor Green
    Write-Host "  URL: http://localhost:5173" -ForegroundColor Gray
} else {
    Write-Host "  [ERRO] Frontend NAO esta rodando na porta 5173" -ForegroundColor Red
    Write-Host "  Execute: cd frontend; npm run dev" -ForegroundColor Yellow
}

Write-Host ""

# Verificar processos Python e Node
Write-Host "[Processos] Verificando processos..." -ForegroundColor Yellow
$pythonProcs = Get-Process | Where-Object {$_.ProcessName -like "*python*"}
$nodeProcs = Get-Process | Where-Object {$_.ProcessName -like "*node*"}

if ($pythonProcs) {
    Write-Host "  [OK] Processos Python encontrados: $($pythonProcs.Count)" -ForegroundColor Green
} else {
    Write-Host "  [ERRO] Nenhum processo Python encontrado" -ForegroundColor Red
}

if ($nodeProcs) {
    Write-Host "  [OK] Processos Node encontrados: $($nodeProcs.Count)" -ForegroundColor Green
} else {
    Write-Host "  [ERRO] Nenhum processo Node encontrado" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Resumo ===" -ForegroundColor Cyan
if ($backend -and $frontend) {
    Write-Host "[OK] Ambos os servidores estao rodando!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Acesse: http://localhost:5173" -ForegroundColor Yellow
} else {
    Write-Host "[ERRO] Um ou ambos os servidores nao estao rodando" -ForegroundColor Red
    Write-Host ""
    Write-Host "Para iniciar, execute: .\start-dev.ps1" -ForegroundColor Yellow
}
