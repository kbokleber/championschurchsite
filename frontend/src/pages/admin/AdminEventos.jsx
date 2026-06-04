import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Edit, Trash2, Eye, Calendar, Gift } from 'lucide-react'
import api from '../../services/api'
import { formatDateTimeBR } from '../../services/utils'
import LoadingSpinner from '../../components/LoadingSpinner'

function AdminEventos() {
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [deletando, setDeletando] = useState(null)

  useEffect(() => {
    fetchEventos()
  }, [])

  const fetchEventos = async () => {
    try {
      const response = await api.get('/eventos/', { params: { incluir_particulares: 'true' } })
      setEventos(response.data.results || response.data)
    } catch (error) {
      console.error('Erro ao carregar eventos:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este evento?')) {
      return
    }

    setDeletando(id)
    try {
      await api.delete(`/eventos/${id}/`)
      setEventos(eventos.filter(e => e.id !== id))
    } catch (error) {
      console.error('Erro ao excluir evento:', error)
      alert('Erro ao excluir evento. Tente novamente.')
    } finally {
      setDeletando(null)
    }
  }

  const eventosFiltrados = eventos.filter(evento =>
    evento.titulo.toLowerCase().includes(busca.toLowerCase())
  )

  if (loading) {
    return <LoadingSpinner text="Carregando eventos..." />
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-church-navy">Eventos</h1>
          <p className="text-gray-600 mt-1">Gerencie os eventos da igreja</p>
        </div>
        <Link
          to="/admin/eventos/novo"
          className="btn-primary mt-4 sm:mt-0 inline-flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Evento
        </Link>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-md p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar eventos..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        {eventosFiltrados.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    Evento
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    Data
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    Local
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    Vagas
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    Valor
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {eventosFiltrados.map((evento) => (
                  <tr key={evento.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mr-3">
                          <Calendar className="h-5 w-5 text-primary-600" />
                        </div>
                        <div>
                          <p className="font-medium text-church-navy">{evento.titulo}</p>
                          <p className="text-sm text-gray-500">{evento.tipo_display}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDateTimeBR(evento.data_inicio)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {evento.local}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {evento.evento_particular ? (
                          <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            Particular
                          </span>
                        ) : (
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                            evento.destaque
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {evento.destaque ? 'Destaque' : 'Normal'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {evento.vagas_disponiveis !== null
                        ? `${evento.vagas_disponiveis} disponíveis`
                        : 'Ilimitadas'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        evento.evento_pago
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {evento.valor_inscricao_formatado || 'Gratuito'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          to={
                            evento.evento_particular && evento.link_acesso
                              ? `/inscricao/${evento.link_acesso}`
                              : `/eventos/${evento.id}`
                          }
                          className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title={evento.evento_particular ? 'Abrir link de inscrição' : 'Ver no site'}
                        >
                          <Eye className="h-5 w-5" />
                        </Link>
                        <Link
                          to={`/admin/sorteio?evento_id=${evento.id}`}
                          className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Sorteio"
                        >
                          <Gift className="h-5 w-5" />
                        </Link>
                        <Link
                          to={`/admin/eventos/${evento.id}`}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="h-5 w-5" />
                        </Link>
                        <button
                          onClick={() => handleDelete(evento.id)}
                          disabled={deletando === evento.id}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Excluir"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nenhum evento encontrado</p>
            <Link to="/admin/eventos/novo" className="btn-primary mt-4 inline-flex items-center">
              <Plus className="h-5 w-5 mr-2" />
              Criar Primeiro Evento
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminEventos
