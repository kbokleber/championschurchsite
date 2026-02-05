import { useState, useEffect } from 'react'
import { Search, Filter } from 'lucide-react'
import EventCard from '../components/EventCard'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../services/api'
import { useConfiguracao } from '../contexts/ConfiguracaoContext'

function Eventos() {
  const { configuracao } = useConfiguracao()
  const corHeaderPagina = configuracao?.cor_header_pagina && /^#[0-9A-Fa-f]{6}$/.test(configuracao.cor_header_pagina) ? configuracao.cor_header_pagina : '#1a365d'
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')

  const tiposEvento = [
    { value: 'todos', label: 'Todos' },
    { value: 'culto', label: 'Cultos' },
    { value: 'conferencia', label: 'Conferências' },
    { value: 'retiro', label: 'Retiros' },
    { value: 'encontro', label: 'Encontros' },
    { value: 'workshop', label: 'Workshops' },
    { value: 'celula', label: 'Células' },
  ]

  useEffect(() => {
    const fetchEventos = async () => {
      try {
        const params = { futuros: 'true' }
        if (filtro !== 'todos') {
          params.tipo = filtro
        }
        const response = await api.get('/eventos/', { params })
        setEventos(response.data.results || response.data)
      } catch (error) {
        console.error('Erro ao carregar eventos:', error)
        setEventos([])
      } finally {
        setLoading(false)
      }
    }

    fetchEventos()
  }, [filtro])

  const eventosFiltrados = eventos.filter((evento) => {
    const matchBusca = evento.titulo.toLowerCase().includes(busca.toLowerCase())
    const matchTipo = filtro === 'todos' || evento.tipo === filtro
    return matchBusca && matchTipo
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="py-16" style={{ backgroundColor: corHeaderPagina }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-4">
            Nossos Eventos
          </h1>
          <p className="text-xl text-primary-100 max-w-2xl mx-auto">
            Confira nossa programação completa e participe dos eventos da {configuracao?.nome_igreja || 'Champions Church'}.
          </p>
        </div>
      </section>

      {/* Filters */}
      <section className="bg-white shadow-sm sticky top-20 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar eventos..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="input-field pl-10"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
              <Filter className="h-5 w-5 text-gray-500 flex-shrink-0" />
              {tiposEvento.map((tipo) => (
                <button
                  key={tipo.value}
                  onClick={() => setFiltro(tipo.value)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    filtro === tipo.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tipo.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Events Grid */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <LoadingSpinner text="Carregando eventos..." />
          ) : eventosFiltrados.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {eventosFiltrados.map((evento) => (
                <EventCard key={evento.id} evento={evento} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">
                Nenhum evento encontrado para os filtros selecionados.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default Eventos
