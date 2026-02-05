import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, Key, User, Users } from 'lucide-react'
import api from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'
import UsuarioForm from './UsuarioForm'

function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState(null)
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    usuario: null,
  })

  useEffect(() => {
    fetchUsuarios()
    fetchGrupos()
  }, [])

  const fetchUsuarios = async () => {
    try {
      const response = await api.get('/usuarios/')
      setUsuarios(response.data.results || response.data)
    } catch (error) {
      console.error('Erro ao carregar usuários:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchGrupos = async () => {
    try {
      const response = await api.get('/grupos/')
      setGrupos(response.data.results || response.data)
    } catch (error) {
      console.error('Erro ao carregar grupos:', error)
    }
  }

  const handleNovo = () => {
    setUsuarioEditando(null)
    setShowForm(true)
  }

  const handleEdit = (usuario) => {
    setUsuarioEditando(usuario)
    setShowForm(true)
  }

  const handleDelete = (usuario) => {
    setModalConfig({
      isOpen: true,
      usuario,
    })
  }

  const fecharModal = () => {
    setModalConfig({ isOpen: false, usuario: null })
  }

  const executarDelete = async () => {
    if (!modalConfig.usuario) return

    // Proteger usuário admin
    if (modalConfig.usuario.username === 'admin') {
      alert('O usuário "admin" não pode ser excluído por questões de segurança.')
      fecharModal()
      return
    }

    try {
      await api.delete(`/usuarios/${modalConfig.usuario.id}/`)
      setUsuarios(usuarios.filter(u => u.id !== modalConfig.usuario.id))
      fecharModal()
    } catch (error) {
      console.error('Erro ao excluir usuário:', error)
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || 'Erro ao excluir usuário. Tente novamente.'
      alert(errorMsg)
    }
  }

  const handleSalvar = () => {
    setShowForm(false)
    setUsuarioEditando(null)
    fetchUsuarios()
  }

  const handleCancelar = () => {
    setShowForm(false)
    setUsuarioEditando(null)
  }

  const usuariosFiltrados = usuarios.filter(usuario => {
    const matchBusca =
      usuario.username?.toLowerCase().includes(busca.toLowerCase()) ||
      usuario.email?.toLowerCase().includes(busca.toLowerCase()) ||
      usuario.first_name?.toLowerCase().includes(busca.toLowerCase()) ||
      usuario.last_name?.toLowerCase().includes(busca.toLowerCase())
    return matchBusca
  })

  if (loading) {
    return <LoadingSpinner text="Carregando usuários..." />
  }

  if (showForm) {
    return (
      <UsuarioForm
        usuario={usuarioEditando}
        grupos={grupos}
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
          <h1 className="text-3xl font-bold text-church-navy">Usuários</h1>
          <p className="text-gray-600 mt-1">Gerencie usuários administrativos do sistema</p>
        </div>
        <button
          onClick={handleNovo}
          className="btn-primary mt-4 sm:mt-0 inline-flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Usuário
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-md p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar usuários..."
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
                  Usuário
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Grupos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {usuariosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    Nenhum usuário encontrado
                  </td>
                </tr>
              ) : (
                usuariosFiltrados.map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-primary-600" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {usuario.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {usuario.first_name} {usuario.last_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{usuario.email || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {usuario.grupos && usuario.grupos.length > 0 ? (
                          usuario.grupos.map((grupo) => (
                            <span
                              key={grupo.id}
                              className="inline-flex px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800"
                            >
                              {grupo.nome}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">Sem grupos</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {usuario.is_superuser ? (
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          Super Admin
                        </span>
                      ) : (
                        <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Admin
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(usuario)}
                          className="text-primary-600 hover:text-primary-900"
                          title="Editar"
                        >
                          <Edit className="h-5 w-5" />
                        </button>
                        {usuario.username !== 'admin' && (
                          <button
                            onClick={() => handleDelete(usuario)}
                            className="text-red-600 hover:text-red-900"
                            title="Excluir"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        )}
                        {usuario.username === 'admin' && (
                          <span className="text-xs text-gray-400" title="Usuário admin protegido">
                            Protegido
                          </span>
                        )}
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
        title="Excluir Usuário"
        message={`Tem certeza que deseja excluir o usuário "${modalConfig.usuario?.username}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  )
}

export default AdminUsuarios
