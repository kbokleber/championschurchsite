import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Edit, Trash2, Users, Mail, Phone, Eye, EyeOff, Key } from 'lucide-react'
import api from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'

function AdminMembros() {
  const [membros, setMembros] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [deletando, setDeletando] = useState(false)
  const [senhasVisiveis, setSenhasVisiveis] = useState({}) // { membroId: true/false }
  
  // Estado do modal de confirmação
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    membro: null,
  })
  
  // Toggle para mostrar/esconder senha de um membro
  const toggleSenha = (membroId) => {
    setSenhasVisiveis(prev => ({
      ...prev,
      [membroId]: !prev[membroId]
    }))
  }

  useEffect(() => {
    fetchMembros()
  }, [])

  const fetchMembros = async () => {
    try {
      const response = await api.get('/membros/')
      setMembros(response.data.results || response.data)
    } catch (error) {
      console.error('Erro ao carregar membros:', error)
    } finally {
      setLoading(false)
    }
  }

  // Abre o modal de confirmação
  const handleDelete = (membro) => {
    setModalConfig({
      isOpen: true,
      membro,
    })
  }
  
  // Fecha o modal
  const fecharModal = () => {
    setModalConfig({ isOpen: false, membro: null })
  }
  
  // Executa a exclusão
  const executarDelete = async () => {
    if (!modalConfig.membro) return
    
    setDeletando(true)
    try {
      await api.delete(`/membros/${modalConfig.membro.id}/`)
      setMembros(membros.filter(m => m.id !== modalConfig.membro.id))
      fecharModal()
    } catch (error) {
      console.error('Erro ao excluir membro:', error)
      alert('Erro ao excluir membro. Tente novamente.')
    } finally {
      setDeletando(false)
    }
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      ativo: { bg: 'bg-green-100', text: 'text-green-800', label: 'Ativo' },
      inativo: { bg: 'bg-red-100', text: 'text-red-800', label: 'Inativo' },
      visitante: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Visitante' },
    }
    const config = statusConfig[status] || statusConfig.visitante
    return (
      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    )
  }

  const membrosFiltrados = membros.filter(membro => {
    const matchBusca = 
      membro.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      membro.email?.toLowerCase().includes(busca.toLowerCase())
    const matchStatus = filtroStatus === 'todos' || membro.status === filtroStatus
    return matchBusca && matchStatus
  })

  if (loading) {
    return <LoadingSpinner text="Carregando membros..." />
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-church-navy">Membros</h1>
          <p className="text-gray-600 mt-1">Gerencie os membros da igreja</p>
        </div>
        <Link
          to="/admin/membros/novo"
          className="btn-primary mt-4 sm:mt-0 inline-flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Membro
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-md p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou email..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          
          {/* Status Filter */}
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="input-field md:w-48"
          >
            <option value="todos">Todos os Status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="visitante">Visitante</option>
          </select>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        {membrosFiltrados.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    Membro
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    Contato
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    Senha
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    Status
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {membrosFiltrados.map((membro) => (
                  <tr key={membro.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center mr-3">
                          <span className="text-primary-600 font-bold">
                            {(membro.nome || 'M')[0].toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-church-navy">{membro.nome}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center text-sm text-gray-600">
                          <Mail className="h-4 w-4 mr-2 text-gray-400" />
                          {membro.email || '-'}
                        </div>
                        {membro.telefone && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Phone className="h-4 w-4 mr-2 text-gray-400" />
                            {membro.telefone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {membro.senha_texto ? (
                        <div className="flex items-center gap-2">
                          <Key className="h-4 w-4 text-gray-400" />
                          <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                            {senhasVisiveis[membro.id] ? membro.senha_texto : '••••••'}
                          </span>
                          <button
                            onClick={() => toggleSenha(membro.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            title={senhasVisiveis[membro.id] ? 'Esconder senha' : 'Mostrar senha'}
                          >
                            {senhasVisiveis[membro.id] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(membro.status)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          to={`/admin/membros/${membro.id}`}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="h-5 w-5" />
                        </Link>
                        <button
                          onClick={() => handleDelete(membro)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir"
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
        ) : (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nenhum membro encontrado</p>
            <Link to="/admin/membros/novo" className="btn-primary mt-4 inline-flex items-center">
              <Plus className="h-5 w-5 mr-2" />
              Cadastrar Primeiro Membro
            </Link>
          </div>
        )}
      </div>

      {/* Modal de Confirmação de Exclusão */}
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        onClose={fecharModal}
        onConfirm={executarDelete}
        title="Excluir Membro"
        message={`Tem certeza que deseja excluir o membro "${modalConfig.membro?.nome}"? Esta ação não pode ser desfeita.`}
        type="danger"
        confirmText="Excluir Membro"
        cancelText="Cancelar"
        loading={deletando}
      >
        {/* Detalhes do membro */}
        {modalConfig.membro && (
          <div className="bg-gray-50 rounded-lg p-4 text-left">
            <div className="flex items-center mb-3">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mr-3">
                <span className="text-primary-600 font-bold text-lg">
                  {(modalConfig.membro.nome || 'M')[0].toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-semibold text-gray-800">{modalConfig.membro.nome}</p>
                {getStatusBadge(modalConfig.membro.status)}
              </div>
            </div>
            <div className="space-y-1 text-sm">
              {modalConfig.membro.email && (
                <p className="flex items-center text-gray-600">
                  <Mail className="h-4 w-4 mr-2 text-gray-400" />
                  {modalConfig.membro.email}
                </p>
              )}
              {modalConfig.membro.telefone && (
                <p className="flex items-center text-gray-600">
                  <Phone className="h-4 w-4 mr-2 text-gray-400" />
                  {modalConfig.membro.telefone}
                </p>
              )}
            </div>
          </div>
        )}
      </ConfirmModal>
    </div>
  )
}

export default AdminMembros
