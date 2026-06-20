import { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw, Send, X, Search, AlertCircle, CheckCircle2, Clock,
  Activity, XCircle, PauseCircle, ChevronLeft, ChevronRight, Eye, Code2, History, Filter,
} from 'lucide-react'
import api from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'

const STATUS_TABS = [
  { valor: 'todos', nome: 'Todos', cor: '#6b7280' },
  { valor: 'pendente', nome: 'Pendentes', cor: '#f59e0b' },
  { valor: 'executando', nome: 'Executando', cor: '#3b82f6' },
  { valor: 'sucesso', nome: 'Sucesso', cor: '#10b981' },
  { valor: 'falha', nome: 'Falhas', cor: '#ef4444' },
  { valor: 'cancelado', nome: 'Cancelados', cor: '#6b7280' },
]

const STATUS_COR = {
  pendente: '#f59e0b',
  executando: '#3b82f6',
  sucesso: '#10b981',
  falha: '#ef4444',
  cancelado: '#6b7280',
}

const FILAS_VALIDAS = ['critica', 'whatsapp', 'baixa']
const FILA_LABEL = { critica: 'Critica', whatsapp: 'WhatsApp', baixa: 'Baixa' }

const PAGE_SIZE = 25

function formatarDataHora(iso) {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    return iso
  }
}

function formatarTipo(tipo) {
  if (!tipo) return ''
  return tipo.replace(/_/g, ' ')
}

function formatarTelefone(tel) {
  if (!tel) return '-'
  let digits = String(tel).replace(/\D/g, '')
  // Remove prefixo 55 (Brasil) se vier no formato E.164 (12 ou 13 digitos).
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2)
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return tel
}

function IconeStatus({ status }) {
  const cls = 'h-4 w-4 inline-block'
  if (status === 'sucesso') return <CheckCircle2 className={`${cls} text-green-600`} />
  if (status === 'falha') return <XCircle className={`${cls} text-red-600`} />
  if (status === 'executando') return <Activity className={`${cls} text-blue-600 animate-pulse`} />
  if (status === 'cancelado') return <PauseCircle className={`${cls} text-gray-500`} />
  return <Clock className={`${cls} text-amber-500`} />
}

function KpiCard({ titulo, valor, cor, ativo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-[140px] text-left bg-white rounded-xl shadow-md p-4 border-l-4 transition ${
        ativo ? 'ring-2 ring-primary-500' : ''
      }`}
      style={{ borderLeftColor: cor }}
    >
      <div className="text-xs uppercase tracking-wide text-gray-500">{titulo}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: cor }}>{valor}</div>
    </button>
  )
}

function JobDetalhesModal({ jobId, onClose, onReenviado, onCancelado }) {
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState('resumo')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data } = await api.get(`/fila/jobs/${jobId}/`)
      setJob(data)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao carregar detalhes')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const reenviar = async () => {
    setProcessando(true)
    try {
      await api.post(`/fila/jobs/${jobId}/reenviar/`)
      onReenviado?.()
      onClose()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao reenviar')
    } finally {
      setProcessando(false)
    }
  }

  const cancelar = async () => {
    setProcessando(true)
    try {
      await api.post(`/fila/jobs/${jobId}/cancelar/`)
      onCancelado?.()
      onClose()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao cancelar')
    } finally {
      setProcessando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[250] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-church-navy">Job #{jobId}</h2>
            {job && (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                <span className="font-mono">{job.tipo}</span>
                <span style={{ color: STATUS_COR[job.status] }}>• {job.status}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 text-gray-500 hover:text-gray-800">
            <X className="h-5 w-5" />
          </button>
        </header>

        {loading ? (
          <div className="p-8 flex-1 flex items-center justify-center"><LoadingSpinner /></div>
        ) : !job ? (
          <div className="p-8 text-red-700">{erro || 'Job nao encontrado'}</div>
        ) : (
          <>
            <nav className="flex border-b">
              {[
                { id: 'resumo', label: 'Resumo', icon: Eye },
                { id: 'payload', label: 'Payload', icon: Code2 },
                { id: 'historico', label: 'Historico', icon: History },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAbaAtiva(id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 ${
                    abaAtiva === id ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="inline-flex items-center gap-1"><Icon className="h-4 w-4" />{label}</span>
                </button>
              ))}
            </nav>

            <div className="p-4 flex-1 overflow-y-auto">
              {abaAtiva === 'resumo' && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {[
                    ['Tipo', job.tipo],
                    ['Fila', job.fila],
                    ['Status', job.status],
                    ['Tentativas', `${job.tentativas}/${job.max_tentativas}`],
                    ['Criado em', formatarDataHora(job.criado_em)],
                    ['Ultima execucao', formatarDataHora(job.ultima_execucao_em)],
                    ['Proxima execucao', formatarDataHora(job.proxima_execucao_em)],
                    ['Concluido em', formatarDataHora(job.concluido_em)],
                    ['Duracao', job.duracao_ms != null ? `${job.duracao_ms} ms` : '-'],
                    ['Referencia', job.referencia_tipo ? `${job.referencia_tipo} #${job.referencia_id}` : '-'],
                    ['Job ID (RQ)', job.job_id || '-'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-gray-500">{k}</dt>
                      <dd className="font-medium text-gray-800 break-all">{v}</dd>
                    </div>
                  ))}
                  {job.whatsapp && (
                    <div className="sm:col-span-2 border-t pt-2 mt-2">
                      <dt className="text-xs text-gray-500">Mensagem WhatsApp</dt>
                      <dd className="text-gray-700 whitespace-pre-wrap font-mono text-xs bg-gray-50 p-2 rounded mt-1">
                        {job.whatsapp.mensagem_renderizada || '-'}
                      </dd>
                    </div>
                  )}
                  {job.ultimo_erro && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-red-600">Ultimo erro</dt>
                      <dd className="text-red-800 bg-red-50 p-2 rounded text-xs font-mono whitespace-pre-wrap">
                        {job.ultimo_erro}
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              {abaAtiva === 'payload' && (
                <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto">
                  {JSON.stringify(job.payload, null, 2)}
                </pre>
              )}

              {abaAtiva === 'historico' && (
                <div>
                  {job.tentativas_log?.length ? (
                    <ol className="space-y-2">
                      {job.tentativas_log.map((t) => (
                        <li key={t.id} className="border-l-4 pl-3" style={{ borderColor: t.sucesso ? '#10b981' : '#ef4444' }}>
                          <div className="text-xs text-gray-500">{formatarDataHora(t.iniciado_em)}</div>
                          <div className="text-sm">{t.sucesso ? 'Sucesso' : `Falhou${t.http_status ? ` (HTTP ${t.http_status})` : ''}`}</div>
                          {t.erro && <pre className="text-xs text-red-700 bg-red-50 p-2 rounded mt-1 whitespace-pre-wrap">{t.erro}</pre>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-gray-500 text-sm">Nenhuma tentativa registrada.</p>
                  )}
                </div>
              )}
            </div>

            <footer className="border-t p-4 flex flex-wrap gap-2 justify-end">
              {job.status === 'pendente' && (
                <button
                  type="button"
                  onClick={cancelar}
                  disabled={processando}
                  className="btn-outline text-red-700 border-red-200 hover:bg-red-50"
                >
                  Cancelar job
                </button>
              )}
              {job.status !== 'executando' && (
                <button
                  type="button"
                  onClick={reenviar}
                  disabled={processando}
                  className="btn-primary flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  Reenviar agora
                </button>
              )}
              <button type="button" onClick={onClose} className="btn-outline">Fechar</button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

function AdminFila() {
  const [kpis, setKpis] = useState(null)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [statusAtivo, setStatusAtivo] = useState('todos')
  const [filaFiltro, setFilaFiltro] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selecionados, setSelecionados] = useState(new Set())
  const [detalheId, setDetalheId] = useState(null)
  const [confirmLote, setConfirmLote] = useState(null)
  const [confirmExcluir, setConfirmExcluir] = useState(null)
  const [processandoLote, setProcessandoLote] = useState(false)

  // Filtro de período (default: hoje)
  const [periodo, setPeriodo] = useState('dia')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Filas/tipos atualmente em uso (vem da API para nao listar opcoes vazias)
  const [filasDisponiveis, setFilasDisponiveis] = useState([])
  const [tiposDisponiveis, setTiposDisponiveis] = useState([])

  const carregarKpis = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set('periodo', periodo)
      if (periodo === 'personalizado') {
        if (dataInicio) params.set('data_inicio', dataInicio)
        if (dataFim) params.set('data_fim', dataFim)
      }
      const { data } = await api.get(`/fila/jobs/kpis/?${params.toString()}`)
      setKpis(data)
    } catch (err) {
      console.warn('KPI fila:', err)
    }
  }, [periodo, dataInicio, dataFim])

  const carregarFiltros = useCallback(async () => {
    try {
      const { data } = await api.get('/fila/jobs/filtros/')
      setFilasDisponiveis(data.filas || [])
      setTiposDisponiveis(data.tipos || [])
    } catch (err) {
      console.warn('Filtros fila:', err)
    }
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    setSucesso('')
    try {
      const params = new URLSearchParams()
      if (statusAtivo !== 'todos') params.set('status', statusAtivo)
      if (filaFiltro) params.set('fila', filaFiltro)
      if (tipoFiltro) params.set('tipo', tipoFiltro)
      if (buscaAplicada) params.set('busca', buscaAplicada)
      params.set('periodo', periodo)
      if (periodo === 'personalizado') {
        if (dataInicio) params.set('data_inicio', dataInicio)
        if (dataFim) params.set('data_fim', dataFim)
      }
      params.set('page', String(pagina))
      params.set('page_size', String(PAGE_SIZE))
      const { data } = await api.get(`/fila/jobs/?${params.toString()}`)
      setJobs(data.results || [])
      setTotal(data.count || 0)
    } catch (err) {
      setErro(err.response?.data?.error || err.message || 'Erro ao carregar jobs')
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [statusAtivo, filaFiltro, tipoFiltro, buscaAplicada, pagina, periodo, dataInicio, dataFim])

  useEffect(() => {
    carregarKpis()
  }, [carregarKpis])

  useEffect(() => {
    carregarFiltros()
  }, [carregarFiltros])

  useEffect(() => {
    carregar()
    setSelecionados(new Set())
  }, [carregar])

  useEffect(() => {
    if (!autoRefresh) return undefined
    const t = setInterval(() => {
      carregar()
      carregarKpis()
      carregarFiltros()
    }, 10000)
    return () => clearInterval(t)
  }, [autoRefresh, carregar, carregarKpis, carregarFiltros])

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const alternarSelecionado = (id) => {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  const reenviarLote = async () => {
    if (!confirmLote) return
    setProcessandoLote(true)
    try {
      await api.post('/fila/jobs/reenviar-lote/', { ids: Array.from(confirmLote) })
      setConfirmLote(null)
      setSelecionados(new Set())
      carregar()
      carregarKpis()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao reenviar lote')
    } finally {
      setProcessandoLote(false)
    }
  }

  const excluirLote = async () => {
    if (!confirmExcluir) return
    setProcessandoLote(true)
    try {
      const { data } = await api.post('/fila/jobs/excluir-lote/', { ids: Array.from(confirmExcluir) })
      const excluidos = data?.excluidos?.length || 0
      const bloqueados = data?.bloqueados?.length || 0
      let msg = `${excluidos} job(s) apagado(s).`
      if (bloqueados > 0) msg += ` ${bloqueados} em execucao (nao puderam ser apagados).`
      setErro('')
      setSucesso(msg)
      setConfirmExcluir(null)
      setSelecionados(new Set())
      carregar()
      carregarKpis()
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao apagar jobs')
    } finally {
      setProcessandoLote(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-church-navy flex items-center gap-3">
            <Activity className="h-8 w-8 text-primary-600" />
            Fila de Integracoes
          </h1>
          <p className="text-gray-600 mt-1">
            Acompanhe WhatsApp, pagamentos e estoque. Reenvie ou cancele jobs pendentes/falhos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-4 w-4 text-gray-500" />
          <select
            value={periodo}
            onChange={(e) => { setPeriodo(e.target.value); setPagina(1) }}
            className="input-field"
          >
            <option value="dia">Hoje</option>
            <option value="mes">Mês atual</option>
            <option value="personalizado">Período personalizado</option>
            <option value="tudo">Tudo (sem filtro de data)</option>
          </select>
          {periodo === 'personalizado' && (
            <>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => { setDataInicio(e.target.value); setPagina(1) }}
                className="input-field"
                title="Data inicial"
              />
              <span className="text-gray-500 text-sm">até</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => { setDataFim(e.target.value); setPagina(1) }}
                className="input-field"
                title="Data final"
              />
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700 ml-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button type="button" onClick={carregar} className="btn-outline flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="flex flex-wrap gap-3 mb-6">
        <KpiCard
          titulo={`Pendentes ${periodo !== 'tudo' ? `(no período)` : '(total)'}`}
          valor={kpis?.pendente ?? '-'}
          cor="#f59e0b"
          ativo={statusAtivo === 'pendente'}
          onClick={() => { setStatusAtivo('pendente'); setPagina(1) }}
        />
        <KpiCard
          titulo={`Executando ${periodo !== 'tudo' ? `(no período)` : '(total)'}`}
          valor={kpis?.executando ?? '-'}
          cor="#3b82f6"
          ativo={statusAtivo === 'executando'}
          onClick={() => { setStatusAtivo('executando'); setPagina(1) }}
        />
        <KpiCard titulo="Sucesso 24h" valor={kpis?.sucesso_24h ?? '-'} cor="#10b981" ativo={statusAtivo === 'sucesso'} onClick={() => { setStatusAtivo('sucesso'); setPagina(1) }} />
        <KpiCard
          titulo={`Falhas ${periodo !== 'tudo' ? `(no período)` : '(total)'}`}
          valor={kpis?.falha_total ?? '-'}
          cor="#ef4444"
          ativo={statusAtivo === 'falha'}
          onClick={() => { setStatusAtivo('falha'); setPagina(1) }}
        />
        <KpiCard titulo="Falhas 24h" valor={kpis?.falha_24h ?? '-'} cor="#b91c1c" ativo={false} onClick={() => { setStatusAtivo('falha'); setPagina(1) }} />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-md p-4 mb-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <select
            value={statusAtivo}
            onChange={(e) => { setStatusAtivo(e.target.value); setPagina(1) }}
            className="input-field lg:w-44"
          >
            {STATUS_TABS.map((s) => <option key={s.valor} value={s.valor}>{s.nome}</option>)}
          </select>
          <select
            value={filaFiltro}
            onChange={(e) => { setFilaFiltro(e.target.value); setPagina(1) }}
            className="input-field lg:w-44"
          >
            <option value="">Fila: Todas</option>
            {filasDisponiveis.map((f) => (
              <option key={f} value={f}>Fila: {FILA_LABEL[f] || f}</option>
            ))}
          </select>
          <select
            value={tipoFiltro}
            onChange={(e) => { setTipoFiltro(e.target.value); setPagina(1) }}
            className="input-field lg:flex-1"
          >
            <option value="">Todos os tipos</option>
            {tiposDisponiveis.map((t) => <option key={t} value={t}>{formatarTipo(t)}</option>)}
          </select>
          <div className="relative lg:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Buscar por telefone (ex: 13 98830)"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setBuscaAplicada(busca.trim())
                  setPagina(1)
                }
              }}
              className="input-field pl-10"
            />
          </div>
        </div>
        {erro && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{erro}</span>
          </div>
        )}
      </div>

      {/* Acoes em massa */}
      {selecionados.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 flex items-center justify-between">
          <div className="text-sm text-blue-900">
            {selecionados.size} job(s) selecionado(s)
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelecionados(new Set())} className="btn-outline text-sm">
              Desmarcar
            </button>
            <button
              type="button"
              onClick={() => setConfirmExcluir(selecionados)}
              disabled={selecionados.size === 0}
              className="btn-outline text-red-700 border-red-200 hover:bg-red-50 text-sm flex items-center gap-1 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Apagar selecionados
            </button>
            <button type="button" onClick={() => setConfirmLote(selecionados)} className="btn-primary text-sm flex items-center gap-1">
              <Send className="h-4 w-4" />
              Reenviar selecionados
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        {loading && jobs.length === 0 ? (
          <div className="p-12 flex justify-center"><LoadingSpinner /></div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Activity className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            Nenhum job encontrado com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={jobs.length > 0 && jobs.every((j) => selecionados.has(j.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelecionados(new Set(jobs.map((j) => j.id)))
                        else setSelecionados(new Set())
                      }}
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fila</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telefone</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tentativas</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criado</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proxima</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selecionados.has(j.id)}
                        onChange={() => alternarSelecionado(j.id)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ background: STATUS_COR[j.status] || '#6b7280' }}
                      >
                        <IconeStatus status={j.status} />
                        {j.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm font-mono text-gray-700">{formatarTipo(j.tipo)}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{j.fila}</td>
                    <td className="px-3 py-3 text-sm text-gray-700 font-mono">
                      {j.telefone ? formatarTelefone(j.telefone) : '-'}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700">{j.tentativas}/{j.max_tentativas}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{formatarDataHora(j.criado_em)}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{formatarDataHora(j.proxima_execucao_em)}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDetalheId(j.id)}
                        className="text-primary-700 hover:text-primary-900"
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm">
            <span className="text-gray-600">Pagina {pagina} de {totalPaginas} ({total} jobs)</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} className="p-2 rounded border bg-white hover:bg-gray-50 disabled:opacity-50">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas} className="p-2 rounded border bg-white hover:bg-gray-50 disabled:opacity-50">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {detalheId && (
        <JobDetalhesModal
          jobId={detalheId}
          onClose={() => setDetalheId(null)}
          onReenviado={() => { carregar(); carregarKpis() }}
          onCancelado={() => { carregar(); carregarKpis() }}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(confirmLote)}
        title="Reenviar jobs em lote"
        message={`Deseja reenfileirar ${confirmLote?.size || 0} job(s) na fila?`}
        type="warning"
        confirmText="Reenviar"
        onConfirm={reenviarLote}
        loading={processandoLote}
        onClose={() => setConfirmLote(null)}
      />

      <ConfirmModal
        isOpen={Boolean(confirmExcluir)}
        title="Apagar jobs definitivamente"
        message={`Esta acao remove ${confirmExcluir?.size || 0} job(s) do banco. Nao ha como desfazer. Jobs em execucao serao ignorados.`}
        type="danger"
        confirmText="Apagar"
        onConfirm={excluirLote}
        loading={processandoLote}
        onClose={() => setConfirmExcluir(null)}
      />

      {sucesso && (
        <div className="fixed top-4 right-4 z-50 bg-green-50 border border-green-200 text-green-800 px-4 py-2 rounded shadow flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm">{sucesso}</span>
          <button type="button" onClick={() => setSucesso('')} className="ml-2 text-green-700 hover:text-green-900">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

export default AdminFila
