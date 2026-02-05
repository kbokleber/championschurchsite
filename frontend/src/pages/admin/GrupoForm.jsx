import { useState, useEffect } from 'react'
import { Save, X } from 'lucide-react'
import api from '../../services/api'

function GrupoForm({ grupo, permissoes, onSalvar, onCancelar }) {
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    permissoes_ids: [],
    ativo: true,
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (grupo) {
      setFormData({
        nome: grupo.nome || '',
        descricao: grupo.descricao || '',
        permissoes_ids: grupo.permissoes_detalhes
          ? grupo.permissoes_detalhes.map(p => p.id)
          : [],
        ativo: grupo.ativo !== undefined ? grupo.ativo : true,
      })
    }
  }, [grupo])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handlePermissoesChange = (permissaoId) => {
    setFormData(prev => {
      const permissoes = prev.permissoes_ids || []
      if (permissoes.includes(permissaoId)) {
        return {
          ...prev,
          permissoes_ids: permissoes.filter(id => id !== permissaoId)
        }
      } else {
        return {
          ...prev,
          permissoes_ids: [...permissoes, permissaoId]
        }
      }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErro('')
    setSalvando(true)

    try {
      if (grupo) {
        await api.put(`/grupos/${grupo.id}/`, formData)
      } else {
        await api.post('/grupos/', formData)
      }

      onSalvar()
    } catch (error) {
      console.error('Erro ao salvar grupo:', error)
      setErro(
        error.response?.data?.nome?.[0] ||
        'Erro ao salvar grupo. Verifique os dados e tente novamente.'
      )
    } finally {
      setSalvando(false)
    }
  }

  // Agrupar permissões por categoria (baseado no código)
  const permissoesAgrupadas = permissoes.reduce((acc, perm) => {
    const categoria = perm.codigo.split('_')[0] || 'outros'
    if (!acc[categoria]) {
      acc[categoria] = []
    }
    acc[categoria].push(perm)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-church-navy">
            {grupo ? 'Editar Grupo' : 'Novo Grupo'}
          </h1>
          <p className="text-gray-600 mt-1">
            {grupo ? 'Edite as informações do grupo' : 'Crie um novo grupo de usuários'}
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
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome do Grupo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              required
              className="input-field"
              placeholder="Ex: Administradores, Secretaria, Financeiro"
            />
          </div>

          {/* Ativo */}
          <div className="flex items-center">
            <input
              type="checkbox"
              name="ativo"
              id="ativo"
              checked={formData.ativo}
              onChange={handleChange}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="ativo" className="ml-2 block text-sm text-gray-700">
              Grupo Ativo
            </label>
          </div>
        </div>

        {/* Descrição */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Descrição
          </label>
          <textarea
            name="descricao"
            value={formData.descricao}
            onChange={handleChange}
            rows="3"
            className="input-field"
            placeholder="Descreva as responsabilidades deste grupo..."
          />
        </div>

        {/* Permissões */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Permissões de Menu <span className="text-red-500">*</span>
          </label>
          <div className="border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
            {permissoes.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nenhuma permissão disponível. Execute o comando para popular permissões primeiro.
              </p>
            ) : (
              <div className="space-y-4">
                {Object.entries(permissoesAgrupadas).map(([categoria, perms]) => (
                  <div key={categoria} className="border-b border-gray-100 pb-3 last:border-b-0">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 capitalize">
                      {categoria}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {perms
                        .filter(p => p.ativo)
                        .map((perm) => (
                          <label
                            key={perm.id}
                            className="flex items-start p-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData.permissoes_ids.includes(perm.id)}
                              onChange={() => handlePermissoesChange(perm.id)}
                              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-0.5"
                            />
                            <div className="ml-2 flex-1">
                              <span className="text-sm text-gray-700">{perm.nome}</span>
                              {perm.descricao && (
                                <p className="text-xs text-gray-500 mt-0.5">{perm.descricao}</p>
                              )}
                            </div>
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {formData.permissoes_ids.length > 0 && (
            <p className="mt-2 text-sm text-gray-600">
              {formData.permissoes_ids.length} permissão{formData.permissoes_ids.length !== 1 ? 'ões' : ''} selecionada{formData.permissoes_ids.length !== 1 ? 's' : ''}
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
            disabled={salvando || formData.permissoes_ids.length === 0}
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

export default GrupoForm
