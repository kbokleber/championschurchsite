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

/** Texto introdutório nas telas de pagamento (eventos ou loja). */
export function textoIntroPagamento(contexto, { pix, cartao }) {
  const cfg = 'Configurações → Mercado Pago'

  if (contexto === 'loja') {
    if (pix && cartao) {
      return `Formas de pagamento conforme ${cfg} (dados da igreja; sem pedir e-mail/CPF do comprador no balcão).`
    }
    if (pix) {
      return `Pagamento via PIX (QR na página), conforme ${cfg}. Dados da igreja; sem pedir e-mail/CPF do comprador no balcão.`
    }
    if (cartao) {
      return `Pagamento com cartão nesta página, conforme ${cfg}. Dados da igreja no Mercado Pago.`
    }
    return `Nenhuma forma de pagamento Mercado Pago está habilitada em ${cfg}.`
  }

  if (pix && cartao) {
    return `Pague com PIX ou cartão nesta página (sem sair do site). O PIX usa seu e-mail de inscrição e o CPF/CNPJ da igreja em ${cfg}.`
  }
  if (pix) {
    return `Pague com PIX nesta página (QR Code). Usa seu e-mail de inscrição e o CPF/CNPJ da igreja em ${cfg}.`
  }
  if (cartao) {
    return `Pague com cartão nesta página (sem sair do site). Preencha os dados do titular no formulário do Mercado Pago.`
  }
  return `Nenhuma forma de pagamento Mercado Pago está habilitada em ${cfg}.`
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
