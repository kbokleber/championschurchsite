import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, Link, useParams, Navigate, useSearchParams } from 'react-router-dom'
import { ShoppingCart, Banknote, CreditCard, Plus, Trash2, ImageIcon } from 'lucide-react'
import api from '../../services/api'
import { formatApiError } from '../../services/api'
import { getMediaUrl } from '../../services/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import AdminLojaSecaoNav from '../../components/AdminLojaSecaoNav'
import ConfirmModal from '../../components/ConfirmModal'

const CATEGORIAS = ['cantina', 'loja']

function formatBRL(n) {
  return Number(n).toFixed(2).replace('.', ',')
}

/** Aceita "10,5", "10.50", "1.234,56" */
function parseMoneyInput(str) {
  if (str == null) return null
  const s = String(str).trim()
  if (s === '') return null
  let t = s.replace(/\s/g, '')
  if (t.includes(',') && !t.includes('.')) {
    t = t.replace(',', '.')
  } else if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.')
  }
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function computeDinheiroResumo(lines, valorRecebidoStr, total) {
  if (!lines.length) {
    return { valid: false, total: 0, recebido: 0, troco: 0, exato: true, erro: null }
  }
  const vazio = !String(valorRecebidoStr ?? '').trim()
  if (vazio) {
    return { valid: true, total, recebido: total, troco: 0, exato: true, erro: null }
  }
  const p = parseMoneyInput(valorRecebidoStr)
  if (p == null) {
    return { valid: false, total, recebido: 0, troco: 0, exato: false, erro: 'Digite um valor recebido válido.' }
  }
  if (p + 1e-6 < total) {
    return {
      valid: false,
      total,
      recebido: p,
      troco: 0,
      exato: false,
      erro: 'O valor recebido não pode ser menor que o total.',
    }
  }
  const troco = Math.max(0, p - total)
  return { valid: true, total, recebido: p, troco, exato: troco < 0.005, erro: null }
}

