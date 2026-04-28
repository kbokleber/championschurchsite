import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, Calendar, Users, Heart, BookOpen } from 'lucide-react'
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
  const [slideAtual, setSlideAtual] = useState(0)

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
      title: 'CONECTION:',
      description:
        'O momento de conexão com nossos pastores, para todos aqueles que desejam se conectar com nossa igreja como membro, caminhar conosco e conhecer a nossa história.',
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: 'DIRECTION:',
      description:
        'O mesmo que direção, é o nosso momento de estudo da palavra. Onde recebemos ensinamentos e direcionamos de acordo com a palavra do senhor.',
    },
    {
      icon: <Heart className="h-8 w-8" />,
      title: 'DEEPER:',
      description:
        'Deeper significa mais fundo, é onde entramos na história e mergulhamos mais fundo nas escrituras.',
    },
    {
      icon: <Calendar className="h-8 w-8" />,
      title: 'CÉLULA – Partir do pão:',
      description:
        'É onde a fé se torna prática, onde vidas se conectam e o pão é repartido, assim como o amor de Cristo.',
    },
  ]
  const slides = Array.isArray(configuracao?.destaques_home) && configuracao.destaques_home.length > 0
    ? configuracao.destaques_home
    : features

  useEffect(() => {
    if (slides.length <= 1) return undefined
    const timer = setInterval(() => {
      setSlideAtual(prev => (prev + 1) % slides.length)
    }, 10000)
    return () => clearInterval(timer)
  }, [slides.length])

  useEffect(() => {
    if (slideAtual >= slides.length) {
      setSlideAtual(0)
    }
  }, [slides.length, slideAtual])

  const avancarSlide = () => {
    if (slides.length <= 1) return
    setSlideAtual(prev => (prev + 1) % slides.length)
  }

  const voltarSlide = () => {
    if (slides.length <= 1) return
    setSlideAtual(prev => (prev - 1 + slides.length) % slides.length)
  }

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
            {configuracao?.slogan || 'Uma igreja para toda a família. Venha viver experiências transformadoras com Deus e fazer parte da nossa comunidade.'}
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
            <h2 className="section-title">NOSSO ALVO: JESUS</h2>
            <p className="section-subtitle">
              NOSSO CHAMADO: Adorar, disciplinar e Compartilhar
            </p>
          </div>

          <div className="relative">
            <div className="max-w-4xl mx-auto">
              {slides.map((slide, index) => {
                const imagemSlide = slide?.imagem ? getImageUrl(slide.imagem) : null
                return (
                  <div
                    key={`${slide?.id ?? index}-${index}`}
                    className={`${index === slideAtual ? 'block' : 'hidden'}`}
                  >
                    <div className="bg-white p-8 rounded-xl shadow-md text-center min-h-[360px] flex flex-col items-center justify-start">
                      {imagemSlide ? (
                        <img
                          src={imagemSlide}
                          alt={slide?.titulo || `Slide ${index + 1}`}
                          className="w-full max-w-[340px] h-[500px] rounded-2xl object-cover mb-6 border border-primary-100 shadow-sm"
                        />
                      ) : (
                        <div className="w-full max-w-[340px] h-[500px] rounded-2xl bg-primary-100 text-primary-600 mb-6 text-xs font-semibold flex items-center justify-center border border-primary-100">
                          Sem imagem
                        </div>
                      )}
                      <h3 className="text-2xl font-bold text-church-navy mb-3">
                        {slide?.title || slide?.titulo}
                      </h3>
                      <p className="text-gray-600 text-lg whitespace-pre-line">
                        {slide?.description || slide?.descricao}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {slides.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={voltarSlide}
                  className="absolute left-0 md:-left-6 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-full p-2 shadow hover:bg-gray-50"
                  aria-label="Slide anterior"
                >
                  <ChevronLeft className="h-5 w-5 text-church-navy" />
                </button>
                <button
                  type="button"
                  onClick={avancarSlide}
                  className="absolute right-0 md:-right-6 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-full p-2 shadow hover:bg-gray-50"
                  aria-label="Próximo slide"
                >
                  <ChevronRight className="h-5 w-5 text-church-navy" />
                </button>
              </>
            )}
          </div>

          <div className="flex justify-center mt-6 gap-2">
            {slides.map((_, index) => (
              <button
                key={`dot-${index}`}
                type="button"
                onClick={() => setSlideAtual(index)}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${index === slideAtual ? 'bg-primary-600' : 'bg-gray-300 hover:bg-gray-400'}`}
                aria-label={`Ir para slide ${index + 1}`}
              />
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
