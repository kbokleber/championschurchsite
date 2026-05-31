import { Routes, Route, Navigate } from 'react-router-dom'
import ScrollToTop from './components/ScrollToTop'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/AuthContext'
import { ParticipanteProvider } from './contexts/ParticipanteContext'
import { ConfiguracaoProvider } from './contexts/ConfiguracaoContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ProtectedRoute from './components/ProtectedRoute'
import PermissionRoute from './components/PermissionRoute'
import AdminLayout from './components/AdminLayout'
import LoadingSpinner from './components/LoadingSpinner'
import EnvironmentBadge from './components/EnvironmentBadge'

// Páginas públicas
import Home from './pages/Home'
import Eventos from './pages/Eventos'
import EventoDetalhe from './pages/EventoDetalhe'
import Sobre from './pages/Sobre'
import Contato from './pages/Contato'
import MeusIngressos from './pages/MeusIngressos'
import PagamentoPix from './pages/PagamentoPix'
import ReciboLoja from './pages/ReciboLoja'

// Páginas admin
import Login from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import AdminEventos from './pages/admin/AdminEventos'
import EventoForm from './pages/admin/EventoForm'
import AdminMembros from './pages/admin/AdminMembros'
import MembroForm from './pages/admin/MembroForm'
import AdminInscricoes from './pages/admin/AdminInscricoes'
import AdminContatos from './pages/admin/AdminContatos'
import AdminConfiguracoes from './pages/admin/AdminConfiguracoes'
import AdminCategorias from './pages/admin/AdminCategorias'
import AdminCobrancas from './pages/admin/AdminCobrancas'
import Checkin from './pages/admin/Checkin'
import AdminUsuarios from './pages/admin/AdminUsuarios'
import AdminGrupos from './pages/admin/AdminGrupos'
import AdminFormularios from './pages/admin/AdminFormularios'
import FormularioForm from './pages/admin/FormularioForm'
import AdminLojaHub from './pages/admin/AdminLojaHub'
import AdminLojaProdutos from './pages/admin/AdminLojaProdutos'
import AdminLojaPDV from './pages/admin/AdminLojaPDV'
import AdminLojaVendas from './pages/admin/AdminLojaVendas'
import AdminLojaPagamento from './pages/admin/AdminLojaPagamento'
import AdminLojaReservas from './pages/admin/AdminLojaReservas'
import AdminLojaAuditoria from './pages/admin/AdminLojaAuditoria'
import AdminLojaFinanceiro from './pages/admin/AdminLojaFinanceiro'
import AdminBackupImport from './pages/admin/AdminBackupImport'
import AdminRoadmap from './pages/admin/AdminRoadmap'
import SuperuserRoute from './components/SuperuserRoute'

const MENU_HOME_PATH = {
  dashboard: '/admin',
  eventos: '/admin/eventos',
  membros: '/admin/membros',
  inscricoes: '/admin/inscricoes',
  cobrancas: '/admin/cobrancas',
  checkin: '/admin/checkin',
  contatos: '/admin/contatos',
  categorias: '/admin/categorias',
  configuracoes: '/admin/configuracoes',
  usuarios: '/admin/usuarios',
  grupos: '/admin/grupos',
  formularios_inscricao: '/admin/formularios',
  loja: '/admin/loja',
  backup_import: '/admin/backup-import',
}

function AdminHome() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/admin/login" replace />
  if (user.is_superuser) return <Dashboard />

  const menus = Array.isArray(user.menus_permitidos) ? user.menus_permitidos : []
  if (menus.includes('dashboard')) return <Dashboard />

  for (const codigo of menus) {
    const path = MENU_HOME_PATH[codigo]
    if (path && path !== '/admin') {
      return <Navigate to={path} replace />
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-8 max-w-md text-center mx-auto mt-10">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Acesso restrito</h2>
      <p className="text-gray-600">
        Seu usuário está autenticado, mas não possui menus liberados no grupo.
      </p>
    </div>
  )
}

