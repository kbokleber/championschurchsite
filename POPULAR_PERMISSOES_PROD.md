# Como Popular Permissões de Menu em Produção

## Opção 1: Via API (Mais Fácil - Recomendado para Resolução Imediata)

Você pode executar o comando através de uma chamada HTTP à API:

### Passo 1: Fazer Login e Obter Token

1. Acesse `https://champions.kbosolucoes.com.br/admin/login`
2. Faça login com suas credenciais de admin
3. Abra o Console do Navegador (F12 → Console)
4. Execute o seguinte código JavaScript:

```javascript
// Obter token do localStorage
const token = localStorage.getItem('token');
console.log('Token:', token);
```

### Passo 2: Chamar o Endpoint

No console do navegador ou usando uma ferramenta como Postman/Insomnia:

```javascript
fetch('https://champions.kbosolucoes.com.br/api/admin/popular-permissoes/', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => {
  console.log('Resultado:', data);
  if (data.sucesso) {
    alert(`Permissões populadas! Criadas: ${data.criadas}, Atualizadas: ${data.atualizadas}`);
  } else {
    alert('Erro: ' + data.erro);
  }
})
.catch(error => console.error('Erro:', error));
```

**Ou usando curl (se tiver acesso ao servidor):**

```bash
curl -X POST https://champions.kbosolucoes.com.br/api/admin/popular-permissoes/ \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -H "Content-Type: application/json"
```

## Opção 2: Execução Automática no Deploy (Recomendado para Futuro)

O comando `popular_permissoes_menu` agora é executado automaticamente quando o container do backend inicia, através do `entrypoint.sh`. Isso garante que as permissões sempre estarão disponíveis após cada deploy.

## Opção 3: Execução Manual no Coolify

Se precisar executar manualmente no ambiente de produção (Coolify):

### Passo 1: Acessar o Terminal do Container no Coolify

1. Acesse o **Coolify**
2. Vá para o seu projeto
3. Clique na aplicação **Backend**
4. Vá para a aba **"Terminal"**
5. **IMPORTANTE**: Certifique-se de que está conectado ao **container correto** (não ao host)
   - Se houver um dropdown "Container", selecione o container do backend
   - Clique em **"Connect"** se necessário

### Passo 2: Verificar o Ambiente

Antes de executar, verifique se está no diretório correto e se o Django está disponível:

```bash
cd /app
python --version
python -c "import django; print(django.get_version())"
```

Se o segundo comando falhar com "No module named 'django'", você não está dentro do container correto.

### Passo 3: Executar o Comando

Dentro do container, execute:

```bash
cd /app
python manage.py popular_permissoes_menu
```

**Alternativa**: Se o terminal do Coolify não estiver funcionando corretamente, você pode usar o comando via Docker diretamente (se tiver acesso SSH ao servidor):

```bash
# Listar containers do backend
docker ps | grep backend

# Executar o comando no container
docker exec -it <container_id> python manage.py popular_permissoes_menu
```

### Resultado Esperado

Você deve ver uma saída similar a:

```
[OK] Criada permissao: Dashboard (dashboard)
[OK] Criada permissao: Eventos (eventos)
[OK] Criada permissao: Membros (membros)
...
[CONCLUIDO] Processo concluido! Criadas: 11, Atualizadas: 0
```

## Opção 4: Execução Manual via Docker (se aplicável)

Se você tem acesso SSH ao servidor e está usando Docker diretamente:

```bash
# Encontrar o container do backend
docker ps | grep backend

# Executar o comando no container
docker exec <container_id> python manage.py popular_permissoes_menu
```

Ou se estiver usando Docker Compose:

```bash
docker-compose exec backend python manage.py popular_permissoes_menu
```

## Verificação

Após executar o comando, você pode verificar se funcionou:

1. Acesse o sistema em produção
2. Vá para **Admin → Grupos → Novo Grupo**
3. Na seção **"Permissões de Menu"**, você deve ver a lista completa de permissões disponíveis:
   - Dashboard
   - Eventos
   - Membros
   - Inscrições
   - Cobranças
   - Check-in
   - Contatos
   - Categorias
   - Configurações
   - Usuários
   - Grupos

## Troubleshooting

### Erro: "ModuleNotFoundError: No module named 'django'"

Este erro indica que você não está executando o comando dentro do container Docker. No Coolify:

1. **Certifique-se de estar conectado ao container correto**:
   - No terminal do Coolify, verifique se há um dropdown "Container"
   - Selecione o container do backend (geralmente tem um nome como `s8sg0owog8804ckwcw04400s-...`)
   - Clique em "Connect" se necessário

2. **Verifique se está no diretório correto**:
   ```bash
   pwd  # Deve mostrar /app
   cd /app
   ```

3. **Teste se o Django está disponível**:
   ```bash
   python -c "import django; print(django.get_version())"
   ```
   Se isso funcionar, você está no ambiente correto.

4. **Se ainda não funcionar**, use o método alternativo via Docker:
   - Acesse o servidor via SSH (se tiver acesso)
   - Execute: `docker exec -it <container_id> python manage.py popular_permissoes_menu`

### Erro: "Command not found"
- Certifique-se de estar no diretório correto (`/app`)
- Verifique se o arquivo `popular_permissoes_menu.py` existe em `backend/eventos/management/commands/`

### Erro: "No module named 'eventos'"
- Certifique-se de que as migrações foram executadas
- Verifique se o ambiente está configurado corretamente
- Execute: `python manage.py migrate` primeiro

### Permissões não aparecem após executar
- Limpe o cache do navegador
- Verifique os logs do backend para erros
- Confirme que o banco de dados está acessível
- Recarregue a página do formulário de grupos
