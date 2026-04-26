import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Receipt, RefreshCw, Store, Trash2 } from 'lucide-react'
import api, { formatApiError } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import AdminLojaSecaoNav from '../../components/AdminLojaSecaoNav'

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

function AdminLojaVendas() {
  const { user } = useAuth()
  const podeExcluirVenda = Boolean(user?.is_staff)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [fStatus, setFStatus] = useState('')
  const [fCat, setFCat] = useState('')
  const [page, setPage] = useState(1)
  const [excluindoId, setExcluindoId] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)

  const load = async (opts = {}) => {
    try {
      setLoading(true)
      const params = { page }
      if (fStatus) params.status = fStatus
      if (fCat) params.categoria = fCat
      const { data } = await api.get('/loja/vendas/', { params: { ...params, page_size: 20 } })
      const firstRows = data.results || data

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
          const { data: data2 } = await api.get('/loja/vendas/', { params: { ...params, page_size: 20 } })
          setRows(data2.results || data2)
          return
        }
      }

      setRows(firstRows)
    } catch (e) {
      console.error(e)
      setRows([])
    } finally {
      setSincronizando(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    load({ syncPending: false })
  }, [page, fStatus, fCat])

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
      await load()
    } catch (e) {
      alert(formatApiError(e, 'Não foi possível excluir a venda.'))
    } finally {
      setExcluindoId(null)
    }
  }

  if (loading && !rows.length) {
    return <LoadingSpinner size="lg" text="Carregando vendas..." />
  }

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
            onClick={() => load({ syncPending: true })}
            disabled={sincronizando}
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
              {podeExcluirVenda && <th className="p-2 w-24 text-right">Ações</th>}
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
                {podeExcluirVenda && (
                  <td className="p-2 text-right">
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
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={podeExcluirVenda ? 7 : 6} className="p-6 text-center text-gray-500">
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

      <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
        <Store className="w-3 h-3" /> Totais por filtros: somar manualmente a partir da lista (MVP).
      </p>
    </div>
  )
}

export default AdminLojaVendas
