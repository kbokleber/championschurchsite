import { Link } from 'react-router-dom'
import { Church, MapPin, Phone, Mail, Clock, Facebook, Instagram, Youtube } from 'lucide-react'
import { useConfiguracao } from '../contexts/ConfiguracaoContext'

function Footer() {
  const { configuracao, getImageUrl } = useConfiguracao()

  // Função para formatar endereço completo
  const formatarEndereco = () => {
    if (!configuracao) return null
    const partes = []
    if (configuracao.endereco) partes.push(configuracao.endereco)
    if (configuracao.cidade && configuracao.estado) {
      partes.push(`${configuracao.cidade}/${configuracao.estado}`)
    } else if (configuracao.cidade) {
      partes.push(configuracao.cidade)
    }
    return partes.length > 0 ? partes.join(' - ') : null
  }

  // Função para formatar horários
  const formatarHorarios = () => {
    if (!configuracao?.horarios) return []
    return configuracao.horarios.split('\n').filter(h => h.trim())
  }

  const endereco = formatarEndereco()
  const horarios = formatarHorarios()
  const corRodape = configuracao?.cor_rodape && /^#[0-9A-Fa-f]{6}$/.test(configuracao.cor_rodape)
    ? configuracao.cor_rodape
    : '#1a365d'

  return (
    <footer className="text-gray-300" style={{ backgroundColor: corRodape }}>
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <div className="flex items-center mb-4">
              {(configuracao?.logo_branco && String(configuracao.logo_branco).trim() !== '') ? (
                <img 
                  src={getImageUrl(configuracao.logo_branco)} 
                  alt={configuracao?.nome_igreja || 'Logo'}
                  className="h-12 w-auto bg-transparent object-contain"
                  style={{ background: 'transparent' }}
                />
              ) : (configuracao?.logo && String(configuracao.logo).trim() !== '') ? (
                <img 
                  src={getImageUrl(configuracao.logo)} 
                  alt={configuracao?.nome_igreja || 'Logo'}
                  className="h-12 w-auto bg-transparent object-contain"
                  style={{ background: 'transparent' }}
                />
              ) : (
                <Church className="h-10 w-10 text-church-gold" />
              )}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {configuracao?.descricao 
                ? configuracao.descricao.replace(/\\n/g, '\n')
                : 'Uma igreja para toda a família. Venha nos conhecer e fazer parte da nossa comunidade de fé, amor e esperança.'}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Links Rápidos</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="hover:text-church-gold transition-colors">Início</Link>
              </li>
              <li>
                <Link to="/eventos" className="hover:text-church-gold transition-colors">Eventos</Link>
              </li>
              <li>
                <Link to="/sobre" className="hover:text-church-gold transition-colors">Sobre Nós</Link>
              </li>
              <li>
                <Link to="/contato" className="hover:text-church-gold transition-colors">Contato</Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Contato</h3>
            <ul className="space-y-3">
              {endereco && (
                <li className="flex items-start space-x-3">
                  <MapPin className="h-5 w-5 text-church-gold flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{endereco}</span>
                </li>
              )}
              {configuracao?.telefone && (
                <li className="flex items-center space-x-3">
                  <Phone className="h-5 w-5 text-church-gold flex-shrink-0" />
                  <a 
                    href={`tel:${configuracao.telefone.replace(/\D/g, '')}`}
                    className="text-sm hover:text-church-gold transition-colors"
                  >
                    {configuracao.telefone}
                  </a>
                </li>
              )}
              {configuracao?.email && (
                <li className="flex items-center space-x-3">
                  <Mail className="h-5 w-5 text-church-gold flex-shrink-0" />
                  <a 
                    href={`mailto:${configuracao.email}`}
                    className="text-sm hover:text-church-gold transition-colors"
                  >
                    {configuracao.email}
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Schedule */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Horários</h3>
            <ul className="space-y-3">
              {horarios.length > 0 ? (
                horarios.map((horario, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <Clock className="h-5 w-5 text-church-gold flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{horario}</span>
                  </li>
                ))
              ) : (
                <>
                  <li className="flex items-start space-x-3">
                    <Clock className="h-5 w-5 text-church-gold flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-white">Domingos</p>
                      <p>9h e 18h - Cultos</p>
                    </div>
                  </li>
                  <li className="flex items-start space-x-3">
                    <Clock className="h-5 w-5 text-church-gold flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-white">Quartas</p>
                      <p>19h30 - Estudo Bíblico</p>
                    </div>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="border-t border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-sm">
              © {new Date().getFullYear()} {configuracao?.nome_igreja || 'Champions Church'}. Todos os direitos reservados.
            </p>
            
            {/* Social Links */}
            <div className="flex space-x-4">
              {configuracao?.facebook && (
                <a
                  href={configuracao.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center hover:bg-church-gold transition-colors"
                  aria-label="Facebook"
                >
                  <Facebook className="h-5 w-5" />
                </a>
              )}
              {configuracao?.instagram && (
                <a
                  href={configuracao.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center hover:bg-church-gold transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="h-5 w-5" />
                </a>
              )}
              {configuracao?.youtube && (
                <a
                  href={configuracao.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center hover:bg-church-gold transition-colors"
                  aria-label="YouTube"
                >
                  <Youtube className="h-5 w-5" />
                </a>
              )}
              {/* Mostrar ícones padrão se não houver redes configuradas */}
              {!configuracao?.facebook && !configuracao?.instagram && !configuracao?.youtube && (
                <>
                  <a
                    href="#"
                    className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center hover:bg-church-gold transition-colors"
                    aria-label="Facebook"
                  >
                    <Facebook className="h-5 w-5" />
                  </a>
                  <a
                    href="#"
                    className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center hover:bg-church-gold transition-colors"
                    aria-label="Instagram"
                  >
                    <Instagram className="h-5 w-5" />
                  </a>
                  <a
                    href="#"
                    className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center hover:bg-church-gold transition-colors"
                    aria-label="YouTube"
                  >
                    <Youtube className="h-5 w-5" />
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
