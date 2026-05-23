import { loadMercadoPago } from '@mercadopago/sdk-js'

let cachedPublicKey = null
let cachedInstance = null

/**
 * Uma instância do SDK por public_key (evita conflito com StrictMode / remount).
 */
export async function getMercadoPagoInstance(publicKey) {
  const key = (publicKey || '').trim()
  if (!key) throw new Error('Chave pública Mercado Pago ausente.')

  if (cachedInstance && cachedPublicKey === key) {
    return cachedInstance
  }

  if (cachedInstance?.bricks) {
    try {
      const prev = window.__championsCardBrick
      if (prev?.unmount) prev.unmount()
    } catch {
      /* ignore */
    }
    cachedInstance = null
    cachedPublicKey = null
  }

  const MercadoPagoCtor = await loadMercadoPago()
  if (!MercadoPagoCtor) {
    throw new Error('SDK Mercado Pago indisponível no navegador.')
  }

  cachedPublicKey = key
  cachedInstance = new MercadoPagoCtor(key, {
    locale: 'pt-BR',
    advancedFraudPrevention: false,
  })
  return cachedInstance
}

export function resetMercadoPagoInstance() {
  cachedPublicKey = null
  cachedInstance = null
}
