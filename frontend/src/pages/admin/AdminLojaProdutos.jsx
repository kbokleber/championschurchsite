import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import { Plus, Edit, Pencil, X, Tag, ImageIcon } from 'lucide-react'
import api from '../../services/api'
import { formatApiError } from '../../services/api'
import { getMediaUrl } from '../../services/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import AdminLojaSecaoNav from '../../components/AdminLojaSecaoNav'

const CATEGORIAS = ['cantina', 'loja']

function resumoNomesProdutos(prods, max = 4) {
  if (!prods?.length) return '.'
  const names = prods.slice(0, max).map((p) => `«${p.nome}»`)
  const extra = prods.length > max ? ` e mais ${prods.length - max}` : ''
  return ` (${names.join(', ')}${extra})`
}

function getEmptyForm(categoria) {
  return {
    nome: '',
    descricao: '',
    categoria,
    preco: '',
    ativo: true,
    controla_estoque: false,
    estoque: '0',
    segmento_cantina: categoria === 'cantina' ? 'comida' : null,
  }
}

function labelSegmentoCantina(s) {
  if (s === 'bebida') return 'Bebidas'
  if (s === 'comida') return 'Comidas'
  return '—'
}

function AdminLojaProdutos() {
  const { area } = useParams()
  if (!CATEGORIAS.includes(area)) {
    return <Navigate to="/admin/loja" replace />
  }

  const areaLabel = area === 'cantina' ? 'Cantina' : 'Loja (mercadoria)'
  const isCantina = area === 'cantina'
  const accent = isCantina
    ? { border: 'border-amber-200', badge: 'bg-amber-100 text-amber-900', ring: 'focus:ring-amber-500/30' }
    : { border: 'border-sky-200', badge: 'bg-sky-100 text-sky-900', ring: 'focus:ring-sky-500/30' }

  const [allProducts, setAllProducts] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(() => getEmptyForm(area))
  const [saving, setSaving] = useState(false)
  const [imagemFile, setImagemFile] = useState(null)
  const [imagemPreview, setImagemPreview] = useState(null)
  const [imagemRemovida, setImagemRemovida] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!modal) setForm(getEmptyForm(area))
  }, [area, modal])

  const outraArea = area === 'cantina' ? 'loja' : 'cantina'
  const outraAreaLabel = outraArea === 'cantina' ? 'Cantina' : 'Loja (mercadoria)'

  const { list, outrosNestaConta } = useMemo(() => {
    const raw = Array.isArray(allProducts) ? allProducts : []
    const listFiltrada = raw.filter((p) => p.categoria === area)
    const fora = raw.filter((p) => p.categoria === outraArea)
    return { list: listFiltrada, outrosNestaConta: fora }
  }, [allProducts, area, outraArea])

  const load = async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const { data } = await api.get('/loja/produtos/', { params: { page_size: 500 } })
      setAllProducts(data.results || data)
    } catch (e) {
      console.error(e)
      setLoadError(formatApiError(e, 'Não foi possível carregar os produtos.'))
      setAllProducts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [area])

  const resetImagem = () => {
    setImagemFile(null)
    setImagemRemovida(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openNew = () => {
    setEditing(null)
    setForm(getEmptyForm(area))
    setImagemPreview(null)
    resetImagem()
    setModal(true)
  }

  const openEdit = (p) => {
    setEditing(p)
    setForm({
      nome: p.nome,
      descricao: p.descricao || '',
      categoria: area,
      preco: String(p.preco),
      ativo: p.ativo,
      controla_estoque: Boolean(p.controla_estoque),
      estoque: String(p.estoque ?? 0),
      segmento_cantina: p.segmento_cantina || (area === 'cantina' ? 'comida' : null),
    })
    setImagemPreview(p.imagem ? getMediaUrl(p.imagem) : null)
    resetImagem()
    setImagemRemovida(false)
    setModal(true)
  }

  const closeModal = () => {
    if (!saving) setModal(false)
  }

  const IMAGEM_MIME_ACEITOS = /^image\//i
  const IMAGEM_EXT_ACEITAS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'])

  const onPickImagem = (e) => {
    const file = e.target.files?.[0] || null
    if (!file) return
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const pareceImagem =
      (file.type && IMAGEM_MIME_ACEITOS.test(file.type)) ||
      (!file.type && IMAGEM_EXT_ACEITAS.has(ext))
    if (!pareceImagem) {
      alert('Selecione um arquivo de imagem (JPG, PNG, WebP, HEIC, etc.).')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 5 MB.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setImagemFile(file)
    setImagemRemovida(false)
    setImagemPreview(URL.createObjectURL(file))
  }

  const clearImagem = () => {
    if (imagemFile) {
      if (imagemPreview && String(imagemPreview).startsWith('blob:')) {
        try {
          URL.revokeObjectURL(imagemPreview)
        } catch {
          /* ignore */
        }
      }
      setImagemFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setImagemPreview(editing?.imagem ? getMediaUrl(editing.imagem) : null)
      setImagemRemovida(false)
      return
    }
    if (editing?.imagem) {
      setImagemRemovida(true)
      setImagemPreview(null)
    } else {
      setImagemRemovida(false)
      setImagemPreview(null)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const preco = parseFloat(String(form.preco).replace(',', '.'))
      if (Number.isNaN(preco) || preco < 0) {
        alert('Informe um preço válido.')
        setSaving(false)
        return
      }
      let estoqueNum = parseInt(String(form.estoque).replace(/\D/g, ''), 10)
      if (Number.isNaN(estoqueNum) || estoqueNum < 0) {
        estoqueNum = 0
      }
      const fd = new FormData()
      fd.append('nome', form.nome.trim())
      fd.append('descricao', form.descricao || '')
      fd.append('categoria', area)
      fd.append('preco', String(preco))
      fd.append('ativo', form.ativo ? 'true' : 'false')
      fd.append('controla_estoque', form.controla_estoque ? 'true' : 'false')
      fd.append('estoque', String(estoqueNum))
      if (area === 'cantina') {
        fd.append('segmento_cantina', form.segmento_cantina === 'bebida' ? 'bebida' : 'comida')
      }
      if (imagemFile) {
        fd.append('imagem', imagemFile)
      } else if (editing && imagemRemovida) {
        fd.append('remover_imagem', 'true')
      }
      if (editing) await api.put(`/loja/produtos/${editing.id}/`, fd)
      else await api.post('/loja/produtos/', fd)
      if (imagemFile && imagemPreview && imagemPreview.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(imagemPreview)
        } catch {
          /* ignore */
        }
      }
      setModal(false)
      load()
    } catch (err) {
      alert(formatApiError(err, 'Não foi possível salvar.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingSpinner size="lg" text="Carregando produtos..." />
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-5xl mx-auto">
      <AdminLojaSecaoNav area={area} />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {area === 'cantina' ? 'Cantina' : 'Loja'}
            </h1>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${accent.badge}`}>
              <Tag className="h-3.5 w-3.5" />
              Só {area === 'cantina' ? 'consumo' : 'mercadoria'}
            </span>
          </div>
          <p className="text-gray-600 text-sm mt-1">
            {isCantina
              ? 'Tudo que você cadastrar aqui aparece só neste contexto; a base de dados é a mesma da Loja, filtrada por tipo.'
              : 'Roupas, acessórios, material. Separação clara do balcão da cantina, mesma tabela com outro filtro.'}
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className={`shrink-0 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 min-h-[48px] text-base font-semibold text-white shadow-sm sm:min-h-[44px] touch-manipulation ${
            isCantina ? 'bg-amber-600 hover:bg-amber-700' : 'bg-sky-600 hover:bg-sky-700'
          }`}
        >
          <Plus className="w-5 h-5" />
          Novo produto
        </button>
      </div>

      {loadError && (
        <div
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          <p className="font-medium">Não foi possível carregar a lista.</p>
          <p className="mt-1">{loadError}</p>
          <p className="mt-2 text-red-800/90">
            Confirme se está com sessão iniciada (token) e se a API responde (mesma origem ou
            <code className="mx-1 rounded bg-red-100 px-1">VITE_API_URL</code> em dev).
          </p>
        </div>
      )}

      {!loadError && !list.length && outrosNestaConta.length > 0 && (
        <div
          className={`mb-4 rounded-2xl border p-4 sm:p-5 ${
            isCantina
              ? 'border-sky-200 bg-sky-50/80 text-sky-950'
              : 'border-amber-200 bg-amber-50/80 text-amber-950'
          }`}
        >
          <p className="font-semibold">Nada nesta seção, mas existem produtos em outro contexto</p>
          <p className="mt-1.5 text-sm leading-relaxed opacity-95">
            A lista de <strong>{areaLabel}</strong> só mostra o que tiver categoria
            {area === 'cantina' ? ' «cantina»' : ' «loja»'}. Há {outrosNestaConta.length} produto(s) em{' '}
            <strong>{outraAreaLabel}</strong>
            {resumoNomesProdutos(outrosNestaConta)}
          </p>
          <Link
            to={`/admin/loja/${outraArea}/produtos`}
            className={`mt-3 inline-flex items-center gap-2 text-sm font-semibold underline ${
              isCantina ? 'text-sky-800' : 'text-amber-800'
            }`}
          >
            Abrir cadastro de produtos — {outraAreaLabel}
          </Link>
        </div>
      )}

      {/* Mobile: cards */}
      <ul className="md:hidden space-y-3">
        {list.map((p) => {
          const imgUrl = p.imagem ? getMediaUrl(p.imagem) : null
          return (
          <li
            key={p.id}
            className={`rounded-2xl border ${accent.border} bg-white p-4 shadow-sm active:scale-[0.99] transition`}
          >
            <div className="flex gap-3 justify-between">
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt=""
                  className="w-20 h-20 rounded-xl object-cover border border-gray-100 shrink-0 bg-gray-50"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center shrink-0 text-gray-300">
                  <ImageIcon className="w-8 h-8" aria-hidden />
                </div>
              )}
              <div className="flex-1 min-w-0 flex justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900 text-base leading-snug">{p.nome}</p>
                  {isCantina && (
                    <p className="text-xs text-amber-800 font-medium mt-0.5">
                      {labelSegmentoCantina(p.segmento_cantina)}
                    </p>
                  )}
                  {p.descricao && (
                    <p className="text-sm text-gray-500 line-clamp-2 mt-1">{p.descricao}</p>
                  )}
                </div>
                <span className="text-lg font-bold text-gray-900 whitespace-nowrap">
                  R$ {Number(p.preco).toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
              <span>
                {p.controla_estoque ? (
                  <span className="text-gray-800">Estoque: {p.estoque ?? 0} un.</span>
                ) : (
                  <span className="text-gray-500">Estoque não controlado</span>
                )}{' '}
                <span
                  className={p.ativo ? 'text-green-700 font-medium' : 'text-gray-400 line-through'}
                >
                  · {p.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => openEdit(p)}
                className={`inline-flex items-center gap-1.5 font-medium min-h-[44px] min-w-[44px] justify-center -mr-1 ${
                  isCantina ? 'text-amber-700' : 'text-sky-700'
                }`}
              >
                <Pencil className="w-4 h-4" />
                Editar
              </button>
            </div>
          </li>
          )
        })}
        {!list.length && !outrosNestaConta.length && !loadError && (
          <li className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-gray-500 text-sm">
            Nenhum produto em cantina nem em loja. Toque em &quot;Novo produto&quot; para adicionar.
          </li>
        )}
        {!list.length && !outrosNestaConta.length && loadError && (
          <li className="rounded-2xl border border-dashed border-red-100 bg-red-50/30 p-8 text-center text-red-800 text-sm">
            Corrija o erro acima e atualize a página, ou tente fazer login de novo.
          </li>
        )}
      </ul>

      {/* desktop / tablet: table */}
      <div
        className={`hidden md:block overflow-hidden rounded-2xl border ${accent.border} bg-white shadow-sm overflow-x-auto`}
      >
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-3 w-20 font-semibold" aria-label="Foto" />
              <th className="p-3 font-semibold">Nome</th>
              {isCantina && <th className="p-3 font-semibold w-32">Comidas / Bebidas</th>}
              <th className="p-3 font-semibold">Preço</th>
              <th className="p-3 font-semibold">Estoque</th>
              <th className="p-3 font-semibold">Ativo</th>
              <th className="p-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/80">
                <td className="p-3 w-20 align-middle">
                  {p.imagem ? (
                    <img
                      src={getMediaUrl(p.imagem)}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover border border-gray-100 bg-gray-50"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-gray-200">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <p className="font-medium text-gray-900">{p.nome}</p>
                  {p.descricao && (
                    <p className="text-xs text-gray-500 line-clamp-1 max-w-md">{p.descricao}</p>
                  )}
                </td>
                {isCantina && (
                  <td className="p-3 text-gray-800">
                    {labelSegmentoCantina(p.segmento_cantina)}
                  </td>
                )}
                <td className="p-3 font-medium">R$ {Number(p.preco).toFixed(2).replace('.', ',')}</td>
                <td className="p-3 text-gray-700">
                  {p.controla_estoque ? `${p.estoque ?? 0} un.` : '—'}
                </td>
                <td className="p-3 text-gray-700">{p.ativo ? 'Sim' : 'Não'}</td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className={`text-sm font-medium flex items-center gap-1 ${
                      isCantina ? 'text-amber-800 hover:underline' : 'text-sky-800 hover:underline'
                    }`}
                  >
                    <Edit className="w-4 h-4" />
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {!list.length && !outrosNestaConta.length && !loadError && (
              <tr>
                <td colSpan={isCantina ? 7 : 6} className="p-6 text-center text-gray-500">
                  Nenhum produto em cantina nem em loja. Clique em &quot;Novo produto&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sheet / modal: mobile bottom, desktop center */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
          onClick={closeModal}
          role="presentation"
        >
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className={[
              'w-full sm:max-w-2xl bg-white shadow-2xl flex flex-col',
              'max-h-[min(92dvh,900px)] overflow-hidden',
              'rounded-t-3xl sm:rounded-2xl',
            ].join(' ')}
          >
            <div
              className={`shrink-0 flex items-center justify-between gap-2 border-b px-4 py-3.5 ${
                isCantina ? 'bg-amber-50 border-amber-100' : 'bg-sky-50 border-sky-100'
              }`}
            >
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {editing ? 'Editar' : 'Novo'} — {areaLabel}
                </h2>
                <p className="text-xs text-gray-600">
                  O produto fica só nesta seção. Campos em tamanho confortável para o celular ou tablet.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2.5 min-h-[44px] min-w-[44px] text-gray-600 hover:bg-white/60"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain px-4 py-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div className="sm:col-span-2">
                  <p className="text-sm font-medium text-gray-700 mb-1.5">Foto do produto (opcional)</p>
                  <p className="text-xs text-gray-500 mb-2">
                    Use a câmera ou a galeria do celular. Formatos: JPG, PNG, WebP, HEIC (iPhone) — até 5 MB. A foto
                    aparece na lista e no PDV.
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div
                      className={[
                        'w-full sm:w-40 h-40 rounded-xl border-2 border-dashed overflow-hidden flex items-center justify-center shrink-0',
                        isCantina ? 'border-amber-200 bg-amber-50/30' : 'border-sky-200 bg-sky-50/30',
                      ].join(' ')}
                    >
                      {imagemPreview ? (
                        <img src={imagemPreview} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-12 h-12 text-gray-300" />
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                      <input
                        id="loja-produto-foto"
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,image/heic,image/heif,.heic,.heif"
                        className="sr-only"
                        aria-label="Selecionar foto do produto da galeria ou câmera"
                        onChange={onPickImagem}
                      />
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={[
                            'w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 min-h-[48px] text-sm font-semibold text-white touch-manipulation',
                            isCantina ? 'bg-amber-600 hover:bg-amber-700' : 'bg-sky-600 hover:bg-sky-700',
                          ].join(' ')}
                        >
                          <ImageIcon className="h-5 w-5 shrink-0" aria-hidden />
                          {imagemFile || imagemPreview
                            ? 'Trocar foto'
                            : 'Adicionar foto (galeria ou câmera)'}
                        </button>
                        <p className="text-xs text-gray-600 break-all">
                          {imagemFile
                            ? `Arquivo selecionado: ${imagemFile.name}`
                            : editing?.imagem && !imagemRemovida && !imagemFile
                              ? 'Foto já cadastrada. Use o botão acima para enviar outra e substituir.'
                              : 'Nenhum arquivo novo selecionado.'}
                        </p>
                      </div>
                      {(imagemPreview || (editing?.imagem && !imagemRemovida) || imagemFile) && (
                        <button
                          type="button"
                          onClick={clearImagem}
                          className="text-sm text-red-600 font-medium self-start min-h-[44px] sm:min-h-0"
                        >
                          Remover imagem
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <label className="sm:col-span-2 block text-sm font-medium text-gray-700">
                  Nome
                  <input
                    className={[
                      'mt-1.5 block w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base',
                      'focus:outline-none focus:ring-2',
                      accent.ring,
                    ].join(' ')}
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    inputMode="text"
                    autoComplete="off"
                    required
                    placeholder="Ex: Café médio, Camiseta M"
                  />
                </label>

                {isCantina && (
                  <label className="sm:col-span-2 block text-sm font-medium text-gray-700">
                    Comidas ou bebidas
                    <select
                      className={[
                        'mt-1.5 block w-full sm:max-w-md rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-base',
                        'focus:outline-none focus:ring-2',
                        accent.ring,
                      ].join(' ')}
                      value={form.segmento_cantina || 'comida'}
                      onChange={(e) =>
                        setForm({ ...form, segmento_cantina: e.target.value })
                      }
                    >
                      <option value="comida">Comidas (salgados, doces, etc.)</option>
                      <option value="bebida">Bebidas</option>
                    </select>
                  </label>
                )}

                <label className="block text-sm font-medium text-gray-700">
                  Preço (R$)
                  <input
                    className="mt-1.5 block w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                    type="text"
                    inputMode="decimal"
                    value={form.preco}
                    onChange={(e) => setForm({ ...form, preco: e.target.value })}
                    required
                    placeholder="0,00"
                  />
                </label>

                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <span className="text-sm font-medium text-gray-700 min-h-[44px] sm:flex sm:items-end pb-1 w-full sm:w-auto">
                    Visível
                  </span>
                  <label
                    className="flex grow items-center justify-between sm:justify-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 min-h-[52px] cursor-pointer touch-manipulation"
                  >
                    <span className="text-base text-gray-800">Produto ativo (aparece no {area === 'cantina' ? 'PDV' : 'venda'})</span>
                    <input
                      type="checkbox"
                      className="h-6 w-6 rounded border-gray-300"
                      checked={form.ativo}
                      onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                    />
                  </label>
                </div>

                <div className="sm:col-span-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 space-y-3">
                  <label className="flex items-center justify-between gap-3 cursor-pointer touch-manipulation min-h-[44px]">
                    <span className="text-sm font-medium text-gray-800">
                      Controlar estoque (bloqueia venda acima do saldo)
                    </span>
                    <input
                      type="checkbox"
                      className="h-6 w-6 rounded border-gray-300"
                      checked={form.controla_estoque}
                      onChange={(e) => setForm({ ...form, controla_estoque: e.target.checked })}
                    />
                  </label>
                  {form.controla_estoque && (
                    <label className="block text-sm font-medium text-gray-700">
                      Quantidade em estoque
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        className="mt-1.5 block w-full sm:max-w-[200px] rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-base [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                        value={form.estoque}
                        onChange={(e) => setForm({ ...form, estoque: e.target.value })}
                      />
                    </label>
                  )}
                </div>

                {isCantina && (
                  <p className="sm:col-span-2 text-sm text-amber-900/80 rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3">
                    <strong>Reservas no culto:</strong> qualquer item da cantina com estoque (usa o saldo como limite do
                    dia) ou sem &quot;controlar estoque&quot; entra na lista de reservas. Nada a marcar aqui.
                  </p>
                )}

                <label className="sm:col-span-2 block text-sm font-medium text-gray-700">
                  Descrição (opcional)
                  <textarea
                    className="mt-1.5 block w-full min-h-[100px] rounded-xl border border-gray-200 px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                    rows={3}
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    placeholder="Tamanho, sabor, observações de estoque, etc."
                  />
                </label>
              </div>
            </div>

            <div
              className="shrink-0 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end p-4 border-t border-gray-100 bg-gray-50/90 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <button
                type="button"
                onClick={closeModal}
                className="w-full sm:w-auto min-h-[48px] rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-base font-medium text-gray-800 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`w-full sm:w-auto min-h-[48px] rounded-xl px-5 py-3.5 text-base font-semibold text-white ${
                  isCantina
                    ? 'bg-amber-600 hover:bg-amber-700 disabled:opacity-60'
                    : 'bg-sky-600 hover:bg-sky-700 disabled:opacity-60'
                }`}
              >
                {saving ? 'Salvando...' : 'Salvar produto'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default AdminLojaProdutos
