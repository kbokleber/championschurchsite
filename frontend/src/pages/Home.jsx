import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Users, Heart, BookOpen, ArrowRight } from 'lucide-react'
import EventCard from '../components/EventCard'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../services/api'
import { useConfiguracao } from '../contexts/ConfiguracaoContext'

function Home() {
  const { configuracao, getImageUrl } = useConfiguracao()
  const temBanner = configuracao?.imagem_banner && String(configuracao.imagem_banner).trim() !== ''
  const bannerUrl = temBanner ? getImageUrl(configuracao.imagem_banner) : null
  const [eventosDestaque, setEventosDestaque] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchEventos = async () => {
      try {
        const response = await api.get('/eventos/destaques/')
        const data = response.data
        setEventosDestaque(Array.isArray(data) ? data.slice(0, 3) : [])
      } catch (error) {
        console.error('Erro ao carregar eventos:', error)
        setEventosDestaque([])
      } finally {
        setLoading(false)
      }
    }

    fetchEventos()
  }, [])

  const features = [
    {
      icon: <BookOpen className="h-8 w-8" />,
      title: 'Palavra de Deus',
      description: 'Ensino bíblico relevante para sua vida diária.',
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: 'Comunidade',
      description: 'Uma família acolhedora para todas as idades.',
    },
    {
      icon: <Heart className="h-8 w-8" />,
      title: 'Amor em Ação',
      description: 'Servindo nossa comunidade com compaixão.',
    },
    {
      icon: <Calendar className="h-8 w-8" />,
      title: 'Eventos',
      description: 'Programação especial durante todo o ano.',
    },
  ]

  return (
    <div>
      {/* Hero Section: fundo com imagem do banner ou gradiente azul */}
      <section
        className={`relative min-h-[600px] flex items-center ${bannerUrl ? 'bg-cover bg-center bg-no-repeat' : 'bg-gradient-to-br from-church-navy via-primary-900 to-church-navy'}`}
        style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
      >
        <div className={`absolute inset-0 ${bannerUrl ? 'bg-black/50' : 'bg-black/30'}`}></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-white mb-6">
            Bem-vindo à{' '}
            <span className="text-church-gold">{configuracao?.nome_igreja || 'Champions Church'}</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-200 mb-10 max-w-3xl mx-auto">
            Uma igreja para toda a família. Venha viver experiências 
            transformadoras com Deus e fazer parte da nossa comunidade.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/eventos" className="btn-secondary inline-flex items-center justify-center">
              Ver Eventos
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link to="/sobre" className="btn-outline border-white text-white hover:bg-white hover:text-church-navy">
              Conheça-nos
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-church-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="section-title">Por que nos escolher?</h2>
            <p className="section-subtitle">
              Somos uma igreja comprometida com a transformação de vidas através do amor de Deus.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow text-center"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 text-primary-600 mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold text-church-navy mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Events Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="section-title">Próximos Eventos</h2>
            <p className="section-subtitle">
              Confira nossa programação e participe dos nossos eventos especiais.
            </p>
          </div>

          {loading ? (
            <LoadingSpinner text="Carregando eventos..." />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {eventosDestaque.map((evento) => (
                  <EventCard key={evento.id} evento={evento} />
                ))}
              </div>

              <div className="text-center mt-10">
                <Link to="/eventos" className="btn-primary inline-flex items-center">
                  Ver Todos os Eventos
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* CTA Section - cor fixa #111111 */}
      <section className="py-20" style={{ backgroundColor: '#111111' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-white mb-6">
            Venha nos visitar!
          </h2>
          <p className="text-xl text-primary-100 mb-8">
            Estamos de braços abertos para recebê-lo. Venha conhecer nossa igreja
            e fazer parte desta família.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/contato" className="btn-secondary">
              Entre em Contato
            </Link>
            <Link
              to="/sobre#como-chegar"
              className="btn-outline border-white text-white hover:bg-white hover:text-primary-700"
            >
              Como Chegar
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
