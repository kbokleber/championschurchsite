import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, Church, Ticket } from 'lucide-react'

function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()

  const navLinks = [
    { path: '/', label: 'Início' },
    { path: '/eventos', label: 'Eventos' },
    { path: '/meus-ingressos', label: 'Meus Ingressos', icon: true },
    { path: '/sobre', label: 'Sobre' },
    { path: '/contato', label: 'Contato' },
  ]

  const isActive = (path) => location.pathname === path

  return (
    <nav className="bg-church-navy shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-3">
              <Church className="h-10 w-10 text-church-gold" />
              <div>
                <span className="text-2xl font-serif font-bold text-white">Champions</span>
                <span className="text-2xl font-serif font-bold text-church-gold"> Church</span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`font-medium transition-colors duration-200 flex items-center ${
                  isActive(link.path)
                    ? 'text-church-gold'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                {link.icon && <Ticket className="h-4 w-4 mr-1" />}
                {link.label}
              </Link>
            ))}
            <Link to="/contato" className="btn-secondary text-sm py-2 px-4">
              Fale Conosco
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-300 hover:text-white p-2"
              aria-label="Menu"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden bg-church-navy border-t border-gray-700">
          <div className="px-4 pt-2 pb-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center py-3 px-4 rounded-lg font-medium transition-colors duration-200 ${
                  isActive(link.path)
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {link.icon && <Ticket className="h-4 w-4 mr-2" />}
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navbar
