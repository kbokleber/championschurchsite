import { createContext, useContext, useEffect, useState } from 'react'
import { loadMercadoPago } from '@mercadopago/sdk-js'
import api from '../../services/api'

const MercadoPagoContext = createContext({
  ready: false,
  error: null,
  isSandbox: false,
  mpInstance: null,
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
        const MercadoPagoCtor = await loadMercadoPago()
        if (!MercadoPagoCtor) {
          if (!cancelled) setError('SDK Mercado Pago indisponível no navegador.')
          return
        }
        const instance = new MercadoPagoCtor(data.public_key, {
          locale: 'pt-BR',
          advancedFraudPrevention: false,
        })
        if (!cancelled) {
          setMpInstance(instance)
          setIsSandbox(!!data.is_sandbox)
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
    <MercadoPagoContext.Provider value={{ ready, error, isSandbox, mpInstance }}>
      {children}
    </MercadoPagoContext.Provider>
  )
}

export default MercadoPagoProvider
