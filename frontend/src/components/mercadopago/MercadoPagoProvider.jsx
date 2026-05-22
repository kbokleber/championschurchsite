import { createContext, useContext, useEffect, useState } from 'react'
import api from '../../services/api'
import { getMercadoPagoInstance } from './mercadoPagoInstance'

const MercadoPagoContext = createContext({
  ready: false,
  error: null,
  isSandbox: false,
  mpInstance: null,
  payerEmailHint: '',
})

export function useMercadoPago() {
  return useContext(MercadoPagoContext)
}

/**
 * Carrega SDK v2 e instancia MP com public_key (for=card em split sandbox).
 */
export function MercadoPagoProvider({ children, forBrick = 'card' }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [isSandbox, setIsSandbox] = useState(false)
  const [mpInstance, setMpInstance] = useState(null)
  const [payerEmailHint, setPayerEmailHint] = useState('')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const params = forBrick === 'card' ? { for: 'card' } : {}
        const { data } = await api.get('/mercadopago/config/', { params })
        if (!data?.ativo || !data?.public_key) {
          if (!cancelled) setError('Mercado Pago não configurado (chave pública ausente).')
          return
        }
        const instance = await getMercadoPagoInstance(data.public_key)
        if (!cancelled) {
          setMpInstance(instance)
          setIsSandbox(!!data.is_sandbox)
          setPayerEmailHint((data.payer_email_hint || '').trim())
          setReady(true)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.error || e.message || 'Erro ao carregar Mercado Pago')
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [forBrick])

  return (
    <MercadoPagoContext.Provider
      value={{ ready, error, isSandbox, mpInstance, payerEmailHint }}
    >
      {children}
    </MercadoPagoContext.Provider>
  )
}

export default MercadoPagoProvider
