import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { CheckCircle, Clock, AlertCircle, ArrowLeft } from 'lucide-react'
import api from '../../services/api'
import { formatApiError } from '../../services/api'
import { MercadoPagoCheckout } from '../../components/mercadopago/MercadoPagoCheckout'
import LoadingSpinner from '../../components/LoadingSpinner'

function AdminLojaPagamento() {
  const { cobrancaLojaId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const pollingRef = useRef(null)
  const [cob, setCob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [pago, setPago] = useState(false)
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

  const iniciarPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/loja/mercadopago/verificar/${cobrancaLojaId}/`)
        if (data.status === 'pago' || data.cobranca_status === 'pago' || data.venda_status === 'pago') {
          setPago(true)
          if (pollingRef.current) clearInterval(pollingRef.current)
          carregar()
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

  const handlePaymentSuccess = async () => {
    setPago(true)
    if (pollingRef.current) clearInterval(pollingRef.current)
    await carregar()
  }

  useEffect(() => {
    carregar()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [cobrancaLojaId])

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
        <p className="text-gray-600 mb-4">A venda foi finalizada.</p>
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
        <p className="text-gray-500 text-xs mt-1">Pagamento no site — checkout transparente Mercado Pago.</p>
        {erro && <p className="text-red-600 text-sm mt-2">{erro}</p>}

        <div className="mt-6">
          <MercadoPagoCheckout
            contexto="loja"
            cobrancaLojaId={Number(cobrancaLojaId)}
            valor={Number(cob?.valor)}
            defaultPayer={{ email: '', cpf: '' }}
            onPaymentSuccess={handlePaymentSuccess}
            onPixReady={() => iniciarPolling()}
          />

          <button
            type="button"
            onClick={verificarAgora}
            disabled={verificando}
            className="btn btn-secondary w-full mt-4"
          >
            {verificando ? 'Verificando...' : 'Já paguei, verificar agora'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdminLojaPagamento
