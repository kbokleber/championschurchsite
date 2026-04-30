import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ShieldCheck, RefreshCw } from 'lucide-react'
import api, { formatApiError } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'

const EVENTO_AUDITORIA = {
  produto_criado: 'Produto criado',
  produto_atualizado: 'Produto atualizado',
  produto_preco_alterado: 'Preço alterado',
  venda_criada: 'Venda criada',
  venda_itens_alterados: 'Itens alterados',
  venda_pagamento_dinheiro: 'Venda paga em dinheiro',
  venda_pagamento_mp: 'Venda paga no Mercado Pago',
  venda_cancelada: 'Venda cancelada',
}

function getHojeInputDate() {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function AdminLojaAuditoria() {
  const { user } = useAuth()
  const podeVerAuditoria = Boolean(user?.is_superuser)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [fCat, setFCat] = useState('')
  const [fEvento, setFEvento] = useState('')
  const [dataInicio, setDataInicio] = useState(getHojeInputDate)
  const [dataFim, setDataFim] = useState(getHojeInputDate)

  const load = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/loja/auditoria/', {
        params: {
          page_size: 50,
          ...(fCat ? { categoria: fCat } : {}),
          ...(fEvento ? { tipo_evento: fEvento } : {}),
          ...(dataInicio ? { data_inicio: dataInicio } : {}),
          ...(dataFim ? { data_fim: dataFim } : {}),
        },
      })
      setRows(data.results || data || [])
    } catch (e) {
      console.error(e)
      alert(formatApiError(e, 'Não foi possível carregar os logs de auditoria.'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (podeVerAuditoria) {
      load()
    }
  }, [fCat, fEvento, dataInicio, dataFim, podeVerAuditoria])

  if (!podeVerAuditoria) {
    return <Navigate to="/admin/loja/vendas" replace />
  }

  if (loading && !rows.length) {
    return <LoadingSpinner size="lg" text="Carregando auditoria..." />
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-church-sky" />
            Auditoria da Loja/Cantina
          </h1>
          <p className="text-gray-600 text-sm">Quem fez, o que fez e quando fez.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select className="input text-sm" value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="">Todas categorias</option>
            <option value="cantina">Cantina</option>
            <option value="loja">Loja</option>
          </select>
          <select className="input text-sm" value={fEvento} onChange={(e) => setFEvento(e.target.value)}>
            <option value="">Todos os eventos</option>
            {Object.entries(EVENTO_AUDITORIA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input text-sm"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            aria-label="Data inicial"
            title="Data inicial"
          />
          <input
            type="date"
            className="input text-sm"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            aria-label="Data final"
            title="Data final"
          />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="btn btn-secondary flex items-center gap-1 text-sm disabled:opacity-60"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="p-2">Data/hora</th>
              <th className="p-2">Evento</th>
              <th className="p-2">Usuário</th>
              <th className="p-2">Venda</th>
              <th className="p-2">Produto</th>
              <th className="p-2">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-t border-gray-100">
                <td className="p-2 text-gray-700">
                  {l.data_evento ? new Date(l.data_evento).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="p-2">{EVENTO_AUDITORIA[l.tipo_evento] || l.tipo_evento}</td>
                <td className="p-2">{l.usuario_nome || 'Sistema'}</td>
                <td className="p-2">{l.venda ? `#${l.venda}` : '—'}</td>
                <td className="p-2">{l.produto_nome || '—'}</td>
                <td className="p-2 max-w-xl whitespace-pre-wrap break-words text-xs text-gray-600">
                  {l.detalhes ? JSON.stringify(l.detalhes) : '—'}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  Sem eventos de auditoria para os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AdminLojaAuditoria
