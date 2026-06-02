import { useState, useEffect } from 'react'
import {
  Plus, Edit, Trash2, Check, X, Users, Percent, DollarSign,
  FolderOpen, ChevronDown, ChevronUp, Shield,
} from 'lucide-react'
import api from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'

const emptyCategoriaForm = {
  nome: '',
  descricao: '',
  tipo_valor: 'porcentagem',
  valor: 100,
  idade_minima: '',
  idade_maxima: '',
  ordem: 0,
  ativo: true,
}

const emptyGrupoForm = {
  nome: '',
  descricao: '',
  ativo: true,
}

function FaixaEtaria({ categoria }) {
  if (!categoria.idade_minima && !categoria.idade_maxima) {
    return <span className="text-gray-400">Não definida</span>
  }
  return (
    <>
      {categoria.idade_minima && `${categoria.idade_minima} anos`}
      {categoria.idade_minima && categoria.idade_maxima && ' - '}
      {categoria.idade_maxima && `${categoria.idade_maxima} anos`}
    </>
  )
}

function AdminCategorias() {
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState({})

  const [showModalCategoria, setShowModalCategoria] = useState(false)
  const [showModalGrupo, setShowModalGrupo] = useState(false)
  const [editandoCategoria, setEditandoCategoria] = useState(null)
  const [editandoGrupo, setEditandoGrupo] = useState(null)
  const [grupoAtivo, setGrupoAtivo] = useState(null)
  const [deletando, setDeletando] = useState(false)

  const [formCategoria, setFormCategoria] = useState(emptyCategoriaForm)
  const [formGrupo, setFormGrupo] = useState(emptyGrupoForm)

  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    tipo: 'categoria',
    item: null,
    grupo: null,
  })

  useEffect(() => {
    fetchGrupos()
  }, [])

  const fetchGrupos = async () => {
    try {
      const response = await api.get('/grupos-categorias/')
      const lista = response.data.results || response.data
      setGrupos(lista)
      const exp = {}
      lista.forEach((g) => {
        exp[g.id] = g.padrao_sistema ? true : exp[g.id]
      })
      setExpandidos((prev) => ({ ...exp, ...prev }))
    } catch (error) {
      console.error('Erro ao carregar grupos:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpandir = (grupoId) => {
    setExpandidos((prev) => ({ ...prev, [grupoId]: !prev[grupoId] }))
  }

  const abrirModalGrupo = (grupo = null) => {
    if (grupo) {
      setEditandoGrupo(grupo)
      setFormGrupo({
        nome: grupo.nome,
        descricao: grupo.descricao || '',
        ativo: grupo.ativo,
      })
    } else {
      setEditandoGrupo(null)
      setFormGrupo(emptyGrupoForm)
    }
    setShowModalGrupo(true)
  }

  const abrirModalCategoria = (grupo, categoria = null) => {
    setGrupoAtivo(grupo)
    if (categoria) {
      setEditandoCategoria(categoria)
      setFormCategoria({
        nome: categoria.nome,
        descricao: categoria.descricao || '',
        tipo_valor: categoria.tipo_valor,
        valor: categoria.valor,
        idade_minima: categoria.idade_minima || '',
        idade_maxima: categoria.idade_maxima || '',
        ordem: categoria.ordem,
        ativo: categoria.ativo,
      })
    } else {
      setEditandoCategoria(null)
      setFormCategoria({
        ...emptyCategoriaForm,
        ordem: (grupo.categorias?.length || 0) + 1,
      })
    }
    setShowModalCategoria(true)
  }

  const fecharModalCategoria = () => {
    setShowModalCategoria(false)
    setEditandoCategoria(null)
    setGrupoAtivo(null)
  }

  const fecharModalGrupo = () => {
    setShowModalGrupo(false)
    setEditandoGrupo(null)
  }

  const handleSubmitGrupo = async (e) => {
    e.preventDefault()
    try {
      const dados = { ...formGrupo }
      if (editandoGrupo) {
        await api.put(`/grupos-categorias/${editandoGrupo.id}/`, dados)
      } else {
        await api.post('/grupos-categorias/', dados)
      }
      fetchGrupos()
      fecharModalGrupo()
    } catch (error) {
      console.error('Erro ao salvar grupo:', error)
      alert(error.response?.data?.error || 'Erro ao salvar grupo')
    }
  }

  const handleSubmitCategoria = async (e) => {
    e.preventDefault()
    if (!grupoAtivo) return
    try {
      const dados = {
        ...formCategoria,
        grupo: grupoAtivo.id,
        idade_minima: formCategoria.idade_minima || null,
        idade_maxima: formCategoria.idade_maxima || null,
        valor: parseFloat(formCategoria.valor) || 0,
      }
      if (editandoCategoria) {
        await api.put(`/categorias/${editandoCategoria.id}/`, dados)
      } else {
        await api.post('/categorias/', dados)
      }
      fetchGrupos()
      fecharModalCategoria()
    } catch (error) {
      console.error('Erro ao salvar categoria:', error)
      alert(error.response?.data?.error || 'Erro ao salvar categoria')
    }
  }

  const handleDelete = (tipo, item, grupo = null) => {
    setDeleteModal({ isOpen: true, tipo, item, grupo })
  }

  const fecharDeleteModal = () => {
    setDeleteModal({ isOpen: false, tipo: 'categoria', item: null, grupo: null })
  }

  const executarDelete = async () => {
    if (!deleteModal.item) return
    setDeletando(true)
    try {
      if (deleteModal.tipo === 'grupo') {
        await api.delete(`/grupos-categorias/${deleteModal.item.id}/`)
      } else {
        await api.delete(`/categorias/${deleteModal.item.id}/`)
      }
      fetchGrupos()
      fecharDeleteModal()
    } catch (error) {
      console.error('Erro ao excluir:', error)
      alert(error.response?.data?.error || 'Erro ao excluir')
    } finally {
      setDeletando(false)
    }
  }

  const toggleAtivoCategoria = async (categoria) => {
    try {
      await api.patch(`/categorias/${categoria.id}/`, { ativo: !categoria.ativo })
      fetchGrupos()
    } catch (error) {
      console.error('Erro ao atualizar categoria:', error)
    }
  }

  const renderLinhaCategoria = (categoria, grupo) => (
    <tr key={categoria.id} className={!categoria.ativo ? 'bg-gray-50' : ''}>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className={`h-9 w-9 rounded-full flex items-center justify-center ${categoria.ativo ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'}`}>
            <Users className="h-4 w-4" />
          </div>
          <div className="ml-3">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${categoria.ativo ? 'text-gray-900' : 'text-gray-500'}`}>
                {categoria.nome}
              </span>
              {categoria.padrao_sistema && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  <Shield className="h-3 w-3" /> Padrão
                </span>
              )}
            </div>
            {categoria.descricao && <div className="text-sm text-gray-500">{categoria.descricao}</div>}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${categoria.tipo_valor === 'fixo' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
          {categoria.tipo_valor === 'fixo' ? <><DollarSign className="h-3 w-3" /> Fixo</> : <><Percent className="h-3 w-3" /> %</>}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{categoria.valor_formatado}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"><FaixaEtaria categoria={categoria} /></td>
      <td className="px-6 py-4 whitespace-nowrap">
        <button
          type="button"
          onClick={() => toggleAtivoCategoria(categoria)}
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${categoria.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
        >
          {categoria.ativo ? <><Check className="h-3 w-3" /> Ativa</> : <><X className="h-3 w-3" /> Inativa</>}
        </button>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={() => abrirModalCategoria(grupo, categoria)} className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg" title="Editar">
            <Edit className="h-5 w-5" />
          </button>
          {!categoria.padrao_sistema && (
            <button type="button" onClick={() => handleDelete('categoria', categoria, grupo)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Excluir">
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grupos de Categorias</h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Cada grupo reúne faixas (Adulto, Criança, etc.) usadas na inscrição dos eventos
          </p>
        </div>
        <button type="button" onClick={() => abrirModalGrupo()} className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto">
          <Plus className="h-5 w-5" />
          Novo Grupo
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Como funciona?</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• O grupo <strong>Padrão</strong> vem com Adulto (100%), Adolescente (50%) e Criança (0%) — usado automaticamente nos eventos.</li>
          <li>• Crie outros grupos para tarifas diferentes e associe ao evento quando permitir acompanhantes.</li>
          <li>• Dentro de cada grupo, use <strong>Nova faixa</strong> para adicionar categorias (valor fixo ou porcentagem).</li>
        </ul>
      </div>

      <div className="space-y-4">
        {grupos.map((grupo) => {
          const aberto = expandidos[grupo.id]
          const categorias = grupo.categorias || []
          return (
            <div key={grupo.id} className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-gray-50 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => toggleExpandir(grupo.id)}
                  className="flex items-center gap-3 text-left min-w-0 flex-1"
                >
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${grupo.padrao_sistema ? 'bg-amber-100 text-amber-700' : 'bg-primary-100 text-primary-600'}`}>
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{grupo.nome}</span>
                      {grupo.padrao_sistema && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          <Shield className="h-3 w-3" /> Grupo padrão
                        </span>
                      )}
                      {!grupo.ativo && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Inativo</span>
                      )}
                    </div>
                    {grupo.descricao && <p className="text-sm text-gray-500 truncate">{grupo.descricao}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{categorias.length} faixa(s)</p>
                  </div>
                  {aberto ? <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />}
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => abrirModalCategoria(grupo)} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1">
                    <Plus className="h-4 w-4" /> Nova faixa
                  </button>
                  {!grupo.padrao_sistema && (
                    <>
                      <button type="button" onClick={() => abrirModalGrupo(grupo)} className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg" title="Editar grupo">
                        <Edit className="h-5 w-5" />
                      </button>
                      <button type="button" onClick={() => handleDelete('grupo', grupo)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Excluir grupo">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {aberto && (
                <div className="overflow-x-auto">
                  {categorias.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <p className="mb-3">Nenhuma faixa neste grupo.</p>
                      <button type="button" onClick={() => abrirModalCategoria(grupo)} className="btn-primary inline-flex items-center gap-2">
                        <Plus className="h-4 w-4" /> Adicionar faixa
                      </button>
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Faixa</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Faixa etária</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {categorias.map((cat) => renderLinhaCategoria(cat, grupo))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {grupos.length === 0 && (
        <div className="bg-white rounded-xl shadow-md p-8 text-center text-gray-500">
          Nenhum grupo encontrado. Execute a migration ou recarregue a página.
        </div>
      )}

      {/* Modal faixa / categoria */}
      {showModalCategoria && grupoAtivo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-1">
              {editandoCategoria ? 'Editar faixa' : 'Nova faixa'}
            </h2>
            <p className="text-sm text-gray-500 mb-4">Grupo: <strong>{grupoAtivo.nome}</strong></p>
            <form onSubmit={handleSubmitCategoria} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={formCategoria.nome}
                  onChange={(e) => setFormCategoria({ ...formCategoria, nome: e.target.value })}
                  className="input-field"
                  placeholder="Ex: Adulto, Idoso"
                  required
                  disabled={editandoCategoria?.padrao_sistema}
                />
                {editandoCategoria?.padrao_sistema && (
                  <p className="text-xs text-amber-600 mt-1">Faixas padrão do sistema não podem ser renomeadas.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input type="text" value={formCategoria.descricao} onChange={(e) => setFormCategoria({ ...formCategoria, descricao: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de valor *</label>
                <select value={formCategoria.tipo_valor} onChange={(e) => setFormCategoria({ ...formCategoria, tipo_valor: e.target.value })} className="input-field">
                  <option value="porcentagem">Porcentagem do valor do evento</option>
                  <option value="fixo">Valor fixo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formCategoria.tipo_valor === 'fixo' ? 'Valor (R$) *' : 'Porcentagem (%) *'}
                </label>
                <input
                  type="number"
                  value={formCategoria.valor}
                  onChange={(e) => setFormCategoria({ ...formCategoria, valor: e.target.value })}
                  className="input-field"
                  step={formCategoria.tipo_valor === 'fixo' ? '0.01' : '1'}
                  min="0"
                  max={formCategoria.tipo_valor === 'porcentagem' ? '100' : undefined}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idade mínima</label>
                  <input type="number" value={formCategoria.idade_minima} onChange={(e) => setFormCategoria({ ...formCategoria, idade_minima: e.target.value })} className="input-field" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idade máxima</label>
                  <input type="number" value={formCategoria.idade_maxima} onChange={(e) => setFormCategoria({ ...formCategoria, idade_maxima: e.target.value })} className="input-field" min="0" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ordem</label>
                <input type="number" value={formCategoria.ordem} onChange={(e) => setFormCategoria({ ...formCategoria, ordem: e.target.value })} className="input-field" min="0" />
              </div>
              <div className="flex items-center">
                <input type="checkbox" id="ativo-cat" checked={formCategoria.ativo} onChange={(e) => setFormCategoria({ ...formCategoria, ativo: e.target.checked })} className="h-4 w-4 text-primary-600 rounded" />
                <label htmlFor="ativo-cat" className="ml-2 text-sm text-gray-700">Faixa ativa</label>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={fecharModalCategoria} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">{editandoCategoria ? 'Salvar' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal grupo */}
      {showModalGrupo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editandoGrupo ? 'Editar grupo' : 'Novo grupo'}</h2>
            <form onSubmit={handleSubmitGrupo} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do grupo *</label>
                <input
                  type="text"
                  value={formGrupo.nome}
                  onChange={(e) => setFormGrupo({ ...formGrupo, nome: e.target.value })}
                  className="input-field"
                  placeholder="Ex: Retiro família"
                  required
                  disabled={editandoGrupo?.padrao_sistema}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input type="text" value={formGrupo.descricao} onChange={(e) => setFormGrupo({ ...formGrupo, descricao: e.target.value })} className="input-field" />
              </div>
              <div className="flex items-center">
                <input type="checkbox" id="ativo-grupo" checked={formGrupo.ativo} onChange={(e) => setFormGrupo({ ...formGrupo, ativo: e.target.checked })} className="h-4 w-4 text-primary-600 rounded" />
                <label htmlFor="ativo-grupo" className="ml-2 text-sm text-gray-700">Grupo ativo</label>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={fecharModalGrupo} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">{editandoGrupo ? 'Salvar' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={fecharDeleteModal}
        onConfirm={executarDelete}
        title={deleteModal.tipo === 'grupo' ? 'Excluir grupo' : 'Excluir faixa'}
        message={
          deleteModal.tipo === 'grupo'
            ? `Excluir o grupo "${deleteModal.item?.nome}" e todas as faixas dentro dele?`
            : `Excluir a faixa "${deleteModal.item?.nome}"?`
        }
        type="danger"
        confirmText="Excluir"
        cancelText="Cancelar"
        loading={deletando}
      />
    </div>
  )
}

export default AdminCategorias
