import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Edit, Trash2, Copy, FileText, Check, X, Users
} from 'lucide-react'
import api from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'

function AdminFormularios() {
  const navigate = useNavigate()
  const [formularios, setFormularios] = useState([])
  const [loading, setLoading] = useState(true)
  const [incluirInativos, setIncluirInativos] = useState(true)
  const [deletando, setDeletando] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, formulario: null })

  useEffect(() => {
    fetchFormularios()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incluirInativos])

  const fetchFormularios = async () => {
    setLoading(true)
    try {
      const params = {}
      if (incluirInativos) params.incluir_inativos = 'true'
      const response = await api.get('/formularios/', { params })
      setFormularios(response.data.results || response.data)
    } catch (error) {
      console.error('Erro ao carregar formulários:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = (formulario) => {
    setDeleteModal({ isOpen: true, formulario })
  }

  const fecharDeleteModal = () => {
    setDeleteModal({ isOpen: false, formulario: null })
  }

  const executarDelete = async () => {
    if (!deleteModal.formulario) return
    setDeletando(true)
    try {
      await api.delete(`/formularios/${deleteModal.formulario.id}/`)
      setFormularios(formularios.filter(f => f.id !== deleteModal.formulario.id))
      fecharDeleteModal()
    } catch (error) {
      console.error('Erro ao excluir formulário:', error)
      const detalhe = error?.response?.data?.detail
      alert(detalhe || 'Erro ao excluir formulário')
    } finally {
      setDeletando(false)
    }
  }

  const handleDuplicar = async (formulario) => {
    try {
      const response = await api.post(`/formularios/${formulario.id}/duplicar/`)
      const novo = response.data
      // Redireciona para a tela de edição da cópia recém-criada
      navigate(`/admin/formularios/${novo.id}`)
    } catch (error) {
      console.error('Erro ao duplicar formulário:', error)
      alert('Erro ao duplicar formulário')
    }
  }

  const toggleAtivo = async (formulario) => {
    try {
      const response = await api.patch(`/formularios/${formulario.id}/`, {
        ativo: !formulario.ativo,
      })
      const atualizado = response.data
      setFormularios(formularios.map(f => (f.id === formulario.id ? { ...f, ativo: atualizado.ativo } : f)))
    } catch (error) {
      console.error('Erro ao alterar status do formulário:', error)
      const msg = error?.response?.data?.detail
        || (error?.response?.data ? JSON.stringify(error.response.data) : 'Erro ao alterar status')
      alert(msg)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formulários de Inscrição</h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Crie formulários reaproveitáveis para coletar informações no ato da inscrição em eventos.
          </p>
        </div>
        <Link
          to="/admin/formularios/novo"
          className="btn-primary inline-flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <Plus className="h-5 w-5" />
          Novo Formulário
        </Link>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p>
          As respostas dos participantes são <strong>privadas</strong> e só podem ser vistas por administradores
          através da tela de Inscrições. Com inscrições já feitas, você ainda pode <strong>acrescentar
          campos</strong> ou ajustar textos: quem se inscrever depois responde ao formulário atual. Para
          clonar tudo, use <em>Duplicar</em>. Remover um campo do formulário apaga as respostas já
          vinculadas a esse campo.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          id="incluirInativos"
          checked={incluirInativos}
          onChange={(e) => setIncluirInativos(e.target.checked)}
          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
        />
        <label htmlFor="incluirInativos" className="text-gray-700">
          Exibir também formulários inativos
        </label>
      </div>

      {formularios.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md p-8 sm:p-12 text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 mb-4">Nenhum formulário cadastrado</p>
          <Link
            to="/admin/formularios/novo"
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Criar primeiro formulário
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Formulário</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Campos</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Em uso</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {formularios.map(form => (
                    <tr key={form.id} className={!form.ativo ? 'bg-gray-50' : ''}>
                      <td className="px-6 py-4">
                        <div className="flex items-start">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${form.ativo ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'}`}>
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="ml-4">
                            <div className={`font-medium ${form.ativo ? 'text-gray-900' : 'text-gray-500'}`}>{form.nome}</div>
                            {form.descricao && <div className="text-sm text-gray-500">{form.descricao}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{form.total_campos ?? 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {form.tem_inscricoes ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Users className="h-3 w-3" /> {form.total_inscricoes || 0} inscrição(ões)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            Sem inscrições
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => toggleAtivo(form)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${form.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                          title="Clique para alternar"
                        >
                          {form.ativo ? (<><Check className="h-3 w-3" /> Ativo</>) : (<><X className="h-3 w-3" /> Inativo</>)}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/admin/formularios/${form.id}`}
                            className="p-2 rounded-lg text-primary-600 hover:bg-primary-50"
                            title="Editar"
                          >
                            <Edit className="h-5 w-5" />
                          </Link>
                          <button
                            onClick={() => handleDuplicar(form)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Duplicar"
                          >
                            <Copy className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(form)}
                            className={`p-2 rounded-lg ${form.tem_inscricoes ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:bg-red-50'}`}
                            title={form.tem_inscricoes ? 'Formulário com inscrições não pode ser excluído' : 'Excluir'}
                            disabled={form.tem_inscricoes}
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-4">
            {formularios.map(form => (
              <div
                key={form.id}
                className={`bg-white rounded-xl shadow-md overflow-hidden ${!form.ativo ? 'opacity-75' : ''}`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start min-w-0 flex-1">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${form.ativo ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'}`}>
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="ml-3 min-w-0">
                        <div className={`font-medium ${form.ativo ? 'text-gray-900' : 'text-gray-500'}`}>{form.nome}</div>
                        {form.descricao && <div className="text-sm text-gray-500">{form.descricao}</div>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3 text-xs">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                      {form.total_campos ?? 0} campos
                    </span>
                    {form.tem_inscricoes ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                        <Users className="h-3 w-3" /> {form.total_inscricoes || 0} inscrição(ões)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                        Sem inscrições
                      </span>
                    )}
                    <button
                      onClick={() => toggleAtivo(form)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium ${form.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {form.ativo ? (<><Check className="h-3 w-3" /> Ativo</>) : (<><X className="h-3 w-3" /> Inativo</>)}
                    </button>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      to={`/admin/formularios/${form.id}`}
                      className="p-2 rounded-lg text-primary-600 hover:bg-primary-50"
                      title="Editar"
                    >
                      <Edit className="h-5 w-5" />
                    </Link>
                    <button
                      onClick={() => handleDuplicar(form)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Duplicar"
                    >
                      <Copy className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(form)}
                      className={`p-2 rounded-lg ${form.tem_inscricoes ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:bg-red-50'}`}
                      disabled={form.tem_inscricoes}
                      title={form.tem_inscricoes ? 'Não pode excluir' : 'Excluir'}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={fecharDeleteModal}
        onConfirm={executarDelete}
        title="Excluir Formulário"
        message={`Tem certeza que deseja excluir o formulário "${deleteModal.formulario?.nome}"? Esta ação não pode ser desfeita.`}
        type="danger"
        confirmText="Excluir"
        cancelText="Cancelar"
        loading={deletando}
      />
    </div>
  )
}

export default AdminFormularios
