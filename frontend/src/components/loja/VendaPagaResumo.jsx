import { useEffect, useState } from 'react'
import { CheckCircle, Printer, Send, MessageCircle } from 'lucide-react'
import api from '../../services/api'

function formatarValor(v) {
  const n = Number(v || 0)
  return `R$ ${n.toFixed(2).replace('.', ',')}`
}

function formatarData(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/**
 * Tela mostrada após o pagamento da loja/cantina ser confirmado.
 * - Resumo da venda (itens, total, código, forma de pagamento).
 * - Imprimir / abrir recibo público.
 * - Enviar recibo por WhatsApp via instância da loja.
 */
export default function VendaPagaResumo({ codigo, ondeIrAposEnvio = null, children = null }) {
  const [recibo, setRecibo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const [telefone, setTelefone] = useState('')
  const [nomeCliente, setNomeCliente] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [feedbackEnvio, setFeedbackEnvio] = useState(null)

  const linkRecibo = `${window.location.origin}/recibo/${codigo}`

  useEffect(() => {
    let cancel = false
    if (!codigo) return
    setLoading(true)
    api
      .get(`/loja/recibo/${codigo}/`)
      .then(({ data }) => {
        if (cancel) return
        setRecibo(data)
        setNomeCliente((data.comprador_nome || '').trim())
      })
      .catch((e) => {
        if (cancel) return
        setErro(e?.response?.data?.error || 'Não foi possível carregar o recibo.')
      })
      .finally(() => !cancel && setLoading(false))
    return () => {
      cancel = true
    }
  }, [codigo])

  const enviarWhatsApp = async () => {
    setEnviando(true)
    setFeedbackEnvio(null)
    try {
      const { data } = await api.post(`/loja/recibo/${codigo}/enviar-whatsapp/`, {
        telefone,
        nome: nomeCliente,
      })
      if (data?.success) {
        setFeedbackEnvio({ tipo: 'ok', texto: 'Recibo enviado pelo WhatsApp.' })
        if (ondeIrAposEnvio) {
          setTimeout(() => ondeIrAposEnvio(), 1500)
        }
      } else {
        setFeedbackEnvio({
          tipo: 'erro',
          texto: data?.detalhe || 'Falha ao enviar pelo WhatsApp.',
        })
      }
    } catch (e) {
      const detalhe = e?.response?.data?.error || e?.response?.data?.detalhe
      setFeedbackEnvio({
        tipo: 'erro',
        texto: detalhe || 'Falha ao enviar pelo WhatsApp.',
      })
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-md mx-auto text-center text-sm text-gray-500">
        Carregando dados da venda…
      </div>
    )
  }

  if (erro || !recibo) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <p className="text-gray-800">{erro || 'Recibo indisponível.'}</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-gray-200 shadow p-5">
        <div className="text-center mb-4">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
          <h1 className="text-xl font-bold text-gray-900">Pagamento confirmado</h1>
          <p className="text-sm text-gray-500">A venda foi finalizada.</p>
        </div>

        <div className="border-t border-gray-100 pt-3 text-sm space-y-1 text-gray-700">
          <div className="flex justify-between">
            <span className="text-gray-500">Pedido</span>
            <span className="font-mono">{recibo.codigo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Data</span>
            <span>{formatarData(recibo.data_pagamento || recibo.data_criacao)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Pagamento</span>
            <span>{recibo.metodo_pagamento || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tipo</span>
            <span>{recibo.titulo_secao}</span>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-gray-100">
          {(recibo.itens || []).map((item) => (
            <li key={item.id} className="py-2 flex justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{item.nome}</p>
                <p className="text-xs text-gray-500">
                  {item.quantidade} × {formatarValor(item.preco_unitario)}
                </p>
              </div>
              <span className="text-gray-800 shrink-0">{formatarValor(item.subtotal)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Total</span>
          <span className="text-xl font-bold text-primary-600">
            {formatarValor(recibo.total)}
          </span>
        </div>

        <div className="mt-5 grid gap-2">
          <a
            href={linkRecibo}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary w-full inline-flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimir recibo
          </a>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-green-600" />
            Enviar recibo por WhatsApp
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Opcional. Use o WhatsApp do cliente para enviar o link do recibo.
          </p>
          <div className="mt-3 grid gap-2">
            <input
              type="text"
              className="input-field w-full"
              placeholder="Nome (opcional)"
              value={nomeCliente}
              onChange={(e) => setNomeCliente(e.target.value)}
              disabled={enviando}
            />
            <input
              type="tel"
              inputMode="tel"
              className="input-field w-full"
              placeholder="WhatsApp (DDD + número)"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              disabled={enviando}
            />
            <button
              type="button"
              onClick={enviarWhatsApp}
              disabled={enviando || !telefone.trim()}
              className="btn btn-primary w-full inline-flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {enviando ? 'Enviando…' : 'Enviar pelo WhatsApp'}
            </button>
            {feedbackEnvio && (
              <p
                className={`text-xs mt-1 ${
                  feedbackEnvio.tipo === 'ok' ? 'text-green-700' : 'text-red-600'
                }`}
              >
                {feedbackEnvio.texto}
              </p>
            )}
          </div>
        </div>

        {children && <div className="mt-5 border-t border-gray-100 pt-4">{children}</div>}
      </div>
    </div>
  )
}
