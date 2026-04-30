import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom'
import { ExternalLink, CheckCircle, Clock, AlertCircle, ArrowLeft } from 'lucide-react'
import api from '../../services/api'
import { formatApiError } from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'

function AdminLojaPagamento() {
  const { cobrancaLojaId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const pollingRef = useRef(null)
  const [cob, setCob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [link, setLink] = useState(null)
  const [linkSandbox, setLinkSandbox] = useState(false)
  const [pago, setPago] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [verificando, setVerificando] = useState(false)

  const st = location.state
  const pdvVoltar =
    st?.area === 'cantina' || st?.area === 'loja'
      ? `/admin/loja/${st.area}/nova-venda`
      : '/admin/loja/cantina/nova-venda'

  const carregar = async () => {
    try {
      setLoading(true)
      setErro(null)
      const { data } = await api.get(`/loja/cobrancas/${cobrancaLojaId}/`)
      setCob(data)
      if (data.status === 'pago') setPago(true)
    } catch (e) {
      setErro(formatApiError(e, 'Cobrança não encontrada.'))
    } finally {
      setLoading(false)
    }
  }

  const garantirLink = async (cl) => {
    if (pago) return
    if (st?.initPoint) {
      const isSandbox = !!st.isSandbox
      const l = st.initPoint || st.sandboxInitPoint
      if (l) {
        setLink(l)
        setLinkSandbox(isSandbox)
        return
      }
    }
    if (!cl?.venda) return
    if (cl.referencia_externa) {
      setGerando(true)
      try {
        const { data } = await api.post(`/loja/vendas/${cl.venda}/gerar-cobranca-mp/`, {
          meio_pagamento: 'pix_mp',
        })
        const isSandbox = !!data.is_sandbox
        const l2 = data.init_point || data.sandbox_init_point
        const ok = data.success === true || Boolean(l2)
        if (ok && l2) {
          setLink(l2)
          setLinkSandbox(isSandbox)
        }
      } catch (e) {
        setErro(formatApiError(e, 'Não foi possível recuperar o link de pagamento.'))
      } finally {
        setGerando(false)
      }
    }
  }

  useEffect(() => {
    const run = async () => {
      await carregar()
    }
    run()
  }, [cobrancaLojaId])

  useEffect(() => {
    const fromMp = searchParams.get('from_mp')
    if (!fromMp) return
    const verificarRetorno = async () => {
      try {
        const { data } = await api.get(`/loja/mercadopago/verificar/${cobrancaLojaId}/`)
        if (data.status === 'pago' || data.cobranca_status === 'pago' || data.venda_status === 'pago') {
          setPago(true)
        } else {
          setErro(null)
        }
      } catch (e) {
        setErro(formatApiError(e, 'Não foi possível confirmar o pagamento agora.'))
      } finally {
        carregar()
      }
    }
    verificarRetorno()
  }, [cobrancaLojaId, searchParams])

  useEffect(() => {
    if (!cob) return
    if (cob.status === 'pago') {
      setPago(true)
      return
    }
    garantirLink(cob)
  }, [cob, st])

  useEffect(() => {
    if (!link) return
    if (!st?.autoStartCheckout) return
    if (searchParams.get('from_mp')) return
    const startedKey = `loja_checkout_started_${cobrancaLojaId}`
    if (sessionStorage.getItem(startedKey) === '1') return
    sessionStorage.setItem(startedKey, '1')
    const tm = window.setTimeout(() => {
      window.open(link, '_blank', 'noopener,noreferrer')
    }, 250)
    return () => window.clearTimeout(tm)
  }, [link, st, searchParams, cobrancaLojaId])

  const iniciarPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/loja/mercadopago/verificar/${cobrancaLojaId}/`)
        if (data.status === 'pago' || data.cobranca_status === 'pago' || data.venda_status === 'pago') {
          setPago(true)
          if (pollingRef.current) clearInterval(pollingRef.current)
        }
      } catch {
        // ignore
      }
    }, 5000)
  }

  const verificarAgora = async () => {
    try {
      setVerificando(true)
      const { data } = await api.get(`/loja/mercadopago/verificar/${cobrancaLojaId}/`)
      if (data.status === 'pago' || data.cobranca_status === 'pago' || data.venda_status === 'pago') {
        setPago(true)
        setErro(null)
      } else {
        setErro(null)
      }
      await carregar()
    } catch (e) {
      setErro(formatApiError(e, 'Não foi possível verificar o pagamento agora.'))
    } finally {
      setVerificando(false)
    }
  }

  useEffect(() => {
    if (cob && cob.status !== 'pago') {
      iniciarPolling()
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [cob, cobrancaLojaId])

  if (loading && !cob) {
    return <LoadingSpinner size="lg" text="Carregando cobrança..." />
  }

  if (erro && !cob) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
        <p className="text-gray-800">{erro}</p>
        <Link to={pdvVoltar} className="btn btn-primary mt-4 inline-block">Voltar ao PDV</Link>
      </div>
    )
  }

  if (pago || cob?.status === 'pago') {
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Pagamento confirmado</h1>
        <p className="text-gray-600 mb-4">A venda foi finalizada (Mercado Pago ou confirmação local).</p>
        <p className="text-lg font-semibold text-gray-800 mb-6">
          R$ {Number(cob?.valor).toFixed(2).replace('.', ',')}
        </p>
        <div className="space-y-2">
          <Link to="/admin/loja/vendas" className="block btn btn-primary">Ver vendas</Link>
          <button type="button" onClick={() => navigate(pdvVoltar)} className="w-full btn btn-secondary">
            Nova venda
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-gray-600 flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>
      <div className="bg-white rounded-xl border border-gray-200 shadow p-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="w-6 h-6 text-amber-500" />
          PIX / cartão (loja)
        </h1>
        <p className="text-gray-600 text-sm mt-1">
          Valor: R$ {cob ? Number(cob.valor).toFixed(2).replace('.', ',') : '—'}
        </p>
        {erro && <p className="text-red-600 text-sm mt-2">{erro}</p>}

        <div className="mt-6">
          <button
            type="button"
            onClick={verificarAgora}
            disabled={verificando}
            className="btn btn-secondary w-full mb-3"
          >
            {verificando ? 'Verificando...' : 'Já paguei, verificar agora'}
          </button>
          {gerando && <p className="text-sm text-gray-500">Preparando o link…</p>}
          {link && (
            <>
              {linkSandbox && (
                <div className="mb-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-left text-sm text-yellow-800">
                  <p className="font-semibold">Checkout em Sandbox</p>
                  <p className="mt-1">
                    Para concluir o teste, entre no Mercado Pago com um usuário comprador de teste.
                    Não use sua conta real nem a conta vendedora da integração.
                  </p>
                </div>
              )}
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary w-full flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" /> Abrir checkout PIX / cartão
              </a>
              <p className="text-xs text-gray-500 mt-2">
                Após pagar no checkout do Mercado Pago, volte para esta tela. A confirmação é automática e você também pode usar "Já paguei, verificar agora".
              </p>
            </>
          )}
          {!link && !gerando && (
            <p className="text-sm text-gray-500">Aguarde, preparando o link de pagamento…</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminLojaPagamento
