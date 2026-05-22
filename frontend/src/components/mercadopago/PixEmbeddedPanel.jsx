import { useState, useEffect, useCallback } from 'react'
import { Copy, RefreshCw, QrCode, AlertCircle } from 'lucide-react'
import api from '../../services/api'
import { PayerDataForm, payerToApiPayload, isPayerValid } from './PayerDataForm'

/**
 * PIX embutido: gera QR via API e exibe na página.
 * @param {'eventos'|'loja'} contexto
 */
export function PixEmbeddedPanel({
  contexto = 'eventos',
  cobrancaId,
  cobrancaLojaId,
  valor,
  defaultPayer = {},
  onPixCreated,
  onAlreadyPaid,
  /** Loja/cantina: sem formulário; backend usa dados da igreja no MP */
  pagadorAnonimo = false,
}) {
  const [payer, setPayer] = useState({
    email: defaultPayer.email || '',
    cpf: (defaultPayer.cpf || '').replace(/\D/g, ''),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pix, setPix] = useState(null)
  const [copied, setCopied] = useState(false)

  const pixUrl =
    contexto === 'loja'
      ? '/loja/mercadopago/criar-pix-embutido/'
      : '/mercadopago/criar-pix-embutido/'

  const bodyKey = contexto === 'loja' ? 'cobranca_loja_id' : 'cobranca_id'
  const bodyId = contexto === 'loja' ? cobrancaLojaId : cobrancaId

  const gerarPix = useCallback(async () => {
    if (!pagadorAnonimo && !isPayerValid(payer)) {
      setError('Informe e-mail e CPF válidos (11 dígitos).')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const body = { [bodyKey]: bodyId }
      if (!pagadorAnonimo) {
        body.payer = payerToApiPayload(payer)
      }
      const { data } = await api.post(pixUrl, body)
      if (data.already_approved || data.status === 'approved') {
        onAlreadyPaid?.(data)
        return
      }
      if (data.success && (data.qr_code || data.qr_code_base64)) {
        setPix(data)
        onPixCreated?.(data)
      } else {
        setError(data.error || 'Não foi possível gerar o PIX.')
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao gerar PIX.')
    } finally {
      setLoading(false)
    }
  }, [payer, pixUrl, bodyKey, bodyId, onPixCreated, onAlreadyPaid, pagadorAnonimo])

  useEffect(() => {
    if (pagadorAnonimo) {
      gerarPix()
      return
    }
    if (isPayerValid(payer) && defaultPayer.email && defaultPayer.cpf?.length >= 11) {
      gerarPix()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagadorAnonimo])

  const copiar = async () => {
    if (!pix?.qr_code) return
    try {
      await navigator.clipboard.writeText(pix.qr_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não foi possível copiar. Selecione o código manualmente.')
    }
  }

  return (
    <div className="space-y-4">
      {pagadorAnonimo && (
        <p className="text-sm text-gray-600 rounded-lg bg-gray-50 border border-gray-200 p-3">
          {contexto === 'loja' ? (
            <>
              O cliente no balcão não precisa informar e-mail nem CPF. O PIX usa os dados em{' '}
              <strong>Configurações → Mercado Pago</strong>.
            </>
          ) : (
            <>
              O QR Code PIX é gerado automaticamente com o <strong>e-mail da inscrição</strong> e o{' '}
              <strong>CPF/CNPJ</strong> configurado em <strong>Configurações → Mercado Pago</strong> (não é
              necessário preencher dados aqui).
            </>
          )}
        </p>
      )}
      {!pagadorAnonimo && (
        <PayerDataForm payer={payer} onChange={setPayer} disabled={loading || !!pix} />
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!pix ? (
        !pagadorAnonimo && (
          <button
            type="button"
            onClick={gerarPix}
            disabled={loading}
            className="btn btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Gerando PIX…
              </>
            ) : (
              <>
                <QrCode className="w-4 h-4" /> Gerar QR Code PIX
              </>
            )}
          </button>
        )
      ) : (
        <div className="text-center space-y-4">
          <p className="text-sm text-gray-600">
            Escaneie o QR Code ou copie o código PIX. Valor:{' '}
            <strong>R$ {Number(valor).toFixed(2).replace('.', ',')}</strong>
          </p>
          {pix.qr_code_base64 && (
            <img
              src={`data:image/png;base64,${pix.qr_code_base64}`}
              alt="QR Code PIX"
              className="mx-auto w-48 h-48 border rounded-lg bg-white p-2"
            />
          )}
          {pix.qr_code && (
            <button type="button" onClick={copiar} className="btn btn-secondary w-full flex items-center justify-center gap-2">
              <Copy className="w-4 h-4" />
              {copied ? 'Copiado!' : 'Copiar código PIX'}
            </button>
          )}
          <p className="text-xs text-gray-500">
            Após pagar, a confirmação aparece automaticamente nesta página (em alguns segundos).
          </p>
          <button type="button" onClick={gerarPix} disabled={loading} className="text-sm text-primary-600 hover:underline">
            Gerar novo código PIX
          </button>
        </div>
      )}
      {pagadorAnonimo && !pix && loading && (
        <p className="text-sm text-gray-500 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Gerando PIX…
        </p>
      )}
    </div>
  )
}

export default PixEmbeddedPanel
