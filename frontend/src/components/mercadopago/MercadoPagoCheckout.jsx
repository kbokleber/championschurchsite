import { useEffect, useState } from 'react'
import { CreditCard, QrCode } from 'lucide-react'
import { MercadoPagoProvider } from './MercadoPagoProvider'
import { PixEmbeddedPanel } from './PixEmbeddedPanel'
import { CardPaymentBrick } from './CardPaymentBrick'
import { useMercadoPagoMetodos } from './useMercadoPagoMetodos'

/**
 * Checkout transparente: PIX e/ou cartão conforme Configurações → Mercado Pago.
 * Mesma regra em eventos e loja/cantina.
 */
export function MercadoPagoCheckout({
  contexto = 'eventos',
  cobrancaId,
  cobrancaCodigo,
  cobrancaLojaId,
  valor,
  defaultPayer = {},
  onPaymentSuccess,
  onPixReady,
  /** Opcional: evita segunda chamada a /mercadopago/config/ (ex.: página já usa useMercadoPagoMetodos). */
  metodos: metodosProp,
}) {
  const metodosHook = useMercadoPagoMetodos()
  const metodos = metodosProp ?? metodosHook
  const [aba, setAba] = useState('pix')
  const pagadorLoja = contexto === 'loja'
  const pixSemFormulario = true

  useEffect(() => {
    if (metodos.loading) return
    if (metodos.pix && !metodos.cartao) setAba('pix')
    else if (!metodos.pix && metodos.cartao) setAba('cartao')
    else if (metodos.pix) setAba('pix')
  }, [metodos.loading, metodos.pix, metodos.cartao])

  const abaAtiva =
    metodos.pix && metodos.cartao ? aba : metodos.pix ? 'pix' : metodos.cartao ? 'cartao' : 'pix'

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
          cobrancaCodigo={cobrancaCodigo}
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
          cobrancaCodigo={cobrancaCodigo}
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
