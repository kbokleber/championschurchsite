import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { BarChart3, RefreshCw, TrendingUp, Wallet, Package, Clock3, UserCircle } from 'lucide-react'
import api, { formatApiError } from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'
import AdminLojaSecaoNav from '../../components/AdminLojaSecaoNav'

const CHART_COLORS = ['#0369a1', '#0d9488', '#ca8a04', '#7c3aed', '#c2410c', '#15803d']

function fmtBRL(v) {
  const n = Number(v || 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtBRLCompact(v) {
  const n = Number(v || 0)
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(1)}k`
  if (n >= 100) return `R$ ${Math.round(n)}`
  return fmtBRL(n)
}

function fmtDateLabel(s) {
  if (!s) return '—'
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-')
    return `${m}/${y}`
  }
  const d = new Date(`${s}T00:00:00`)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('pt-BR')
}

function PaymentLabel({ code }) {
  const map = {
    dinheiro: 'Dinheiro',
    pix_mp: 'PIX (Mercado Pago)',
    cartao_mp: 'Cartão (Mercado Pago)',
  }
  return map[code] || code || '—'
}

function truncateNome(s, max = 26) {
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function fmtQty(v) {
  const n = Number(v || 0)
  return n.toLocaleString('pt-BR')
}

function ChartCardTooltip({ active, payload, label, title }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-sm max-w-xs">
      <p className="font-medium text-gray-900">{title || label}</p>
      {row.valor != null && (
        <p className="text-gray-800">Faturamento: {fmtBRL(row.valor)}</p>
      )}
      {row.faturamento != null && (
        <p className="text-gray-800">Faturamento: {fmtBRL(row.faturamento)}</p>
      )}
      {row.vendas != null && (
        <p className="text-gray-700">Vendas: {fmtQty(row.vendas)}</p>
      )}
      {row.itens != null && (
        <p className="text-gray-700">Itens: {fmtQty(row.itens)}</p>
      )}
      {row.unidades != null && (
        <p className="text-gray-700">Unidades: {fmtQty(row.unidades)}</p>
      )}
      {row.quantidade != null && (
        <p className="text-gray-700">Transações: {fmtQty(row.quantidade)}</p>
      )}
    </div>
  )
}

function AdminLojaFinanceiro() {
  const [periodo, setPeriodo] = useState('mes')
  const [categoria, setCategoria] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const params = {
        periodo,
        ...(categoria ? { categoria } : {}),
      }
      if (periodo === 'personalizado') {
        params.data_inicio = dataInicio
        params.data_fim = dataFim
      }
      const res = await api.get('/loja/dashboard-financeiro/', { params })
      setData(res.data)
    } catch (e) {
      alert(formatApiError(e, 'Não foi possível carregar o dashboard financeiro.'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (periodo !== 'personalizado') {
      load()
    }
  }, [periodo, categoria])

  useEffect(() => {
    load()
  }, [])

  const canLoadCustom = useMemo(() => {
    if (periodo !== 'personalizado') return true
    return Boolean(dataInicio && dataFim)
  }, [periodo, dataInicio, dataFim])

  const resumo = data?.resumo || {}
  const topProdutos = data?.top_produtos || []
  const meios = data?.meios_pagamento || []
  const serie = data?.serie_faturamento || []
  const topHorarios = data?.top_horarios || []
  const categorias = data?.categorias || []
  const porAtendente = data?.por_atendente || []

  const serieChart = useMemo(
    () =>
      serie.map((s) => ({
        label: fmtDateLabel(s.periodo),
        valor: Number(s.valor || 0),
        vendas: Number(s.vendas || 0),
        itens: Number(s.itens || 0),
      })),
    [serie],
  )

  const produtosChart = useMemo(
    () =>
      topProdutos.slice(0, 10).map((p) => ({
        nome: truncateNome(p.produto_nome, 28),
        faturamento: Number(p.faturamento || 0),
        unidades: Number(p.unidades || 0),
        vendas: Number(p.vendas || 0),
      })),
    [topProdutos],
  )

  const meiosChart = useMemo(
    () =>
      meios.map((m) => ({
        nameStr: String(
          {
            dinheiro: 'Dinheiro',
            pix_mp: 'PIX (MP)',
            cartao_mp: 'Cartão (MP)',
          }[m.meio_pagamento] || m.meio_pagamento,
        ),
        valor: Number(m.valor || 0),
        quantidade: Number(m.quantidade || 0),
      })),
    [meios],
  )

  const horariosChart = useMemo(() => {
    const sorted = [...topHorarios].sort((a, b) => Number(a.hora) - Number(b.hora))
    return sorted.map((h) => ({
      label: `${String(h.hora).padStart(2, '0')}:00`,
      valor: Number(h.valor || 0),
      vendas: Number(h.vendas || 0),
      hora: Number(h.hora),
    }))
  }, [topHorarios])

  const categoriasChart = useMemo(
    () =>
      categorias.map((c) => ({
        nome: c.categoria === 'cantina' ? 'Cantina' : c.categoria === 'loja' ? 'Loja' : c.categoria,
        faturamento: Number(c.faturamento || 0),
        unidades: Number(c.unidades || 0),
      })),
    [categorias],
  )

  const atendentesChart = useMemo(
    () =>
      porAtendente.map((a) => ({
        nome: truncateNome(a.atendente_nome, 28),
        faturamento: Number(a.faturamento || 0),
        vendas: Number(a.vendas || 0),
      })),
    [porAtendente],
  )

  const alturaProdutos = Math.min(420, Math.max(200, produtosChart.length * 40 || 200))
  const alturaAtendentes = Math.min(420, Math.max(200, atendentesChart.length * 44 || 200))

  if (loading && !data) {
    return <LoadingSpinner size="lg" text="Carregando dashboard financeiro..." />
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <AdminLojaSecaoNav area={undefined} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-church-sky" />
            Dashboard Financeiro (Loja/Cantina)
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            KPIs e gráficos por período — produtos, atendentes, meios de pagamento e horários.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select className="input text-sm" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="dia">Hoje</option>
            <option value="mes">Mês atual</option>
            <option value="personalizado">Período personalizado</option>
          </select>
          <select className="input text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas categorias</option>
            <option value="cantina">Cantina</option>
            <option value="loja">Loja</option>
          </select>
          {periodo === 'personalizado' && (
            <>
              <input
                type="date"
                className="input text-sm"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                title="Data inicial"
              />
              <input
                type="date"
                className="input text-sm"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                title="Data final"
              />
            </>
          )}
          <button
            type="button"
            disabled={!canLoadCustom || loading}
            onClick={load}
            className="btn btn-secondary text-sm flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Faturamento total
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtBRL(resumo.faturamento_total)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Ticket médio
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtBRL(resumo.ticket_medio)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Package className="w-4 h-4" /> Itens vendidos
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{Number(resumo.total_itens_vendidos || 0)}</p>
          <p className="text-xs text-gray-500 mt-1">
            Vendas pagas: {Number(resumo.total_vendas_pagas || 0)} | Canceladas:{' '}
            {Number(resumo.total_vendas_canceladas || 0)}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Evolução do faturamento</h2>
        <p className="text-xs text-gray-500 mb-3">
          Faturamento (área), quantidade de vendas e itens por dia (ou por mês em períodos longos).
        </p>
        {serieChart.length > 0 ? (
          <div className="w-full h-[300px] min-h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serieChart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillFat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0284c7" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#6b7280" />
                <YAxis
                  yAxisId="left"
                  tickFormatter={(v) => fmtBRLCompact(v)}
                  width={72}
                  tick={{ fontSize: 11 }}
                  stroke="#6b7280"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v) => fmtQty(v)}
                  width={48}
                  tick={{ fontSize: 11 }}
                  stroke="#6b7280"
                />
                <Tooltip content={<ChartCardTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="valor"
                  name="Faturamento"
                  stroke="#0369a1"
                  strokeWidth={2}
                  fill="url(#fillFat)"
                />
                <Bar yAxisId="right" dataKey="vendas" name="Vendas" fill="#0d9488" barSize={14} radius={[4, 4, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="itens"
                  name="Itens"
                  stroke="#ca8a04"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-8 text-center">Sem dados no período selecionado.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Produtos mais vendidos</h2>
          <p className="text-xs text-gray-500 mb-2">Unidades e faturamento por produto — até 10 itens.</p>
          {produtosChart.length > 0 ? (
            <div style={{ height: alturaProdutos }} className="w-full min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={produtosChart}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => fmtQty(v)}
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={118}
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                  />
                  <Tooltip content={<ChartCardTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="unidades" name="Unidades" fill="#0d9488" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Sem dados no período selecionado.</p>
          )}
          <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-xs text-gray-600">
            {topProdutos.slice(0, 5).map((p) => (
              <li key={p.produto_id} className="flex justify-between gap-2">
                <span className="truncate">{p.produto_nome}</span>
                <span className="shrink-0 text-gray-900 font-medium text-right">
                  {fmtQty(p.unidades)} un · {fmtBRL(p.faturamento)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Meios de pagamento</h2>
          <p className="text-xs text-gray-500 mb-2">Quantidade de transações e faturamento por meio.</p>
          {meiosChart.length > 0 ? (
            <div className="w-full h-[280px] min-h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={meiosChart}
                    dataKey="quantidade"
                    nameKey="nameStr"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={96}
                    paddingAngle={2}
                    label={({ nameStr, quantidade, percent }) =>
                      `${nameStr} (${fmtQty(quantidade)} · ${(percent * 100).toFixed(0)}%)`
                    }
                  >
                    {meiosChart.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartCardTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Sem dados no período selecionado.</p>
          )}
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
            {meios.map((m) => (
              <div key={m.meio_pagamento} className="flex justify-between text-sm gap-2">
                <span className="text-gray-700">
                  <PaymentLabel code={m.meio_pagamento} />
                </span>
                <span className="font-medium text-gray-900 text-right">
                  {fmtQty(m.quantidade)} trans · {fmtBRL(m.valor)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <UserCircle className="w-4 h-4" /> Vendas por atendente
        </h2>
        <p className="text-xs text-gray-500 mb-2">
          Quantidade de vendas pagas e faturamento por quem registrou a venda no PDV.
        </p>
        {atendentesChart.length > 0 ? (
          <div style={{ height: alturaAtendentes }} className="w-full min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={atendentesChart}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal />
                <XAxis
                  type="number"
                  tickFormatter={(v) => fmtQty(v)}
                  tick={{ fontSize: 11 }}
                  stroke="#6b7280"
                />
                <YAxis
                  type="category"
                  dataKey="nome"
                  width={118}
                  tick={{ fontSize: 11 }}
                  stroke="#6b7280"
                />
                <Tooltip content={<ChartCardTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="vendas" name="Vendas" fill="#7c3aed" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-6 text-center">Sem dados no período selecionado.</p>
        )}
        {porAtendente.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-xs text-gray-600">
            {porAtendente.map((a) => (
              <li key={a.atendente_id ?? a.atendente_nome} className="flex justify-between gap-2">
                <span className="truncate">{a.atendente_nome}</span>
                <span className="shrink-0 text-gray-900 font-medium text-right">
                  {fmtQty(a.vendas)} vendas · {fmtBRL(a.faturamento)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Clock3 className="w-4 h-4" /> Horários de maior venda
          </h2>
          <p className="text-xs text-gray-500 mb-2">Quantidade de vendas e faturamento por hora (horário local).</p>
          {horariosChart.length > 0 ? (
            <div className="w-full h-[260px] min-h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={horariosChart} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#6b7280" />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(v) => fmtQty(v)}
                    width={48}
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => fmtBRLCompact(v)}
                    width={68}
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                  />
                  <Tooltip content={<ChartCardTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="vendas" name="Vendas" fill="#0d9488" radius={[6, 6, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="valor"
                    name="Faturamento"
                    stroke="#0369a1"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Sem dados no período selecionado.</p>
          )}
          {horariosChart.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              {horariosChart.map((h) => (
                <div key={h.label} className="flex justify-between text-sm gap-2">
                  <span className="text-gray-700">{h.label}</span>
                  <span className="font-medium text-gray-900">
                    {fmtQty(h.vendas)} vendas · {fmtBRL(h.valor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Vendas por categoria</h2>
          <p className="text-xs text-gray-500 mb-2">Unidades vendidas e faturamento — Cantina vs Loja.</p>
          {categoriasChart.length > 0 ? (
            <div className="w-full h-[260px] min-h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoriasChart} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="nome" tick={{ fontSize: 12 }} stroke="#6b7280" />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(v) => fmtQty(v)}
                    width={48}
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => fmtBRLCompact(v)}
                    width={68}
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                  />
                  <Tooltip content={<ChartCardTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="unidades" name="Unidades" fill="#0d9488" radius={[6, 6, 0, 0]} />
                  <Bar yAxisId="right" dataKey="faturamento" name="Faturamento" fill="#ca8a04" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Sem dados ou filtro restrito a uma categoria.</p>
          )}
          {categoriasChart.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              {categoriasChart.map((c) => (
                <div key={c.nome} className="flex justify-between text-sm gap-2">
                  <span className="text-gray-700">{c.nome}</span>
                  <span className="font-medium text-gray-900">
                    {fmtQty(c.unidades)} un · {fmtBRL(c.faturamento)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminLojaFinanceiro
