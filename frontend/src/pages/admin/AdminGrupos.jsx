import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, Users, Shield } from 'lucide-react'
import api from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'
import GrupoForm from './GrupoForm'

function AdminGrupos() {
  const [grupos, setGrupos] = useState([])
  const [permissoes, setPermissoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [grupoEditando, setGrupoEditando] = useState(null)
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    grupo: null,
  })

  useEffect(() => {
    fetchGrupos()
    fetchPermissoes()
  }, [])

  const fetchGrupos = async () => {
    try {
      const response = await api.get('/grupos/?incluir_inativos=true')
      setGrupos(response.data.results || response.data)
    } catch (error) {
      console.error('Erro ao carregar grupos:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPermissoes = async () => {
    try {
      // Busca todas as páginas para não perder permissões no fim da lista
      // (ex.: "Loja / Cantina" quando a API está paginada).
      let url = '/permissoes-menu/?incluir_inativos=true'
      const todasPermissoes = []

      while (url) {
        const response = await api.get(url)
        const data = response.data

        if (Array.isArray(data)) {
          todasPermissoes.push(...data)
          url = null
        } else {
          todasPermissoes.push(...(data.results || []))
          url = data.next
          if (url?.includes(window.location.origin)) {
            url = url.replace(window.location.origin, '')
          }
        }
      }

      setPermissoes(todasPermissoes)
    } catch (error) {
      console.error('Erro ao carregar permissões:', error)
    }
  }

  const handleNovo = () => {
    setGrupoEditando(null)
    setShowForm(true)
  }

  const handleEdit = (grupo) => {
    setGrupoEditando(grupo)
    setShowForm(true)
  }

  const handleDelete = (grupo) => {
    setModalConfig({
      isOpen: true,
      grupo,
    })
  }

  const fecharModal = () => {
    setModalConfig({ isOpen: false, grupo: null })
  }

  const executarDelete = async () => {
    if (!modalConfig.grupo) return

    try {
      await api.delete(`/grupos/${modalConfig.grupo.id}/`)
      setGrupos(grupos.filter(g => g.id !== modalConfig.grupo.id))
      fecharModal()
    } catch (error) {
      console.error('Erro ao excluir grupo:', error)
      alert('Erro ao excluir grupo. Tente novamente.')
    }
  }

  const handleSalvar = () => {
    setShowForm(false)
    setGrupoEditando(null)
    fetchGrupos()
  }

  const handleCancelar = () => {
    setShowForm(false)
    setGrupoEditando(null)
  }

  const gruposFiltrados = grupos.filter(grupo => {
    const matchBusca =
      grupo.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      grupo.descricao?.toLowerCase().includes(busca.toLowerCase())
    return matchBusca
  })

  if (loading) {
    return <LoadingSpinner text="Carregando grupos..." />
  }

  if (showForm) {
    return (
      <GrupoForm
        grupo={grupoEditando}
        permissoes={permissoes}
        onSalvar={handleSalvar}
        onCancelar={handleCancelar}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-church-navy">Grupos</h1>
          <p className="text-gray-600 mt-1">Gerencie grupos de usuários e suas permissões</p>
        </div>
        <button
          onClick={handleNovo}
          className="btn-primary mt-4 sm:mt-0 inline-flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Grupo
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-md p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar grupos..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Grupo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Descrição
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Permissões
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuários
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
              {gruposFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    Nenhum grupo encontrado
                  </td>
                </tr>
              ) : (
                gruposFiltrados.map((grupo) => (
                  <tr key={grupo.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {grupo.nome}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500">
                        {grupo.descricao || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {grupo.permissoes_detalhes && grupo.permissoes_detalhes.length > 0 ? (
                          grupo.permissoes_detalhes.map((perm) => (
                            <span
                              key={perm.id}
                              className="inline-flex px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800"
                              title={perm.descricao}
                            >
                              {perm.nome}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">Sem permissões</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {grupo.usuarios_count || 0} usuário{grupo.usuarios_count !== 1 ? 's' : ''}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {grupo.ativo ? (
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(grupo)}
                          className="text-primary-600 hover:text-primary-900"
                          title="Editar"
                        >
                          <Edit className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(grupo)}
                          className="text-red-600 hover:text-red-900"
                          title="Excluir"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Confirmação */}
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        onClose={fecharModal}
        onConfirm={executarDelete}
        title="Excluir Grupo"
        message={`Tem certeza que deseja excluir o grupo "${modalConfig.grupo?.nome}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  )
}

export default AdminGrupos
