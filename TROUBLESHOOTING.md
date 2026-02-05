# Guia de Troubleshooting - Champions Church

## Problema: Sistema não abre em http://localhost:5173/

### 1. Verificar se os servidores estão rodando

#### Verificar Backend (porta 8000):
```powershell
# No PowerShell
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
```

Se não retornar nada, o backend não está rodando. Inicie com:
```powershell
cd C:\Projetos\ChampionsChurch\backend
python manage.py runserver
```

#### Verificar Frontend (porta 5173):
```powershell
# No PowerShell
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
```

Se não retornar nada, o frontend não está rodando. Inicie com:
```powershell
cd C:\Projetos\ChampionsChurch\frontend
npm run dev
```

### 2. Verificar erros no console do navegador

1. Abra o navegador (Chrome/Firefox/Edge)
2. Pressione `F12` para abrir o DevTools
3. Vá para a aba **Console**
4. Recarregue a página (`Ctrl+R` ou `F5`)
5. Verifique se há erros em vermelho

### 3. Verificar erros nas janelas do PowerShell

Verifique as janelas do PowerShell onde os servidores estão rodando:
- **Backend**: Deve mostrar "Starting development server at http://127.0.0.1:8000/"
- **Frontend**: Deve mostrar "Local: http://localhost:5173/"

### 4. Problemas comuns e soluções

#### Problema: "Cannot GET /"
- **Causa**: Frontend não está rodando ou porta incorreta
- **Solução**: Verifique se o servidor Vite está rodando na porta 5173

#### Problema: Erro de conexão com API
- **Causa**: Backend não está rodando ou CORS bloqueado
- **Solução**: 
  1. Verifique se o backend está em http://localhost:8000
  2. Verifique o console do navegador para erros de CORS

#### Problema: Página em branco
- **Causa**: Erro JavaScript não tratado
- **Solução**: 
  1. Abra o DevTools (F12)
  2. Verifique a aba Console para erros
  3. Verifique a aba Network para requisições falhando

#### Problema: Porta já em uso
- **Causa**: Outro processo está usando a porta
- **Solução**:
```powershell
# Encontrar processo usando a porta 5173
Get-NetTCPConnection -LocalPort 5173 | Select-Object OwningProcess
# Matar o processo (substitua PID pelo número retornado)
Stop-Process -Id PID -Force

# Ou usar outra porta no Vite
cd frontend
npm run dev -- --port 5174
```

### 5. Reiniciar tudo do zero

```powershell
# 1. Parar todos os processos Python e Node relacionados
Get-Process | Where-Object {$_.ProcessName -like "*python*" -or $_.ProcessName -like "*node*"} | Stop-Process -Force

# 2. Limpar cache do npm (opcional)
cd C:\Projetos\ChampionsChurch\frontend
Remove-Item -Recurse -Force node_modules\.vite -ErrorAction SilentlyContinue

# 3. Iniciar novamente
cd C:\Projetos\ChampionsChurch
.\start-dev.ps1
```

### 6. Verificar logs detalhados

#### Backend:
- Verifique a janela do PowerShell do backend
- Procure por erros em vermelho ou tracebacks

#### Frontend:
- Abra o DevTools (F12)
- Vá para a aba **Network**
- Recarregue a página
- Verifique se há requisições falhando (vermelho)

### 7. Testar conexão manual

#### Testar Backend:
Abra no navegador: http://localhost:8000/api/configuracao/

Deve retornar JSON com as configurações do site.

#### Testar Frontend:
Abra no navegador: http://localhost:5173/

Deve mostrar a página inicial do Champions Church.

### 8. Verificar variáveis de ambiente

Verifique se há arquivo `.env.development` no diretório raiz:
```powershell
Test-Path "C:\Projetos\ChampionsChurch\.env.development"
```

Se não existir, crie baseado no `.env.example`.

### 9. Reinstalar dependências (último recurso)

```powershell
# Frontend
cd C:\Projetos\ChampionsChurch\frontend
Remove-Item -Recurse -Force node_modules
npm install

# Backend (se necessário)
cd C:\Projetos\ChampionsChurch\backend
pip install -r requirements.txt
```

## Contato e Suporte

Se o problema persistir:
1. Anote os erros exatos do console do navegador
2. Anote os erros das janelas do PowerShell
3. Tire screenshots se possível
4. Verifique se ambos os servidores estão realmente rodando
