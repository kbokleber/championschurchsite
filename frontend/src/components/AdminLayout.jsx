import { useState, useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  Church, LayoutDashboard, Calendar, Users, 
  FileText, Mail, LogOut, Menu, X, ChevronDown,
  Home, QrCode, Settings, Tags, DollarSign, Shield
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useConfiguracao } from '../contexts/ConfiguracaoContext'
import api from '../services/api'

// Mapeamento de códigos de menu para paths (fora do componente para evitar recriação)
const MENU_MAPPING = {
  'dashboard': { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  'eventos': { path: '/admin/eventos', label: 'Eventos', icon: Calendar },
  'membros': { path: '/admin/membros', label: 'Membros', icon: Users },
  'inscricoes': { path: '/admin/inscricoes', label: 'Inscrições', icon: FileText },
  'cobrancas': { path: '/admin/cobrancas', label: 'Cobranças', icon: DollarSign },
  'checkin': { path: '/admin/checkin', label: 'Check-in', icon: QrCode },
  'contatos': { path: '/admin/contatos', label: 'Contatos', icon: Mail },
  'categorias': { path: '/admin/categorias', label: 'Categorias', icon: Tags },
  'configuracoes': { path: '/admin/configuracoes', label: 'Configurações', icon: Settings },
  'usuarios': { path: '/admin/usuarios', label: 'Usuários', icon: Shield },
  'grupos': { path: '/admin/grupos', label: 'Grupos', icon: Users },
}

function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()
  const { configuracao, getImageUrl } = useConfiguracao()
  const location = useLocation()
  const navigate = useNavigate()
  const [menusPermitidos, setMenusPermitidos] = useState([])

  const temLogoBranco = configuracao?.logo_branco && String(configuracao.logo_branco).trim() !== ''
  const temLogo = configuracao?.logo && String(configuracao.logo).trim() !== ''
  const logoUrl = temLogoBranco
    ? getImageUrl(configuracao.logo_branco)
    : temLogo
      ? getImageUrl(configuracao.logo)
      : null

  // Usar cor do header se for suficientemente clara (azul vibrante); senão usar primary-500
  const _corHeader = configuracao?.cor_header_pagina && /^#[0-9A-Fa-f]{6}$/.test(configuracao.cor_header_pagina)
    ? configuracao.cor_header_pagina
    : configuracao?.cor_header && /^#[0-9A-Fa-f]{6}$/.test(configuracao.cor_header)
      ? configuracao.cor_header
      : null
  const corMenuDestaque = _corHeader && (() => {
    const hex = _corHeader.slice(1)
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255
    return luminance > 0.2
  })() ? _corHeader : null

  useEffect(() => {
    // Carregar menus permitidos do usuário
    if (user) {
      if (user.is_superuser) {
        // Super usuário tem acesso a tudo
        setMenusPermitidos(Object.keys(MENU_MAPPING))
      } else if (user.menus_permitidos) {
        // Usuário comum: usar menus permitidos do backend
        setMenusPermitidos(user.menus_permitidos)
      } else {
        // Fallback: buscar do backend
        fetchMenusPermitidos()
      }
    }
  }, [user])

  const fetchMenusPermitidos = async () => {
    try {
      const response = await api.get('/auth/menus-permitidos/')
      setMenusPermitidos(response.data.codigos || [])
    } catch (error) {
      console.error('Erro ao carregar menus permitidos:', error)
      // Em caso de erro, mostrar todos os menus (fallback)
      setMenusPermitidos(Object.keys(MENU_MAPPING))
    }
  }

  // Filtrar menuItems baseado nas permissões
  const menuItems = useMemo(() => {
    return Object.entries(MENU_MAPPING)
      .filter(([codigo]) => menusPermitidos.includes(codigo))
      .map(([codigo, item]) => ({
        ...item,
        icon: <item.icon className="h-5 w-5" />
      }))
  }, [menusPermitidos])

  const isActive = (path) => {
    if (path === '/admin') {
      return location.pathname === '/admin'
    }
    return location.pathname.startsWith(path)
  }

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-church-navy transform transition-transform duration-300 lg:translate-x-0 flex flex-col ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo - usa o mesmo da tela de cadastros (configurações do site) - fundo preto para acompanhar o logo */}
        <div className="h-24 flex-shrink-0 flex items-center justify-center px-4 bg-black border-b border-gray-800 relative">
          <Link to="/admin" className="flex items-center justify-center w-full min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={configuracao?.nome_igreja || 'Champions Church'}
                className="h-16 max-h-[4.5rem] w-auto max-w-full object-contain"
              />
            ) : (
              <>
                <Church className="h-8 w-8 text-church-gold flex-shrink-0" />
                <span className="text-lg font-serif font-bold text-white ml-2">Champions</span>
              </>
            )}
          </Link>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Navigation - Scrollable */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1 min-h-0">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive(item.path)
                  ? corMenuDestaque ? 'text-white' : 'bg-primary-500 text-white'
                  : 'text-gray-300 hover:bg-gray-600'
              }`}
              style={isActive(item.path) && corMenuDestaque ? { backgroundColor: corMenuDestaque } : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Footer - Fixed at bottom */}
        <div className="flex-shrink-0 p-4 border-t border-gray-700 bg-church-navy">
          <Link
            to="/"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-600 rounded-lg transition-colors mb-2"
            onClick={() => setSidebarOpen(false)}
          >
            <Home className="h-5 w-5" />
            <span>Ver Site</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-red-600/20 hover:text-red-400 rounded-lg transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Top Bar */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-4 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-600 hover:text-gray-800"
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex-grow lg:flex-grow-0" />

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-medium text-church-navy">
                {user?.first_name || user?.username}
              </p>
              <p className="text-xs text-gray-500">Administrador</p>
            </div>
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-primary-600 font-bold">
                {(user?.first_name || user?.username || 'U')[0].toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
