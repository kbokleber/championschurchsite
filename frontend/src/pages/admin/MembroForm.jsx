import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import api from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'

function MembroForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id

  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    data_nascimento: '',
    sexo: '',
    endereco: '',
    status: 'visitante',
    observacoes: '',
  })

  useEffect(() => {
    if (isEditing) {
      fetchMembro()
    }
  }, [id])

  const fetchMembro = async () => {
    try {
      const response = await api.get(`/membros/${id}/`)
      const membro = response.data
      
      setFormData({
        nome: membro.nome || '',
        email: membro.email || '',
        telefone: formatarTelefone(membro.telefone || ''),
        data_nascimento: membro.data_nascimento || '',
        sexo: membro.sexo || '',
        endereco: membro.endereco || '',
        status: membro.status || 'visitante',
        observacoes: membro.observacoes || '',
      })
    } catch (error) {
      console.error('Erro ao carregar membro:', error)
      const status = error?.response?.status
      setError(
        status === 404
          ? 'Cadastro não encontrado. Acompanhantes de eventos não ficam na lista de membros — veja em Inscrições.'
          : 'Erro ao carregar membro. Tente novamente.'
      )
    } finally {
      setLoading(false)
    }
  }

  // Formata telefone brasileiro: (XX) XXXXX-XXXX (11 dígitos) ou (XX) XXXX-XXXX (10 dígitos). Máx 11 dígitos.
  const formatarTelefone = (valor) => {
    const numeros = (valor || '').replace(/\D/g, '').slice(0, 11)
    if (numeros.length <= 2) return numeros ? `(${numeros}` : ''
    if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'telefone') {
      setFormData(prev => ({ ...prev, telefone: formatarTelefone(value) }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const apenasNumeros = (formData.telefone || '').replace(/\D/g, '')
    if (formData.telefone && (apenasNumeros.length < 10 || apenasNumeros.length > 11)) {
      setError('Telefone deve ter 10 ou 11 dígitos (DDD + número).')
      return
    }
    setSaving(true)
    setError('')

    try {
      const dataToSend = {
        ...formData,
        data_nascimento: formData.data_nascimento || null,
      }

      if (isEditing) {
        await api.put(`/membros/${id}/`, dataToSend)
      } else {
        await api.post('/membros/', dataToSend)
      }

      navigate('/admin/membros')
    } catch (error) {
      console.error('Erro ao salvar membro:', error)
      if (error.response?.data) {
        const errors = Object.entries(error.response.data)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')
        setError(errors || 'Erro ao salvar membro.')
      } else {
        setError('Erro ao salvar membro. Verifique sua conexão.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingSpinner text="Carregando membro..." />
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/admin/membros"
          className="inline-flex items-center text-gray-600 hover:text-primary-600 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Voltar para Membros
        </Link>
        <h1 className="text-3xl font-bold text-church-navy">
          {isEditing ? 'Editar Membro' : 'Novo Membro'}
        </h1>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl shadow-md p-6 lg:p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nome */}
          <div>
            <label htmlFor="nome" className="label">
              Nome Completo *
            </label>
            <input
              type="text"
              id="nome"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              required
              className="input-field"
              placeholder="Nome completo do membro"
            />
          </div>

          {/* Email e Telefone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="email" className="label">
                E-mail
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input-field"
                placeholder="email@exemplo.com"
              />
            </div>

            <div>
              <label htmlFor="telefone" className="label">
                Telefone
              </label>
              <input
                type="tel"
                id="telefone"
                name="telefone"
                value={formData.telefone}
                onChange={handleChange}
                className="input-field"
                placeholder="(11) 99999-9999"
                maxLength={15}
                autoComplete="tel"
              />
              <p className="text-xs text-gray-500 mt-1">10 ou 11 dígitos (DDD + número). Ex.: (11) 99999-9999</p>
            </div>
          </div>

          {/* Data Nascimento e Sexo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="data_nascimento" className="label">
                Data de Nascimento
              </label>
              <input
                type="date"
                id="data_nascimento"
                name="data_nascimento"
                value={formData.data_nascimento}
                onChange={handleChange}
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="sexo" className="label">
                Sexo
              </label>
              <select
                id="sexo"
                name="sexo"
                value={formData.sexo}
                onChange={handleChange}
                className="input-field"
              >
                <option value="">Selecione</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label htmlFor="status" className="label">
              Status *
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              required
              className="input-field"
            >
              <option value="visitante">Visitante</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          {/* Endereço */}
          <div>
            <label htmlFor="endereco" className="label">
              Endereço
            </label>
            <textarea
              id="endereco"
              name="endereco"
              value={formData.endereco}
              onChange={handleChange}
              rows={2}
              className="input-field resize-none"
              placeholder="Rua, número, bairro, cidade..."
            />
          </div>

          {/* Observações */}
          <div>
            <label htmlFor="observacoes" className="label">
              Observações
            </label>
            <textarea
              id="observacoes"
              name="observacoes"
              value={formData.observacoes}
              onChange={handleChange}
              rows={3}
              className="input-field resize-none"
              placeholder="Observações adicionais..."
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                'Salvando...'
              ) : (
                <>
                  <Save className="h-5 w-5 mr-2" />
                  {isEditing ? 'Salvar Alterações' : 'Cadastrar Membro'}
                </>
              )}
            </button>
            <Link
              to="/admin/membros"
              className="btn-outline text-center"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MembroForm
