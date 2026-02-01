import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save, X, Image, DollarSign } from 'lucide-react'
import api from '../../services/api'
import { getMediaUrl } from '../../services/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import DatePickerBR from '../../components/DatePickerBR'

function EventoForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [imagemPreview, setImagemPreview] = useState(null)
  const [imagemFile, setImagemFile] = useState(null)
  
  // Estados para as datas (objetos Date)
  const [dataInicio, setDataInicio] = useState(null)
  const [dataFim, setDataFim] = useState(null)
  const [inscricaoInicio, setInscricaoInicio] = useState(null)
  const [inscricaoFim, setInscricaoFim] = useState(null)
  
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    tipo: 'culto',
    local: '',
    endereco: '',
    vagas: '',
    destaque: false,
    status: 'agendado',
    evento_pago: false,
    valor_inscricao: '',
  })

  const tiposEvento = [
    { value: 'culto', label: 'Culto' },
    { value: 'conferencia', label: 'Conferência' },
    { value: 'retiro', label: 'Retiro' },
    { value: 'encontro', label: 'Encontro' },
    { value: 'workshop', label: 'Workshop' },
    { value: 'celula', label: 'Célula' },
    { value: 'outro', label: 'Outro' },
  ]

  const statusOptions = [
    { value: 'agendado', label: 'Agendado' },
    { value: 'em_andamento', label: 'Em Andamento' },
    { value: 'finalizado', label: 'Finalizado' },
    { value: 'cancelado', label: 'Cancelado' },
  ]

  useEffect(() => {
    if (isEditing) {
      fetchEvento()
    }
  }, [id])

  const fetchEvento = async () => {
    try {
      const response = await api.get(`/eventos/${id}/`)
      const evento = response.data
      
      // Converter strings de data para objetos Date
      const parseDate = (dateString) => {
        if (!dateString) return null
        return new Date(dateString)
      }

      setFormData({
        titulo: evento.titulo || '',
        descricao: evento.descricao || '',
        tipo: evento.tipo || 'culto',
        local: evento.local || '',
        endereco: evento.endereco || '',
        vagas: evento.vagas || '',
        destaque: evento.destaque || false,
        status: evento.status || 'agendado',
        evento_pago: evento.evento_pago || false,
        valor_inscricao: evento.valor_inscricao || '',
      })
      
      const parsedDataInicio = parseDate(evento.data_inicio)
      
      setDataInicio(parsedDataInicio)
      setDataFim(parseDate(evento.data_fim))
      setInscricaoInicio(parseDate(evento.inscricao_inicio))
      setInscricaoFim(parseDate(evento.inscricao_fim))

      // Se tem imagem, mostrar preview
      if (evento.imagem) {
        setImagemPreview(getMediaUrl(evento.imagem))
      }
    } catch (error) {
      console.error('Erro ao carregar evento:', error)
      setError('Erro ao carregar evento. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    setError('')
  }

  const handleImagemChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Validar tipo de arquivo
      if (!file.type.startsWith('image/')) {
        setError('Por favor, selecione uma imagem válida.')
        return
      }
      
      // Validar tamanho (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('A imagem deve ter no máximo 5MB.')
        return
      }

      setImagemFile(file)
      setImagemPreview(URL.createObjectURL(file))
      setError('')
    }
  }

  const handleRemoverImagem = () => {
    setImagemFile(null)
    setImagemPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Formatar data para enviar ao backend (ISO format)
  const formatDateForAPI = (date) => {
    if (!date) return null
    return date.toISOString()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    // Validar data de início obrigatória
    if (!dataInicio) {
      setError('A data e hora de início é obrigatória.')
      setSaving(false)
      return
    }

    try {
      // Usar FormData para suportar upload de arquivo
      const data = new FormData()
      
      data.append('titulo', formData.titulo)
      data.append('descricao', formData.descricao)
      data.append('tipo', formData.tipo)
      data.append('data_inicio', formatDateForAPI(dataInicio))
      data.append('local', formData.local)
      data.append('status', formData.status)
      data.append('destaque', formData.destaque)
      data.append('evento_pago', formData.evento_pago)
      
      // Valor da inscrição (apenas se evento é pago)
      if (formData.evento_pago && formData.valor_inscricao) {
        data.append('valor_inscricao', parseFloat(formData.valor_inscricao))
      } else if (isEditing) {
        data.append('valor_inscricao', '')
      }
      
      // Data fim - enviar vazio se não tiver valor (para limpar no backend)
      if (dataFim) {
        data.append('data_fim', formatDateForAPI(dataFim))
      } else if (isEditing) {
        data.append('data_fim', '')
      }
      
      if (formData.endereco) {
        data.append('endereco', formData.endereco)
      }
      if (formData.vagas) {
        data.append('vagas', parseInt(formData.vagas))
      } else if (isEditing) {
        data.append('vagas', '')
      }
      
      // Período de inscrição - enviar vazio se não tiver valor (para limpar no backend)
      if (inscricaoInicio) {
        data.append('inscricao_inicio', formatDateForAPI(inscricaoInicio))
      } else if (isEditing) {
        data.append('inscricao_inicio', '')
      }
      
      if (inscricaoFim) {
        data.append('inscricao_fim', formatDateForAPI(inscricaoFim))
      } else if (isEditing) {
        data.append('inscricao_fim', '')
      }
      
      // Adicionar imagem se foi selecionada
      if (imagemFile) {
        data.append('imagem', imagemFile)
      }

      const config = {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }

      if (isEditing) {
        await api.put(`/eventos/${id}/`, data, config)
      } else {
        await api.post('/eventos/', data, config)
      }

      navigate('/admin/eventos')
    } catch (error) {
      console.error('Erro ao salvar evento:', error)
      if (error.response?.data) {
        // Verificar se a resposta é um objeto (JSON) ou string (HTML de erro)
        if (typeof error.response.data === 'object' && error.response.data !== null) {
          const errors = Object.entries(error.response.data)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join('; ')
          setError(errors || 'Erro ao salvar evento.')
        } else {
          // Se for string (HTML de erro), mostrar mensagem genérica
          setError('Erro no servidor. Tente novamente mais tarde.')
        }
      } else {
        setError('Erro ao salvar evento. Verifique sua conexão.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingSpinner text="Carregando evento..." />
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/admin/eventos"
          className="inline-flex items-center text-gray-600 hover:text-primary-600 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Voltar para Eventos
        </Link>
        <h1 className="text-3xl font-bold text-church-navy">
          {isEditing ? 'Editar Evento' : 'Novo Evento'}
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
          {/* Título */}
          <div>
            <label htmlFor="titulo" className="label">
              Título do Evento *
            </label>
            <input
              type="text"
              id="titulo"
              name="titulo"
              value={formData.titulo}
              onChange={handleChange}
              required
              className="input-field"
              placeholder="Ex: Culto de Celebração"
            />
          </div>

          {/* Imagem de Capa */}
          <div>
            <label className="label">Imagem de Capa</label>
            <div className="mt-2">
              {imagemPreview ? (
                <div className="relative inline-block">
                  <img
                    src={imagemPreview}
                    alt="Preview"
                    className="w-full max-w-md h-48 object-cover rounded-lg border"
                  />
                  <button
                    type="button"
                    onClick={handleRemoverImagem}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full max-w-md h-48 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors"
                >
                  <Image className="h-12 w-12 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500">Clique para selecionar uma imagem</p>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG até 5MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImagemChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label htmlFor="descricao" className="label">
              Descrição *
            </label>
            <textarea
              id="descricao"
              name="descricao"
              value={formData.descricao}
              onChange={handleChange}
              required
              rows={5}
              className="input-field resize-none"
              placeholder="Descreva o evento..."
            />
          </div>

          {/* Tipo e Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="tipo" className="label">
                Tipo de Evento *
              </label>
              <select
                id="tipo"
                name="tipo"
                value={formData.tipo}
                onChange={handleChange}
                required
                className="input-field"
              >
                {tiposEvento.map(tipo => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
            </div>

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
                {statusOptions.map(status => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Datas do Evento */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-church-navy mb-4">Data do Evento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">
                  Data e Hora de Início *
                </label>
                <DatePickerBR
                  selected={dataInicio}
                  onChange={(date) => setDataInicio(date)}
                  placeholder="DD/MM/AAAA HH:MM"
                />
              </div>

              <div>
                <label className="label">
                  Data e Hora de Término
                </label>
                <DatePickerBR
                  selected={dataFim}
                  onChange={(date) => setDataFim(date)}
                  placeholder="DD/MM/AAAA HH:MM"
                  minDate={dataInicio}
                />
              </div>
            </div>
          </div>

          {/* Período de Inscrição */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-church-navy mb-2">Período de Inscrição</h3>
            <p className="text-sm text-gray-500 mb-4">
              Defina quando as inscrições estarão disponíveis. Deixe em branco para permitir inscrições a qualquer momento.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">
                  Abertura das Inscrições
                </label>
                <DatePickerBR
                  selected={inscricaoInicio}
                  onChange={(date) => setInscricaoInicio(date)}
                  placeholder="DD/MM/AAAA HH:MM"
                />
              </div>

              <div>
                <label className="label">
                  Encerramento das Inscrições
                </label>
                <DatePickerBR
                  selected={inscricaoFim}
                  onChange={(date) => setInscricaoFim(date)}
                  placeholder="DD/MM/AAAA HH:MM"
                  minDate={inscricaoInicio}
                />
              </div>
            </div>
          </div>

          {/* Local e Vagas */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-church-navy mb-4">Local e Vagas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="local" className="label">
                  Local *
                </label>
                <input
                  type="text"
                  id="local"
                  name="local"
                  value={formData.local}
                  onChange={handleChange}
                  required
                  className="input-field"
                  placeholder="Ex: Templo Principal"
                />
              </div>

              <div>
                <label htmlFor="vagas" className="label">
                  Número de Vagas
                </label>
                <input
                  type="number"
                  id="vagas"
                  name="vagas"
                  value={formData.vagas}
                  onChange={handleChange}
                  min="1"
                  className="input-field"
                  placeholder="Deixe em branco para ilimitado"
                />
              </div>
            </div>

            {/* Endereço Completo */}
            <div className="mt-6">
              <label htmlFor="endereco" className="label">
                Endereço Completo
              </label>
              <input
                type="text"
                id="endereco"
                name="endereco"
                value={formData.endereco}
                onChange={handleChange}
                className="input-field"
                placeholder="Rua, número, bairro, cidade..."
              />
            </div>
          </div>

          {/* Valor do Evento */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-church-navy mb-2">Valor do Evento</h3>
            <p className="text-sm text-gray-500 mb-4">
              Defina se o evento possui taxa de inscrição.
            </p>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="evento_pago"
                  name="evento_pago"
                  checked={formData.evento_pago}
                  onChange={handleChange}
                  className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="evento_pago" className="text-sm font-medium text-gray-700">
                  Este é um evento pago
                </label>
              </div>
              
              {formData.evento_pago && (
                <div className="max-w-xs">
                  <label htmlFor="valor_inscricao" className="label">
                    Valor da Inscrição (R$) *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <DollarSign className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      id="valor_inscricao"
                      name="valor_inscricao"
                      value={formData.valor_inscricao}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      className="input-field pl-10"
                      placeholder="0,00"
                      required={formData.evento_pago}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Informe o valor em reais (ex: 50.00)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Destaque */}
          <div className="border-t pt-6">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="destaque"
                name="destaque"
                checked={formData.destaque}
                onChange={handleChange}
                className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="destaque" className="text-sm font-medium text-gray-700">
                Exibir este evento em destaque na página inicial
              </label>
            </div>
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
                  {isEditing ? 'Salvar Alterações' : 'Criar Evento'}
                </>
              )}
            </button>
            <Link
              to="/admin/eventos"
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

export default EventoForm
