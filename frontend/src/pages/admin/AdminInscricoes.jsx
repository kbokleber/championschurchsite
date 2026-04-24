import { useState, useEffect } from 'react'
import { Search, FileText, Check, X, Calendar, Trash2, Tag, ChevronLeft, ChevronRight, ClipboardList, Download, FileSpreadsheet } from 'lucide-react'
import api from '../../services/api'
import { formatDateTimeBR } from '../../services/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'

const PAGE_SIZE = 10

function AdminInscricoes() {
  const [inscricoes, setInscricoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroPagamento, setFiltroPagamento] = useState('todos')
  const [filtroEvento, setFiltroEvento] = useState('todos')
  const [page, setPage] = useState(1)
  const [exportando, setExportando] = useState(false)
  
  // Estado do modal de confirmação
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: 'warning',
    title: '',
    message: '',
    confirmText: '',
    inscricao: null,
    action: null, // 'cancelar' | 'deletar'
  })
  const [actionLoading, setActionLoading] = useState(false)

  // Modal "Ver respostas"
  const [respostasModal, setRespostasModal] = useState({
    isOpen: false,
    loading: false,
    error: '',
    inscricao: null,
    respostas: [],
  })

  useEffect(() => {
    fetchInscricoes()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [busca, filtroStatus, filtroPagamento, filtroEvento])

  const fetchInscricoes = async () => {
    try {
      const todas = []
      let pageNum = 1
      let hasMore = true
      while (hasMore) {
        const response = await api.get('/inscricoes/', { params: { page: pageNum } })
        const data = response.data
        const lista = data.results ?? (Array.isArray(data) ? data : [])
        todas.push(...lista)
        hasMore = !!data.next && lista.length > 0
        pageNum += 1
      }
      setInscricoes(todas)
    } catch (error) {
      console.error('Erro ao carregar inscrições:', error)
      setInscricoes([])
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
      default:
        fecharModal()
    }
  }

  const abrirRespostas = async (inscricao) => {
    setRespostasModal({
      isOpen: true,
      loading: true,
      error: '',
      inscricao,
      respostas: [],
    })
    try {
      const response = await api.get(`/admin/inscricoes/${inscricao.id}/respostas/`)
      const data = response.data || {}
      const lista = Array.isArray(data)
        ? data
        : (Array.isArray(data.respostas) ? data.respostas : (data.results || []))
      setRespostasModal(prev => ({
        ...prev,
        loading: false,
        respostas: lista,
      }))
    } catch (err) {
      console.error('Erro ao carregar respostas:', err)
      const msg = err?.response?.status === 403
        ? 'Você não tem permissão para ver respostas.'
        : err?.response?.data?.detail || 'Erro ao carregar respostas.'
      setRespostasModal(prev => ({
        ...prev,
        loading: false,
        error: msg,
      }))
    }
  }

  const fecharRespostas = () => {
    setRespostasModal({
      isOpen: false,
      loading: false,
      error: '',
      inscricao: null,
      respostas: [],
    })
  }

  const baixarArquivo = async (resposta) => {
    if (!resposta.arquivo_url) return
    try {
      // resposta.arquivo_url = /api/admin/inscricoes/<id>/respostas/<campo_id>/arquivo/
      // Usamos api (axios) com responseType blob para herdar auth
      const path = resposta.arquivo_url.replace(/^\/api/, '')
      const response = await api.get(path, { responseType: 'blob' })
      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = resposta.arquivo_nome || 'arquivo'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao baixar arquivo:', err)
      alert('Erro ao baixar arquivo.')
    }
  }

  const formatarValorResposta = (r) => {
    if (r.tipo === 'arquivo') return null
    if (r.valor === null || r.valor === undefined || r.valor === '') return <span className="text-gray-400">-</span>
    if (r.tipo === 'boolean') return r.valor ? 'Sim' : 'Não'
    if (r.tipo === 'select_multiplo') {
      if (Array.isArray(r.valor)) return r.valor.join(', ')
      return String(r.valor)
    }
    if (r.tipo === 'data') {
      try {
        const d = new Date(r.valor)
        if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR')
      } catch { /* noop */ }
    }
    if (typeof r.valor === 'object') return JSON.stringify(r.valor)
    return String(r.valor)
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

  const getPagamentoViaResponsavelBadge = (statusPagamento) => {
    const config = {
      pago: { bg: 'bg-green-100', text: 'text-green-800', label: 'Pago via responsável' },
      pendente: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pendente via responsável' },
      isento: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Isento via responsável' },
      nao_aplicavel: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Via responsável' },
    }
    const statusConfig = config[statusPagamento] || config.nao_aplicavel
    return (
      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
        {statusConfig.label}
      </span>
    )
  }

  // Opções do combo: evento único por (evento_id + evento_data) com label "Nome - Data"
  const listaInscricoes = Array.isArray(inscricoes) ? inscricoes : []
  const opcoesEventos = (() => {
    const seen = new Set()
    const lista = []
    listaInscricoes.forEach(inscricao => {
      const titulo = inscricao?.evento_titulo || `Evento #${inscricao?.evento ?? ''}`
      const data = inscricao?.evento_data ?? '-'
      const key = `${inscricao?.evento ?? ''}|${data}`
      if (!seen.has(key)) {
        seen.add(key)
        lista.push({ value: key, label: `${titulo} - ${data}` })
      }
    })
    lista.sort((a, b) => (a.label || '').localeCompare(b.label || ''))
    return lista
  })()

  const inscricoesFiltradas = listaInscricoes.filter(inscricao => {
    const matchBusca = 
      inscricao.membro_nome?.toLowerCase().includes(busca.toLowerCase()) ||
      inscricao.evento_titulo?.toLowerCase().includes(busca.toLowerCase())
    const matchStatus = filtroStatus === 'todos' || inscricao.status === filtroStatus
    const matchPagamento = filtroPagamento === 'todos' || inscricao.status_pagamento === filtroPagamento
    
    const matchEvento = filtroEvento === 'todos' || filtroEvento === `${inscricao?.evento ?? ''}|${inscricao?.evento_data ?? ''}`
    
    return matchBusca && matchStatus && matchPagamento && matchEvento
  })

  const totalCount = inscricoesFiltradas.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const endItem = Math.min(page * PAGE_SIZE, totalCount)
  const inscricoesPagina = inscricoesFiltradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleExportarXlsx = async () => {
    setExportando(true)
    try {
      const params = {
        q: (busca || '').trim() || undefined,
        status: filtroStatus,
        status_pagamento: filtroPagamento,
      }
      if (filtroEvento !== 'todos') {
        const eventoId = filtroEvento.split('|')[0]
        if (eventoId) params.evento_id = eventoId
      }
      const response = await api.get('/admin/inscricoes/exportar/', {
        params,
        responseType: 'blob',
        timeout: 120000,
      })
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const dispo = response.headers['content-disposition'] || response.headers['Content-Disposition'] || ''
      const match = /filename="?([^";]+)"?/i.exec(dispo)
      const filename = match && match[1] ? match[1].trim() : `inscricoes_champions.xlsx`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao exportar inscrições:', err)
      let msg = 'Não foi possível gerar a planilha. Tente de novo.'
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text()
          const j = JSON.parse(text)
          if (j?.detail) msg = j.detail
        } catch {
          /* manter genérico */
        }
      } else if (err.response?.data?.detail) {
        msg = err.response.data.detail
      }
      alert(msg)
    } finally {
      setExportando(false)
    }
  }

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
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
          <div className="flex flex-col md:flex-row flex-1 gap-4 min-w-0">
            {/* Search */}
            <div className="relative flex-grow min-w-0">
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
            
            {/* Event Filter (nome + data) */}
            <select
              value={filtroEvento}
              onChange={(e) => setFiltroEvento(e.target.value)}
              className="input-field md:w-64"
              title="Filtrar por evento e data"
            >
              <option value="todos">Todos os Eventos</option>
              {opcoesEventos.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleExportarXlsx}
            disabled={exportando || totalCount === 0}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-church-navy bg-white text-church-navy font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
            title="Exporta as inscrições listadas (respeitando busca e filtros), uma linha por inscrição, com colunas do formulário"
          >
            <FileSpreadsheet className="h-5 w-5 shrink-0" />
            {exportando ? 'Gerando...' : 'Exportar Excel'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          A planilha inclui os mesmos registros exibidos com os filtros atuais, mais uma coluna por pergunta do formulário.
        </p>
      </div>

      {/* Lista vazia */}
      {totalCount === 0 && (
        <div className="bg-white rounded-xl shadow-md py-12 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Nenhuma inscrição encontrada</p>
        </div>
      )}

      {/* Desktop: Tabela (oculta em mobile) */}
      {totalCount > 0 && (
        <div className="hidden md:block bg-white rounded-xl shadow-md overflow-hidden">
          <>
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
                {inscricoesPagina.map((inscricao) => (
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
                        getPagamentoViaResponsavelBadge(inscricao.status_pagamento)
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
                        {inscricao.evento_tem_formulario && (
                          <button onClick={() => abrirRespostas(inscricao)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Ver respostas do formulário"><ClipboardList className="h-5 w-5" /></button>
                        )}
                        {inscricao.status === 'pendente' && inscricao.status_pagamento !== 'pendente' && (
                          <button onClick={() => handleConfirmar(inscricao.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Confirmar"><Check className="h-5 w-5" /></button>
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
          {/* Paginação */}
          {totalCount > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t bg-gray-50">
              <p className="text-sm text-gray-600">
                Mostrando <span className="font-medium">{startItem}</span>-<span className="font-medium">{endItem}</span> de <span className="font-medium">{totalCount}</span> inscrições
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Página anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm text-gray-600 px-2">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Próxima página"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
          </>
        </div>
      )}

      {/* Mobile: Cards com botões de ação sempre visíveis */}
      {totalCount > 0 && (
        <div className="md:hidden space-y-4">
          {inscricoesPagina.map((inscricao) => (
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
                    {inscricao.evento_tem_formulario && (
                      <button onClick={() => abrirRespostas(inscricao)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Ver respostas do formulário"><ClipboardList className="h-5 w-5" /></button>
                    )}
                    {inscricao.status === 'pendente' && inscricao.status_pagamento !== 'pendente' && (
                      <button onClick={() => handleConfirmar(inscricao.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Confirmar"><Check className="h-5 w-5" /></button>
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
                  {inscricao.is_acompanhante && getPagamentoViaResponsavelBadge(inscricao.status_pagamento)}
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
          {/* Paginação (mobile) */}
          {totalCount > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 mt-4 bg-white rounded-xl shadow-md border-t">
              <p className="text-sm text-gray-600">
                Mostrando <span className="font-medium">{startItem}</span>-<span className="font-medium">{endItem}</span> de <span className="font-medium">{totalCount}</span> inscrições
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Página anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm text-gray-600 px-2">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Próxima página"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
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

      {/* Modal Ver Respostas */}
      {respostasModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={fecharRespostas}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-church-navy flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" /> Respostas do formulário
                </h3>
                {respostasModal.inscricao && (
                  <p className="text-sm text-gray-500 truncate">
                    {respostasModal.inscricao.membro_nome || `Membro #${respostasModal.inscricao.membro}`}
                    {' • '}
                    {respostasModal.inscricao.evento_titulo || `Evento #${respostasModal.inscricao.evento}`}
                  </p>
                )}
              </div>
              <button onClick={fecharRespostas} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {respostasModal.loading && (
                <div className="py-10 flex justify-center">
                  <LoadingSpinner />
                </div>
              )}
              {!respostasModal.loading && respostasModal.error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {respostasModal.error}
                </div>
              )}
              {!respostasModal.loading && !respostasModal.error && respostasModal.respostas.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-6">Nenhuma resposta registrada.</p>
              )}
              {!respostasModal.loading && !respostasModal.error && respostasModal.respostas.length > 0 && (
                <ul className="space-y-5">
                  {respostasModal.respostas.map((r) => {
                    const pergunta = r.label || r.campo_label || `Campo #${r.campo_id}`
                    return (
                      <li
                        key={r.id || `${r.campo_id}`}
                        className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                      >
                        <div className="border-l-4 border-church-navy pl-4 pr-4 py-3.5">
                          <p className="text-xs font-medium text-slate-500 tracking-wide">Pergunta</p>
                          <p className="mt-1 text-base font-semibold text-church-navy leading-snug">{pergunta}</p>
                        </div>
                        <div className="px-4 pb-4 -mt-0.5">
                          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3.5 py-3">
                            <p className="text-xs font-medium text-slate-500 mb-1.5">Resposta</p>
                            <div className="text-sm text-slate-900 break-words leading-relaxed">
                              {r.tipo === 'arquivo' ? (
                                r.arquivo_url ? (
                                  <button
                                    type="button"
                                    onClick={() => baixarArquivo(r)}
                                    className="inline-flex items-center gap-2 text-primary-600 font-medium hover:underline"
                                  >
                                    <Download className="h-4 w-4 shrink-0" />
                                    {r.arquivo_nome || 'Baixar arquivo'}
                                  </button>
                                ) : (
                                  <span className="text-slate-400">Sem arquivo anexado</span>
                                )
                              ) : (
                                formatarValorResposta(r)
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="px-6 py-3 border-t bg-gray-50 flex justify-end">
              <button onClick={fecharRespostas} className="btn-secondary">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminInscricoes
