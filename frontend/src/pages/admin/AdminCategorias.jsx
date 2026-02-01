import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Check, X, Users, Percent, DollarSign } from 'lucide-react'
import api from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'

function AdminCategorias() {
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [deletando, setDeletando] = useState(false)
  
  // Estado do modal de confirmação de exclusão
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    categoria: null,
  })
  
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    tipo_valor: 'porcentagem',
    valor: 100,
    idade_minima: '',
    idade_maxima: '',
    ordem: 0,
    ativo: true
  })

  useEffect(() => {
    fetchCategorias()
  }, [])

  const fetchCategorias = async () => {
    try {
      const response = await api.get('/categorias/')
      setCategorias(response.data.results || response.data)
    } catch (error) {
      console.error('Erro ao carregar categorias:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      const dados = {
        ...formData,
        idade_minima: formData.idade_minima || null,
        idade_maxima: formData.idade_maxima || null,
        valor: parseFloat(formData.valor) || 0
      }

      if (editando) {
        await api.put(`/categorias/${editando.id}/`, dados)
      } else {
        await api.post('/categorias/', dados)
      }
      
      fetchCategorias()
      fecharModal()
    } catch (error) {
      console.error('Erro ao salvar categoria:', error)
      alert('Erro ao salvar categoria')
    }
  }

  // Abre o modal de confirmação de exclusão
  const handleDelete = (categoria) => {
    setDeleteModal({
      isOpen: true,
      categoria,
    })
  }
  
  // Fecha o modal de exclusão
  const fecharDeleteModal = () => {
    setDeleteModal({ isOpen: false, categoria: null })
  }
  
  // Executa a exclusão
  const executarDelete = async () => {
    if (!deleteModal.categoria) return
    
    setDeletando(true)
    try {
      await api.delete(`/categorias/${deleteModal.categoria.id}/`)
      setCategorias(categorias.filter(c => c.id !== deleteModal.categoria.id))
      fecharDeleteModal()
    } catch (error) {
      console.error('Erro ao excluir categoria:', error)
      alert('Erro ao excluir categoria')
    } finally {
      setDeletando(false)
    }
  }

  const toggleAtivo = async (categoria) => {
    try {
      await api.patch(`/categorias/${categoria.id}/`, { ativo: !categoria.ativo })
      setCategorias(categorias.map(c => 
        c.id === categoria.id ? { ...c, ativo: !c.ativo } : c
      ))
    } catch (error) {
      console.error('Erro ao atualizar categoria:', error)
    }
  }

  const abrirModal = (categoria = null) => {
    if (categoria) {
      setEditando(categoria)
      setFormData({
        nome: categoria.nome,
        descricao: categoria.descricao || '',
        tipo_valor: categoria.tipo_valor,
        valor: categoria.valor,
        idade_minima: categoria.idade_minima || '',
        idade_maxima: categoria.idade_maxima || '',
        ordem: categoria.ordem,
        ativo: categoria.ativo
      })
    } else {
      setEditando(null)
      setFormData({
        nome: '',
        descricao: '',
        tipo_valor: 'porcentagem',
        valor: 100,
        idade_minima: '',
        idade_maxima: '',
        ordem: 0,
        ativo: true
      })
    }
    setShowModal(true)
  }

  const fecharModal = () => {
    setShowModal(false)
    setEditando(null)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categorias de Participantes</h1>
          <p className="text-gray-600">
            Gerencie as categorias para calcular valores diferenciados em eventos pagos
          </p>
        </div>
        <button
          onClick={() => abrirModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Nova Categoria
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Como funciona?</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>Valor Fixo:</strong> O participante paga um valor específico (ex: R$ 50,00)</li>
          <li>• <strong>Porcentagem:</strong> O participante paga uma porcentagem do valor do evento (ex: 50% = metade do valor)</li>
          <li>• As idades são opcionais e servem apenas como referência para o operador</li>
        </ul>
      </div>

      {/* Lista de Categorias */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Categoria
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tipo de Valor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Valor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Faixa Etária
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categorias.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Nenhuma categoria cadastrada</p>
                  <button
                    onClick={() => abrirModal()}
                    className="mt-2 text-primary-600 hover:text-primary-700"
                  >
                    Criar primeira categoria
                  </button>
                </td>
              </tr>
            ) : (
              categorias.map(categoria => (
                <tr key={categoria.id} className={!categoria.ativo ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        categoria.ativo ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'
                      }`}>
                        <Users className="h-5 w-5" />
                      </div>
                      <div className="ml-4">
                        <div className={`font-medium ${categoria.ativo ? 'text-gray-900' : 'text-gray-500'}`}>
                          {categoria.nome}
                        </div>
                        {categoria.descricao && (
                          <div className="text-sm text-gray-500">{categoria.descricao}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      categoria.tipo_valor === 'fixo' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {categoria.tipo_valor === 'fixo' ? (
                        <><DollarSign className="h-3 w-3" /> Valor Fixo</>
                      ) : (
                        <><Percent className="h-3 w-3" /> Porcentagem</>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-gray-900 font-medium">
                      {categoria.valor_formatado}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {categoria.idade_minima || categoria.idade_maxima ? (
                      <>
                        {categoria.idade_minima && `${categoria.idade_minima} anos`}
                        {categoria.idade_minima && categoria.idade_maxima && ' - '}
                        {categoria.idade_maxima && `${categoria.idade_maxima} anos`}
                      </>
                    ) : (
                      <span className="text-gray-400">Não definida</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => toggleAtivo(categoria)}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        categoria.ativo 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {categoria.ativo ? (
                        <><Check className="h-3 w-3" /> Ativa</>
                      ) : (
                        <><X className="h-3 w-3" /> Inativa</>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => abrirModal(categoria)}
                      className="text-primary-600 hover:text-primary-900 mr-3"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(categoria)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editando ? 'Editar Categoria' : 'Nova Categoria'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome da Categoria *
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="input-field"
                  placeholder="Ex: Adulto, Criança, Adolescente"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição
                </label>
                <input
                  type="text"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  className="input-field"
                  placeholder="Ex: Crianças menores de 12 anos"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Valor *
                </label>
                <select
                  value={formData.tipo_valor}
                  onChange={(e) => setFormData({ ...formData, tipo_valor: e.target.value })}
                  className="input-field"
                >
                  <option value="porcentagem">Porcentagem do valor do evento</option>
                  <option value="fixo">Valor Fixo</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formData.tipo_valor === 'fixo' ? 'Valor (R$) *' : 'Porcentagem (%) *'}
                </label>
                <input
                  type="number"
                  value={formData.valor}
                  onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                  className="input-field"
                  placeholder={formData.tipo_valor === 'fixo' ? 'Ex: 50.00' : 'Ex: 50'}
                  step={formData.tipo_valor === 'fixo' ? '0.01' : '1'}
                  min="0"
                  max={formData.tipo_valor === 'porcentagem' ? '100' : undefined}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.tipo_valor === 'fixo' 
                    ? 'Este valor será cobrado independente do valor do evento'
                    : 'Porcentagem do valor do evento. Ex: 50 = metade, 0 = gratuito, 100 = valor integral'
                  }
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Idade Mínima
                  </label>
                  <input
                    type="number"
                    value={formData.idade_minima}
                    onChange={(e) => setFormData({ ...formData, idade_minima: e.target.value })}
                    className="input-field"
                    placeholder="Ex: 0"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Idade Máxima
                  </label>
                  <input
                    type="number"
                    value={formData.idade_maxima}
                    onChange={(e) => setFormData({ ...formData, idade_maxima: e.target.value })}
                    className="input-field"
                    placeholder="Ex: 12"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ordem de Exibição
                </label>
                <input
                  type="number"
                  value={formData.ordem}
                  onChange={(e) => setFormData({ ...formData, ordem: e.target.value })}
                  className="input-field"
                  placeholder="0"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Menor número aparece primeiro na lista
                </p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="ativo"
                  checked={formData.ativo}
                  onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="ativo" className="ml-2 text-sm text-gray-700">
                  Categoria ativa
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={fecharModal}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  {editando ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={fecharDeleteModal}
        onConfirm={executarDelete}
        title="Excluir Categoria"
        message={`Tem certeza que deseja excluir a categoria "${deleteModal.categoria?.nome}"? Esta ação não pode ser desfeita.`}
        type="danger"
        confirmText="Excluir Categoria"
        cancelText="Cancelar"
        loading={deletando}
      >
        {/* Detalhes da categoria */}
        {deleteModal.categoria && (
          <div className="bg-gray-50 rounded-lg p-4 text-left">
            <div className="flex items-center mb-3">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center mr-3 ${
                deleteModal.categoria.ativo ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'
              }`}>
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-800">{deleteModal.categoria.nome}</p>
                {deleteModal.categoria.descricao && (
                  <p className="text-sm text-gray-500">{deleteModal.categoria.descricao}</p>
                )}
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p className="flex items-center">
                <span className="text-gray-500 mr-2">Tipo:</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  deleteModal.categoria.tipo_valor === 'fixo' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {deleteModal.categoria.tipo_valor === 'fixo' ? (
                    <><DollarSign className="h-3 w-3" /> Valor Fixo</>
                  ) : (
                    <><Percent className="h-3 w-3" /> Porcentagem</>
                  )}
                </span>
              </p>
              <p>
                <span className="text-gray-500">Valor:</span>{' '}
                <span className="font-medium text-gray-800">{deleteModal.categoria.valor_formatado}</span>
              </p>
              <p>
                <span className="text-gray-500">Status:</span>{' '}
                <span className={`font-medium ${deleteModal.categoria.ativo ? 'text-green-600' : 'text-gray-500'}`}>
                  {deleteModal.categoria.ativo ? 'Ativa' : 'Inativa'}
                </span>
              </p>
            </div>
          </div>
        )}
      </ConfirmModal>
    </div>
  )
}

export default AdminCategorias