function AdminLojaPDV() {
  const { area } = useParams()
  if (!CATEGORIAS.includes(area)) {
    return <Navigate to="/admin/loja" replace />
  }

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isCantina = area === 'cantina'
  const accent = isCantina
    ? { add: 'text-amber-700', bar: 'border-amber-200', btn: 'bg-amber-600 hover:bg-amber-700' }
    : { add: 'text-sky-700', bar: 'border-sky-200', btn: 'bg-sky-600 hover:bg-sky-700' }

  const [produtos, setProdutos] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [lines, setLines] = useState([])
  const [comprador, setComprador] = useState('')
  const [obs, setObs] = useState('')
  /** vazio = pagamento no valor exato; preenchido = cédulas recebidas (pode ter troco) */
  const [valorRecebido, setValorRecebido] = useState('')
  const [processing, setProcessing] = useState(false)
  /** Cantina: filtrar cardápio por comidas / bebidas */
  const [segmentoFiltro, setSegmentoFiltro] = useState('todos')
  /** Resumo calculado no clique; modal usa antes de chamar a API */
  const [confirmDinheiro, setConfirmDinheiro] = useState(null)
  /** Rascunho vindo da reserva (query ?venda=) — id da venda; itens podem ser ajustados; antes de pagar, sincroniza com a API */
  const [rascunhoVendaId, setRascunhoVendaId] = useState(null)

  const baseTotal = useCallback(() => {
    return lines.reduce((s, l) => s + Number(l.subtotal), 0)
  }, [lines])

  const load = async (opts = {}) => {
    const silent = Boolean(opts.silent)
    try {
      if (!silent) setLoading(true)
      const { data } = await api.get('/loja/produtos/', {
        params: { ativo: 'true', categoria: area, page_size: 500 },
      })
      setProdutos((data.results || data).filter((p) => p.ativo && p.categoria === area))
    } catch (e) {
      console.error(e)
      setProdutos([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    setLines([])
    setQ('')
    setValorRecebido('')
    setSegmentoFiltro('todos')
    setRascunhoVendaId(null)
    load()
  }, [area])

  const vParam = searchParams.get('venda')
  useEffect(() => {
    if (loading) return
    if (!vParam || !/^\d+$/.test(vParam)) {
      return
    }
    const vid = parseInt(vParam, 10)
    let ignore = false
    ;(async () => {
      try {
        const { data: v } = await api.get(`/loja/vendas/${vid}/`)
        if (ignore) return
        if (v.status === 'pago' || v.status === 'cancelado') {
          alert('Esta venda já foi encerrada no sistema.')
          setSearchParams({}, { replace: true })
          return
        }
        const first = v.itens && v.itens[0]
        const cat = first && first.produto_categoria
        if (cat && cat !== area) {
          alert('Redirecionando para a área correta do produto (cantina/loja).')
          setSearchParams({}, { replace: true })
          navigate(`/admin/loja/${cat}/nova-venda?venda=${vid}`, { replace: true })
          return
        }
        setLines(
          (v.itens || []).map((it) => {
            const p = produtos.find((x) => x.id === it.produto)
            return {
              produtoId: it.produto,
              nome: it.produto_nome,
              preco: Number(it.preco_unitario),
              subtotal: Number(it.subtotal),
              quantidade: it.quantidade,
              imagem: it.produto_imagem || p?.imagem || null,
              controla_estoque: Boolean(p?.controla_estoque),
              estoque: p?.estoque ?? null,
            }
          }),
        )
        setComprador(v.comprador_nome || '')
        setObs(v.observacao || '')
        setRascunhoVendaId(vid)
        setSearchParams({}, { replace: true })
      } catch (e) {
        if (!ignore) alert(formatApiError(e, 'Não foi possível abrir a venda rascunho.'))
        setSearchParams({}, { replace: true })
      }
    })()
    return () => {
      ignore = true
    }
  }, [loading, vParam, area, navigate, setSearchParams])

  const dinheiroResumo = useMemo(() => {
    const total = baseTotal()
    return computeDinheiroResumo(lines, valorRecebido, total)
  }, [lines, valorRecebido, baseTotal])
  const totalAtual = useMemo(() => baseTotal(), [baseTotal])

  const salvarRascunhoItens = useCallback(
    async (vId) => {
      if (!vId) return
      const itens = lines.map((l) => ({ produto: l.produtoId, quantidade: l.quantidade }))
      if (!itens.length) {
        throw new Error('Inclua ao menos um item no carrinho.')
      }
      await api.put(`/loja/vendas/${vId}/definir-itens/`, { itens })
    },
    [lines],
  )

  const addLine = (p) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.produtoId === p.id)
      if (i >= 0) {
        const n = [...prev]
        const nextQ = n[i].quantidade + 1
        if (p.controla_estoque && nextQ > (Number(p.estoque) || 0)) {
          alert(
            `Estoque insuficiente para «${p.nome}». Disponível: ${p.estoque ?? 0} un.`
          )
          return prev
        }
        n[i] = {
          ...n[i],
          controla_estoque: Boolean(p.controla_estoque),
          estoque: p.estoque,
          quantidade: nextQ,
          subtotal: n[i].preco * nextQ,
        }
        return n
      }
      if (p.controla_estoque && (Number(p.estoque) || 0) < 1) {
        alert(`Sem estoque de «${p.nome}».`)
        return prev
      }
      return [
        ...prev,
        {
          produtoId: p.id,
          nome: p.nome,
          preco: Number(p.preco),
          imagem: p.imagem || null,
          controla_estoque: Boolean(p.controla_estoque),
          estoque: p.estoque,
          quantidade: 1,
          subtotal: Number(p.preco),
        },
      ]
    })
  }

  const inc = (i) => {
    setLines((prev) => {
      const n = [...prev]
      const l = n[i]
      const p = produtos.find((x) => x.id === l.produtoId)
      const nextQ = l.quantidade + 1
      if (p?.controla_estoque && nextQ > (Number(p.estoque) || 0)) {
        alert(
          `Estoque insuficiente para «${l.nome}». Disponível: ${p.estoque ?? 0} un.`
        )
        return prev
      }
      n[i] = {
        ...l,
        quantidade: nextQ,
        subtotal: l.preco * nextQ,
      }
      return n
    })
  }
  const dec = (i) => {
    setLines((prev) => {
      const n = [...prev]
      if (n[i].quantidade <= 1) return n.filter((_, j) => j !== i)
      n[i] = {
        ...n[i],
        quantidade: n[i].quantidade - 1,
        subtotal: n[i].preco * (n[i].quantidade - 1),
      }
      return n
    })
  }
  const remove = (i) => {
    setLines((prev) => prev.filter((_, j) => j !== i))
  }

  const solicitarConfirmacaoDinheiro = () => {
    if (!lines.length) return
    const r = computeDinheiroResumo(lines, valorRecebido, baseTotal())
    if (!r.valid) {
      alert(r.erro || 'Confira o valor recebido.')
      return
    }
    setConfirmDinheiro({ r })
  }

  const executarVendaDinheiro = async () => {
    if (!confirmDinheiro?.r) return
    const { r } = confirmDinheiro
    setProcessing(true)
    try {
      if (rascunhoVendaId) {
        await salvarRascunhoItens(rascunhoVendaId)
        await api.post(`/loja/vendas/${rascunhoVendaId}/registrar-pagamento-dinheiro/`, {})
      } else {
        const itens = lines.map((l) => ({ produto: l.produtoId, quantidade: l.quantidade }))
        const { data: v } = await api.post('/loja/vendas/', {
          itens,
          meio_pagamento: 'dinheiro',
          comprador_nome: comprador,
          observacao: obs,
        })
        await api.post(`/loja/vendas/${v.id}/registrar-pagamento-dinheiro/`, {})
      }
      setConfirmDinheiro(null)
      if (r.troco >= 0.005) {
        alert(`Venda registrada. Troco a entregar: R$ ${formatBRL(r.troco)}.`)
      } else {
        alert('Venda registrada em dinheiro.')
      }
      setLines([])
      setComprador('')
      setObs('')
      setValorRecebido('')
      setRascunhoVendaId(null)
      await load({ silent: true })
    } catch (e) {
      alert(formatApiError(e, 'Erro ao concluir venda.'))
    } finally {
      setProcessing(false)
    }
  }

  const filtrados = useMemo(() => {
    let base = produtos
    if (isCantina && segmentoFiltro !== 'todos') {
      base = base.filter((p) => (p.segmento_cantina || 'comida') === segmentoFiltro)
    }
    if (!q.trim()) return base
    const qq = q.toLowerCase()
    return base.filter((p) => p.nome.toLowerCase().includes(qq))
  }, [produtos, isCantina, segmentoFiltro, q])

  const submeterVendaMP = async () => {
    if (!lines.length) {
      alert(
        'Carrinho vazio. Adicione produtos ou volte às reservas e abra de novo o link da venda (com ?venda= no endereço).',
      )
      return
    }
    setProcessing(true)
    try {
      let vId
      if (rascunhoVendaId) {
        const { data: vSnap } = await api.get(`/loja/vendas/${rascunhoVendaId}/`)
        if (vSnap.status === 'pago' || vSnap.status === 'cancelado') {
          alert('Esta venda já foi encerrada. Abra uma nova venda ou volte pelas reservas.')
          return
        }
        // Após gerar MP a venda vira pendente_pagamento; definir-itens só aceita rascunho.
        if (vSnap.status === 'rascunho') {
          await salvarRascunhoItens(rascunhoVendaId)
        } else if (vSnap.status !== 'pendente_pagamento') {
          alert('Estado da venda inesperado. Atualize a página ou abra outra venda.')
          return
        }
        vId = rascunhoVendaId
      } else {
        const itens = lines.map((l) => ({ produto: l.produtoId, quantidade: l.quantidade }))
        const { data: v } = await api.post('/loja/vendas/', {
          itens,
          meio_pagamento: 'pix_mp',
          comprador_nome: comprador,
          observacao: obs,
        })
        vId = v.id
      }
      const { data: mp } = await api.post(`/loja/vendas/${vId}/gerar-cobranca-mp/`, {
        meio_pagamento: 'pix_mp',
      })
      const temLink = Boolean(mp?.init_point || mp?.sandbox_init_point)
      const ok = mp?.success === true || temLink
      if (!ok) {
        alert(
          (typeof mp?.error === 'string' && mp.error) ||
            (mp?.detail && String(mp.detail)) ||
            'Falha ao gerar pagamento no Mercado Pago.',
        )
        return
      }
      const cobId = mp.cobranca_loja?.id
      if (cobId) {
        if (rascunhoVendaId) {
          setRascunhoVendaId(null)
        }
        navigate('/admin/loja/pagamento/' + String(cobId), {
          state: {
            area,
            autoStartCheckout: true,
            initPoint: mp.init_point || mp.initPoint,
            sandboxInitPoint: mp.sandbox_init_point || mp.sandboxInitPoint,
            isSandbox: mp.is_sandbox ?? mp.isSandbox,
            reutilizado: mp.reutilizado,
            valor: mp.valor,
            preferenceId: mp.preference_id ?? mp.preferenceId,
          },
        })
      } else {
        alert('Resposta inesperada do servidor.')
      }
    } catch (e) {
      alert(formatApiError(e, 'Erro ao preparar pagamento.'))
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return <LoadingSpinner size="lg" text="Carregando produtos…" />
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-5xl mx-auto pb-36 lg:pb-6">
      <AdminLojaSecaoNav area={area} />

      <div className="mb-4 sm:mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShoppingCart className={`w-6 h-6 sm:w-7 sm:h-7 ${isCantina ? 'text-amber-600' : 'text-sky-600'}`} />
          {isCantina ? 'Cantina' : 'Loja'} — venda
        </h1>
        <p className="text-gray-600 text-sm mt-1">
          Só aparecem produtos {isCantina ? 'deste balcão' : 'desta loja'}. É a mesma tabela, filtrada.
        </p>
        {rascunhoVendaId && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Venda a partir de <strong>reserva</strong>: você pode <strong>alterar quantidades</strong>, incluir ou
            retirar itens. O total usado no pagamento será o do carrinho ao concluir (dinheiro ou Mercado Pago).
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <div className={`bg-white rounded-2xl border ${accent.bar} shadow-sm p-3 sm:p-4`}>
          {isCantina && (
            <div
              className="flex flex-wrap gap-2 mb-3"
              role="tablist"
              aria-label="Comidas e bebidas"
            >
              {[
                { id: 'todos', label: 'Todas' },
                { id: 'comida', label: 'Comidas' },
                { id: 'bebida', label: 'Bebidas' },
              ].map((t) => {
                const active = segmentoFiltro === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSegmentoFiltro(t.id)}
                    className={[
                      'rounded-xl px-4 py-2.5 min-h-[44px] text-sm font-semibold border transition',
                      active
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                        : 'bg-amber-50/80 text-amber-900 border-amber-200 hover:bg-amber-100',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          )}
          <input
            className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base mb-3 min-h-[48px] focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            placeholder="Buscar produto…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          <ul className="max-h-[50vh] sm:max-h-80 overflow-y-auto divide-y divide-gray-100 -mx-1 sm:mx-0">
            {filtrados.map((p) => {
              const thumb = p.imagem ? getMediaUrl(p.imagem) : null
              return (
              <li
                key={p.id}
                className="py-3 sm:py-2 flex flex-wrap sm:flex-nowrap justify-between items-center gap-2"
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    className="h-14 w-14 sm:h-12 sm:w-12 rounded-lg object-cover border border-gray-100 bg-gray-50 shrink-0"
                  />
                ) : (
                  <div className="h-14 w-14 sm:h-12 sm:w-12 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-gray-200 shrink-0">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1 pl-0 sm:pl-1">
                  <div className="font-medium text-gray-900 text-base">{p.nome}</div>
                  {isCantina && (
                    <p className="text-xs text-amber-800 font-medium mt-0.5">
                      {(p.segmento_cantina || 'comida') === 'bebida' ? 'Bebidas' : 'Comidas'}
                    </p>
                  )}
                  {p.controla_estoque && (
                    <p className="text-xs text-gray-500 mt-0.5">Estoque: {p.estoque ?? 0} un.</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 min-w-0 sm:ml-auto">
                  <div className="text-base font-semibold">R$ {Number(p.preco).toFixed(2).replace('.', ',')}</div>
                  <button
                    type="button"
                    onClick={() => addLine(p)}
                    disabled={Boolean(p.controla_estoque) && (Number(p.estoque) || 0) < 1}
                    className={`min-h-[44px] min-w-[44px] sm:px-4 sm:min-w-0 text-sm font-semibold flex items-center justify-center gap-1 rounded-xl bg-gray-100 ${accent.add} hover:bg-gray-200 touch-manipulation active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Plus className="w-5 h-5" />
                    <span className="sm:hidden">Incluir</span>
                    <span className="hidden sm:inline">Adicionar</span>
                  </button>
                </div>
              </li>
              )
            })}
            {!filtrados.length && (
              <li className="py-6 text-sm text-center text-gray-500">
                Sem produtos ativos nesta seção.{' '}
                <Link
                  to={`/admin/loja/${area}/produtos`}
                  className={`font-medium underline ${accent.add}`}
                >
                  Cadastre aqui
                </Link>
                .
              </li>
            )}
          </ul>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 lg:sticky lg:top-4">
          <h2 className="font-semibold text-lg mb-3">Carrinho</h2>
          {!lines.length && <p className="text-gray-500 text-sm">Carrinho vazio.</p>}
          {lines.map((l, i) => (
            <div
              key={i}
              className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 py-3 sm:py-2 border-b border-gray-100 text-sm"
            >
              {l.imagem ? (
                <img
                  src={getMediaUrl(l.imagem)}
                  alt=""
                  className="h-10 w-10 rounded-md object-cover border border-gray-100 shrink-0"
                />
              ) : (
                <div className="h-10 w-10 rounded-md border border-dashed border-gray-200 flex items-center justify-center text-gray-200 shrink-0">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}
              <span className="text-base font-medium text-gray-800 flex-1 min-w-0">
                {l.nome} ×{l.quantidade}
                {l.controla_estoque && (
                  <span className="block text-xs font-normal text-gray-500">
                    estoque: {l.estoque ?? 0} un. (no cadastro)
                  </span>
                )}
              </span>
              <span className="text-base font-bold text-gray-900 w-24 text-right">
                R$ {l.subtotal.toFixed(2).replace('.', ',')}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => dec(i)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-gray-100 text-lg font-bold disabled:opacity-40"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => inc(i)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-gray-100 text-lg font-bold disabled:opacity-40"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 disabled:opacity-40"
                  aria-label="Remover"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </span>
            </div>
          ))}

          <div className="mt-4 space-y-3 text-sm">
            <label className="block text-gray-700 font-medium">
              Comprador (opcional)
              <input
                className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base min-h-[48px]"
                value={comprador}
                onChange={(e) => setComprador(e.target.value)}
              />
            </label>
            <label className="block text-gray-700 font-medium">
              Observação
              <input
                className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base min-h-[48px]"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-5 flex justify-between items-baseline text-xl font-bold text-gray-900">
            <span>Total</span>
            <span>R$ {totalAtual.toFixed(2).replace('.', ',')}</span>
          </div>

          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-sm">
            <label className="block text-gray-800 font-medium" htmlFor="pdv-valor-recebido">
              Valor recebido (R$)
            </label>
            <p className="text-xs text-gray-600 mt-0.5 mb-2">
              Deixe em branco se o pagamento for no valor exato. Preencha se a pessoa pagar com cédula a maior para
              calcular o troco.
            </p>
            <input
              id="pdv-valor-recebido"
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-amber-200/80 bg-white px-4 py-3.5 text-base min-h-[48px]"
              value={valorRecebido}
              onChange={(e) => setValorRecebido(e.target.value)}
              disabled={!lines.length || processing}
              placeholder="Ex.: 20,00 ou 50,00"
              autoComplete="off"
            />
            {lines.length > 0 && dinheiroResumo.valid && !dinheiroResumo.exato && (
              <p className="mt-2 text-base font-bold text-amber-900">
                Troco: R$ {formatBRL(dinheiroResumo.troco)}
              </p>
            )}
            {lines.length > 0 && dinheiroResumo.valid && dinheiroResumo.exato && (
              <p className="mt-2 text-sm text-gray-600">Sem troco (valor exato).</p>
            )}
            {lines.length > 0 && !dinheiroResumo.valid && String(valorRecebido).trim() && (
              <p className="mt-2 text-sm text-red-700" role="alert">
                {dinheiroResumo.erro}
              </p>
            )}
          </div>

          <div className="mt-4 hidden lg:flex flex-col sm:flex-row gap-2.5 sm:gap-2">
            <button
              type="button"
              disabled={!lines.length || processing || !dinheiroResumo.valid}
              onClick={solicitarConfirmacaoDinheiro}
              className="btn btn-secondary flex-1 min-h-[52px] text-base font-semibold flex items-center justify-center gap-2 touch-manipulation"
            >
              <Banknote className="w-5 h-5" /> Pago em dinheiro
            </button>
            <button
              type="button"
              disabled={!lines.length || processing}
              onClick={submeterVendaMP}
              className={`flex-1 min-h-[52px] text-base font-semibold text-white rounded-xl flex items-center justify-center gap-2 ${accent.btn} disabled:opacity-50 touch-manipulation`}
            >
              <CreditCard className="w-5 h-5" /> PIX / cartão
            </button>
          </div>
        </div>
      </div>

      {/* Barra fixa operacional para celular/tablet */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-6px_20px_rgba(0,0,0,0.08)]">
        <div className="max-w-5xl mx-auto">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm text-gray-600">Itens: {lines.length}</div>
            <div className="text-lg font-bold text-gray-900">Total: R$ {formatBRL(totalAtual)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!lines.length || processing || !dinheiroResumo.valid}
              onClick={solicitarConfirmacaoDinheiro}
              className="btn btn-secondary min-h-[52px] text-base font-semibold flex items-center justify-center gap-2 touch-manipulation disabled:opacity-50"
            >
              <Banknote className="w-5 h-5" /> Dinheiro
            </button>
            <button
              type="button"
              disabled={!lines.length || processing}
              onClick={submeterVendaMP}
              className={`min-h-[52px] text-base font-semibold text-white rounded-xl flex items-center justify-center gap-2 ${accent.btn} disabled:opacity-50 touch-manipulation`}
            >
              <CreditCard className="w-5 h-5" /> PIX/cartão
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(confirmDinheiro)}
        onClose={() => {
          if (!processing) setConfirmDinheiro(null)
        }}
        onConfirm={executarVendaDinheiro}
        title="Confirmar venda em dinheiro"
        message="Confira o total, o que foi recebido e o troco. Depois, registre a venda."
        type="warning"
        confirmText="Confirmar e registrar"
        cancelText="Voltar"
        loading={processing}
      >
        {confirmDinheiro?.r && (
          <div className="space-y-3 text-left text-sm sm:text-base">
            <div className="flex justify-between gap-4 border-b border-gray-100 pb-2">
              <span className="text-gray-600">Total</span>
              <span className="font-bold text-church-navy">R$ {formatBRL(confirmDinheiro.r.total)}</span>
            </div>
            <div className="flex justify-between gap-4 border-b border-gray-100 pb-2">
              <span className="text-gray-600">Recebido</span>
              <span className="font-bold text-church-navy">
                R$ {formatBRL(confirmDinheiro.r.recebido)}
                {!String(valorRecebido).trim() && (
                  <span className="block text-xs font-normal text-gray-500 sm:inline sm:ml-1">(exato, sem troco)</span>
                )}
              </span>
            </div>
            {confirmDinheiro.r.troco >= 0.005 ? (
              <div className="flex justify-between items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
                <span className="text-amber-900 font-medium">Troco a devolver</span>
                <span className="text-xl sm:text-2xl font-extrabold text-amber-900">
                  R$ {formatBRL(confirmDinheiro.r.troco)}
                </span>
              </div>
            ) : (
              <p className="text-center text-sm text-gray-600">Sem troco a devolver.</p>
            )}
          </div>
        )}
      </ConfirmModal>
    </div>
  )
}

export default AdminLojaPDV