function App() {
  return (
    <ConfiguracaoProvider>
    <AuthProvider>
      <ParticipanteProvider>
      <EnvironmentBadge />
      <ScrollToTop />
      <Routes>
        {/* Rotas Públicas */}
        <Route path="/" element={
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow"><Home /></main>
            <Footer />
          </div>
        } />
        <Route path="/eventos" element={
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow"><Eventos /></main>
            <Footer />
          </div>
        } />
        <Route path="/eventos/:id" element={
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow"><EventoDetalhe /></main>
            <Footer />
          </div>
        } />
        <Route path="/sobre" element={
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow"><Sobre /></main>
            <Footer />
          </div>
        } />
        <Route path="/contato" element={
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow"><Contato /></main>
            <Footer />
          </div>
        } />
        <Route path="/meus-ingressos" element={
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow"><MeusIngressos /></main>
            <Footer />
          </div>
        } />
        <Route path="/pagamento/:codigo" element={<PagamentoPix />} />
        <Route path="/recibo/:codigo" element={<ReciboLoja />} />

        {/* Rota de Login */}
        <Route path="/admin/login" element={<Login />} />

        {/* Rotas Protegidas (Admin) */}
        <Route path="/admin" element={
          <ProtectedRoute>
            <AdminLayout><AdminHome /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/eventos" element={
          <ProtectedRoute>
            <AdminLayout><AdminEventos /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/eventos/novo" element={
          <ProtectedRoute>
            <AdminLayout><EventoForm /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/eventos/:id" element={
          <ProtectedRoute>
            <AdminLayout><EventoForm /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/membros" element={
          <ProtectedRoute>
            <AdminLayout><AdminMembros /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/membros/novo" element={
          <ProtectedRoute>
            <AdminLayout><MembroForm /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/membros/:id" element={
          <ProtectedRoute>
            <AdminLayout><MembroForm /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/inscricoes" element={
          <ProtectedRoute>
            <AdminLayout><AdminInscricoes /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/contatos" element={
          <ProtectedRoute>
            <AdminLayout><AdminContatos /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/checkin" element={
          <ProtectedRoute>
            <AdminLayout><Checkin /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/configuracoes" element={
          <ProtectedRoute>
            <AdminLayout><AdminConfiguracoes /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/categorias" element={
          <ProtectedRoute>
            <AdminLayout><AdminCategorias /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/cobrancas" element={
          <ProtectedRoute>
            <AdminLayout><AdminCobrancas /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/usuarios" element={
          <ProtectedRoute>
            <AdminLayout><AdminUsuarios /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/grupos" element={
          <ProtectedRoute>
            <AdminLayout><AdminGrupos /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/formularios" element={
          <ProtectedRoute>
            <AdminLayout><AdminFormularios /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/formularios/novo" element={
          <ProtectedRoute>
            <AdminLayout><FormularioForm /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/formularios/:id" element={
          <ProtectedRoute>
            <AdminLayout><FormularioForm /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/loja" element={
          <ProtectedRoute>
            <AdminLayout><AdminLojaHub /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/loja/produtos" element={
          <ProtectedRoute>
            <Navigate to="/admin/loja/cantina/produtos" replace />
          </ProtectedRoute>
        } />
        <Route path="/admin/loja/nova-venda" element={
          <ProtectedRoute>
            <Navigate to="/admin/loja/cantina/nova-venda" replace />
          </ProtectedRoute>
        } />
        <Route path="/admin/loja/cantina" element={
          <ProtectedRoute>
            <Navigate to="/admin/loja/cantina/produtos" replace />
          </ProtectedRoute>
        } />
        <Route path="/admin/loja/loja" element={
          <ProtectedRoute>
            <Navigate to="/admin/loja/loja/produtos" replace />
          </ProtectedRoute>
        } />
        <Route path="/admin/loja/:area/produtos" element={
          <ProtectedRoute>
            <AdminLayout><AdminLojaProdutos /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/loja/:area/nova-venda" element={
          <ProtectedRoute>
            <AdminLayout><AdminLojaPDV /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/loja/:area/reservas" element={
          <ProtectedRoute>
            <AdminLayout><AdminLojaReservas /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/loja/vendas" element={
          <ProtectedRoute>
            <AdminLayout><AdminLojaVendas /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/loja/financeiro" element={
          <ProtectedRoute>
            <AdminLayout><AdminLojaFinanceiro /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/loja/auditoria" element={
          <ProtectedRoute>
            <AdminLayout><AdminLojaAuditoria /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/loja/pagamento/:cobrancaLojaId" element={
          <ProtectedRoute>
            <AdminLayout><AdminLojaPagamento /></AdminLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/backup-import" element={
          <ProtectedRoute>
            <PermissionRoute permission="backup_import">
              <AdminLayout><AdminBackupImport /></AdminLayout>
            </PermissionRoute>
          </ProtectedRoute>
        } />
        <Route path="/admin/roadmap" element={
          <ProtectedRoute>
            <SuperuserRoute>
              <AdminLayout><AdminRoadmap /></AdminLayout>
            </SuperuserRoute>
          </ProtectedRoute>
        } />
      </Routes>
      </ParticipanteProvider>
    </AuthProvider>
    </ConfiguracaoProvider>
  )
}

export default App
