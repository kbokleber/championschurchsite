import { Heart, Target, Eye, Users, BookOpen, Music, MapPin } from 'lucide-react'
import { useConfiguracao } from '../contexts/ConfiguracaoContext'
import { useMemo } from 'react'

function Sobre() {
  const { configuracao } = useConfiguracao()
  
  // Extrair src do iframe do código embed
  const mapaIframeSrc = useMemo(() => {
    if (!configuracao?.google_maps_embed) return null
    
    // Tentar extrair o src do iframe
    const match = configuracao.google_maps_embed.match(/src="([^"]+)"/)
    if (match && match[1]) {
      return match[1]
    }
    
    // Se não conseguir extrair, retornar o HTML completo para usar com dangerouslySetInnerHTML
    return null
  }, [configuracao?.google_maps_embed])
  const valores = [
    {
      icon: <BookOpen className="h-8 w-8" />,
      titulo: 'Palavra de Deus',
      descricao: 'A Bíblia é nossa única regra de fé e prática.',
    },
    {
      icon: <Heart className="h-8 w-8" />,
      titulo: 'Amor',
      descricao: 'Amar a Deus sobre todas as coisas e ao próximo como a nós mesmos.',
    },
    {
      icon: <Users className="h-8 w-8" />,
      titulo: 'Comunhão',
      descricao: 'Valorizamos os relacionamentos e a vida em comunidade.',
    },
    {
      icon: <Music className="h-8 w-8" />,
      titulo: 'Adoração',
      descricao: 'Adorar a Deus em espírito e em verdade é nosso propósito.',
    },
  ]

  const ministerios = [
    {
      nome: 'Ministério Infantil',
      descricao: 'Cuidando das crianças com amor e ensinando os princípios da Palavra de Deus.',
    },
    {
      nome: 'Ministério de Jovens',
      descricao: 'Discipulando a nova geração para impactar o mundo.',
    },
    {
      nome: 'Ministério de Casais',
      descricao: 'Fortalecendo famílias através de encontros e aconselhamento.',
    },
    {
      nome: 'Ministério de Louvor',
      descricao: 'Conduzindo a igreja na adoração a Deus através da música.',
    },
    {
      nome: 'Ministério de Intercessão',
      descricao: 'Orando pela igreja, pela cidade e pelas nações.',
    },
    {
      nome: 'Ministério de Ação Social',
      descricao: 'Servindo a comunidade com amor e compaixão.',
    },
  ]

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-church-navy to-primary-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-6">
            Sobre a Champions Church
          </h1>
          <p className="text-xl text-primary-100 max-w-3xl mx-auto">
            Uma igreja comprometida com a transformação de vidas através do amor de Deus.
            Conheça nossa história, missão e valores.
          </p>
        </div>
      </section>

      {/* History Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="section-title">Nossa História</h2>
              <div className="space-y-4 text-gray-700 leading-relaxed">
                <p>
                  A Champions Church nasceu do sonho de criar uma igreja onde pessoas de todas 
                  as idades e origens pudessem encontrar um lar espiritual acolhedor e 
                  transformador.
                </p>
                <p>
                  Fundada por um grupo de cristãos comprometidos com o evangelho, nossa igreja 
                  tem crescido em número e em amor ao longo dos anos, sempre mantendo o foco 
                  na Palavra de Deus e no serviço ao próximo.
                </p>
                <p>
                  Hoje, somos uma comunidade vibrante que busca impactar nossa cidade e o 
                  mundo através do amor de Cristo, desenvolvendo discípulos que fazem a 
                  diferença onde quer que estejam.
                </p>
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl p-8 shadow-lg">
                <img
                  src="https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=600"
                  alt="Igreja"
                  className="rounded-xl shadow-md w-full h-80 object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-20 bg-church-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mr-4">
                  <Target className="h-7 w-7 text-primary-600" />
                </div>
                <h3 className="text-2xl font-bold text-church-navy">Missão</h3>
              </div>
              <p className="text-gray-700 leading-relaxed">
                Levar pessoas a conhecer Jesus Cristo, desenvolvê-las como discípulos e 
                capacitá-las para servir, a fim de glorificar a Deus e impactar o mundo.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-8">
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 bg-church-gold/20 rounded-full flex items-center justify-center mr-4">
                  <Eye className="h-7 w-7 text-church-gold" />
                </div>
                <h3 className="text-2xl font-bold text-church-navy">Visão</h3>
              </div>
              <p className="text-gray-700 leading-relaxed">
                Ser uma igreja relevante que transforma vidas, famílias e comunidades 
                através do poder do Evangelho, formando uma geração de campeões para Cristo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="section-title">Nossos Valores</h2>
            <p className="section-subtitle">
              Princípios que guiam nossa caminhada como igreja.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {valores.map((valor, index) => (
              <div
                key={index}
                className="bg-gray-50 p-6 rounded-xl text-center hover:shadow-lg transition-shadow"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 text-primary-600 mb-4">
                  {valor.icon}
                </div>
                <h3 className="text-lg font-bold text-church-navy mb-2">
                  {valor.titulo}
                </h3>
                <p className="text-gray-600">{valor.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ministries */}
      <section className="py-20 bg-church-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="section-title">Nossos Ministérios</h2>
            <p className="section-subtitle">
              Conheça os ministérios que atuam em nossa igreja.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ministerios.map((ministerio, index) => (
              <div
                key={index}
                className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow"
              >
                <h3 className="text-lg font-bold text-church-navy mb-2">
                  {ministerio.nome}
                </h3>
                <p className="text-gray-600">{ministerio.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como Chegar */}
      {configuracao?.google_maps_embed && (
        <section id="como-chegar" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 text-primary-600 mb-4">
                <MapPin className="h-8 w-8" />
              </div>
              <h2 className="section-title">Como Chegar</h2>
              <p className="section-subtitle">
                Venha nos visitar! Estamos esperando por você.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              {/* Informações de Endereço */}
              {(configuracao.endereco || configuracao.cidade || configuracao.estado) && (
                <div className="bg-church-cream p-6 border-b border-gray-200">
                  <div className="max-w-2xl mx-auto">
                    <h3 className="text-lg font-bold text-church-navy mb-4">Endereço</h3>
                    <div className="space-y-2 text-gray-700">
                      {configuracao.endereco && (
                        <p className="flex items-start">
                          <span className="font-semibold mr-2">Endereço:</span>
                          {configuracao.endereco}
                        </p>
                      )}
                      {(configuracao.cidade || configuracao.estado) && (
                        <p className="flex items-start">
                          <span className="font-semibold mr-2">Cidade:</span>
                          {configuracao.cidade && `${configuracao.cidade}`}
                          {configuracao.estado && ` - ${configuracao.estado}`}
                        </p>
                      )}
                      {configuracao.cep && (
                        <p className="flex items-start">
                          <span className="font-semibold mr-2">CEP:</span>
                          {configuracao.cep}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Mapa do Google Maps */}
              <div className="w-full overflow-hidden" style={{ minHeight: '450px' }}>
                {mapaIframeSrc ? (
                  <iframe
                    src={mapaIframeSrc}
                    width="100%"
                    height="450"
                    style={{ border: 0, display: 'block' }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Localização Champions Church"
                  />
                ) : (
                  <div 
                    className="w-full"
                    style={{ minHeight: '450px' }}
                    dangerouslySetInnerHTML={{ __html: configuracao.google_maps_embed }}
                  />
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-primary-600 to-primary-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-white mb-6">
            Venha fazer parte desta família!
          </h2>
          <p className="text-xl text-primary-100 mb-8">
            Estamos esperando por você. Visite-nos neste domingo!
          </p>
          <a
            href="/contato"
            className="btn-secondary inline-block"
          >
            Entre em Contato
          </a>
        </div>
      </section>
    </div>
  )
}

export default Sobre
