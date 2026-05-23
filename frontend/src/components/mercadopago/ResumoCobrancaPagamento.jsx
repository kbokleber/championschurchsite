/**
 * Resumo da cobrança acima do checkout (PIX/cartão) — loja ou eventos.
 */
function formatarValor(v) {
  if (v == null || v === '') return '—'
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`
}

export function ResumoCobrancaPagamento({ contexto, dados }) {
  if (!dados) return null

  if (contexto === 'loja') {
    const itens = dados.itens || []
    const area =
      dados.venda_categoria === 'loja'
        ? 'Loja'
        : dados.venda_categoria === 'cantina'
          ? 'Cantina'
          : 'Lojinha / Cantina'
    const comprador = (dados.comprador_nome || '').trim()

    return (
      <div className="mb-6 pb-4 border-b border-gray-200">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{area}</p>
          {comprador && (
            <p className="text-sm text-gray-700 mt-0.5">Cliente: {comprador}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">Ref. {dados.codigo}</p>
        </div>
        {itens.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm">
            {itens.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="text-gray-800">
                  {item.produto_nome}
                  <span className="text-gray-500"> × {item.quantidade}</span>
                </span>
                <span className="text-gray-600 shrink-0">{formatarValor(item.subtotal)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-gray-500">Nenhum item na venda.</p>
        )}
        <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100">
          <span className="text-sm font-medium text-gray-700">Total</span>
          <span className="text-xl font-bold text-primary-600">{formatarValor(dados.valor)}</span>
        </div>
      </div>
    )
  }

  const itens = dados.itens || []
  return (
    <div className="mb-6 pb-4 border-b border-gray-200">
      <div className="min-w-0">
        <p className="text-sm text-gray-500">Evento</p>
        <p className="font-semibold text-gray-900">{dados.evento_titulo || '—'}</p>
        {dados.evento_data && (
          <p className="text-sm text-gray-600 mt-0.5">{dados.evento_data}</p>
        )}
        {dados.membro_nome && (
          <p className="text-sm text-gray-600 mt-1">Responsável: {dados.membro_nome}</p>
        )}
      </div>
      {itens.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {itens.map((item, index) => (
            <li key={item.id ?? index} className="flex justify-between gap-3">
              <span className="text-gray-800">
                {item.membro_nome}
                {item.categoria ? (
                  <span className="text-gray-500"> — {item.categoria}</span>
                ) : null}
              </span>
              <span className="text-gray-600 shrink-0">{formatarValor(item.valor)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-gray-500">Nenhuma inscrição nesta cobrança.</p>
      )}
      <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100">
        <span className="text-sm font-medium text-gray-700">Total</span>
        <span className="text-xl font-bold text-primary-600">{formatarValor(dados.valor)}</span>
      </div>
    </div>
  )
}

export default ResumoCobrancaPagamento
