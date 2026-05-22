import { useState } from 'react'
import { CreditCard, QrCode } from 'lucide-react'
import { MercadoPagoProvider } from './MercadoPagoProvider'
import { PixEmbeddedPanel } from './PixEmbeddedPanel'
import { CardPaymentBrick } from './CardPaymentBrick'

/**
 * Checkout transparente: PIX + Cartão.
 * Loja: pagador da igreja (Configurações). Eventos PIX: e-mail inscrição + CPF config.
 * SDK MP carrega ao abrir o checkout (não só ao clicar em Cartão).
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
  const [aba, setAba] = useState('pix')
  const pagadorLoja = contexto === 'loja'
  const pixSemFormulario = true

  const handleSuccess = (data) => {
    onPaymentSuccess?.(data)
  }

  return (
    <MercadoPagoProvider forBrick="card">
      <div>
        <div className="flex border-b border-gray-200 mb-4">
          <button
            type="button"
            onClick={() => setAba('pix')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
              aba === 'pix'
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
              aba === 'cartao'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <CreditCard className="w-4 h-4" /> Cartão
          </button>
        </div>

        {aba === 'pix' && (
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

        {aba === 'cartao' && (
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
    </MercadoPagoProvider>
  )
}

export default MercadoPagoCheckout
