import { useLayoutEffect, useRef, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import api, { formatApiError } from '../../services/api'
import { useMercadoPago } from './MercadoPagoProvider'
import {
  MP_CARD_BRICK_CONTAINER_ID,
  brickContainerHasFields,
  esconderTituloSecaoEmailBrick,
  formatBrickError,
  unmountGlobalCardBrick,
} from './cardBrickHelpers'

const VALOR_MINIMO_CARTAO = 0.5

/** Extrai payer do Brick (nome do titular vem em additionalData.cardholderName). */
function payerFromBrickForm(cardFormData, additionalData) {
  const p = cardFormData?.payer || {}
  const id = p.identification || {}
  const number = String(id.number ?? id.document ?? '').replace(/\D/g, '')
  let firstName = (p.first_name || '').trim()
  let lastName = (p.last_name || '').trim()
  const holderRaw = (
    additionalData?.cardholderName ||
    cardFormData?.cardholderName ||
    p.name ||
    ''
  ).trim()
  if ((!firstName && !lastName) && holderRaw) {
    const parts = holderRaw.split(/\s+/).filter(Boolean)
    firstName = parts[0] || ''
    lastName = parts.slice(1).join(' ') || parts[0] || ''
  }
  return {
    email: (p.email || '').trim(),
    first_name: firstName,
    last_name: lastName,
    cardholder_name: holderRaw || `${firstName} ${lastName}`.trim(),
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
  const { ready, error: mpError, isSandbox, mpInstance, payerEmailHint } = useMercadoPago()
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

  useLayoutEffect(() => {
    if (!canMountBrick) return

    const mountGeneration = ++mountGenRef.current
    let cancelled = false
    let readyTimeoutId = null

    const mount = async () => {
      brickMountedRef.current = false
      brickReadyRef.current = false
      setBrickReady(false)
      await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => setTimeout(r, 200))
      if (cancelled || mountGeneration !== mountGenRef.current) return

      const el = containerRef.current || document.getElementById(MP_CARD_BRICK_CONTAINER_ID)
      if (!el) {
        if (!cancelled) {
          setError('Não foi possível montar o formulário de cartão. Recarregue a página.')
        }
        return
      }

      const failLoad = (msg) => {
        if (!cancelled && mountGeneration === mountGenRef.current) {
          if (readyTimeoutId) window.clearTimeout(readyTimeoutId)
          setError(msg)
        }
      }

      readyTimeoutId = window.setTimeout(() => {
        if (!cancelled && mountGeneration === mountGenRef.current && !brickReadyRef.current) {
          const hasFields = brickContainerHasFields(el)
          if (!hasFields) {
            failLoad(
              'Secure Fields do Mercado Pago não carregou (fields_setup_failed). ' +
                'No painel developers.mercadopago.com → sua aplicação → Checkout Bricks, ' +
                'cadastre a URL https://dev.championschurch.com.br. Confira credenciais Sandbox no admin e o Console (F12).',
            )
          }
        }
      }, 15000)

      unmountGlobalCardBrick()

      // Loja: e-mail só no Brick (sem pré-preencher com config da igreja).
      const emailHint = pagadorAnonimo
        ? ''
        : (defaultPayer.email || payerEmailHint || '').trim()
      const init = { amount: valorNum }
      if (emailHint) {
        init.payer = { email: emailHint }
      }

      const settings = {
        locale: 'pt-BR',
        initialization: init,
        customization: {
          visual: {
            texts: {
              // String vazia no MP mostra o padrão; caractere invisível + hide no onReady.
              emailSectionTitle: '\u200B',
              email: {
                label: 'E-mail',
                placeholder: 'exemplo@email.com',
              },
            },
          },
        },
        callbacks: {
          onReady: () => {
            if (!cancelled && mountGeneration === mountGenRef.current) {
              if (readyTimeoutId) window.clearTimeout(readyTimeoutId)
              const root =
                containerRef.current || document.getElementById(MP_CARD_BRICK_CONTAINER_ID)
              esconderTituloSecaoEmailBrick(root)
              window.setTimeout(() => esconderTituloSecaoEmailBrick(root), 400)
              brickReadyRef.current = true
              setBrickReady(true)
              setError(null)
            }
          },
            onSubmit: (cardFormData, additionalData) => {
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
                    const payer = payerFromBrickForm(cardFormData, additionalData)
                    const email = (payer.email || defaultPayer.email || '').trim()
                    if (!email || !email.includes('@')) {
                      const msg = 'Informe um e-mail válido para o pagamento com cartão.'
                      setError(msg)
                      onError?.(msg)
                      reject(new Error(msg))
                      return
                    }
                    payload.payer = { ...payer, email }
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
                    const rawErr = data.error || data.message || 'Pagamento não aprovado.'
                    const msg = typeof rawErr === 'string' ? rawErr : JSON.stringify(rawErr)
                    setError(msg)
                    onError?.(msg)
                    reject(new Error(msg))
                  } catch (e) {
                    const body = e.response?.data
                    const msg =
                      (typeof body?.error === 'string' && body.error) ||
                      (typeof body?.message === 'string' && body.message) ||
                      formatApiError(e, 'Erro ao processar cartão.')
                    setError(msg)
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
                failLoad(
                  `Mercado Pago: ${formatBrickError(brickErr)}. ` +
                    'Verifique URLs do site no Checkout Bricks e credenciais Sandbox.',
                )
              }
            },
          },
        }

      let lastErr = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (cancelled || mountGeneration !== mountGenRef.current) return
        try {
          el.innerHTML = ''
          const bricksBuilder = mpInstance.bricks()
          const controller = await bricksBuilder.create(
            'cardPayment',
            MP_CARD_BRICK_CONTAINER_ID,
            settings,
          )
          if (!cancelled && mountGeneration === mountGenRef.current) {
            brickRef.current = controller
            window.__championsCardBrick = controller
            brickMountedRef.current = true
            lastErr = null
            window.setTimeout(() => {
              esconderTituloSecaoEmailBrick(el)
              if (!brickReadyRef.current && brickContainerHasFields(el)) {
                brickReadyRef.current = true
                setBrickReady(true)
                setError(null)
                if (readyTimeoutId) window.clearTimeout(readyTimeoutId)
              }
            }, 800)
            break
          }
          if (controller?.unmount) {
            try {
              controller.unmount()
            } catch {
              /* ignore */
            }
          }
        } catch (e) {
          lastErr = e
          console.error('[MP Brick] tentativa', attempt + 1, e)
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
        }
      }
      if (lastErr && !cancelled && mountGeneration === mountGenRef.current) {
        failLoad(lastErr.message || 'Não foi possível carregar o formulário de cartão.')
        brickMountedRef.current = false
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
    defaultPayer.email,
    payerEmailHint,
    pagadorAnonimo,
    mountKey,
  ])

  const tentarNovamenteBrick = () => {
    unmountGlobalCardBrick()
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
        Para R$ {valorNum.toFixed(2).replace('.', ',')}, use o pagamento via <strong>PIX</strong>.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!pagadorAnonimo && (
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
          <p className="text-amber-800">
            O admin está em Sandbox: o cartão usa a API de Produção do MP (credenciais de teste da
            app não aceitam pagamento). Use os cartões de teste abaixo.
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
        id={MP_CARD_BRICK_CONTAINER_ID}
        ref={containerRef}
        className="min-h-[320px] w-full"
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
