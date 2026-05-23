import { useEffect, useState } from 'react'
import api from '../../services/api'

function metodoHabilitadoNaApi(data, key) {
  if (!data || !(key in data)) return true
  return data[key] === true
}

export function parseMetodosFromConfig(data) {
  const ativo = !!data?.ativo
  return {
    ativo,
    pix: ativo && metodoHabilitadoNaApi(data, 'pix_habilitado'),
    cartao: ativo && metodoHabilitadoNaApi(data, 'cartao_habilitado'),
  }
}

/** Rótulo curto: "PIX", "Cartão", "PIX / cartão" */
export function rotuloMetodosMp({ pix, cartao }) {
  if (pix && cartao) return 'PIX / cartão'
  if (pix) return 'PIX'
  if (cartao) return 'Cartão'
  return 'Mercado Pago'
}

export function useMercadoPagoMetodos() {
  const [metodos, setMetodos] = useState({
    ativo: false,
    pix: false,
    cartao: false,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    api
      .get('/mercadopago/config/')
      .then(({ data }) => {
        if (cancelled) return
        setMetodos({ ...parseMetodosFromConfig(data), loading: false })
      })
      .catch(() => {
        if (!cancelled) {
          setMetodos({ ativo: false, pix: false, cartao: false, loading: false })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return metodos
}
