import { useState, useEffect, useCallback } from 'react'
import { Search, Mail, MailOpen, Eye, Trash2, RefreshCw } from 'lucide-react'
import api from '../../services/api'
import { formatDateTimeBR } from '../../services/utils'
import LoadingSpinner from '../../components/LoadingSpinner'

function AdminContatos() {
  const [contatos, setContatos] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroLido, setFiltroLido] = useState('nao_lido') // Padrão: não lidas
  const [contatoSelecionado, setContatoSelecionado] = useState(null)

  // Carregar contatos
  const fetchContatos = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true)
      // Adicionar timestamp para evitar cache
      const response = await api.get(`/contatos/?_t=${Date.now()}`)
      setContatos(response.data.results || response.data)
    } catch (error) {
      console.error('Erro ao carregar contatos:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchContatos()
  }, [fetchContatos])
  
  // Contador de não lidas
  const naoLidas = contatos.filter(c => !c.lido).length

  const handleSelecionarContato = async (contato) => {
    // Se não lido, marcar como lido primeiro
    if (!contato.lido) {
      try {
        await api.post(`/contatos/${contato.id}/marcar_lido/`)
        
        // Atualizar contato com estado lido
        const contatoAtualizado = { ...contato, lido: true }
        
        // Atualizar o estado local da lista
        setContatos(prev => prev.map(c => 
          c.id === contato.id ? contatoAtualizado : c
        ))
        
        // Selecionar com estado atualizado
        setContatoSelecionado(contatoAtualizado)
      } catch (error) {
        console.error('Erro ao marcar como lido:', error)
        // Mesmo com erro, seleciona o contato
        setContatoSelecionado(contato)
      }
    } else {
      setContatoSelecionado(contato)
    }
  }

  const handleMarcarNaoLido = async (id) => {
    try {
      await api.post(`/contatos/${id}/marcar_nao_lido/`)
      setContatos(prev => prev.map(c => 
        c.id === id ? { ...c, lido: false } : c
      ))
      if (contatoSelecionado?.id === id) {
        setContatoSelecionado(prev => ({ ...prev, lido: false }))
      }
    } catch (error) {
      console.error('Erro ao marcar como não lido:', error)
    }
  }

  const handleDeletarContato = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir esta mensagem?')) {
      return
    }
    try {
      await api.delete(`/contatos/${id}/`)
      setContatos(prev => prev.filter(c => c.id !== id))
      if (contatoSelecionado?.id === id) {
        setContatoSelecionado(null)
      }
    } catch (error) {
      console.error('Erro ao excluir mensagem:', error)
    }
  }

  const contatosFiltrados = contatos.filter(contato => {
    const matchBusca = 
      contato.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      contato.email?.toLowerCase().includes(busca.toLowerCase()) ||
      contato.assunto?.toLowerCase().includes(busca.toLowerCase())
    const matchLido = 
      filtroLido === 'todos' || 
      (filtroLido === 'lido' && contato.lido) ||
      (filtroLido === 'nao_lido' && !contato.lido)
    return matchBusca && matchLido
  })

  if (loading) {
    return <LoadingSpinner text="Carregando mensagens..." />
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-church-navy">Mensagens de Contato</h1>
          {naoLidas > 0 && (
            <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">
              {naoLidas} não lida{naoLidas > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-gray-600 mt-1">Visualize as mensagens recebidas pelo site</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-md p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, email ou assunto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          
          {/* Status Filter */}
          <select
            value={filtroLido}
            onChange={(e) => setFiltroLido(e.target.value)}
            className="input-field md:w-56"
          >
            <option value="todos">Todas ({contatos.length})</option>
            <option value="nao_lido">
              Não Lidas ({naoLidas})
            </option>
            <option value="lido">Lidas ({contatos.length - naoLidas})</option>
          </select>
          
          {/* Refresh Button */}
          <button
            onClick={() => fetchContatos(true)}
            disabled={refreshing}
            className="btn-outline flex items-center justify-center gap-2 md:w-auto"
            title="Atualizar lista"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="md:hidden">Atualizar</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Messages List */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {contatosFiltrados.length > 0 ? (
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {contatosFiltrados.map((contato) => (
                <div
                  key={contato.id}
                  onClick={() => handleSelecionarContato(contato)}
                  className={`p-4 cursor-pointer transition-colors ${
                    contatoSelecionado?.id === contato.id
                      ? 'bg-primary-50'
                      : 'hover:bg-gray-50'
                  } ${!contato.lido ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className={`p-2 rounded-lg ${
                        contato.lido ? 'bg-gray-100' : 'bg-primary-100'
                      }`}>
                        {contato.lido ? (
                          <MailOpen className="h-5 w-5 text-gray-500" />
                        ) : (
                          <Mail className="h-5 w-5 text-primary-600" />
                        )}
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className={`font-medium truncate ${
                            !contato.lido ? 'text-church-navy' : 'text-gray-700'
                          }`}>
                            {contato.nome}
                          </p>
                          {!contato.lido && (
                            <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{contato.assunto}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDateTimeBR(contato.data_envio)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Mail className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma mensagem encontrada</p>
            </div>
          )}
        </div>

        {/* Message Detail */}
        <div className="bg-white rounded-xl shadow-md p-6">
          {contatoSelecionado ? (
            <div>
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-church-navy">
                    {contatoSelecionado.assunto}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatDateTimeBR(contatoSelecionado.data_envio)}
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-600 font-bold">
                      {contatoSelecionado.nome[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-church-navy">{contatoSelecionado.nome}</p>
                    <p className="text-sm text-gray-500">{contatoSelecionado.email}</p>
                    {contatoSelecionado.telefone && (
                      <p className="text-sm text-gray-500">{contatoSelecionado.telefone}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-sm font-semibold text-gray-500 mb-3">MENSAGEM</h3>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {contatoSelecionado.mensagem}
                </p>
              </div>

              <div className="mt-6 pt-6 border-t flex flex-wrap gap-3">
                <a
                  href={`mailto:${contatoSelecionado.email}?subject=Re: ${contatoSelecionado.assunto}`}
                  className="btn-primary flex-grow text-center"
                >
                  Responder por E-mail
                </a>
                {contatoSelecionado.lido && (
                  <button
                    onClick={() => handleMarcarNaoLido(contatoSelecionado.id)}
                    className="btn-outline flex items-center justify-center"
                    title="Marcar como não lida"
                  >
                    <Mail className="h-5 w-5 mr-2" />
                    Não Lida
                  </button>
                )}
                <button
                  onClick={() => handleDeletarContato(contatoSelecionado.id)}
                  className="p-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Excluir mensagem"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <Eye className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Selecione uma mensagem para visualizar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminContatos
