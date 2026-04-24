import { Heart, Target, Eye, Anchor, Users, BookOpen, Music, MapPin } from 'lucide-react'
import { useConfiguracao } from '../contexts/ConfiguracaoContext'
import { useMemo } from 'react'

function Sobre() {
  const { configuracao } = useConfiguracao()
  const corHeaderPagina = configuracao?.cor_header_pagina && /^#[0-9A-Fa-f]{6}$/.test(configuracao.cor_header_pagina) ? configuracao.cor_header_pagina : '#1a365d'
  
  // Extrair src e atributos do iframe do código embed
  const mapaIframeProps = useMemo(() => {
    if (!configuracao?.google_maps_embed) return null
    
    const embedCode = configuracao.google_maps_embed
    
    // Tentar extrair o src do iframe (suporta aspas simples e duplas)
    const srcMatch = embedCode.match(/src=["']([^"']+)["']/) || embedCode.match(/src=([^\s>]+)/)
    if (!srcMatch || !srcMatch[1]) return null
    
    const src = srcMatch[1]
    
    // Extrair width e height se existirem
    const widthMatch = embedCode.match(/width=["']?(\d+)["']?/)
    const heightMatch = embedCode.match(/height=["']?(\d+)["']?/)
    
    return {
      src,
      width: widthMatch ? widthMatch[1] : '100%',
      height: heightMatch ? heightMatch[1] : '450',
    }
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
      nome: 'Intercessão',
      descricao:
        'É o altar invisível da igreja, onde joelhos dobrados movem céus, e corações rendidos sustentam aquilo que os olhos ainda não veem.',
    },
    {
      nome: 'Clean',
      descricao:
        'É servir em silêncio, preparando o ambiente para que vidas sejam transformadas, cada detalhe limpo se torna um ato de honra ao Senhor.',
    },
    {
      nome: 'Estacionamento',
      descricao:
        'É o primeiro gesto de cuidado, antes mesmo de entrarem, já são acolhidos. Abre o caminho para que cada pessoa encontre o seu lugar.',
    },
    {
      nome: 'Recepção',
      descricao:
        'São braços abertos que refletem o amor de Cristo, um sorriso que diz: "você pertence". Transforma a chegada em encontro.',
    },
    {
      nome: 'Coffee',
      descricao:
        'É comunhão em forma de cuidado, preparando e servindo com carinho, entre um lanche e outro, vidas se conectam, e o amor se manifesta nos detalhes simples.',
    },
    {
      nome: 'Store',
      descricao:
        'É levar a mensagem além das palavras, cada item carrega propósito, e se torna lembrança viva do que Deus está fazendo.',
    },
    {
      nome: 'Mídia',
      descricao:
        'É a voz que ecoa, a imagem que alcança, torna visível o invisível, para que a mensagem toque cada coração, presente ou à distância.',
    },
    {
      nome: 'Champions Music',
      descricao:
        'É o som da rendição, onde notas e vozes se unem para conduzir a igreja à presença de Deus.',
    },
    {
      nome: 'Kids',
      descricao:
        'São sementes plantadas em terra fértil, pequenos corações aprendendo a amar Jesus, construindo um futuro cheio de fé.',
    },
    {
      nome: 'Teens',
      descricao:
        'É identidade sendo formada em Deus, jovens sendo levantados com propósito, para viverem uma fé verdadeira em meio ao mundo.',
    },
  ]

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-20" style={{ backgroundColor: corHeaderPagina }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-6">
            Sobre a {configuracao?.nome_igreja || 'Champions Church'}
          </h1>
          <div className="text-xl text-primary-100 max-w-3xl mx-auto space-y-2">
            <p className="font-semibold">NOSSO ALVO: JESUS</p>
            <p>NOSSO CHAMADO: Adorar, disciplinar e Compartilhar</p>
          </div>
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
                  A Champions Church é o cumprimento da promessa de Deus na vida dos pastores
                  Eduardo Santana e Isabela Santana, que iniciaram sua jornada cristã em 2002.
                </p>
                <p>
                  Em 2022 Deus entregou a visão do Ministério ao pastor e em 2023 tudo começou...
                </p>
                <p>E o que era um sonho, Deus tornou realidade.</p>
                <p>
                  Somos uma família em Cristo Jesus, entendemos que a salvação é individual,
                  mas a caminhada não precisa ser solitária!
                </p>
                <p>Uma igreja de Campeões é formada por um time de vencedores.</p>
                <p className="font-medium text-church-navy">Venha você também fazer parte!</p>
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl p-8 shadow-lg">
                <img
                  src="/images/sobre-nossa-historia.png"
                  alt="Liderança da Champions Church"
                  className="rounded-xl shadow-md w-full max-w-md mx-auto h-80 sm:h-96 object-cover object-center"
                />
              </div>
            </div>
          </div>

          <div className="mt-14 sm:mt-16 flex justify-center px-0">
            <figure className="w-full max-w-xl sm:max-w-2xl mx-auto text-center">
              <img
                src="/images/sobre-familia-destaque.png"
                alt="Família Champions Church em frente à igreja"
                className="w-full rounded-2xl shadow-2xl object-cover ring-1 ring-black/5"
              />
            </figure>
          </div>
        </div>
      </section>

      {/* Missão, visão e valores */}
      <section className="py-20 bg-church-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mr-4">
                  <Target className="h-7 w-7 text-primary-600" />
                </div>
                <h3 className="text-2xl font-bold text-church-navy">Missão</h3>
              </div>
              <p className="text-gray-700 leading-relaxed">
                Apresentar e fazer com que as pessoas tenham um encontro com o Senhor Jesus.
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
                Quebrar a religiosidade sem perder a espiritualidade.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-8 md:col-span-2 lg:col-span-1">
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mr-4">
                  <Anchor className="h-7 w-7 text-emerald-700" />
                </div>
                <h3 className="text-2xl font-bold text-church-navy">Valores</h3>
              </div>
              <p className="text-gray-700 leading-relaxed">
                Não abrir mão dos princípios e valores estabelecidos pela palavra de Deus.
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {ministerios.map((ministerio, index) => (
              <div
                key={index}
                className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow flex flex-col"
              >
                <h3 className="text-lg font-bold text-church-navy mb-3">
                  {ministerio.nome}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed grow">
                  {ministerio.descricao}
                </p>
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
              <div className="w-full overflow-hidden rounded-b-xl" style={{ minHeight: '450px' }}>
                {mapaIframeProps ? (
                  <iframe
                    src={mapaIframeProps.src}
                    width={mapaIframeProps.width}
                    height={mapaIframeProps.height}
                    style={{ 
                      border: 0, 
                      display: 'block',
                      width: '100%',
                      minHeight: '450px'
                    }}
                    allowFullScreen={true}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Localização ${configuracao?.nome_igreja || 'Champions Church'}`}
                  />
                ) : configuracao?.google_maps_embed ? (
                  <div 
                    className="w-full"
                    style={{ minHeight: '450px' }}
                    dangerouslySetInnerHTML={{ __html: configuracao.google_maps_embed }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20" style={{ backgroundColor: corHeaderPagina }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-white mb-6">
            Venha fazer parte desta família!
          </h2>
          <p className="text-xl text-white/90 mb-8">
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
