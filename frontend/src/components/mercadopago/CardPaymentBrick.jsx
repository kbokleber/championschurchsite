import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import api from '../../services/api'
import { useMercadoPago } from './MercadoPagoProvider'

const VALOR_MINIMO_CARTAO = 0.5

/** Extrai payer enviado pelo Card Payment Brick no onSubmit. */
function payerFromBrickForm(cardFormData) {
  const p = cardFormData?.payer || {}
  const id = p.identification || {}
  const number = String(id.number ?? id.document ?? '').replace(/\D/g, '')
  return {
    email: (p.email || '').trim(),
    identification: {
      type: id.type || 'CPF',
      number,
    },
  }
}

/**
 * Card Payment Brick — checkout transparente de cartão.
 * E-mail, CPF e titular vêm do próprio formulário do Mercado Pago (sem duplicar campos).
 */
export function CardPaymentBrick({
  contexto = 'eventos',
  cobrancaId,
  cobrancaLojaId,
  amount,
  defaultPayer = {},
  onSuccess,
  onError,
  pagadorAnonimo = false,
}) {
  const { ready, error: mpError, isSandbox, mpInstance } = useMercadoPago()
  const reactId = useId().replace(/:/g, '')
  const containerId = `mp-card-brick-${reactId}`
  const containerRef = useRef(null)
  const brickRef = useRef(null)
  const brickMountedRef = useRef(false)
  const brickReadyRef = useRef(false)
  const mountGenRef = useRef(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [brickReady, setBrickReady] = useState(false)
  const [mountKey, setMountKey] = useState(0)

  const cardUrl =
    contexto === 'loja' ? '/loja/mercadopago/pagar-cartao/' : '/mercadopago/pagar-cartao/'

  const valorNum = Number(amount)
  const valorOk = valorNum >= VALOR_MINIMO_CARTAO
  const canMountBrick = ready && mpInstance && valorOk

  useEffect(() => {
    if (!canMountBrick) return

    const mountGeneration = ++mountGenRef.current
    let cancelled = false
    let readyTimeoutId = null

    const mount = async () => {
      brickMountedRef.current = false
      brickReadyRef.current = false
      setBrickReady(false)
      await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => setTimeout(r, 150))
      if (cancelled || mountGeneration !== mountGenRef.current) return

      const el = containerRef.current || document.getElementById(containerId)
      if (!el) {
        if (!cancelled) {
          setError('Não foi possível montar o formulário de cartão. Recarregue a página.')
        }
        return
      }

      readyTimeoutId = window.setTimeout(() => {
        if (!cancelled && mountGeneration === mountGenRef.current && !brickReadyRef.current) {
          setError(
            'O formulário de cartão não carregou. Confira: (1) credenciais Sandbox no admin, ' +
              '(2) no painel Mercado Pago cadastre este site em URLs permitidas, ' +
              '(3) desative bloqueador de anúncios e recarregue (Ctrl+F5).',
          )
        }
      }, 25000)

      try {
        el.innerHTML = ''
        const bricksBuilder = mpInstance.bricks()
        const init = { amount: valorNum }
        const emailHint = (defaultPayer.email || '').trim()
        if (emailHint) {
          init.payer = { email: emailHint }
        }
        const settings = {
          initialization: init,
          callbacks: {
            onReady: () => {
              if (!cancelled && mountGeneration === mountGenRef.current) {
                if (readyTimeoutId) window.clearTimeout(readyTimeoutId)
                brickReadyRef.current = true
                setBrickReady(true)
                setError(null)
              }
            },
            onSubmit: (cardFormData) => {
              return new Promise((resolve, reject) => {
                setSubmitting(true)
                setError(null)
                setInfo(null)
                ;(async () => {
                  try {
                    const payload = {
                      token: cardFormData.token,
                      payment_method_id: cardFormData.payment_method_id,
                      installments: cardFormData.installments || 1,
                      issuer_id: cardFormData.issuer_id,
                    }
                    if (!pagadorAnonimo) {
                      payload.payer = payerFromBrickForm(cardFormData)
                    }
                    if (contexto === 'loja') {
                      payload.cobranca_loja_id = cobrancaLojaId
                    } else {
                      payload.cobranca_id = cobrancaId
                    }
                    const { data } = await api.post(cardUrl, payload)
                    if (data.status === 'approved') {
                      onSuccess?.(data)
                      resolve()
                      return
                    }
                    if (data.success && (data.status === 'pending' || data.status === 'in_process')) {
                      setInfo(data.message || 'Pagamento em análise. Aguarde a confirmação.')
                      onSuccess?.(data)
                      resolve()
                      return
                    }
                    const msg = data.error || data.message || 'Pagamento não aprovado.'
                    setError(msg)
                    onError?.(msg)
                    reject(new Error(msg))
                  } catch (e) {
                    const msg = e.response?.data?.error || e.message || 'Erro ao processar cartão.'
                    const text = typeof msg === 'string' ? msg : JSON.stringify(msg)
                    setError(text)
                    onError?.(msg)
                    reject(e)
                  } finally {
                    setSubmitting(false)
                  }
                })()
              })
            },
            onError: (brickErr) => {
              console.error('[MP Brick]', brickErr)
              if (!cancelled && mountGeneration === mountGenRef.current) {
                if (readyTimeoutId) window.clearTimeout(readyTimeoutId)
                const detail =
                  brickErr?.message ||
                  (typeof brickErr === 'string' ? brickErr : JSON.stringify(brickErr))
                setError(
                  `Mercado Pago não exibiu o formulário: ${detail || 'erro desconhecido'}. ` +
                    'Cadastre https://dev.championschurch.com.br (e produção) nas URLs da aplicação no painel MP.',
                )
              }
            },
          },
        }
        const controller = await bricksBuilder.create('cardPayment', containerId, settings)
        if (!cancelled && mountGeneration === mountGenRef.current) {
          brickRef.current = controller
          brickMountedRef.current = true
        } else if (controller?.unmount) {
          try {
            controller.unmount()
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        if (!cancelled && mountGeneration === mountGenRef.current) {
          if (readyTimeoutId) window.clearTimeout(readyTimeoutId)
          setError(e.message || 'Não foi possível carregar o formulário de cartão.')
          brickMountedRef.current = false
        }
      }
    }

    mount()
    return () => {
      cancelled = true
      if (readyTimeoutId) window.clearTimeout(readyTimeoutId)
      if (brickRef.current?.unmount) {
        try {
          brickRef.current.unmount()
        } catch {
          /* ignore */
        }
      }
      brickRef.current = null
      brickMountedRef.current = false
      setBrickReady(false)
    }
  }, [
    canMountBrick,
    mpInstance,
    valorNum,
    cobrancaId,
    cobrancaLojaId,
    contexto,
    pagadorAnonimo,
    cardUrl,
    containerId,
    defaultPayer.email,
    mountKey,
  ])

  const tentarNovamenteBrick = () => {
    setError(null)
    setBrickReady(false)
    brickMountedRef.current = false
    setMountKey((k) => k + 1)
  }

  if (mpError) {
    return (
      <div className="text-sm text-red-600 flex items-start gap-2">
        <AlertCircle className="w-5 h-5" />
        {mpError}
      </div>
    )
  }

  if (!ready) {
    return (
      <p className="text-sm text-gray-500 flex items-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Carregando formulário de cartão…
      </p>
    )
  }

  if (!valorOk) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Valor mínimo para cartão: <strong>R$ {VALOR_MINIMO_CARTAO.toFixed(2).replace('.', ',')}</strong>.
        Para R$ {valorNum.toFixed(2).replace('.', ',')}, use a aba <strong>PIX</strong>.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {pagadorAnonimo ? (
        <p className="text-sm text-gray-600 rounded-lg bg-gray-50 border border-gray-200 p-3">
          Pagamento em nome da igreja (dados em Configurações → Mercado Pago). O cliente no
          balcão não precisa informar e-mail nem CPF.
        </p>
      ) : (
        <p className="text-sm text-gray-600">
          Preencha os dados do cartão e do titular no formulário do Mercado Pago abaixo.
          {defaultPayer.email ? (
            <span className="block mt-1 text-gray-500">
              E-mail pode vir pré-preenchido quando disponível.
            </span>
          ) : null}
        </p>
      )}
      {isSandbox && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
          <p>
            <strong>Nome do titular:</strong> digite <strong>APRO</strong> (aprovado), não use nome
            real. CPF: <strong>12345678909</strong>.
          </p>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-amber-300">
                <th className="py-1 pr-2 font-semibold">Bandeira</th>
                <th className="py-1 pr-2 font-semibold">Número</th>
                <th className="py-1 pr-2 font-semibold">CVV</th>
                <th className="py-1 font-semibold">Validade</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 pr-2">Mastercard</td>
                <td className="py-1 pr-2 font-mono">5031 4332 1540 6351</td>
                <td className="py-1 pr-2">123</td>
                <td className="py-1">11/30</td>
              </tr>
              <tr>
                <td className="py-1 pr-2">Visa</td>
                <td className="py-1 pr-2 font-mono">4235 6477 2802 5682</td>
                <td className="py-1 pr-2">123</td>
                <td className="py-1">11/30</td>
              </tr>
              <tr>
                <td className="py-1 pr-2">Amex</td>
                <td className="py-1 pr-2 font-mono">3753 651535 56885</td>
                <td className="py-1 pr-2">1234</td>
                <td className="py-1">11/30</td>
              </tr>
              <tr>
                <td className="py-1 pr-2">Elo débito</td>
                <td className="py-1 pr-2 font-mono">5067 7667 8388 8311</td>
                <td className="py-1 pr-2">123</td>
                <td className="py-1">11/30</td>
              </tr>
            </tbody>
          </table>
          <p className="text-amber-800">
            Outros resultados: <strong>OTHE</strong> recusado, <strong>CONT</strong> pendente,{' '}
            <strong>FUND</strong> sem saldo (sempre no campo nome do titular).
          </p>
        </div>
      )}
      {info && (
        <div className="text-sm text-amber-800 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {info}
        </div>
      )}
      {error && (
        <div className="text-sm text-red-600 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
          <button
            type="button"
            onClick={tentarNovamenteBrick}
            className="text-sm text-primary-600 hover:underline"
          >
            Tentar carregar formulário novamente
          </button>
        </div>
      )}
      <div
        id={containerId}
        ref={containerRef}
        className="min-h-[280px] w-full"
        aria-busy={!brickReady}
      />
      {!brickReady && !error && (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Carregando campos do cartão…
        </p>
      )}
      {submitting && (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Processando pagamento…
        </p>
      )}
    </div>
  )
}

export default CardPaymentBrick
