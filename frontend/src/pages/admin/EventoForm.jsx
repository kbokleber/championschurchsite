import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save, X, Image, DollarSign, Copy, Check } from 'lucide-react'
import api from '../../services/api'
import { getMediaUrl } from '../../services/utils'
import LoadingSpinner from '../../components/LoadingSpinner'
import DatePickerBR from '../../components/DatePickerBR'
import { useConfiguracao } from '../../contexts/ConfiguracaoContext'

function EventoForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id
  const fileInputRef = useRef(null)
  const { configuracao, loading: configLoading } = useConfiguracao()
  const [camposPreenchidos, setCamposPreenchidos] = useState(false)

  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [imagemPreview, setImagemPreview] = useState(null)
  const [imagemFile, setImagemFile] = useState(null)
  const [imagemRemovida, setImagemRemovida] = useState(false)
  const [linkInscricaoPublico, setLinkInscricaoPublico] = useState('')
  const [copiadoLink, setCopiadoLink] = useState(false)
  
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
    formulario_inscricao: '',
    permite_acompanhantes: true,
    permite_inscricao_adolescente: false,
    evento_particular: false,
    grupo_categorias: '',
  })
  const [formulariosDisponiveis, setFormulariosDisponiveis] = useState([])
  const [gruposCategorias, setGruposCategorias] = useState([])

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

  // Função para formatar endereço completo das configurações
  const formatarEnderecoCompleto = () => {
    if (!configuracao) return ''
    const partes = []
    if (configuracao.endereco) partes.push(configuracao.endereco)
    if (configuracao.cidade && configuracao.estado) {
      partes.push(`${configuracao.cidade}/${configuracao.estado}`)
    } else if (configuracao.cidade) {
      partes.push(configuracao.cidade)
    }
    if (configuracao.cep) partes.push(`CEP: ${configuracao.cep}`)
    return partes.join(' - ')
  }

  // Preencher campos ao criar novo evento (não ao editar)
  useEffect(() => {
    if (isEditing) {
      fetchEvento()
    }
  }, [id])

  // Carregar lista de formulários disponíveis (somente ativos)
  useEffect(() => {
    const carregarFormularios = async () => {
      try {
        const response = await api.get('/formularios/')
        setFormulariosDisponiveis(response.data.results || response.data)
      } catch (err) {
        // Se o usuário não tiver permissão, apenas ignora silenciosamente
        if (err?.response?.status !== 403) {
          console.error('Erro ao carregar formulários:', err)
        }
      }
    }
    carregarFormularios()
    carregarGruposCategorias()
  }, [])

  const carregarGruposCategorias = async () => {
    try {
      const response = await api.get('/grupos-categorias/')
      setGruposCategorias(response.data.results || response.data)
    } catch (err) {
      if (err?.response?.status !== 403) {
        console.error('Erro ao carregar grupos de categorias:', err)
      }
    }
  }

  // Preencher campos com configurações quando criar novo evento
  // Aguardar configurações carregarem e só preencher uma vez
  useEffect(() => {
    if (!isEditing && !configLoading && configuracao && !camposPreenchidos) {
      const enderecoCompleto = formatarEnderecoCompleto()
      setFormData(prev => ({
        ...prev,
        local: configuracao.nome_igreja || prev.local || '',
        endereco: enderecoCompleto || prev.endereco || ''
      }))
      setCamposPreenchidos(true)
    }
  }, [isEditing, configLoading, configuracao, camposPreenchidos])

  const buildLinkInscricao = (evento) => {
    if (!evento?.link_acesso) return ''
    return `${window.location.origin}/inscricao/${evento.link_acesso}`
  }

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
        formulario_inscricao: evento.formulario_inscricao ?? '',
        permite_acompanhantes: evento.permite_acompanhantes !== false,
        permite_inscricao_adolescente: evento.permite_inscricao_adolescente === true,
        evento_particular: evento.evento_particular === true,
        grupo_categorias: evento.grupo_categorias ?? '',
      })
      setLinkInscricaoPublico(buildLinkInscricao(evento))
      
      const parsedDataInicio = parseDate(evento.data_inicio)
      
      setDataInicio(parsedDataInicio)
      setDataFim(parseDate(evento.data_fim))
      setInscricaoInicio(parseDate(evento.inscricao_inicio))
      setInscricaoFim(parseDate(evento.inscricao_fim))

      // Se tem imagem, mostrar preview
      if (evento.imagem) {
        setImagemPreview(getMediaUrl(evento.imagem))
      }
      setImagemRemovida(false)
    } catch (error) {
      console.error('Erro ao carregar evento:', error)
      setError('Erro ao carregar evento. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    if (name === 'permite_acompanhantes' && type === 'checkbox' && !checked) {
      setFormData(prev => ({
        ...prev,
        permite_acompanhantes: false,
        grupo_categorias: '',
      }))
      setError('')
      return
    }
    if (name === 'evento_particular' && type === 'checkbox') {
      setFormData(prev => ({
        ...prev,
        evento_particular: checked,
        destaque: checked ? false : prev.destaque,
      }))
      setError('')
      return
    }
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    setError('')
  }

  const copiarLinkInscricao = async () => {
    if (!linkInscricaoPublico) return
    try {
      await navigator.clipboard.writeText(linkInscricaoPublico)
      setCopiadoLink(true)
      setTimeout(() => setCopiadoLink(false), 2000)
    } catch {
      setError('Não foi possível copiar o link. Selecione e copie manualmente.')
    }
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
      setImagemRemovida(false)
      setError('')
    }
  }

  const handleRemoverImagem = (e) => {
    e?.preventDefault()
    e?.stopPropagation()
    setImagemFile(null)
    setImagemPreview(null)
    setImagemRemovida(true)
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

    // Debug: ver no F12 > Console se o submit foi acionado
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[EventoForm] Submit acionado', { isEditing, id, imagemRemovida, temArquivo: !!imagemFile })
    }

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
      data.append('destaque', formData.evento_particular ? false : formData.destaque)
      data.append('evento_pago', formData.evento_pago)
      data.append('permite_acompanhantes', formData.permite_acompanhantes)
      data.append('permite_inscricao_adolescente', formData.permite_inscricao_adolescente)
      data.append('evento_particular', formData.evento_particular)

      if (formData.permite_acompanhantes && formData.grupo_categorias) {
        data.append('grupo_categorias', formData.grupo_categorias)
      } else {
        data.append('grupo_categorias', '')
      }
      
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
      
      // Imagem: nova arquivo, ou sinalizar remoção ao editar
      if (imagemFile) {
        data.append('imagem', imagemFile)
      } else if (isEditing && imagemRemovida) {
        data.append('imagem', '')
      }

      // Formulário de inscrição (opcional)
      if (formData.formulario_inscricao) {
        data.append('formulario_inscricao', formData.formulario_inscricao)
      } else if (isEditing) {
        data.append('formulario_inscricao', '')
      }

      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[EventoForm] Enviando requisição', isEditing ? 'PUT' : 'POST', isEditing ? id : '')
      }
      if (isEditing) {
        await api.put(`/eventos/${id}/`, data)
        navigate('/admin/eventos')
      } else {
        const response = await api.post('/eventos/', data)
        if (response.data?.evento_particular) {
          navigate(`/admin/eventos/${response.data.id}`)
        } else {
          navigate('/admin/eventos')
        }
      }
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
                    aria-label="Remover imagem"
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

          {/* Formulário de Inscrição (opcional) */}
          <div>
            <label htmlFor="formulario_inscricao" className="label">
              Formulário de Inscrição
            </label>
            <select
              id="formulario_inscricao"
              name="formulario_inscricao"
              value={formData.formulario_inscricao || ''}
              onChange={handleChange}
              className="input-field"
            >
              <option value="">Nenhum (somente dados básicos)</option>
              {formulariosDisponiveis.map(f => (
                <option key={f.id} value={f.id}>
                  {f.nome}{!f.ativo ? ' (inativo)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Opcional. As respostas ficam visíveis apenas para administradores. Gerencie formulários em{' '}
              <Link to="/admin/formularios" className="text-primary-600 hover:underline">Formulários de Inscrição</Link>.
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/60">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="permite_inscricao_adolescente"
                name="permite_inscricao_adolescente"
                checked={formData.permite_inscricao_adolescente}
                onChange={handleChange}
                className="w-5 h-5 mt-0.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <div>
                <label htmlFor="permite_inscricao_adolescente" className="text-sm font-medium text-gray-800">
                  Permitir inscrição de adolescente (titular escolhe faixa)
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Desmarcado por padrão: quem se inscreve é tratado como <strong>Adulto</strong> (comportamento atual).
                  Marque para a pessoa informar se é <strong>Adulto</strong> ou <strong>Adolescente</strong>; o titular paga sempre o valor integral.
                  Valores por faixa do grupo de categorias valem apenas para <strong>acompanhantes</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/60">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="permite_acompanhantes"
                name="permite_acompanhantes"
                checked={formData.permite_acompanhantes}
                onChange={handleChange}
                className="w-5 h-5 mt-0.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <div>
                <label htmlFor="permite_acompanhantes" className="text-sm font-medium text-gray-800">
                  Permitir cadastro de acompanhantes na inscrição
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Desmarque para eventos de casais em que o ingresso já é para o casal (ex.: encontros de casados).
                  Nesse caso, a tela pública não exibirá a opção de adicionar acompanhantes.
                </p>
                {formData.permite_acompanhantes && (
                  <div className="mt-4">
                    <label htmlFor="grupo_categorias" className="block text-sm font-medium text-gray-700 mb-1">
                      Grupo de categorias na inscrição
                    </label>
                    <select
                      id="grupo_categorias"
                      name="grupo_categorias"
                      value={formData.grupo_categorias || ''}
                      onChange={handleChange}
                      className="input-field max-w-md"
                    >
                      <option value="">Padrão (Adulto, Adolescente, Criança)</option>
                      {gruposCategorias.filter((g) => !g.padrao_sistema).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.nome}
                          {g.padrao_sistema ? ' — sistema' : ''}
                          {!g.ativo ? ' (inativo)' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Define as faixas de preço que titular e acompanhantes poderão escolher na inscrição.{' '}
                      <Link to="/admin/categorias" className="text-primary-600 hover:underline">
                        Gerenciar grupos
                      </Link>
                    </p>
                  </div>
                )}
              </div>
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
                  placeholder={configuracao?.nome_igreja || "Ex: Templo Principal"}
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
                placeholder={formatarEnderecoCompleto() || "Rua, número, bairro, cidade..."}
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
          {!formData.evento_particular && (
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
          )}

          {/* Evento particular */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/60 mt-6">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="evento_particular"
                name="evento_particular"
                checked={formData.evento_particular}
                onChange={handleChange}
                className="w-5 h-5 mt-0.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <div className="flex-1">
                <label htmlFor="evento_particular" className="text-sm font-medium text-gray-800">
                  Evento particular (não listar no site; acesso só por link)
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  O evento não aparece em <strong>/eventos</strong> nem na home. Compartilhe o link exclusivo abaixo com os convidados.
                </p>
                {formData.evento_particular && (
                  <div className="mt-3">
                    {linkInscricaoPublico ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          readOnly
                          value={linkInscricaoPublico}
                          className="input-field flex-1 bg-white text-sm"
                        />
                        <button
                          type="button"
                          onClick={copiarLinkInscricao}
                          className="btn-outline inline-flex items-center justify-center whitespace-nowrap"
                        >
                          {copiadoLink ? (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 mr-2" />
                              Copiar link
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        Salve o evento para gerar o link de inscrição.
                      </p>
                    )}
                  </div>
                )}
              </div>
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
