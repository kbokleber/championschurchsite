import { useState, useEffect } from 'react'
import { Search, FileText, Check, X, UserCheck, Calendar, Trash2, DollarSign, Tag } from 'lucide-react'
import api from '../../services/api'
import { formatDateTimeBR } from '../../services/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'

function AdminInscricoes() {
  const [inscricoes, setInscricoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroPagamento, setFiltroPagamento] = useState('todos')
  
  // Estado do modal de confirmação
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: 'warning',
    title: '',
    message: '',
    confirmText: '',
    inscricao: null,
    action: null, // 'cancelar' | 'deletar' | 'isentar'
  })
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchInscricoes()
  }, [])

  const fetchInscricoes = async () => {
    try {
      const response = await api.get('/inscricoes/')
      setInscricoes(response.data.results || response.data)
    } catch (error) {
      console.error('Erro ao carregar inscrições:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmar = async (id) => {
    try {
      await api.post(`/inscricoes/${id}/confirmar/`)
      fetchInscricoes()
    } catch (error) {
      console.error('Erro ao confirmar inscrição:', error)
      alert('Erro ao confirmar inscrição.')
    }
  }

  // Abre o modal para cancelar
  const handleCancelar = (inscricao) => {
    setModalConfig({
      isOpen: true,
      type: 'warning',
      title: 'Cancelar Inscrição',
      message: `Deseja cancelar a inscrição de "${inscricao.membro_nome}" no evento "${inscricao.evento_titulo}"?`,
      confirmText: 'Cancelar Inscrição',
      inscricao,
      action: 'cancelar',
    })
  }
  
  // Executa o cancelamento
  const executarCancelar = async (id) => {
    setActionLoading(true)
    try {
      await api.post(`/inscricoes/${id}/cancelar/`)
      fetchInscricoes()
      fecharModal()
    } catch (error) {
      console.error('Erro ao cancelar inscrição:', error)
      alert('Erro ao cancelar inscrição.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleMarcarPresenca = async (id) => {
    try {
      await api.post(`/inscricoes/${id}/marcar_presenca/`)
      fetchInscricoes()
    } catch (error) {
      console.error('Erro ao marcar presença:', error)
      alert('Erro ao marcar presença.')
    }
  }

  // Abre o modal para deletar
  const handleDeletar = (inscricao) => {
    setModalConfig({
      isOpen: true,
      type: 'danger',
      title: 'Excluir Inscrição',
      message: `Tem certeza que deseja EXCLUIR permanentemente a inscrição de "${inscricao.membro_nome}"? Esta ação não pode ser desfeita.`,
      confirmText: 'Excluir Permanentemente',
      inscricao,
      action: 'deletar',
    })
  }
  
  // Executa a exclusão
  const executarDeletar = async (id) => {
    setActionLoading(true)
    try {
      await api.delete(`/inscricoes/${id}/`)
      fetchInscricoes()
      fecharModal()
    } catch (error) {
      console.error('Erro ao deletar inscrição:', error)
      alert('Erro ao deletar inscrição.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirmarPagamento = async (id) => {
    try {
      await api.post(`/inscricoes/${id}/confirmar_pagamento/`)
      fetchInscricoes()
    } catch (error) {
      console.error('Erro ao confirmar pagamento:', error)
      alert('Erro ao confirmar pagamento.')
    }
  }

  // Abre o modal para isentar pagamento
  const handleIsentarPagamento = (inscricao) => {
    setModalConfig({
      isOpen: true,
      type: 'info',
      title: 'Isentar Pagamento',
      message: `Deseja isentar a inscrição de "${inscricao.membro_nome}" do pagamento? Isso também isenta os acompanhantes vinculados.`,
      confirmText: 'Isentar Pagamento',
      inscricao,
      action: 'isentar',
    })
  }
  
  // Executa a isenção
  const executarIsentar = async (id) => {
    setActionLoading(true)
    try {
      await api.post(`/inscricoes/${id}/isentar_pagamento/`)
      fetchInscricoes()
      fecharModal()
    } catch (error) {
      console.error('Erro ao isentar pagamento:', error)
      alert('Erro ao isentar pagamento.')
    } finally {
      setActionLoading(false)
    }
  }
  
  // Fechar modal
  const fecharModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }))
  }
  
  // Executar ação confirmada no modal
  const handleConfirmAction = () => {
    if (!modalConfig.inscricao) return
    
    const { action, inscricao } = modalConfig
    
    switch (action) {
      case 'cancelar':
        executarCancelar(inscricao.id)
        break
      case 'deletar':
        executarDeletar(inscricao.id)
        break
      case 'isentar':
        executarIsentar(inscricao.id)
        break
      default:
        fecharModal()
    }
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      pendente: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pendente' },
      confirmada: { bg: 'bg-green-100', text: 'text-green-800', label: 'Confirmada' },
      cancelada: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelada' },
      lista_espera: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Lista de Espera' },
    }
    const config = statusConfig[status] || statusConfig.pendente
    return (
      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    )
  }

  const getPagamentoBadge = (statusPagamento, valor) => {
    const valorNumerico = parseFloat(valor) || 0
    const valorFormatado = valorNumerico.toFixed(2).replace('.', ',')
    
    const config = {
      nao_aplicavel: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Gratuito' },
      pendente: { bg: 'bg-amber-100', text: 'text-amber-800', label: `Pendente R$ ${valorFormatado}` },
      pago: { bg: 'bg-green-100', text: 'text-green-800', label: 'Pago' },
      isento: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Isento' },
    }
    const statusConfig = config[statusPagamento] || config.nao_aplicavel
    return (
      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
        {statusConfig.label}
      </span>
    )
  }

  const inscricoesFiltradas = inscricoes.filter(inscricao => {
    const matchBusca = 
      inscricao.membro_nome?.toLowerCase().includes(busca.toLowerCase()) ||
      inscricao.evento_titulo?.toLowerCase().includes(busca.toLowerCase())
    const matchStatus = filtroStatus === 'todos' || inscricao.status === filtroStatus
    const matchPagamento = filtroPagamento === 'todos' || inscricao.status_pagamento === filtroPagamento
    return matchBusca && matchStatus && matchPagamento
  })

  if (loading) {
    return <LoadingSpinner text="Carregando inscrições..." />
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-church-navy">Inscrições</h1>
        <p className="text-gray-600 mt-1">Gerencie as inscrições nos eventos</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-md p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por membro ou evento..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          
          {/* Status Filter */}
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="input-field md:w-48"
          >
            <option value="todos">Todos os Status</option>
            <option value="pendente">Pendente</option>
            <option value="confirmada">Confirmada</option>
            <option value="cancelada">Cancelada</option>
            <option value="lista_espera">Lista de Espera</option>
          </select>
          
          {/* Payment Filter */}
          <select
            value={filtroPagamento}
            onChange={(e) => setFiltroPagamento(e.target.value)}
            className="input-field md:w-48"
          >
            <option value="todos">Todos Pagamentos</option>
            <option value="pendente">Pgto Pendente</option>
            <option value="pago">Pago</option>
            <option value="isento">Isento</option>
            <option value="nao_aplicavel">Gratuito</option>
          </select>
        </div>
      </div>

      {/* Lista vazia */}
      {inscricoesFiltradas.length === 0 && (
        <div className="bg-white rounded-xl shadow-md py-12 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Nenhuma inscrição encontrada</p>
        </div>
      )}

      {/* Desktop: Tabela (oculta em mobile) */}
      {inscricoesFiltradas.length > 0 && (
        <div className="hidden md:block bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Membro</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Evento</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Categoria</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Pagamento</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Presença</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inscricoesFiltradas.map((inscricao) => (
                  <tr key={inscricao.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${inscricao.is_acompanhante ? 'bg-gray-100' : 'bg-primary-100'}`}>
                          <span className={`font-bold ${inscricao.is_acompanhante ? 'text-gray-500' : 'text-primary-600'}`}>
                            {(inscricao.membro_nome || 'M')[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-church-navy">{inscricao.membro_nome || `Membro #${inscricao.membro}`}</span>
                          {inscricao.is_acompanhante && <span className="block text-xs text-gray-500">Acompanhante</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-gray-700">{inscricao.evento_titulo || `Evento #${inscricao.evento}`}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{formatDateTimeBR(inscricao.data_inscricao)}</div>
                    </td>
                    <td className="px-6 py-4">
                      {inscricao.categoria_nome ? (
                        <span className="inline-flex items-center text-sm"><Tag className="h-4 w-4 text-gray-400 mr-1" />{inscricao.categoria_nome}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(inscricao.status)}</td>
                    <td className="px-6 py-4">
                      {inscricao.is_acompanhante ? (
                        <span className="text-xs text-gray-500 italic">Via responsável</span>
                      ) : (
                        getPagamentoBadge(inscricao.status_pagamento, inscricao.valor_inscricao)
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {inscricao.presente ? (
                        <span className="inline-flex items-center text-green-600"><Check className="h-5 w-5 mr-1" />Presente</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {!inscricao.is_acompanhante && inscricao.status_pagamento === 'pendente' && (
                          <>
                            <button onClick={() => handleConfirmarPagamento(inscricao.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Confirmar Pagamento"><DollarSign className="h-5 w-5" /></button>
                            <button onClick={() => handleIsentarPagamento(inscricao)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Isentar"><Tag className="h-5 w-5" /></button>
                          </>
                        )}
                        {inscricao.status === 'pendente' && inscricao.status_pagamento !== 'pendente' && (
                          <button onClick={() => handleConfirmar(inscricao.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Confirmar"><Check className="h-5 w-5" /></button>
                        )}
                        {inscricao.status === 'confirmada' && !inscricao.presente && (
                          <button onClick={() => handleMarcarPresenca(inscricao.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Marcar Presença"><UserCheck className="h-5 w-5" /></button>
                        )}
                        {inscricao.status !== 'cancelada' && (
                          <button onClick={() => handleCancelar(inscricao)} className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg" title="Cancelar"><X className="h-5 w-5" /></button>
                        )}
                        <button onClick={() => handleDeletar(inscricao)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Excluir"><Trash2 className="h-5 w-5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile: Cards com botões de ação sempre visíveis */}
      {inscricoesFiltradas.length > 0 && (
        <div className="md:hidden space-y-4">
          {inscricoesFiltradas.map((inscricao) => (
            <div key={inscricao.id} className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${inscricao.is_acompanhante ? 'bg-gray-100' : 'bg-primary-100'}`}>
                      <span className={`font-bold ${inscricao.is_acompanhante ? 'text-gray-500' : 'text-primary-600'}`}>
                        {(inscricao.membro_nome || 'M')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="ml-3 min-w-0">
                      <div className="font-medium text-church-navy truncate">{inscricao.membro_nome || `Membro #${inscricao.membro}`}</div>
                      {inscricao.is_acompanhante && <div className="text-xs text-gray-500">Acompanhante</div>}
                      <div className="text-sm text-gray-600 truncate">{inscricao.evento_titulo || `Evento #${inscricao.evento}`}</div>
                      <div className="text-xs text-gray-500">{formatDateTimeBR(inscricao.data_inscricao)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 flex-shrink-0">
                    {!inscricao.is_acompanhante && inscricao.status_pagamento === 'pendente' && (
                      <>
                        <button onClick={() => handleConfirmarPagamento(inscricao.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Confirmar Pagamento"><DollarSign className="h-5 w-5" /></button>
                        <button onClick={() => handleIsentarPagamento(inscricao)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Isentar"><Tag className="h-5 w-5" /></button>
                      </>
                    )}
                    {inscricao.status === 'pendente' && inscricao.status_pagamento !== 'pendente' && (
                      <button onClick={() => handleConfirmar(inscricao.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Confirmar"><Check className="h-5 w-5" /></button>
                    )}
                    {inscricao.status === 'confirmada' && !inscricao.presente && (
                      <button onClick={() => handleMarcarPresenca(inscricao.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Marcar Presença"><UserCheck className="h-5 w-5" /></button>
                    )}
                    {inscricao.status !== 'cancelada' && (
                      <button onClick={() => handleCancelar(inscricao)} className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg" title="Cancelar"><X className="h-5 w-5" /></button>
                    )}
                    <button onClick={() => handleDeletar(inscricao)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Excluir"><Trash2 className="h-5 w-5" /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {getStatusBadge(inscricao.status)}
                  {!inscricao.is_acompanhante && getPagamentoBadge(inscricao.status_pagamento, inscricao.valor_inscricao)}
                  {inscricao.is_acompanhante && <span className="text-xs text-gray-500 italic">Via responsável</span>}
                  {inscricao.presente && (
                    <span className="inline-flex items-center text-green-600 text-xs"><Check className="h-3 w-3 mr-1" />Presente</span>
                  )}
                  {inscricao.categoria_nome && (
                    <span className="inline-flex items-center text-sm text-gray-600"><Tag className="h-3 w-3 mr-1" />{inscricao.categoria_nome}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Confirmação */}
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        onClose={fecharModal}
        onConfirm={handleConfirmAction}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        confirmText={modalConfig.confirmText}
        cancelText="Voltar"
        loading={actionLoading}
      >
        {/* Detalhes da inscrição no modal */}
        {modalConfig.inscricao && (
          <div className="bg-gray-50 rounded-lg p-4 text-left">
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-gray-500">Membro:</span>{' '}
                <span className="font-medium text-gray-800">{modalConfig.inscricao.membro_nome}</span>
                {modalConfig.inscricao.is_acompanhante && (
                  <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Acompanhante</span>
                )}
              </p>
              <p>
                <span className="text-gray-500">Evento:</span>{' '}
                <span className="font-medium text-gray-800">{modalConfig.inscricao.evento_titulo}</span>
              </p>
              <p>
                <span className="text-gray-500">Data Inscrição:</span>{' '}
                <span className="text-gray-700">{formatDateTimeBR(modalConfig.inscricao.data_inscricao)}</span>
              </p>
              {modalConfig.inscricao.categoria_nome && (
                <p>
                  <span className="text-gray-500">Categoria:</span>{' '}
                  <span className="text-gray-700">{modalConfig.inscricao.categoria_nome}</span>
                </p>
              )}
            </div>
          </div>
        )}
      </ConfirmModal>
    </div>
  )
}

export default AdminInscricoes
