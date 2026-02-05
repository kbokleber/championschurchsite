import { useState, useEffect } from 'react'
import { Save, X } from 'lucide-react'
import api from '../../services/api'

function UsuarioForm({ usuario, grupos, onSalvar, onCancelar }) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    grupos_ids: [],
    is_superuser: false,
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (usuario) {
      setFormData({
        username: usuario.username || '',
        email: usuario.email || '',
        first_name: usuario.first_name || '',
        last_name: usuario.last_name || '',
        password: '',
        grupos_ids: usuario.grupos ? usuario.grupos.map(g => g.id) : [],
        is_superuser: usuario.is_superuser || false,
      })
    }
  }, [usuario])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleGruposChange = (grupoId) => {
    setFormData(prev => {
      const grupos = prev.grupos_ids || []
      if (grupos.includes(grupoId)) {
        return {
          ...prev,
          grupos_ids: grupos.filter(id => id !== grupoId)
        }
      } else {
        return {
          ...prev,
          grupos_ids: [...grupos, grupoId]
        }
      }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErro('')
    setSalvando(true)

    try {
      const data = {
        ...formData,
        is_staff: true,
      }

      // Proteger usuário admin
      if (usuario && usuario.username === 'admin') {
        // Garantir que admin sempre seja superusuário
        data.is_superuser = true
        // Não permitir alterar username do admin
        data.username = 'admin'
      }

      // Remover senha se estiver vazia na edição
      if (usuario && !data.password) {
        delete data.password
      }

      if (usuario) {
        await api.put(`/usuarios/${usuario.id}/`, data)
      } else {
        await api.post('/usuarios/', data)
      }

      onSalvar()
    } catch (error) {
      console.error('Erro ao salvar usuário:', error)
      setErro(
        error.response?.data?.password?.[0] ||
        error.response?.data?.username?.[0] ||
        error.response?.data?.email?.[0] ||
        error.response?.data?.detail ||
        'Erro ao salvar usuário. Verifique os dados e tente novamente.'
      )
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-church-navy">
            {usuario ? 'Editar Usuário' : 'Novo Usuário'}
          </h1>
          <p className="text-gray-600 mt-1">
            {usuario ? 'Edite as informações do usuário' : 'Crie um novo usuário administrativo'}
          </p>
        </div>
        <button
          onClick={onCancelar}
          className="text-gray-500 hover:text-gray-700"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md p-6">
        {erro && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {erro}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username <span className="text-red-500">*</span>
              {usuario && usuario.username === 'admin' && (
                <span className="ml-2 text-xs text-gray-500">(protegido)</span>
              )}
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              disabled={!!usuario || (usuario && usuario.username === 'admin')}
              className="input-field"
              placeholder="nomeusuario"
            />
            {usuario && usuario.username === 'admin' && (
              <p className="mt-1 text-xs text-gray-500">
                O usuário admin não pode ter seu username alterado por questões de segurança.
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="input-field"
              placeholder="usuario@exemplo.com"
            />
          </div>

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome
            </label>
            <input
              type="text"
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              className="input-field"
              placeholder="Nome"
            />
          </div>

          {/* Sobrenome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sobrenome
            </label>
            <input
              type="text"
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              className="input-field"
              placeholder="Sobrenome"
            />
          </div>

          {/* Senha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Senha {usuario ? '(deixe em branco para manter)' : <span className="text-red-500">*</span>}
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required={!usuario}
              className="input-field"
              placeholder="••••••••"
            />
          </div>

          {/* Super Usuário */}
          <div className="flex items-center">
            <input
              type="checkbox"
              name="is_superuser"
              id="is_superuser"
              checked={formData.is_superuser}
              onChange={handleChange}
              disabled={usuario && usuario.username === 'admin'}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="is_superuser" className="ml-2 block text-sm text-gray-700">
              Super Usuário (acesso total ao sistema)
              {usuario && usuario.username === 'admin' && (
                <span className="ml-1 text-xs text-gray-500">(sempre ativo para admin)</span>
              )}
            </label>
          </div>
        </div>

        {/* Grupos */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Grupos
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {grupos.map((grupo) => (
              <label
                key={grupo.id}
                className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={formData.grupos_ids.includes(grupo.id)}
                  onChange={() => handleGruposChange(grupo.id)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">{grupo.nome}</span>
              </label>
            ))}
          </div>
          {grupos.length === 0 && (
            <p className="text-sm text-gray-500 mt-2">
              Nenhum grupo disponível. Crie grupos primeiro.
            </p>
          )}
        </div>

        {/* Botões */}
        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancelar}
            className="btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="btn-primary inline-flex items-center"
          >
            <Save className="h-5 w-5 mr-2" />
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default UsuarioForm
