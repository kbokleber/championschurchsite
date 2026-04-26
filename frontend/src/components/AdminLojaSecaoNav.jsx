import { Link, useLocation } from 'react-router-dom'
import { Coffee, ShoppingBag, Home, PlusCircle, ListOrdered } from 'lucide-react'

const AREAS = [
  { id: 'cantina', label: 'Cantina', pathBase: '/admin/loja/cantina', icon: Coffee, accent: 'amber' },
  { id: 'loja', label: 'Loja', pathBase: '/admin/loja/loja', icon: ShoppingBag, accent: 'sky' },
]

/**
 * Navegação por seção: Cantina / Loja + atalhos (produtos, PDV) e início.
 * @param {'cantina'|'loja'|undefined} area — se omitido (ex.: página de vendas geral), os dois segmentos não ficam “a verde/ativo”.
 */
function AdminLojaSecaoNav({ area }) {
  const loc = useLocation()
  const hasArea = area === 'loja' || area === 'cantina'
  const current = hasArea ? area : null
  const base = hasArea ? `/admin/loja/${current}` : null

  return (
    <div className="mb-4 sm:mb-6">
      <div
        className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white/90 p-2 sm:p-2 shadow-sm sm:shadow"
        role="navigation"
        aria-label="Loja e cantina"
      >
        {/* Segment: Cantina | Loja — tap targets mín. 44px */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 p-0.5">
          {AREAS.map((a) => {
            const Icon = a.icon
            const active = hasArea && current === a.id
            const isAmber = a.accent === 'amber'
            return (
              <Link
                key={a.id}
                to={`${a.pathBase}/produtos`}
                className={[
                  'flex items-center justify-center gap-2 rounded-xl px-3 py-3.5 min-h-[48px] text-sm sm:text-base font-semibold transition touch-manipulation',
                  active
                    ? isAmber
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-sky-600 text-white shadow-sm'
                    : hasArea
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-[0.99]'
                    : isAmber
                    ? 'bg-amber-50 text-amber-900 border-2 border-amber-200 hover:bg-amber-100'
                    : 'bg-sky-50 text-sky-900 border-2 border-sky-200 hover:bg-sky-100',
                ].join(' ')}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                {a.label}
              </Link>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
          <Link
            to="/admin/loja"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 min-h-[44px] text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            <Home className="h-4 w-4" />
            Início
          </Link>
          <div className="flex flex-wrap justify-end gap-1.5 sm:gap-2">
            {base && (
              <>
                <Link
                  to={`${base}/produtos`}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 min-h-[44px] text-sm font-medium ${
                    loc.pathname.endsWith('/produtos')
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  <ListOrdered className="h-4 w-4" />
                  Produtos
                </Link>
                <Link
                  to={`${base}/nova-venda`}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 min-h-[44px] text-sm font-medium ${
                    loc.pathname.includes('/nova-venda')
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  <PlusCircle className="h-4 w-4" />
                  Vender
                </Link>
              </>
            )}
            {current === 'cantina' && (
              <Link
                to="/admin/loja/cantina/reservas"
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 min-h-[44px] text-sm font-medium ${
                  loc.pathname === '/admin/loja/cantina/reservas'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                Reservas
              </Link>
            )}
            <Link
              to="/admin/loja/vendas"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 min-h-[44px] text-sm font-medium ${
                loc.pathname === '/admin/loja/vendas'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              Histórico
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminLojaSecaoNav
