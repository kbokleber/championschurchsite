import { useEffect, useState } from 'react'
import { CreditCard, QrCode } from 'lucide-react'
import api from '../../services/api'
import { MercadoPagoProvider } from './MercadoPagoProvider'
import { PixEmbeddedPanel } from './PixEmbeddedPanel'
import { CardPaymentBrick } from './CardPaymentBrick'

function metodoHabilitadoNaApi(data, key) {
  if (!data || !(key in data)) return true
  return data[key] === true
}

/**
 * Checkout transparente: PIX e/ou cartão conforme Configurações → Mercado Pago.
 */
export function MercadoPagoCheckout({
  contexto = 'eventos',
  cobrancaId,
  cobrancaLojaId,
  valor,
  defaultPayer = {},
  onPaymentSuccess,
  onPixReady,
}) {
  const [metodos, setMetodos] = useState({ pix: true, cartao: true, loading: true })
  const [aba, setAba] = useState('pix')
  const pagadorLoja = contexto === 'loja'
  const pixSemFormulario = true

  useEffect(() => {
    let cancelled = false
    api
      .get('/mercadopago/config/')
      .then(({ data }) => {
        if (cancelled) return
        const ativo = !!data?.ativo
        const pix = ativo && metodoHabilitadoNaApi(data, 'pix_habilitado')
        const cartao = ativo && metodoHabilitadoNaApi(data, 'cartao_habilitado')
        setMetodos({ pix, cartao, loading: false })
        setAba(pix ? 'pix' : cartao ? 'cartao' : 'pix')
      })
      .catch(() => {
        if (!cancelled) setMetodos({ pix: false, cartao: false, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSuccess = (data) => {
    onPaymentSuccess?.(data)
  }

  if (metodos.loading) {
    return <p className="text-sm text-gray-500 py-4">Carregando formas de pagamento…</p>
  }

  if (!metodos.pix && !metodos.cartao) {
    return (
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
        Nenhuma forma de pagamento Mercado Pago está habilitada nas configurações do site.
      </p>
    )
  }

  const showTabs = metodos.pix && metodos.cartao
  const abaAtiva = showTabs ? aba : metodos.pix ? 'pix' : 'cartao'

  const conteudo = (
    <div>
      {showTabs && (
        <div className="flex border-b border-gray-200 mb-4">
          <button
            type="button"
            onClick={() => setAba('pix')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
              abaAtiva === 'pix'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <QrCode className="w-4 h-4" /> PIX
          </button>
          <button
            type="button"
            onClick={() => setAba('cartao')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
              abaAtiva === 'cartao'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <CreditCard className="w-4 h-4" /> Cartão
          </button>
        </div>
      )}

      {metodos.pix && abaAtiva === 'pix' && (
        <PixEmbeddedPanel
          contexto={contexto}
          cobrancaId={cobrancaId}
          cobrancaLojaId={cobrancaLojaId}
          valor={valor}
          defaultPayer={defaultPayer}
          onPixCreated={onPixReady}
          onAlreadyPaid={handleSuccess}
          pagadorAnonimo={pixSemFormulario}
        />
      )}

      {metodos.cartao && abaAtiva === 'cartao' && (
        <CardPaymentBrick
          contexto={contexto}
          cobrancaId={cobrancaId}
          cobrancaLojaId={cobrancaLojaId}
          amount={valor}
          defaultPayer={defaultPayer}
          onSuccess={handleSuccess}
          pagadorAnonimo={pagadorLoja}
        />
      )}
    </div>
  )

  if (metodos.cartao) {
    return <MercadoPagoProvider forBrick="card">{conteudo}</MercadoPagoProvider>
  }

  return conteudo
}

export default MercadoPagoCheckout
