import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Receipt, RefreshCw, Store, Trash2, FileText, X, ChevronLeft, ChevronRight } from 'lucide-react'
import api, { formatApiError } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import AdminLojaSecaoNav from '../../components/AdminLojaSecaoNav'
import VendaPagaResumo from '../../components/loja/VendaPagaResumo'

const STATUS = {
  rascunho: 'Rascunho',
  pendente_pagamento: 'Pendente',
  pago: 'Pago',
  cancelado: 'Cancelado',
}

const MEIO = {
  dinheiro: 'Dinheiro',
  pix_mp: 'PIX/MP',
  cartao_mp: 'Cartão/MP',
}

const PAGE_SIZE = 20

function fmtDataLocal(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function paramsPeriodo(periodo, dataInicio, dataFim) {
  const hoje = fmtDataLocal(new Date())
  if (periodo === 'dia') {
    return { data_inicio: hoje, data_fim: hoje }
  }
  if (periodo === 'mes') {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return { data_inicio: fmtDataLocal(first), data_fim: hoje }
  }
  if (periodo === 'personalizado' && dataInicio && dataFim) {
    return { data_inicio: dataInicio, data_fim: dataFim }
  }
  return {}
}

function AdminLojaVendas() {
  const { user } = useAuth()
  const podeExcluirVenda = Boolean(user?.is_superuser)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [fStatus, setFStatus] = useState('')
  const [fCat, setFCat] = useState('')
  const [periodo, setPeriodo] = useState('dia')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [periodoPersonalizadoAtivo, setPeriodoPersonalizadoAtivo] = useState(false)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [excluindoId, setExcluindoId] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [reciboCodigo, setReciboCodigo] = useState(null)

  const load = async (opts = {}) => {
    try {
      setLoading(true)
      const params = {
        page,
        page_size: PAGE_SIZE,
        ...paramsPeriodo(periodo, dataInicio, dataFim),
      }
      if (fStatus) params.status = fStatus
      if (fCat) params.categoria = fCat
      const { data } = await api.get('/loja/vendas/', { params })
      const firstRows = data.results || data
      setTotalCount(typeof data.count === 'number' ? data.count : (firstRows || []).length)

      if (opts.syncPending) {
        const pendentes = (firstRows || []).filter(
          (r) =>
            r.status === 'pendente_pagamento' &&
            (r.meio_pagamento === 'pix_mp' || r.meio_pagamento === 'cartao_mp') &&
            r.cobranca_loja_id,
        )
        if (pendentes.length) {
          setSincronizando(true)
          await Promise.allSettled(
            pendentes.map((r) => api.get(`/loja/mercadopago/verificar/${r.cobranca_loja_id}/`)),
          )
          const { data: data2 } = await api.get('/loja/vendas/', { params })
          setRows(data2.results || data2)
          setTotalCount(typeof data2.count === 'number' ? data2.count : (data2.results || data2).length)
          return
        }
      }

      setRows(firstRows)
    } catch (e) {
      console.error(e)
      setRows([])
      setTotalCount(0)
    } finally {
      setSincronizando(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (periodo === 'personalizado' && !periodoPersonalizadoAtivo) return
    load({ syncPending: false })
  }, [page, fStatus, fCat, periodo, periodoPersonalizadoAtivo])

  const canLoadCustom = useMemo(() => {
    if (periodo !== 'personalizado') return true
    return Boolean(dataInicio && dataFim)
  }, [periodo, dataInicio, dataFim])

  const handleAtualizar = () => {
    if (periodo === 'personalizado') {
      if (!dataInicio || !dataFim) return
      setPeriodoPersonalizadoAtivo(true)
      setPage(1)
    }
    load({ syncPending: true })
  }

  const handlePeriodoChange = (value) => {
    setPage(1)
    setPeriodo(value)
    if (value !== 'personalizado') {
      setPeriodoPersonalizadoAtivo(false)
    }
  }

  const excluirVenda = async (id) => {
    if (
      !window.confirm(
        'Excluir esta venda de forma definitiva? Se tiver pago e controle de estoque, as quantidades voltam para o saldo dos produtos.'
      )
    ) {
      return
    }
    try {
      setExcluindoId(id)
      await api.delete(`/loja/vendas/${id}/`)
      if (rows.length <= 1 && page > 1) setPage((p) => p - 1)
      else await load()
    } catch (e) {
      alert(formatApiError(e, 'Não foi possível excluir a venda.'))
    } finally {
      setExcluindoId(null)
    }
  }

  if (loading && !rows.length) {
    return <LoadingSpinner size="lg" text="Carregando vendas..." />
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const startItem = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const endItem = Math.min(page * PAGE_SIZE, totalCount)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <AdminLojaSecaoNav area={undefined} />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="w-7 h-7 text-church-sky" />
            Histórico de vendas
          </h1>
          <p className="text-gray-600 text-sm">Cantina e Loja juntas. Use os filtros para ver só Cantina ou só Loja.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select className="input text-sm" value={periodo} onChange={(e) => handlePeriodoChange(e.target.value)}>
            <option value="dia">Hoje</option>
            <option value="mes">Mês atual</option>
            <option value="personalizado">Período personalizado</option>
          </select>
          {periodo === 'personalizado' && (
            <>
              <input
                type="date"
                className="input text-sm"
                value={dataInicio}
                onChange={(e) => {
                  setPeriodoPersonalizadoAtivo(false)
                  setDataInicio(e.target.value)
                }}
                title="Data inicial"
              />
              <input
                type="date"
                className="input text-sm"
                value={dataFim}
                onChange={(e) => {
                  setPeriodoPersonalizadoAtivo(false)
                  setDataFim(e.target.value)
                }}
                title="Data final"
              />
            </>
          )}
          <select className="input text-sm" value={fStatus} onChange={(e) => { setPage(1); setFStatus(e.target.value) }}>
            <option value="">Todos status</option>
            {Object.keys(STATUS).map((k) => (
              <option key={k} value={k}>{STATUS[k]}</option>
            ))}
          </select>
          <select className="input text-sm" value={fCat} onChange={(e) => { setPage(1); setFCat(e.target.value) }}>
            <option value="">Todas categorias (itens)</option>
            <option value="cantina">Cantina (item)</option>
            <option value="loja">Loja (item)</option>
          </select>
          <button
            type="button"
            onClick={handleAtualizar}
            disabled={sincronizando || !canLoadCustom || loading}
            className="btn btn-secondary flex items-center gap-1 text-sm disabled:opacity-60"
            title="Atualiza lista e reconcilia pagamentos pendentes no Mercado Pago"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </div>
      {sincronizando && (
        <p className="text-xs text-amber-700 mb-2">Sincronizando pagamentos pendentes no Mercado Pago...</p>
      )}

      <p className="text-sm text-gray-500 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link to="/admin/loja" className="text-church-sky hover:underline font-medium">Início (Cantina / Loja)</Link>
        <span className="text-gray-300" aria-hidden>|</span>
        <Link to="/admin/loja/cantina/produtos" className="text-amber-800 hover:underline">Produtos — Cantina</Link>
        <span className="text-gray-300" aria-hidden>|</span>
        <Link to="/admin/loja/loja/produtos" className="text-sky-800 hover:underline">Produtos — Loja</Link>
        <span className="text-gray-300" aria-hidden>|</span>
        <Link to="/admin/loja/cantina/nova-venda" className="text-church-sky hover:underline">Vender (Cantina)</Link>
        <span className="text-gray-300" aria-hidden>|</span>
        <Link to="/admin/loja/loja/nova-venda" className="text-church-sky hover:underline">Vender (Loja)</Link>
      </p>

      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">Data</th>
              <th className="p-2">Status</th>
              <th className="p-2">Meio</th>
              <th className="p-2">Comprador</th>
              <th className="p-2">Total</th>
              <th className="p-2">Atendente</th>
              <th className="p-2 w-40 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="p-2 font-mono">{r.id}</td>
                <td className="p-2 text-gray-700">
                  {r.data_criacao
                    ? new Date(r.data_criacao).toLocaleString('pt-BR')
                    : '—'}
                </td>
                <td className="p-2">{STATUS[r.status] || r.status}</td>
                <td className="p-2">{MEIO[r.meio_pagamento] || r.meio_pagamento}</td>
                <td className="p-2 max-w-xs truncate" title={r.comprador_nome}>{r.comprador_nome || '—'}</td>
                <td className="p-2 font-medium">
                  R$ {Number(r.total).toFixed(2).replace('.', ',')}
                </td>
                <td className="p-2 text-gray-700 max-w-[10rem] truncate" title={r.criado_por_nome}>
                  {r.criado_por_nome || '—'}
                </td>
                <td className="p-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    {r.status === 'pago' && r.cobranca_loja_codigo && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-primary-700 hover:bg-primary-50"
                        onClick={() => setReciboCodigo(r.cobranca_loja_codigo)}
                        title="Ver / enviar recibo"
                      >
                        <FileText className="w-4 h-4" />
                        Recibo
                      </button>
                    )}
                    {podeExcluirVenda && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                        disabled={excluindoId === r.id}
                        onClick={() => excluirVenda(r.id)}
                        title="Excluir venda (apenas administradores)"
                      >
                        <Trash2 className="w-4 h-4" />
                        {excluindoId === r.id ? '…' : 'Excluir'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  Nenhuma venda. Inicie uma{' '}
                  <Link to="/admin/loja/cantina/nova-venda" className="text-church-sky hover:underline">nova venda (Cantina)</Link>
                  {' ou '}
                  <Link to="/admin/loja/loja/nova-venda" className="text-church-sky hover:underline">nova venda (Loja)</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalCount > PAGE_SIZE && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-gray-600">
          <p>
            Mostrando <span className="font-medium text-gray-900">{startItem}</span>
            –<span className="font-medium text-gray-900">{endItem}</span> de{' '}
            <span className="font-medium text-gray-900">{totalCount}</span> vendas
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="btn btn-secondary inline-flex items-center gap-1 text-sm disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="px-2 tabular-nums">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="btn btn-secondary inline-flex items-center gap-1 text-sm disabled:opacity-50"
            >
              Próxima
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {totalCount > 0 && totalCount <= PAGE_SIZE && (
        <p className="mt-3 text-sm text-gray-500">
          {totalCount} {totalCount === 1 ? 'venda' : 'vendas'} no período selecionado.
        </p>
      )}

      <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
        <Store className="w-3 h-3" /> Totais por filtros: somar manualmente a partir da lista (MVP).
      </p>

      {reciboCodigo && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          onClick={() => setReciboCodigo(null)}
        >
          <div
            className="relative max-w-lg w-full bg-transparent"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute -top-3 -right-3 z-10 bg-white text-gray-700 hover:text-gray-900 rounded-full shadow p-1.5"
              onClick={() => setReciboCodigo(null)}
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
            <VendaPagaResumo
              codigo={reciboCodigo}
              ondeIrAposEnvio={() => setReciboCodigo(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminLojaVendas
