# Como Adicionar Novos Menus ao Sistema

O sistema agora sincroniza automaticamente os menus entre o frontend e o backend. Quando você adicionar um novo menu, ele será automaticamente disponibilizado para seleção nos grupos de acesso.

## Passo 1: Adicionar Menu no Frontend

Edite o arquivo `frontend/src/components/AdminLayout.jsx` e adicione o novo menu ao objeto `MENU_MAPPING`:

```javascript
const MENU_MAPPING = {
  'dashboard': { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  'eventos': { path: '/admin/eventos', label: 'Eventos', icon: Calendar },
  // ... outros menus ...
  'novo-menu': { path: '/admin/novo-menu', label: 'Novo Menu', icon: IconeEscolhido },
}
```

**Importante**: 
- O `codigo` (chave do objeto) deve ser único e em minúsculas
- O `path` deve corresponder à rota definida no `App.jsx`
- O `icon` deve ser importado do `lucide-react`

## Passo 2: Adicionar Menu no Backend

Edite o arquivo `backend/eventos/models.py` e adicione o novo menu à lista `MENUS_DISPONIVEIS` na classe `PermissaoMenu`:

```python
MENUS_DISPONIVEIS = [
    {'codigo': 'dashboard', 'nome': 'Dashboard', 'ordem': 1, 'descricao': 'Painel principal com estatísticas'},
    {'codigo': 'eventos', 'nome': 'Eventos', 'ordem': 2, 'descricao': 'Gerenciar eventos da igreja'},
    # ... outros menus ...
    {'codigo': 'novo-menu', 'nome': 'Novo Menu', 'ordem': 12, 'descricao': 'Descrição do novo menu'},
]
```

**Importante**:
- O `codigo` deve ser **exatamente igual** ao usado no frontend
- O `nome` será exibido no formulário de grupos
- A `ordem` determina a posição na lista (menor = primeiro)
- A `descricao` é opcional mas recomendada

## Passo 3: Adicionar Rota no Frontend (se necessário)

Se o novo menu precisa de uma página, adicione a rota no `frontend/src/App.jsx`:

```javascript
<Route path="/admin/novo-menu" element={
  <ProtectedRoute>
    <AdminLayout>
      <NovaPagina />
    </AdminLayout>
  </ProtectedRoute>
} />
```

## Sincronização Automática

O sistema sincroniza automaticamente os menus quando:

1. **Startup do servidor**: Quando o container do backend inicia
2. **Listagem de grupos**: Quando você acessa a página de grupos
3. **Criação/edição de grupos**: Quando você cria ou edita um grupo
4. **Listagem de permissões**: Quando você acessa a lista de permissões
5. **Login do usuário**: Quando o sistema carrega os menus permitidos

**Você não precisa executar nenhum comando manualmente!** O sistema detecta automaticamente novos menus e os disponibiliza para seleção.

## Verificação

Após adicionar um novo menu:

1. Faça deploy das alterações
2. Acesse **Admin → Grupos → Novo Grupo** (ou edite um grupo existente)
3. Na seção **"Permissões de Menu"**, o novo menu deve aparecer automaticamente na lista

## Exemplo Completo

### Frontend (`AdminLayout.jsx`)

```javascript
import { FileCheck } from 'lucide-react' // Importar ícone

const MENU_MAPPING = {
  // ... menus existentes ...
  'relatorios': { 
    path: '/admin/relatorios', 
    label: 'Relatórios', 
    icon: FileCheck 
  },
}
```

### Backend (`models.py`)

```python
MENUS_DISPONIVEIS = [
    # ... menus existentes ...
    {'codigo': 'relatorios', 'nome': 'Relatórios', 'ordem': 12, 'descricao': 'Visualizar e gerar relatórios do sistema'},
]
```

### Rota (`App.jsx`)

```javascript
import Relatorios from './pages/admin/Relatorios'

<Route path="/admin/relatorios" element={
  <ProtectedRoute>
    <AdminLayout>
      <Relatorios />
    </AdminLayout>
  </ProtectedRoute>
} />
```

## Notas Importantes

- ⚠️ **Sempre mantenha o `codigo` idêntico** entre frontend e backend
- ⚠️ **A ordem importa**: Menus com ordem menor aparecem primeiro
- ✅ **Sincronização é automática**: Não precisa executar comandos
- ✅ **Menus inativos**: Você pode desativar um menu no banco sem removê-lo do código

## Troubleshooting

### Menu não aparece na lista de permissões

1. Verifique se o `codigo` está idêntico no frontend e backend
2. Verifique se o menu está na lista `MENUS_DISPONIVEIS`
3. Faça um refresh na página de grupos
4. Verifique os logs do backend para erros de sincronização

### Menu aparece mas não funciona

1. Verifique se a rota está definida no `App.jsx`
2. Verifique se o componente da página existe
3. Verifique se o usuário tem permissão para acessar o menu
