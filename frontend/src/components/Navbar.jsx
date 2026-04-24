import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, Church, Ticket } from 'lucide-react'
import { useConfiguracao } from '../contexts/ConfiguracaoContext'

function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()
  const { configuracao, getImageUrl } = useConfiguracao()
  
  const nomeIgreja = configuracao?.nome_igreja || 'Champions Church'
  // Só usar logo dinâmico se existir arquivo cadastrado (string não vazia)
  const temLogoBranco = configuracao?.logo_branco && String(configuracao.logo_branco).trim() !== ''
  const temLogo = configuracao?.logo && String(configuracao.logo).trim() !== ''
  const logoUrl = temLogoBranco
    ? getImageUrl(configuracao.logo_branco)
    : temLogo
      ? getImageUrl(configuracao.logo)
      : null

  const navLinks = [
    { path: '/', label: 'Início' },
    { path: '/sobre', label: 'Sobre' },
    { path: '/eventos', label: 'Eventos' },
    { path: '/meus-ingressos', label: 'Meus Ingressos', icon: true },
    { path: '/contato', label: 'Contato' },
  ]

  const isActive = (path) => location.pathname === path
  const corHeader = configuracao?.cor_header && /^#[0-9A-Fa-f]{6}$/.test(configuracao.cor_header)
    ? configuracao.cor_header
    : '#1a365d'

  return (
    <nav className="shadow-lg sticky top-0 z-50" style={{ backgroundColor: corHeader }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-24 min-h-[6rem]">
          {/* Logo: mesma cor do header atrás da imagem para transparência do PNG integrar */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              {logoUrl ? (
                <span className="inline-flex items-center rounded overflow-hidden" style={{ backgroundColor: corHeader }}>
                  <img
                    src={logoUrl}
                    alt={nomeIgreja}
                    className="h-16 sm:h-20 md:h-24 w-auto max-h-24 object-contain object-left flex-shrink-0"
                  />
                </span>
              ) : (
                <Church className="h-14 w-14 sm:h-16 sm:w-16 md:h-20 md:w-20 text-church-gold flex-shrink-0" />
              )}
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
        <div className="md:hidden border-t border-gray-700" style={{ backgroundColor: corHeader }}>
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
