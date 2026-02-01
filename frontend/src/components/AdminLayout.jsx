import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  Church, LayoutDashboard, Calendar, Users, 
  FileText, Mail, LogOut, Menu, X, ChevronDown,
  Home, QrCode, Settings, Tags, DollarSign
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const menuItems = [
    { path: '/admin', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
    { path: '/admin/eventos', label: 'Eventos', icon: <Calendar className="h-5 w-5" /> },
    { path: '/admin/membros', label: 'Membros', icon: <Users className="h-5 w-5" /> },
    { path: '/admin/inscricoes', label: 'Inscrições', icon: <FileText className="h-5 w-5" /> },
    { path: '/admin/cobrancas', label: 'Cobranças', icon: <DollarSign className="h-5 w-5" /> },
    { path: '/admin/checkin', label: 'Check-in', icon: <QrCode className="h-5 w-5" /> },
    { path: '/admin/contatos', label: 'Contatos', icon: <Mail className="h-5 w-5" /> },
    { path: '/admin/categorias', label: 'Categorias', icon: <Tags className="h-5 w-5" /> },
    { path: '/admin/configuracoes', label: 'Configurações', icon: <Settings className="h-5 w-5" /> },
  ]

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
      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-church-navy transform transition-transform duration-300 lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-700">
          <Link to="/admin" className="flex items-center space-x-2">
            <Church className="h-8 w-8 text-church-gold" />
            <span className="text-lg font-serif font-bold text-white">Champions</span>
          </Link>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive(item.path)
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
          <Link
            to="/"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors mb-2"
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
