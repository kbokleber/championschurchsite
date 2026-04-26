import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Calendar,
  Plus,
  Minus,
  Banknote,
  RefreshCw,
  Trash2,
  Home,
  ShoppingCart,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import api, { formatApiError } from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'
import AdminLojaSecaoNav from '../../components/AdminLojaSecaoNav'

function hojeISODate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const STATUS = {
  pendente: 'Pendente',
  em_cobranca: 'Pendente',
  pago: 'Pago',
  cancelada: 'Cancelada',
}

/** Garante comparação com a API (string / casing). */
function stReserva(r) {
  return String(r?.status || '')
    .trim()
    .toLowerCase()
}

/**
 * DRF costuma expor venda como id; em alguns casos pode vir objeto. Usar no Set (mesma venda do grupo).
 */
function vendaIdReserva(r) {
  const v = r?.venda
  if (v == null || v === '') return null
  if (typeof v === 'object' && v != null && 'id' in v) {
    const n = Number(v.id)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function areaPdvReserva(r) {
  const a = (r?.categoria || '').toString().toLowerCase()
  return a === 'loja' ? 'loja' : 'cantina'
}

function AdminLojaReservas() {
  const navigate = useNavigate()
  const [data, setData] = useState(hojeISODate())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [produtos, setProdutos] = useState([])
  const [saving, setSaving] = useState(false)
  const [cobrandoGrupoChave, setCobrandoGrupoChave] = useState(null)

  const [nomeReserva, setNomeReserva] = useState('')
  const [carrinho, setCarrinho] = useState(() => [])
  const [carrinhoListaExpandida, setCarrinhoListaExpandida] = useState(false)
  /** Por chave do grupo: tabela de itens expandida. Default: 1 item = expandido, 2+ = recolhido (resumo). */
  const [grupoTabelaExpandida, setGrupoTabelaExpandida] = useState({})
  const [addProduto, setAddProduto] = useState('')
  const [addQtd, setAddQtd] = useState('1')

  const comReserva = useMemo(
    () =>
      Array.isArray(produtos)
        ? produtos.filter(
            (p) =>
              p.categoria === 'cantina' &&
              p.ativo &&
              (!p.controla_estoque || Number(p.estoque) > 0),
          )
        : [],
    [produtos],
  )

  /** Lista plana -> grupos por nome (mesma data já vem filtrada). */
  const gruposPorNome = useMemo(() => {
    const list = Array.isArray(rows) ? rows : []
    const map = new Map()
    for (const r of list) {
      const raw = (r.nome || '').trim()
      const chave = raw ? raw.toLowerCase() : `_id_${r.id}`
      if (!map.has(chave)) {
        map.set(chave, { chave, nomeExibicao: raw || '—', itens: [] })
      }
      const g = map.get(chave)
      if (raw && (g.nomeExibicao === '—' || !g.nomeExibicao)) g.nomeExibicao = raw
      g.itens.push(r)
    }
    for (const g of map.values()) {
      g.itens.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    }
    return Array.from(map.values()).sort((a, b) =>
      a.nomeExibicao.localeCompare(b.nomeExibicao, 'pt-BR', { sensitivity: 'base' }),
    )
  }, [rows])

  const isGrupoTabelaExpandida = (g) => {
    if (!g.itens.length) return false
    const st = grupoTabelaExpandida[g.chave]
    if (st !== undefined) return st
    return false
  }

  const setGrupoTabelaExpandidaChave = (g, v) => {
    setGrupoTabelaExpandida((prev) => ({ ...prev, [g.chave]: v }))
  }

  const totaisGrupo = (g) => {
    const n = g.itens.length
    const un = g.itens.reduce((s, r) => s + (Number(r.quantidade) || 0), 0)
    const primeiro = g.itens[0]?.produto_nome
    return { n, un, primeiro }
  }

  /** Há linhas pendentes a ir ao PDV e nenhuma já em venda rascunho. */
  const grupoPodeCobrarPedidoNoPdv = (g) => {
    if (!g.itens.length) return false
    const hasPend = g.itens.some((r) => stReserva(r) === 'pendente')
    const hasFila = g.itens.some((r) => stReserva(r) === 'em_cobranca')
    return hasPend && !hasFila
  }

  const grupoMistoPendenteEfila = (g) => {
    if (!g.itens.length) return false
    const hasPend = g.itens.some((r) => stReserva(r) === 'pendente')
    const hasFila = g.itens.some((r) => stReserva(r) === 'em_cobranca')
    return hasPend && hasFila
  }

  /** Só linhas em cobrança (mesma venda); linhas pagas no cartão não impedem reabrir. */
  const grupoPodeReabrirMesmaVenda = (g) => {
    const fila = g.itens.filter((r) => stReserva(r) === 'em_cobranca')
    if (!fila.length) return null
    if (g.itens.some((r) => stReserva(r) === 'pendente')) return null
    if (!fila.every((r) => vendaIdReserva(r) != null)) return null
    const ids = fila.map((r) => vendaIdReserva(r))
    const s = new Set(ids)
    if (s.size !== 1) return null
    return ids[0]
  }

  const loadProdutos = useCallback(async () => {
    try {
      const { data: d } = await api.get('/loja/produtos/', {
        params: { categoria: 'cantina', ativo: 'true', page_size: 500 },
      })
      setProdutos(d.results || d)
    } catch (e) {
      console.error(e)
      setProdutos([])
    }
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const { data: d } = await api.get('/loja/reservas/', {
        params: { data, categoria: 'cantina', page_size: 200 },
      })
      setRows(d.results || d)
    } catch (e) {
      console.error(e)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [data])

  useEffect(() => {
    loadProdutos()
  }, [loadProdutos])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setGrupoTabelaExpandida({})
    setCarrinhoListaExpandida(false)
  }, [data])

  const carrinhoTotais = useMemo(() => {
    const n = carrinho.length
    const un = carrinho.reduce((s, l) => s + (Number(l.quantidade) || 0), 0)
    return { n, un }
  }, [carrinho])

  useEffect(() => {
    setCarrinhoListaExpandida(false)
  }, [carrinho.length])

  const adicionarAoCarrinho = () => {
    if (!addProduto) {
      alert('Escolha um produto para adicionar.')
      return
    }
    const q = Math.max(1, parseInt(String(addQtd).replace(/\D/g, ''), 10) || 1)
    const id = parseInt(addProduto, 10)
    const p = comReserva.find((x) => x.id === id)
    setCarrinho((prev) => {
      const i = prev.findIndex((l) => l.produtoId === id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], quantidade: next[i].quantidade + q }
        return next
      }
      return [...prev, { produtoId: id, produtoNome: p?.nome || `#${id}`, quantidade: q }]
    })
    setAddQtd('1')
  }

  const setQtdLinha = (produtoId, qtd) => {
    const q = Math.max(1, parseInt(String(qtd).replace(/\D/g, ''), 10) || 1)
    setCarrinho((prev) => prev.map((l) => (l.produtoId === produtoId ? { ...l, quantidade: q } : l)))
  }

  const incLinha = (produtoId, delta) => {
    setCarrinho((prev) =>
      prev
        .map((l) => {
          if (l.produtoId !== produtoId) return l
          return { ...l, quantidade: l.quantidade + delta }
        })
        .filter((l) => l.quantidade >= 1),
    )
  }

  const removerLinha = (produtoId) => {
    setCarrinho((prev) => prev.filter((l) => l.produtoId !== produtoId))
  }

  const onConfirmarReserva = async (e) => {
    e.preventDefault()
    if (!nomeReserva.trim()) {
      alert('Informe o nome de quem está reservando.')
      return
    }
    if (!carrinho.length) {
      alert('Adicione ao menos um item à lista (como no pedido de compra).')
      return
    }
    setSaving(true)
    try {
      await api.post('/loja/reservas/criar-lote/', {
        data,
        nome: nomeReserva.trim(),
        observacao: '',
        itens: carrinho.map((l) => ({ produto: l.produtoId, quantidade: l.quantidade })),
      })
      setNomeReserva('')
      setCarrinho([])
      setAddProduto('')
      setAddQtd('1')
      await load()
    } catch (err) {
      const d = err.response?.data
      const msg = formatApiError(err, 'Não foi possível reservar.')
      const nfe = d?.non_field_errors
      const detail = typeof d === 'string' ? d : null
      alert(
        nfe
          ? Array.isArray(nfe)
            ? nfe[0]
            : nfe
          : d?.detail
            ? String(d.detail)
            : detail || msg,
      )
    } finally {
      setSaving(false)
    }
  }

  const onCancelarReserva = async (r) => {
    const st = stReserva(r)
    if (st === 'pago' || st === 'cancelada') return
    const msg =
      st === 'em_cobranca'
        ? 'Excluir esta linha? O item sai da venda (rascunho) e o empenho de estoque desta reserva é devolvido, se aplicável.'
        : 'Excluir esta reserva? O empenho de estoque (se houver) é devolvido.'
    if (!window.confirm(msg)) return
    try {
      await api.delete(`/loja/reservas/${r.id}/`)
      await load()
    } catch (e) {
      alert(formatApiError(e, 'Não foi possível cancelar.'))
    }
  }

  const onCobrarTudoNoGrupo = async (g) => {
    const reabre = grupoPodeReabrirMesmaVenda(g)
    if (reabre) {
      const cat = g.itens[0] ? areaPdvReserva(g.itens[0]) : 'cantina'
      navigate(`/admin/loja/${cat}/nova-venda?venda=${reabre}`)
      return
    }
    if (!grupoPodeCobrarPedidoNoPdv(g)) {
      alert(
        'Não dá para ir ao caixa com tudo: há itens na fila (PDV) e outros ainda pendentes. ' +
          'Conclua ou cancele a venda em aberto no PDV; ou exclua linhas pendentes (lixeira) e tente de novo.',
      )
      return
    }
    setCobrandoGrupoChave(g.chave)
    try {
      const { data: out } = await api.post('/loja/reservas/iniciar-cobranca-grupo/', {
        data,
        nome: g.nomeExibicao,
      })
      const cat =
        out.categoria && ['cantina', 'loja'].includes(String(out.categoria)) ? out.categoria : 'cantina'
      const path = out.path_pdv || `/admin/loja/${cat}/nova-venda?venda=${out.venda_id}`
      navigate(path)
    } catch (e) {
      const err = e.response?.data
      const msg = err?.error || formatApiError(e, 'Não foi possível abrir o caixa para o grupo.')
      alert(msg)
    } finally {
      setCobrandoGrupoChave(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
        <Link
          to="/admin/loja"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <Home className="h-4 w-4" /> Loja / cantina
        </Link>
      </div>
      <AdminLojaSecaoNav area="cantina" />

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-7 h-7 text-amber-600" />
            Reservas (cantina)
          </h1>
          <p className="text-gray-600 text-sm mt-1 max-w-2xl">
            Monte a <strong>lista de itens</strong> (como no pedido), informe o nome e confirme. Itens com estoque seguem
            o limite do saldo do dia. A cobrança é <strong>por nome</strong> (itens ainda pendentes desta pessoa nesta
            data): use <strong>Cobrar no PDV</strong> no canto do cartão do pedido (nova cobrança ou retomar venda em rascunho).
            Reservas canceladas somem desta lista (permanecem no banco). Por linha só
            dá para <strong>excluir</strong> itens ainda <strong>não pagos</strong> (só reserva ou já na venda de rascunho). Cada
            <strong> pedido</strong> abaixo fica <strong>resumido</strong> ao abrir; toque em
            <strong> Expandir</strong> na lista de itens para ver a tabela.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">
            Data do culto
            <input
              type="date"
              className="mt-1 block rounded-xl border border-gray-200 px-3 py-2 text-base"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={load}
            className="btn btn-secondary flex items-center gap-1.5 self-end"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </div>

      <form
        onSubmit={onConfirmarReserva}
        className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-4"
      >
        <h2 className="font-semibold text-amber-950 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" /> Nova reserva (lista, como o pedido)
        </h2>
        <p className="text-sm text-amber-950/80 -mt-2">
          A lista <strong>inicia resumida</strong> (1 ou mais itens); toque em <strong>Expandir</strong> para ver quantidade,
          remover linhas e ajustar.
        </p>
        <label className="block text-sm font-medium text-gray-800 max-w-md">
          Nome (quem reserva)
          <input
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 min-h-[48px] text-base"
            value={nomeReserva}
            onChange={(e) => setNomeReserva(e.target.value)}
            placeholder="Ex.: Maria Souza"
            maxLength={200}
            autoComplete="name"
            required
          />
        </label>

        <div className="rounded-xl border border-amber-200/80 bg-white/80 p-3 space-y-3">
          <div className="text-sm font-medium text-amber-950 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Adicionar itens
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end sm:flex-wrap">
            <label className="block text-sm text-gray-800 flex-1 min-w-[200px]">
              Produto
              <select
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 min-h-[48px]"
                value={addProduto}
                onChange={(e) => setAddProduto(e.target.value)}
              >
                <option value="">Selecione…</option>
                {comReserva.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {p.controla_estoque
                      ? ` (até ${p.estoque} un. pelo estoque hoje)`
                      : ' (sem teto)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-800 w-full sm:w-24">
              Qtd
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 min-h-[48px] text-base"
                value={addQtd}
                onChange={(e) => setAddQtd(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={adicionarAoCarrinho}
              disabled={!comReserva.length}
              className="min-h-[48px] rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-900 font-semibold px-4 hover:bg-amber-100 disabled:opacity-50 w-full sm:w-auto"
            >
              Adicionar à lista
            </button>
          </div>
        </div>

        {carrinho.length > 0 && (() => {
          const { n, un } = carrinhoTotais
          const primeiro = carrinho[0]
          const resumoFechado = !carrinhoListaExpandida
          return (
            <div className="rounded-xl border border-amber-300/60 bg-white overflow-hidden">
              {resumoFechado && (
                <div className="p-3">
                  <div className="text-sm font-semibold text-amber-950">Sua lista (resumida)</div>
                  <button
                    type="button"
                    onClick={() => setCarrinhoListaExpandida(true)}
                    className="mt-2 w-full text-left flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition min-h-[52px] touch-manipulation"
                    aria-expanded="false"
                  >
                    <ChevronRight className="h-5 w-5 text-amber-800 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-amber-950">
                        <span className="font-semibold">
                          {n} {n === 1 ? 'item' : 'itens'}
                        </span>
                        <span className="text-amber-800/90"> · {un} un.</span>
                      </p>
                      <p
                        className="text-xs text-amber-900/80 mt-0.5 truncate"
                        title={carrinho.map((c) => c.produtoNome).join(', ')}
                      >
                        {primeiro?.produtoNome}
                        {n > 1
                          ? `  ·  +${n - 1} ${
                              n - 1 === 1
                                ? 'outro'
                                : 'outros'
                            }`
                          : ''}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-amber-800 shrink-0">Expandir</span>
                  </button>
                </div>
              )}
              {carrinhoListaExpandida && (
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-semibold text-amber-950">Sua lista</div>
                    <button
                      type="button"
                      onClick={() => setCarrinhoListaExpandida(false)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-900 py-1"
                      aria-expanded="true"
                    >
                      <ChevronDown className="h-4 w-4" />
                      Recolher
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {carrinho.map((l) => (
                      <li
                        key={l.produtoId}
                        className="flex flex-wrap items-center gap-2 py-1.5 border-b border-amber-100/80 last:border-0"
                      >
                        <span className="flex-1 min-w-[140px] font-medium text-gray-900">{l.produtoNome}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => incLinha(l.produtoId, -1)}
                            className="min-h-10 min-w-10 flex items-center justify-center rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200"
                            aria-label="Diminuir"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            className="w-16 rounded-lg border border-gray-200 px-2 py-2 text-center text-base [appearance:textfield]"
                            value={l.quantidade}
                            onChange={(e) => setQtdLinha(l.produtoId, e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => incLinha(l.produtoId, 1)}
                            className="min-h-10 min-w-10 flex items-center justify-center rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200"
                            aria-label="Aumentar"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removerLinha(l.produtoId)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                            title="Remover"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })()}

        <button
          type="submit"
          disabled={saving || !comReserva.length || !carrinho.length}
          className="w-full sm:w-auto min-h-[48px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold px-8 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Confirmar reserva da lista'}
        </button>
        {!comReserva.length && !loading && (
          <p className="text-sm text-amber-900">
            Não há produtos da cantina disponíveis (com estoque ou sem controle de estoque). Cadastre em{' '}
            <Link to="/admin/loja/cantina/produtos" className="underline font-medium">
              Produtos da cantina
            </Link>
            .
          </p>
        )}
      </form>

      {loading ? (
        <LoadingSpinner size="lg" text="Carregando reservas…" />
      ) : (
        <div className="space-y-4">
          {!gruposPorNome.length && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-500 text-sm">
              Nenhuma reserva nesta data.
            </div>
          )}
          {gruposPorNome.map((g) => {
            const tabelaGrupoVisivel = isGrupoTabelaExpandida(g)
            const resumoGrupoFechado = g.itens.length > 0 && !tabelaGrupoVisivel
            const { n: nGr, un: unGr, primeiro: priGr } = totaisGrupo(g)
            return (
              <div
                key={g.chave}
                className="bg-white rounded-xl border border-amber-200/80 shadow-sm overflow-hidden"
              >
                <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-amber-50/30 border-b border-amber-100 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-amber-950 leading-tight">{g.nomeExibicao}</h2>
                    <p className="text-xs text-amber-800/80 mt-0.5">
                      {g.itens.length} {g.itens.length === 1 ? 'item' : 'itens'}
                    </p>
                  </div>
                  <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0 w-full sm:w-auto">
                    {grupoPodeCobrarPedidoNoPdv(g) && (
                      <button
                        type="button"
                        onClick={() => onCobrarTudoNoGrupo(g)}
                        disabled={cobrandoGrupoChave === g.chave}
                        className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-amber-600 text-white font-semibold px-4 py-2.5 text-sm hover:bg-amber-700 disabled:opacity-50 w-full sm:w-auto"
                      >
                        <Banknote className="w-4 h-4" />
                        {cobrandoGrupoChave === g.chave ? 'Abrindo…' : 'Cobrar no PDV'}
                      </button>
                    )}
                    {grupoPodeReabrirMesmaVenda(g) && !grupoPodeCobrarPedidoNoPdv(g) && (
                      <button
                        type="button"
                        onClick={() => onCobrarTudoNoGrupo(g)}
                        className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-900 font-semibold px-4 py-2.5 text-sm hover:bg-amber-100 w-full sm:w-auto"
                      >
                        <Banknote className="w-4 h-4" />
                        Cobrar no PDV
                      </button>
                    )}
                    {grupoMistoPendenteEfila(g) && (
                      <p className="text-xs text-amber-900/90 max-w-md sm:text-right">
                        Há itens pendentes e itens já na venda. Conclua ou cancele a venda aberta no PDV; se precisar, use
                        a lixeira em linhas ainda pendentes.
                      </p>
                    )}
                  </div>
                </div>
                {resumoGrupoFechado && (
                  <div className="p-3 border-b border-amber-100/80 bg-amber-50/20">
                    <p className="text-xs font-medium text-amber-900/80 mb-2">Itens do pedido (resumido)</p>
                    <button
                      type="button"
                      onClick={() => setGrupoTabelaExpandidaChave(g, true)}
                      className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-white hover:bg-amber-50/50 transition min-h-[52px] touch-manipulation"
                      aria-expanded="false"
                    >
                      <ChevronRight className="h-5 w-5 text-amber-800 shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-amber-950">
                          <span className="font-semibold">
                            {nGr} {nGr === 1 ? 'item' : 'itens'}
                          </span>
                          <span className="text-amber-800/90"> · {unGr} un.</span>
                        </p>
                        <p
                          className="text-xs text-amber-900/80 mt-0.5 truncate"
                          title={g.itens.map((r) => r.produto_nome).join(', ')}
                        >
                          {priGr}
                          {nGr > 1
                            ? `  ·  +${nGr - 1} ${
                                nGr - 1 === 1 ? 'outro' : 'outros'
                              }`
                            : ''}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-amber-800 shrink-0">Expandir</span>
                    </button>
                  </div>
                )}
                {tabelaGrupoVisivel && (
                  <div className="overflow-x-auto">
                    <div className="px-3 pt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setGrupoTabelaExpandidaChave(g, false)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-900 py-1"
                        aria-expanded="true"
                      >
                        <ChevronDown className="h-4 w-4" />
                        Recolher
                      </button>
                    </div>
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50/80 text-left text-gray-600 text-xs uppercase tracking-wide">
                        <tr>
                          <th className="p-2 pl-4">#</th>
                          <th className="p-2">Produto</th>
                          <th className="p-2 w-16">Qtd</th>
                          <th className="p-2">Status</th>
                          <th className="p-2 pr-4 text-right w-16">Excluir</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.itens.map((r) => (
                          <tr key={r.id} className="border-t border-gray-100 hover:bg-amber-50/20">
                            <td className="p-2 pl-4 font-mono text-gray-500 tabular-nums">{r.id}</td>
                            <td className="p-2 font-medium text-gray-900">{r.produto_nome}</td>
                            <td className="p-2 tabular-nums">{r.quantidade}</td>
                            <td className="p-2">{STATUS[stReserva(r)] || r.status}</td>
                        <td className="p-2 pr-4 text-right whitespace-nowrap">
                          {stReserva(r) === 'pendente' || stReserva(r) === 'em_cobranca' ? (
                            <button
                              type="button"
                              onClick={() => onCancelarReserva(r)}
                              className="inline-flex items-center justify-center min-h-10 min-w-10 rounded-lg text-red-700 hover:bg-red-50"
                              title="Excluir reserva"
                              aria-label="Excluir reserva"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="text-gray-300" aria-hidden>
                              —
                            </span>
                          )}
                        </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AdminLojaReservas
