import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ParticipanteProvider } from './contexts/ParticipanteContext'
import { ConfiguracaoProvider } from './contexts/ConfiguracaoContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ProtectedRoute from './components/ProtectedRoute'
import AdminLayout from './components/AdminLayout'

// Páginas públicas
import Home from './pages/Home'
import Eventos from './pages/Eventos'
import EventoDetalhe from './pages/EventoDetalhe'
import Sobre from './pages/Sobre'
import Contato from './pages/Contato'
import MeusIngressos from './pages/MeusIngressos'
import PagamentoPix from './pages/PagamentoPix'

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

function App() {
  return (
    <ConfiguracaoProvider>
    <AuthProvider>
      <ParticipanteProvider>
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
        <Route path="/pagamento/:cobrancaId" element={<PagamentoPix />} />

        {/* Rota de Login */}
        <Route path="/admin/login" element={<Login />} />

        {/* Rotas Protegidas (Admin) */}
        <Route path="/admin" element={
          <ProtectedRoute>
            <AdminLayout><Dashboard /></AdminLayout>
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
      </Routes>
      </ParticipanteProvider>
    </AuthProvider>
    </ConfiguracaoProvider>
  )
}

export default App
