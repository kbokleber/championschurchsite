import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'

function formatarValor(v) {
  const n = Number(v || 0)
  return `R$ ${n.toFixed(2).replace('.', ',')}`
}

function resolveMediaUrl(path) {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path
  }
  const isProd = import.meta.env.MODE === 'production'
  const base = isProd ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:8000')
  const pathFromRoot = path.startsWith('/') ? path : `/${path}`
  return `${base}${pathFromRoot}`
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

export default function ReciboLoja() {
  const { codigo } = useParams()
  const [recibo, setRecibo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    api
      .get(`/loja/recibo/${codigo}/`)
      .then(({ data }) => {
        if (cancel) return
        setRecibo(data)
      })
      .catch((e) => {
        if (cancel) return
        setErro(e?.response?.data?.error || 'Recibo não encontrado.')
      })
      .finally(() => !cancel && setLoading(false))
    return () => {
      cancel = true
    }
  }, [codigo])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <p className="text-gray-600 text-sm">Carregando recibo…</p>
      </div>
    )
  }

  if (erro || !recibo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow p-6 max-w-sm text-center">
          <p className="text-gray-800 font-medium">{erro || 'Recibo indisponível.'}</p>
        </div>
      </div>
    )
  }

  const igreja = recibo.igreja || {}

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-3 print:bg-white print:py-0 print:px-0">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-md print:shadow-none print:rounded-none overflow-hidden">
        <div className="p-5 border-b border-gray-200 text-center">
          {igreja.logo ? (
            <img
              src={resolveMediaUrl(igreja.logo)}
              alt={igreja.nome}
              className="h-12 mx-auto mb-2 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : null}
          <p className="text-base font-semibold text-gray-900">{igreja.nome}</p>
          {igreja.cidade && (
            <p className="text-xs text-gray-500 mt-0.5">
              {igreja.cidade}
              {igreja.estado ? ` - ${igreja.estado}` : ''}
            </p>
          )}
          <p className="text-xs uppercase tracking-wide text-primary-600 mt-3 font-semibold">
            {recibo.titulo_secao}
          </p>
        </div>

        <div className="p-5 text-sm text-gray-700 space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Pedido</span>
            <span className="font-mono">{recibo.codigo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Data</span>
            <span>{formatarData(recibo.data_pagamento || recibo.data_criacao)}</span>
          </div>
          {recibo.atendente_nome && (
            <div className="flex justify-between">
              <span className="text-gray-500">Atendente</span>
              <span>{recibo.atendente_nome}</span>
            </div>
          )}
          {recibo.comprador_nome && (
            <div className="flex justify-between">
              <span className="text-gray-500">Cliente</span>
              <span>{recibo.comprador_nome}</span>
            </div>
          )}
          {recibo.metodo_pagamento && (
            <div className="flex justify-between">
              <span className="text-gray-500">Pagamento</span>
              <span>{recibo.metodo_pagamento}</span>
            </div>
          )}
        </div>

        <div className="px-5 pb-2">
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Itens</p>
          <ul className="divide-y divide-gray-100">
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
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-700">Total</span>
          <span className="text-xl font-bold text-primary-600">
            {formatarValor(recibo.total)}
          </span>
        </div>

        <div className="px-5 pb-5 text-[11px] text-gray-400 text-center print:hidden">
          {recibo.aviso || 'Documento não fiscal'}
        </div>

        <div className="px-5 pb-6 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-lg"
          >
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>
    </div>
  )
}
