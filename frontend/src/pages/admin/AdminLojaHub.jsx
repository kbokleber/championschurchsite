import { Link } from 'react-router-dom'
import { Coffee, ShoppingBag, Receipt, ChevronRight, BarChart3 } from 'lucide-react'

/**
 * Ponto de entrada: escolhe Cantina (consumo) ou Loja (mercadoria).
 * Os dados continuam na mesma tabela; a separação é só de fluxo na UI.
 */
function AdminLojaHub() {
  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto min-h-[60vh] flex flex-col">
      <div className="text-center sm:text-left mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Loja / Cantina</h1>
        <p className="text-gray-600 text-sm sm:text-base mt-2 max-w-md mx-auto sm:mx-0">
          Escolha onde quer trabalhar. O cadastro é o mesmo sistema; aqui você só separa o contexto
          (balcão de consumo ou loja de produtos).
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
        <Link
          to="/admin/loja/cantina/produtos"
          className="group flex flex-col items-stretch rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-amber-400 active:scale-[0.99] transition min-h-[160px] touch-manipulation"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shrink-0">
              <Coffee className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
            </div>
            <ChevronRight className="h-6 w-6 text-amber-600 opacity-0 group-hover:opacity-100 transition hidden sm:block" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mt-4">Cantina</h2>
          <p className="text-sm text-gray-600 mt-1 flex-1">
            Bebidas, salgados e lanches. Cadastre e venda só o que for deste balcão.
          </p>
          <span className="mt-4 text-sm font-semibold text-amber-800">Abrir cantina →</span>
        </Link>

        <Link
          to="/admin/loja/loja/produtos"
          className="group flex flex-col items-stretch rounded-2xl border-2 border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-sky-400 active:scale-[0.99] transition min-h-[160px] touch-manipulation"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-sky-100 text-sky-800 shrink-0">
              <ShoppingBag className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
            </div>
            <ChevronRight className="h-6 w-6 text-sky-600 opacity-0 group-hover:opacity-100 transition hidden sm:block" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mt-4">Loja</h2>
          <p className="text-sm text-gray-600 mt-1 flex-1">
            Camisas, canecas, livros. Cadastre e venda a mercadoria separada do consumo.
          </p>
          <span className="mt-4 text-sm font-semibold text-sky-800">Abrir loja →</span>
        </Link>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center max-w-md mx-auto sm:max-w-none w-full flex-wrap">
        <Link
          to="/admin/loja/cantina/reservas"
          className="flex-1 min-w-[140px] flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3.5 text-sm font-medium text-amber-950 shadow-sm hover:bg-amber-50 min-h-[48px] touch-manipulation"
        >
          Reservas (cantina)
        </Link>
        <Link
          to="/admin/loja/loja/reservas"
          className="flex-1 min-w-[140px] flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3.5 text-sm font-medium text-sky-950 shadow-sm hover:bg-sky-50 min-h-[48px] touch-manipulation"
        >
          Reservas (loja)
        </Link>
        <Link
          to="/admin/loja/vendas"
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 min-h-[48px] touch-manipulation"
        >
          <Receipt className="h-4 w-4" />
          Ver histórico de vendas (todas)
        </Link>
        <Link
          to="/admin/loja/financeiro"
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3.5 text-sm font-medium text-sky-900 shadow-sm hover:bg-sky-50 min-h-[48px] touch-manipulation"
        >
          <BarChart3 className="h-4 w-4" />
          Dashboard financeiro
        </Link>
      </div>
    </div>
  )
}

export default AdminLojaHub
