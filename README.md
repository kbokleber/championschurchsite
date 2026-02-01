# Champions Church - Sistema de Gestão

Sistema web completo para gestão de igreja, incluindo gerenciamento de membros, eventos e inscrições.

## Tecnologias Utilizadas

### Backend
- **Django 4.2** - Framework web Python
- **Django REST Framework** - API REST
- **SQLite** (desenvolvimento) / PostgreSQL (produção)

### Frontend
- **React 18** - Biblioteca JavaScript
- **Vite** - Build tool
- **Tailwind CSS** - Framework CSS
- **React Router** - Roteamento
- **Axios** - Cliente HTTP
- **Lucide React** - Ícones

## Estrutura do Projeto

```
ChampionsChurch/
├── backend/                  # Backend Django
│   ├── champions_backend/    # Configurações do projeto
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── eventos/              # App principal
│   │   ├── models.py         # Membro, Evento, Inscrição
│   │   ├── views.py          # API Views
│   │   ├── serializers.py    # Serializers
│   │   ├── admin.py          # Admin customizado
│   │   └── urls.py
│   ├── manage.py
│   └── requirements.txt
├── frontend/                 # Frontend React
│   ├── src/
│   │   ├── components/       # Componentes reutilizáveis
│   │   ├── pages/            # Páginas
│   │   ├── services/         # Serviços (API)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── tailwind.config.js
├── static/                   # Arquivos estáticos
└── README.md
```

## Instalação

### Pré-requisitos
- Python 3.10+
- Node.js 18+
- npm ou yarn

### Backend

```bash
# Navegar para o diretório do backend
cd backend

# Criar ambiente virtual
python -m venv venv

# Ativar ambiente virtual (Windows)
venv\Scripts\activate

# Ativar ambiente virtual (Linux/Mac)
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Executar migrações
python manage.py migrate

# Criar superusuário
python manage.py createsuperuser

# Iniciar servidor de desenvolvimento
python manage.py runserver
```

O backend estará disponível em `http://localhost:8000`

### Frontend

```bash
# Navegar para o diretório do frontend
cd frontend

# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev
```

O frontend estará disponível em `http://localhost:5173`

## Funcionalidades

### Módulos Principais

#### 1. Gestão de Membros
- Cadastro completo de membros
- Status (ativo, inativo, visitante)
- Informações de contato
- Histórico de participação

#### 2. Gestão de Eventos
- Tipos: Culto, Conferência, Retiro, Encontro, Workshop, Célula
- Controle de vagas
- Eventos em destaque
- Inscrições online

#### 3. Inscrições
- Inscrição em eventos
- Controle de presença
- Lista de espera

#### 4. Contato
- Formulário de contato
- Gestão de mensagens

### API REST

| Endpoint | Métodos | Descrição |
|----------|---------|-----------|
| `/api/membros/` | GET, POST | Lista e cria membros |
| `/api/membros/{id}/` | GET, PUT, DELETE | Detalhe do membro |
| `/api/eventos/` | GET, POST | Lista e cria eventos |
| `/api/eventos/{id}/` | GET, PUT, DELETE | Detalhe do evento |
| `/api/eventos/proximos/` | GET | Próximos eventos |
| `/api/eventos/destaques/` | GET | Eventos em destaque |
| `/api/inscricoes/` | GET, POST | Lista e cria inscrições |
| `/api/contatos/` | GET, POST | Lista e cria contatos |

## Administração

Acesse o painel administrativo em `http://localhost:8000/admin/` com as credenciais do superusuário criado.

## Deploy

### Backend (Produção)
1. Configure variáveis de ambiente
2. Configure banco de dados PostgreSQL
3. Colete arquivos estáticos: `python manage.py collectstatic`
4. Configure servidor WSGI (Gunicorn)
5. Configure proxy reverso (Nginx)

### Frontend (Produção)
1. Build de produção: `npm run build`
2. Sirva os arquivos da pasta `dist/`

## Licença

Este projeto foi desenvolvido para a Champions Church.

## Suporte

Para suporte, entre em contato através do e-mail: contato@championschurch.com.br
