import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Calendar, MapPin, Users, Clock, ArrowLeft, Check, AlertCircle, Lock, DollarSign, QrCode, Download, Phone, Smartphone, UserPlus, X, UserCheck, ExternalLink, FileText } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ConfirmModal from '../components/ConfirmModal'
import FormularioDinamico from '../components/FormularioDinamico'
import { useParticipante } from '../contexts/ParticipanteContext'
import { useConfiguracao } from '../contexts/ConfiguracaoContext'
import api from '../services/api'
import { getMediaUrl, formatDateTimeBR } from '../services/utils'
import {
  validarQuestionarioInscricao,
  eventoTemQuestionarioInscricao,
} from '../utils/formularioInscricao'

function EventoDetalhe() {
  const { id, linkAcesso } = useParams()
  const navigate = useNavigate()
  const { configuracao } = useConfiguracao()
  const { registrar, isLoggedIn, participante } = useParticipante()
  const corHeaderPagina = configuracao?.cor_header_pagina && /^#[0-9A-Fa-f]{6}$/.test(configuracao.cor_header_pagina) ? configuracao.cor_header_pagina : '#1a365d'
  const [evento, setEvento] = useState(null)
  const [loading, setLoading] = useState(true)
  const [inscricaoLoading, setInscricaoLoading] = useState(false)
  const [inscricaoSucesso, setInscricaoSucesso] = useState(false)
  const [inscricaoData, setInscricaoData] = useState(null)
  const [acompanhantesData, setAcompanhantesData] = useState([])
  const [senhaGerada, setSenhaGerada] = useState(null)
  const [novoCadastro, setNovoCadastro] = useState(false)
  const [whatsappEnviado, setWhatsappEnviado] = useState(null)
  const [whatsappMensagem, setWhatsappMensagem] = useState('')
  const [inscricaoErro, setInscricaoErro] = useState('')
  const [jaInscrito, setJaInscrito] = useState(false)
  const [acompanhantesAdicionados, setAcompanhantesAdicionados] = useState(false)
  const [somenteAdicionandoAcompanhantes, setSomenteAdicionandoAcompanhantes] = useState(false)
  const [cobranca, setCobranca] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [categoriaTitularId, setCategoriaTitularId] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    email: '',
  })
  const [acompanhantes, setAcompanhantes] = useState([]) // [{nome: '', categoria_id: ''}]
  const [novoAcompanhante, setNovoAcompanhante] = useState('')
  const [novoAcompanhanteCategoria, setNovoAcompanhanteCategoria] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  // Respostas/arquivos do formulário dinâmico vinculado ao evento (opcional).
  // IMPORTANTE: não exibimos respostas após o envio — privadas aos admins.
  const [respostasForm, setRespostasForm] = useState({})
  const [arquivosForm, setArquivosForm] = useState({})
  const [errosForm, setErrosForm] = useState({})
  const [showFormularioModal, setShowFormularioModal] = useState(false)
  /** Questionário validado via "Salvar e continuar" no modal. */
  const [questionarioSalvo, setQuestionarioSalvo] = useState(false)
  /** Evita reabrir o popup do questionário após o usuário fechar manualmente. */
  const questionarioAutoAbertoRef = useRef(false)

  const formularioDinamico = evento?.formulario_inscricao_detalhe
  const temQuestionarioInscricao = eventoTemQuestionarioInscricao(evento)
  const permiteAcompanhantes = evento?.permite_acompanhantes !== false
  const permiteInscricaoAdolescente = evento?.permite_inscricao_adolescente === true

  const categoriasTitular = useMemo(
    () => categorias.filter((c) => ['Adulto', 'Adolescente'].includes(c.nome)),
    [categorias]
  )

  const exigeQuestionarioInscricao = temQuestionarioInscricao && !somenteAdicionandoAcompanhantes

  const questionarioCompleto = useMemo(() => {
    if (!exigeQuestionarioInscricao) return true
    return validarQuestionarioInscricao(
      formularioDinamico,
      respostasForm,
      arquivosForm,
      true,
      questionarioSalvo
    ).ok
  }, [formularioDinamico, exigeQuestionarioInscricao, respostasForm, arquivosForm, questionarioSalvo])

  useEffect(() => {
    if (showFormularioModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [showFormularioModal])

  useEffect(() => {
    setSomenteAdicionandoAcompanhantes(false)
    setInscricaoSucesso(false)
    setJaInscrito(false)
    setAcompanhantesAdicionados(false)
    setAcompanhantes([])
    setInscricaoData(null)
    setCobranca(null)
    setWhatsappEnviado(null)
    setWhatsappMensagem('')
    setRespostasForm({})
    setArquivosForm({})
    setErrosForm({})
    setShowFormularioModal(false)
    setQuestionarioSalvo(false)
    setCategoriaTitularId('')
    questionarioAutoAbertoRef.current = false
    if (!id && !linkAcesso) {
      setLoading(false)
      setEvento(null)
      return
    }
    const fetchEvento = async () => {
      try {
        const url = linkAcesso
          ? `/eventos/por-link/${linkAcesso}/`
          : `/eventos/${id}/`
        const response = await api.get(url)
        setEvento(response.data)
        
        if (response.data.permite_inscricao_adolescente || response.data.permite_acompanhantes !== false) {
          fetchCategorias(response.data.id, response.data.permite_inscricao_adolescente === true)
        }
      } catch (error) {
        console.error('Erro ao carregar evento:', error)
        setEvento(null)
      } finally {
        setLoading(false)
      }
    }

    fetchEvento()
  }, [id, linkAcesso])

  useEffect(() => {
    if (!evento?.evento_particular) return undefined
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [evento?.evento_particular])

  const abrirQuestionarioModal = useCallback((erros = {}) => {
    setErrosForm(erros)
    setShowFormularioModal(true)
  }, [])

  const mensagemErroQuestionario = useCallback((precisaSalvar) => (
    precisaSalvar
      ? 'Responda o questionário do evento e clique em "Salvar e continuar". Depois confirme a inscrição.'
      : 'Preencha os campos obrigatórios (*) do questionário antes de confirmar a inscrição.'
  ), [])

  useEffect(() => {
    if (jaInscrito && !somenteAdicionandoAcompanhantes) {
      setShowFormularioModal(false)
    }
  }, [jaInscrito, somenteAdicionandoAcompanhantes])
  
  const normalizarListaCategorias = (data) => {
    if (Array.isArray(data)) return data
    if (data && Array.isArray(data.results)) return data.results
    return []
  }

  const fetchCategorias = async (eventoId, titularDefaultAdolescente = false) => {
    try {
      let lista = []
      const params = eventoId ? { evento_id: eventoId } : {}
      try {
        const response = await api.get('/categorias/ativas/', { params })
        lista = normalizarListaCategorias(response.data)
      } catch (_) {
        const response = await api.get('/categorias/', { params: { ativo: 'true', ...params } })
        lista = normalizarListaCategorias(response.data)
      }
      setCategorias(lista)
      const adulto = lista.find((c) => c.nome === 'Adulto')
      const adolescente = lista.find((c) => c.nome === 'Adolescente')
      const defaultAcompanhanteId = adulto?.id ?? lista[0]?.id ?? ''
      const defaultTitularId = titularDefaultAdolescente
        ? (adolescente?.id ?? adulto?.id ?? lista[0]?.id ?? '')
        : (adulto?.id ?? lista[0]?.id ?? '')
      setNovoAcompanhanteCategoria(defaultAcompanhanteId)
      setCategoriaTitularId((prev) => prev || defaultTitularId)
    } catch (error) {
      console.error('Erro ao carregar categorias:', error)
    }
  }

  const formatarTelefone = (valor) => {
    const numeros = valor.replace(/\D/g, '')
    if (numeros.length <= 2) return numeros
    if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`
    if (numeros.length <= 11) return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7, 11)}`
  }

  const [buscandoParticipante, setBuscandoParticipante] = useState(false)
  const [participanteEncontrado, setParticipanteEncontrado] = useState(false)

  /** Celular + nome preenchidos e busca por telefone concluída (acompanhantes já podem ter sido adicionados). */
  const identificacaoConcluida = useMemo(() => {
    const digitos = (formData.telefone || '').replace(/\D/g, '')
    return digitos.length >= 10 && !!formData.nome?.trim() && !buscandoParticipante
  }, [formData.telefone, formData.nome, buscandoParticipante])

  const precisaQuestionarioPendente =
    identificacaoConcluida && exigeQuestionarioInscricao && !questionarioCompleto

  // Questionário dinâmico só no popup — abre automaticamente após identificação (uma vez)
  useEffect(() => {
    if (!identificacaoConcluida) {
      questionarioAutoAbertoRef.current = false
      return
    }
    if (
      !exigeQuestionarioInscricao ||
      questionarioCompleto ||
      jaInscrito ||
      inscricaoSucesso ||
      !evento?.inscricoes_abertas ||
      showFormularioModal ||
      questionarioAutoAbertoRef.current
    ) {
      return
    }
    questionarioAutoAbertoRef.current = true
    setShowFormularioModal(true)
  }, [
    identificacaoConcluida,
    exigeQuestionarioInscricao,
    questionarioCompleto,
    jaInscrito,
    inscricaoSucesso,
    evento?.inscricoes_abertas,
    showFormularioModal,
  ])

  const handleChange = (e) => {
    const { name, value } = e.target
    
    if (name === 'telefone') {
      const telefoneFormatado = formatarTelefone(value)
      setFormData({
        ...formData,
        telefone: telefoneFormatado,
      })
      
      // Buscar participante quando telefone tiver 11 dígitos
      const numeros = value.replace(/\D/g, '')
      if (numeros.length >= 10) {
        buscarParticipantePorTelefone(numeros)
      } else {
        setParticipanteEncontrado(false)
        setInscricaoSucesso(false)
        setJaInscrito(false)
      }
    } else {
      setFormData({
        ...formData,
        [name]: value,
      })
    }
    setInscricaoErro('')
  }
  
  const buscarParticipantePorTelefone = async (telefone) => {
    try {
      setBuscandoParticipante(true)
      const response = await api.get(`/participante/buscar/?telefone=${telefone}&evento_id=${id}`)
      
      if (response.data.encontrado) {
        setFormData(prev => ({
          ...prev,
          nome: response.data.participante.nome,
          email: response.data.participante.email || '',
        }))
        setParticipanteEncontrado(true)
        // Se já está inscrito neste evento, exibir estado de "já inscrito"
        if (response.data.ja_inscrito) {
          setJaInscrito(true)
          setInscricaoSucesso(true)
          setAcompanhantesData(response.data.acompanhantes || [])
          setInscricaoData({
            ...response.data.inscricao,
            valor_total: response.data.inscricao?.valor_total,
          })
          if (response.data.cobranca) {
            setCobranca(response.data.cobranca)
          }
        }
      } else {
        setParticipanteEncontrado(false)
      }
    } catch (error) {
      console.error('Erro ao buscar participante:', error)
      setParticipanteEncontrado(false)
    } finally {
      setBuscandoParticipante(false)
    }
  }

  const adicionarAcompanhante = () => {
    if (!permiteAcompanhantes) return
    const nome = novoAcompanhante.trim()
    if (nome && !acompanhantes.find(a => a.nome === nome)) {
      // Verificar vagas: se já inscrito e só adicionando acompanhantes, não conta vaga do responsável
      const vagasNecessarias = somenteAdicionandoAcompanhantes
        ? acompanhantes.length + 1
        : 1 + acompanhantes.length + 1
      if (evento.vagas && vagasNecessarias > evento.vagas_disponiveis) {
        setInscricaoErro(`Vagas insuficientes para adicionar mais acompanhantes. Disponível: ${evento.vagas_disponiveis}`)
        return
      }
      setAcompanhantes([...acompanhantes, { 
        nome, 
        categoria_id: novoAcompanhanteCategoria || (categorias[0]?.id || '')
      }])
      setNovoAcompanhante('')
      if (categorias.length > 0) {
        setNovoAcompanhanteCategoria(categorias[0].id)
      }
      setInscricaoErro('')
    }
  }

  const removerAcompanhante = (index) => {
    setAcompanhantes(acompanhantes.filter((_, i) => i !== index))
  }
  
  const atualizarCategoriaAcompanhante = (index, categoriaId) => {
    setAcompanhantes(acompanhantes.map((a, i) => 
      i === index ? { ...a, categoria_id: categoriaId } : a
    ))
  }
  
  // Calcular valor total (quando só adicionando acompanhantes, não inclui o responsável)
  const calcularValorTotal = () => {
    if (!evento?.evento_pago || !evento.valor_inscricao) return 0
    
    const valorEvento = parseFloat(evento.valor_inscricao)
    let total = 0
    
    // Titular: sempre valor integral (faixa Adulto/Adolescente é só classificação)
    if (!somenteAdicionandoAcompanhantes) {
      total += valorEvento
    }
    
    // Valor dos acompanhantes (baseado na categoria selecionada)
    acompanhantes.forEach(acomp => {
      const cat = categorias.find(c => c.id == acomp.categoria_id)
      if (cat) {
        if (cat.tipo_valor === 'fixo') {
          total += parseFloat(cat.valor)
        } else {
          total += valorEvento * (parseFloat(cat.valor) / 100)
        }
      } else {
        total += valorEvento // Valor integral se não tiver categoria
      }
    })
    
    return total
  }
  
  // Calcular valor de um acompanhante específico
  const calcularValorAcompanhante = (categoriaId) => {
    if (!evento?.evento_pago || !evento.valor_inscricao) return 0
    const valorEvento = parseFloat(evento.valor_inscricao)
    const cat = categorias.find(c => c.id == categoriaId)
    if (cat) {
      if (cat.tipo_valor === 'fixo') {
        return parseFloat(cat.valor)
      } else {
        return valorEvento * (parseFloat(cat.valor) / 100)
      }
    }
    return valorEvento
  }
  
  const formatarValor = (valor) => {
    return `R$ ${valor.toFixed(2).replace('.', ',')}`
  }

  const totalPessoasInscricao = !permiteAcompanhantes
    ? 1
    : somenteAdicionandoAcompanhantes
      ? acompanhantes.length
      : 1 + acompanhantes.length

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      adicionarAcompanhante()
    }
  }

  // Abrir modal de confirmação
  const handleSubmit = (e) => {
    e.preventDefault()
    setInscricaoErro('')
    setErrosForm({})

    // Validar campos obrigatórios
    if (!formData.nome.trim()) {
      setInscricaoErro('Por favor, informe seu nome.')
      return
    }
    if (!formData.telefone || formData.telefone.replace(/\D/g, '').length < 10) {
      setInscricaoErro('Por favor, informe um telefone válido.')
      return
    }
    if (buscandoParticipante) {
      setInscricaoErro('Aguarde: estamos localizando seu cadastro pelo telefone.')
      return
    }

    // Questionário: só após identificação (celular, nome e acompanhantes se houver)
    if (exigeQuestionarioInscricao && identificacaoConcluida) {
      const validacao = validarQuestionarioInscricao(
        formularioDinamico,
        respostasForm,
        arquivosForm,
        true,
        questionarioSalvo
      )
      if (!validacao.ok) {
        abrirQuestionarioModal(validacao.erros)
        setInscricaoErro(mensagemErroQuestionario(validacao.precisaSalvar))
        return
      }
    }

    // Abrir modal de confirmação
    setShowConfirmModal(true)
  }

  // Realizar inscrição após confirmação
  const realizarInscricao = async () => {
    setInscricaoLoading(true)
    setInscricaoErro('')

    const formularioGuard = formularioDinamico
    const enviarQuestionario = exigeQuestionarioInscricao
    if (enviarQuestionario) {
      const validacao = validarQuestionarioInscricao(
        formularioGuard,
        respostasForm,
        arquivosForm,
        true,
        questionarioSalvo
      )
      if (!validacao.ok) {
        setInscricaoLoading(false)
        setShowConfirmModal(false)
        setQuestionarioSalvo(false)
        abrirQuestionarioModal(validacao.erros)
        setInscricaoErro(mensagemErroQuestionario(validacao.precisaSalvar))
        return
      }
    }

    try {
      // Preparar dados de acompanhantes (agora é objeto com nome e categoria)
      const acompanhantesDataEnvio = permiteAcompanhantes
        ? acompanhantes.map(a => ({
            nome: a.nome,
            categoria_id: a.categoria_id || null
          }))
        : []

      const formulario = formularioDinamico
      const temFormulario = enviarQuestionario
      const temArquivos = Object.keys(arquivosForm).length > 0
      const enviarFormulario = temFormulario

      let payload
      if (enviarFormulario && temArquivos) {
        // Multipart: respostas como JSON + arquivos separados.
        const fd = new FormData()
        fd.append('nome', formData.nome)
        fd.append('telefone', formData.telefone)
        if (formData.email) fd.append('email', formData.email)
        fd.append('evento_id', String(evento.id))
        fd.append('acompanhantes', JSON.stringify(acompanhantesDataEnvio))
        if (permiteInscricaoAdolescente && !somenteAdicionandoAcompanhantes && categoriaTitularId) {
          fd.append('categoria_id', String(categoriaTitularId))
        }
        // Respostas no formato { campo_id: valor }
        const respostasDict = {}
        for (const [cid, valor] of Object.entries(respostasForm)) {
          respostasDict[cid] = valor
        }
        fd.append('respostas', JSON.stringify(respostasDict))
        // Arquivos: resposta_arquivo_{campo_id}
        for (const [cid, file] of Object.entries(arquivosForm)) {
          if (file) fd.append(`resposta_arquivo_${cid}`, file)
        }
        payload = fd
      } else {
        payload = {
          nome: formData.nome,
          telefone: formData.telefone,
          email: formData.email || null,
          evento_id: evento.id,
          acompanhantes: acompanhantesDataEnvio,
        }
        if (permiteInscricaoAdolescente && !somenteAdicionandoAcompanhantes && categoriaTitularId) {
          payload.categoria_id = categoriaTitularId
        }
        if (enviarFormulario) {
          payload.respostas = { ...respostasForm }
        }
      }

      // Usar o novo endpoint de registro de participante
      const result = await registrar(payload)

      if (result.success) {
        // Fechar modal
        setShowConfirmModal(false)
        
        // Incluir valor_total e status_pagamento na inscricaoData
        setInscricaoData({
          ...result.data.inscricao,
          valor_total: result.data.valor_total,
          pagamento_pendente: result.data.pagamento_pendente
        })
        setAcompanhantesData(result.data.acompanhantes || [])
        setInscricaoSucesso(true)
        setNovoCadastro(result.data.novo_cadastro)
        if (typeof result.data.whatsapp_enviado === 'boolean') {
          setWhatsappEnviado(result.data.whatsapp_enviado)
          setWhatsappMensagem(result.data.whatsapp_mensagem || '')
        } else {
          setWhatsappEnviado(null)
          setWhatsappMensagem('')
        }
        
        // Capturar cobrança se existir
        if (result.data.cobranca) {
          setCobranca(result.data.cobranca)
        }
        
        // Verificar se já estava inscrito
        if (result.data.ja_inscrito) {
          setJaInscrito(true)
          setInscricaoErro('')
          setSomenteAdicionandoAcompanhantes(false)
          // Verificar se foram adicionados novos acompanhantes
          if (result.data.acompanhantes_adicionados) {
            setAcompanhantesAdicionados(true)
          }
        }
        
        // Senha pode vir como senha_gerada (novo) ou senha_existente (já cadastrado)
        if (result.data.senha_gerada) {
          setSenhaGerada(result.data.senha_gerada)
        } else if (result.data.senha_existente) {
          setSenhaGerada(result.data.senha_existente)
          if (!result.data.ja_inscrito || result.data.acompanhantes_adicionados) {
            setNovoCadastro(true) // Força mostrar os dados de acesso
          }
        }
      } else {
        setShowConfirmModal(false)
        if (result.errors_por_campo && typeof result.errors_por_campo === 'object') {
          setQuestionarioSalvo(false)
          abrirQuestionarioModal(result.errors_por_campo)
        }
        setInscricaoErro(result.error || 'Erro ao realizar inscrição.')
      }
    } catch (error) {
      console.error('Erro ao realizar inscrição:', error)
      setShowConfirmModal(false)
      const data = error.response?.data || {}
      if (data.errors_por_campo && typeof data.errors_por_campo === 'object') {
        setQuestionarioSalvo(false)
        abrirQuestionarioModal(data.errors_por_campo)
        setInscricaoErro(data.error || 'Revise os campos do formulário e tente novamente.')
      } else if (data.error) {
        setInscricaoErro(data.error)
      } else {
        setInscricaoErro('Erro ao realizar inscrição. Tente novamente.')
      }
    } finally {
      setInscricaoLoading(false)
    }
  }


  const getStatusInscricaoInfo = () => {
    if (!evento) return null

    const status = evento.status_inscricao
    const configs = {
      aberto: {
        icon: <Check className="h-5 w-5" />,
        bg: 'bg-green-100',
        text: 'text-green-800',
        label: 'Inscrições Abertas',
      },
      nao_iniciado: {
        icon: <Clock className="h-5 w-5" />,
        bg: 'bg-yellow-100',
        text: 'text-yellow-800',
        label: `Inscrições abrem em ${formatDateTimeBR(evento.inscricao_inicio)}`,
      },
      encerrado: {
        icon: <Lock className="h-5 w-5" />,
        bg: 'bg-red-100',
        text: 'text-red-800',
        label: 'Inscrições Encerradas',
      },
      lotado: {
        icon: <AlertCircle className="h-5 w-5" />,
        bg: 'bg-red-100',
        text: 'text-red-800',
        label: 'Vagas Esgotadas',
      },
      evento_encerrado: {
        icon: <Lock className="h-5 w-5" />,
        bg: 'bg-gray-100',
        text: 'text-gray-800',
        label: 'Evento Encerrado',
      },
    }

    return configs[status] || configs.aberto
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text="Carregando evento..." />
      </div>
    )
  }

  if (!evento) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {linkAcesso ? 'Link inválido ou evento indisponível' : 'Evento não encontrado'}
        </h1>
        {linkAcesso && (
          <p className="text-gray-600 mb-4">
            Verifique se o endereço está correto ou fale com quem compartilhou o convite.
          </p>
        )}
        {linkAcesso ? (
          <Link to="/" className="btn-primary">
            Voltar ao início
          </Link>
        ) : (
          <Link to="/eventos" className="btn-primary">
            Voltar para Eventos
          </Link>
        )}
      </div>
    )
  }

  const statusInfo = getStatusInscricaoInfo()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="py-12" style={{ backgroundColor: corHeaderPagina }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/eventos"
            className="inline-flex items-center text-primary-200 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Voltar para Eventos
          </Link>
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="bg-church-gold text-church-navy text-sm font-bold px-4 py-1 rounded-full">
                      {evento.tipo_display || evento.tipo}
                    </span>
                    <span className={`${statusInfo.bg} ${statusInfo.text} text-sm font-bold px-4 py-1 rounded-full inline-flex items-center gap-2`}>
                      {statusInfo.icon}
                      {statusInfo.label}
                    </span>
                    <span className={`text-sm font-bold px-4 py-1 rounded-full ${
                      evento.evento_pago 
                        ? 'bg-green-500 text-white' 
                        : 'bg-blue-500 text-white'
                    }`}>
                      {evento.valor_inscricao_formatado || 'Gratuito'}
                    </span>
                  </div>
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-white">
            {evento.titulo}
          </h1>
        </div>
      </section>

      {/* Content */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Event Details */}
            <div className="lg:col-span-2">
              {/* Imagem do Evento */}
              {evento.imagem && (
                <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8">
                  <img
                    src={getMediaUrl(evento.imagem)}
                    alt={evento.titulo}
                    className="w-full h-64 md:h-96 object-cover"
                  />
                </div>
              )}

              <div className="bg-white rounded-xl shadow-lg p-8">
                <h2 className="text-2xl font-bold text-church-navy mb-6">
                  Sobre o Evento
                </h2>
                <div className="prose prose-lg max-w-none text-gray-700 whitespace-pre-line">
                  {evento.descricao}
                </div>

                {/* Event Info */}
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                    <Calendar className="h-6 w-6 text-primary-600 flex-shrink-0 mt-1" />
                    <div>
                      <p className="font-semibold text-church-navy">Início do Evento</p>
                      <p className="text-gray-600">{formatDateTimeBR(evento.data_inicio)}</p>
                    </div>
                  </div>
                  
                  {evento.data_fim && (
                    <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                      <Clock className="h-6 w-6 text-primary-600 flex-shrink-0 mt-1" />
                      <div>
                        <p className="font-semibold text-church-navy">Término do Evento</p>
                        <p className="text-gray-600">{formatDateTimeBR(evento.data_fim)}</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                    <MapPin className="h-6 w-6 text-primary-600 flex-shrink-0 mt-1" />
                    <div>
                      <p className="font-semibold text-church-navy">Local</p>
                      <p className="text-gray-600">{evento.local}</p>
                      {evento.endereco && (
                        <p className="text-sm text-gray-500">{evento.endereco}</p>
                      )}
                    </div>
                  </div>
                  
                  {evento.vagas && (
                    <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                      <Users className="h-6 w-6 text-primary-600 flex-shrink-0 mt-1" />
                      <div>
                        <p className="font-semibold text-church-navy">Vagas</p>
                        <p className="text-gray-600">
                          {evento.vagas_disponiveis} de {evento.vagas} disponíveis
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                    <DollarSign className="h-6 w-6 text-primary-600 flex-shrink-0 mt-1" />
                    <div>
                      <p className="font-semibold text-church-navy">Valor</p>
                      <p className={`font-semibold ${evento.evento_pago ? 'text-green-600' : 'text-blue-600'}`}>
                        {evento.valor_inscricao_formatado || 'Gratuito'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Período de Inscrição */}
                {(evento.inscricao_inicio || evento.inscricao_fim) && (
                  <div className="mt-8 p-4 bg-primary-50 rounded-lg">
                    <h3 className="font-semibold text-church-navy mb-2">Período de Inscrição</h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      {evento.inscricao_inicio && (
                        <p>
                          <span className="font-medium">Início:</span>{' '}
                          {formatDateTimeBR(evento.inscricao_inicio)}
                        </p>
                      )}
                      {evento.inscricao_fim && (
                        <p>
                          <span className="font-medium">Término:</span>{' '}
                          {formatDateTimeBR(evento.inscricao_fim)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Registration Form */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-lg p-8 sticky top-24">
                {inscricaoSucesso ? (
                  <div className="text-center py-4">
                    {/* Caso: Já inscrito sem adicionar acompanhantes */}
                    {jaInscrito && !acompanhantesAdicionados ? (
                      <>
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Check className="h-8 w-8 text-blue-600" />
                        </div>
                        <h3 className="text-xl font-bold text-church-navy mb-2">
                          Você já está inscrito!
                        </h3>
                        <p className="text-gray-600 mb-4">
                          {permiteAcompanhantes
                            ? 'Deseja adicionar acompanhantes? Preencha os dados abaixo.'
                            : 'Seu ingresso para este evento já está confirmado.'}
                        </p>
                        
                        {/* Mostra acompanhantes existentes */}
                        {permiteAcompanhantes && acompanhantesData.length > 0 && (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 text-left">
                            <h4 className="font-semibold text-gray-700 mb-2">Acompanhantes já cadastrados:</h4>
                            <ul className="text-sm text-gray-600 space-y-1">
                              {acompanhantesData.map((acomp, idx) => (
                                <li key={idx}>• {acomp.nome} {acomp.categoria && `(${acomp.categoria})`}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Pagamento pendente - botão Pagar Agora */}
                        {inscricaoData?.status_pagamento === 'pendente' && cobranca && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-left">
                            <h4 className="font-semibold text-amber-800 mb-2 flex items-center">
                              <DollarSign className="h-5 w-5 mr-2" />
                              Pagamento Pendente
                            </h4>
                            <p className="text-sm text-amber-700 mb-3">
                              Valor: {formatarValor(inscricaoData?.valor_total || cobranca.valor)}
                            </p>
                            <button
                              onClick={() => navigate(`/pagamento/${cobranca.codigo}?auto=true`)}
                              className="w-full btn-primary py-2 mb-2 flex items-center justify-center gap-2"
                            >
                              <ExternalLink className="h-5 w-5" />
                              Pagar Agora
                            </button>
                          </div>
                        )}
                        
                        {permiteAcompanhantes && (
                        <button
                          onClick={() => {
                            setInscricaoSucesso(false)
                            setJaInscrito(false)
                            setSomenteAdicionandoAcompanhantes(true)
                          }}
                          className="btn-primary w-full mb-3"
                        >
                          Adicionar Acompanhantes
                        </button>
                        )}
                        <Link 
                          to={`/meus-ingressos${formData.telefone ? `?telefone=${encodeURIComponent(formData.telefone.replace(/\D/g, ''))}` : ''}`}
                          className="btn-outline w-full block text-center"
                        >
                          Ver Meus Ingressos
                        </Link>
                      </>
                    ) : jaInscrito && acompanhantesAdicionados ? (
                      /* Caso: Acompanhantes adicionados à inscrição existente */
                      <>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <UserPlus className="h-8 w-8 text-green-600" />
                        </div>
                        <h3 className="text-xl font-bold text-church-navy mb-2">
                          Acompanhantes Adicionados!
                        </h3>
                        <p className="text-gray-600 mb-4">
                          {inscricaoData?.status_pagamento === 'pendente' 
                            ? 'Aguardando pagamento para liberar os ingressos.'
                            : 'Os novos acompanhantes foram adicionados com sucesso.'}
                        </p>
                        
                        {inscricaoData?.status_pagamento === 'pendente' && inscricaoData?.valor > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
                            <h4 className="font-semibold text-amber-800 mb-2 flex items-center">
                              <DollarSign className="h-5 w-5 mr-2" />
                              Pagamento Pendente
                            </h4>
                            <div className="text-sm text-amber-700 space-y-1">
                              <p><span className="font-medium">Valor Total:</span> {formatarValor(inscricaoData?.valor || 0)}</p>
                              <p><span className="font-medium">Total de Inscritos:</span> {1 + acompanhantesData.length} pessoa(s)</p>
                            </div>
                          </div>
                        )}
                      </>
                    ) : inscricaoData?.status_pagamento === 'pendente' ? (
                      /* Caso: Nova inscrição com pagamento pendente */
                      <>
                        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <DollarSign className="h-8 w-8 text-amber-600" />
                        </div>
                        <h3 className="text-xl font-bold text-church-navy mb-2">
                          Inscrição Realizada!
                        </h3>
                        <p className="text-gray-600 mb-4">
                          Aguardando confirmação de pagamento para liberar o ingresso.
                        </p>
                        
                        {/* Resumo do valor */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
                          <h4 className="font-semibold text-amber-800 mb-2 flex items-center">
                            <DollarSign className="h-5 w-5 mr-2" />
                            Pagamento Pendente
                          </h4>
                          <div className="text-sm text-amber-700 space-y-1">
                            <p><span className="font-medium">Valor Total:</span> {formatarValor(inscricaoData?.valor_total || calcularValorTotal())}</p>
                            <p><span className="font-medium">Total de Inscritos:</span> {1 + acompanhantesData.length} pessoa(s)</p>
                          </div>
                        </div>
                        
                        {/* Botão Pagar - Navega para página de pagamento com auto-open */}
                        {cobranca && (
                          <button
                            onClick={() => navigate(`/pagamento/${cobranca.codigo}?auto=true`)}
                            className="w-full btn-primary py-3 mb-4 flex items-center justify-center gap-2"
                          >
                            <ExternalLink className="h-5 w-5" />
                            Pagar Agora
                          </button>
                        )}
                        
                        <p className="text-xs text-gray-500">
                          Ou entre em contato com a secretaria da igreja
                        </p>
                      </>
                    ) : (
                      /* Caso: Nova inscrição gratuita ou paga confirmada */
                      <>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Check className="h-8 w-8 text-green-600" />
                        </div>
                        <h3 className="text-xl font-bold text-church-navy mb-2">
                          Inscrição Realizada!
                        </h3>
                        <p className="text-gray-600 mb-4">
                          Acesse "Meus Ingressos" para visualizar seu QR Code.
                        </p>
                      </>
                    )}
                    
                    {/* Status do envio WhatsApp */}
                    {whatsappEnviado === true && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-left">
                        <h4 className="font-semibold text-green-800 mb-2 flex items-center">
                          <Smartphone className="h-5 w-5 mr-2" />
                          Instruções enviadas
                        </h4>
                        <p className="text-sm text-green-700">
                          As instruções de acesso foram enviadas via WhatsApp para o número{' '}
                          <span className="font-medium">{formData.telefone}</span>. Confira no celular e acesse &quot;Meus Ingressos&quot; quando quiser.
                        </p>
                      </div>
                    )}
                    {whatsappEnviado === false && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
                        <h4 className="font-semibold text-amber-800 mb-2 flex items-center">
                          <AlertCircle className="h-5 w-5 mr-2" />
                          WhatsApp não enviado
                        </h4>
                        <p className="text-sm text-amber-800">
                          {whatsappMensagem || 'Não foi possível enviar a confirmação pelo WhatsApp. Sua inscrição foi registrada.'}
                        </p>
                        {senhaGerada && (
                          <p className="text-sm text-amber-900 mt-3">
                            Sua senha de acesso:{' '}
                            <span className="font-mono font-bold tracking-widest">{senhaGerada}</span>
                            {' '}— anote e use em &quot;Meus Ingressos&quot;.
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* QR Codes removidos desta tela - só aparecem em "Meus Ingressos" */}
                    
                    {/* Lista de acompanhantes (quando pagamento pendente - sem QR code gerado) */}
                    {acompanhantesData.length > 0 && !acompanhantesData[0]?.qrcode && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">
                          Acompanhantes cadastrados:
                        </h4>
                        <div className="bg-amber-50 rounded-lg p-3">
                          {acompanhantesData.map((acomp, index) => (
                            <div key={index} className="flex items-center justify-between py-2 border-b border-amber-200 last:border-b-0">
                              <span className="text-sm text-amber-800">{acomp.nome}</span>
                              {acomp.categoria && (
                                <span className="text-xs text-amber-600">{acomp.categoria}</span>
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-amber-600 mt-2 text-center">
                          Os ingressos serão liberados após confirmação do pagamento
                        </p>
                      </div>
                    )}
                    
                    {inscricaoData?.status_pagamento === 'pendente' ? (
                      <div className="bg-amber-50 p-4 rounded-lg text-left mb-6">
                        <h4 className="font-semibold text-amber-800 mb-2 flex items-center">
                          <DollarSign className="h-5 w-5 mr-2" />
                          Próximos passos
                        </h4>
                        <ul className="text-sm text-amber-700 space-y-1">
                          <li>- Realize o pagamento conforme instruções da igreja</li>
                          <li>- Após confirmação, seus ingressos serão liberados</li>
                          <li>- Acompanhe em <Link to="/meus-ingressos" className="underline font-medium">Meus Ingressos</Link></li>
                        </ul>
                      </div>
                    ) : (
                      <div className="bg-blue-50 p-4 rounded-lg text-left mb-6">
                        <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
                          <QrCode className="h-5 w-5 mr-2" />
                          Importante
                        </h4>
                        <ul className="text-sm text-blue-700 space-y-1">
                          <li>- Acesse <Link to="/meus-ingressos" className="underline font-medium">Meus Ingressos</Link> para visualizar seu QR Code</li>
                          <li>- Apresente o QR Code na entrada do evento</li>
                          <li>- Tire um print ou salve a imagem do QR Code</li>
                        </ul>
                      </div>
                    )}
                    
                    <div className="flex flex-col gap-3">
                      <Link 
                        to={`/meus-ingressos${formData.telefone ? `?telefone=${encodeURIComponent(formData.telefone.replace(/\D/g, ''))}` : ''}`}
                        className="btn-primary"
                      >
                        Ver Meus Ingressos
                      </Link>
                      <Link to="/eventos" className="btn-outline">
                        Ver Outros Eventos
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl font-bold text-church-navy mb-4">
                      Inscreva-se
                    </h3>
                    
                    {/* Status Badge */}
                    <div className={`${statusInfo.bg} ${statusInfo.text} p-3 rounded-lg mb-6 flex items-center gap-2`}>
                      {statusInfo.icon}
                      <span className="text-sm font-medium">{statusInfo.label}</span>
                    </div>
                    
                    {!evento.inscricoes_abertas ? (
                      <div className="text-center py-4">
                        <p className="text-gray-600 mb-2">
                          {evento.status_inscricao === 'nao_iniciado' 
                            ? 'As inscrições para este evento ainda não foram abertas.'
                            : evento.status_inscricao === 'encerrado'
                            ? 'O período de inscrições já foi encerrado.'
                            : evento.status_inscricao === 'lotado'
                            ? 'Este evento está com as vagas esgotadas.'
                            : 'Não é possível se inscrever neste evento no momento.'}
                        </p>
                        
                        {/* Mostrar período de inscrição quando encerrado ou não iniciado */}
                        {(evento.status_inscricao === 'encerrado' || evento.status_inscricao === 'nao_iniciado') && 
                         (evento.inscricao_inicio_formatada || evento.inscricao_fim_formatada) && (
                          <div className="bg-gray-100 rounded-lg p-3 mb-4 text-sm">
                            <p className="font-medium text-gray-700 mb-1">Período de Inscrições:</p>
                            {evento.inscricao_inicio_formatada && (
                              <p className="text-gray-600">
                                <span className="font-medium">Início:</span> {evento.inscricao_inicio_formatada}
                              </p>
                            )}
                            {evento.inscricao_fim_formatada && (
                              <p className="text-gray-600">
                                <span className="font-medium">Término:</span> {evento.inscricao_fim_formatada}
                              </p>
                            )}
                          </div>
                        )}
                        
                        <Link to="/eventos" className="btn-outline">
                          Ver Outros Eventos
                        </Link>
                      </div>
                    ) : (
                      <>
                        {inscricaoErro && (
                          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {inscricaoErro}
                          </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                          {/* Telefone PRIMEIRO */}
                          <div>
                            <label htmlFor="telefone" className="label">
                              <Phone className="h-4 w-4 inline mr-1" />
                              WhatsApp *
                            </label>
                            <div className="relative">
                              <input
                                type="tel"
                                id="telefone"
                                name="telefone"
                                value={formData.telefone}
                                onChange={handleChange}
                                required
                                className={`input-field ${participanteEncontrado ? 'border-green-500 bg-green-50' : ''}`}
                                placeholder="(11) 99999-9999"
                                maxLength={16}
                              />
                              {buscandoParticipante && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                  <div className="animate-spin h-5 w-5 border-2 border-primary-500 border-t-transparent rounded-full"></div>
                                </div>
                              )}
                              {participanteEncontrado && !buscandoParticipante && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                  <Check className="h-5 w-5 text-green-500" />
                                </div>
                              )}
                            </div>
                            {participanteEncontrado ? (
                              <p className="text-xs text-green-600 mt-1 flex items-center">
                                <Check className="h-3 w-3 mr-1" />
                                Cadastro encontrado! Dados preenchidos automaticamente.
                              </p>
                            ) : (
                              <p className="text-xs text-gray-500 mt-1">
                                Digite seu WhatsApp para identificação
                              </p>
                            )}
                          </div>

                          {/* Nome DEPOIS */}
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
                              className={`input-field ${participanteEncontrado ? 'bg-gray-50' : ''}`}
                              placeholder="Seu nome completo"
                            />
                          </div>

                          <div>
                            <label htmlFor="email" className="label">
                              E-mail (opcional)
                            </label>
                            <input
                              type="email"
                              id="email"
                              name="email"
                              value={formData.email}
                              onChange={handleChange}
                              className={`input-field ${participanteEncontrado && formData.email ? 'bg-gray-50' : ''}`}
                              placeholder="seu@email.com"
                            />
                          </div>

                          {permiteInscricaoAdolescente && !somenteAdicionandoAcompanhantes && categoriasTitular.length > 0 && (
                            <div>
                              <label htmlFor="categoria_titular" className="label">
                                Você é *
                              </label>
                              <select
                                id="categoria_titular"
                                value={categoriaTitularId}
                                onChange={(e) => setCategoriaTitularId(e.target.value)}
                                className="input-field"
                                required
                              >
                                {categoriasTitular.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.nome}
                                    {cat.descricao ? ` — ${cat.descricao}` : ''}
                                  </option>
                                ))}
                              </select>
                              <p className="text-xs text-gray-500 mt-1">
                                Informe se a inscrição é para adulto ou adolescente. O valor da inscrição principal é sempre integral.
                              </p>
                            </div>
                          )}

                          {/* Acompanhantes */}
                          {permiteAcompanhantes && (
                          <div className="border-t pt-4 mt-4">
                            <label className="label flex items-center">
                              <UserPlus className="h-4 w-4 mr-1" />
                              Acompanhantes (opcional)
                            </label>
                            <p className="text-xs text-gray-500 mb-3">
                              Adicione outras pessoas que irão com você
                            </p>
                            
                            {/* Lista de acompanhantes */}
                            {acompanhantes.length > 0 && (
                              <div className="space-y-2 mb-3">
                                {acompanhantes.map((acomp, index) => (
                                  <div 
                                    key={index}
                                    className="bg-gray-50 px-3 py-2 rounded-lg"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium text-gray-700">{acomp.nome}</span>
                                      <button
                                        type="button"
                                        onClick={() => removerAcompanhante(index)}
                                        className="text-red-500 hover:text-red-700 p-1"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                    {/* Categoria do acompanhante (adulto, idade – sem valor para eventos gratuitos) */}
                                    {categorias.length > 0 && (
                                      <select
                                        value={acomp.categoria_id}
                                        onChange={(e) => atualizarCategoriaAcompanhante(index, e.target.value)}
                                        className="input-field mt-2 text-sm py-1"
                                      >
                                        {categorias.map(cat => (
                                          <option key={cat.id} value={cat.id}>
                                            {evento.evento_pago
                                              ? [cat.nome || 'Categoria', cat.descricao, cat.valor_formatado].filter(Boolean).join(' – ')
                                              : [cat.nome || 'Categoria', cat.descricao].filter(Boolean).join(' – ')}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* Campo para adicionar */}
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={novoAcompanhante}
                                  onChange={(e) => setNovoAcompanhante(e.target.value)}
                                  onKeyPress={handleKeyPress}
                                  className="input-field flex-grow"
                                  placeholder="Nome do acompanhante"
                                />
                                <button
                                  type="button"
                                  onClick={adicionarAcompanhante}
                                  className="btn-outline px-3"
                                  disabled={!novoAcompanhante.trim()}
                                >
                                  <UserPlus className="h-5 w-5" />
                                </button>
                              </div>
                              {/* Categoria para o novo acompanhante (adulto, idade – sem valor para eventos gratuitos) */}
                              {categorias.length > 0 && novoAcompanhante && (
                                <select
                                  value={novoAcompanhanteCategoria}
                                  onChange={(e) => setNovoAcompanhanteCategoria(e.target.value)}
                                  className="input-field text-sm"
                                >
                                  {categorias.map(cat => (
                                    <option key={cat.id} value={cat.id}>
                                      {evento.evento_pago
                                        ? [cat.nome || 'Categoria', cat.descricao, cat.valor_formatado].filter(Boolean).join(' – ')
                                        : [cat.nome || 'Categoria', cat.descricao].filter(Boolean).join(' – ')}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                            
                            {acompanhantes.length > 0 && (
                              <p className="text-xs text-primary-600 mt-2">
                                Total: {totalPessoasInscricao} pessoa(s)
                              </p>
                            )}
                          </div>
                          )}
                          
                          {/* Resumo de valores (para eventos pagos) */}
                          {evento.evento_pago && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                              <h4 className="font-semibold text-amber-800 mb-2 flex items-center">
                                <DollarSign className="h-5 w-5 mr-1" />
                                Resumo de Valores
                              </h4>
                              <div className="text-sm text-amber-700 space-y-1">
                                {/* Responsável - só mostra quando não for apenas adição de acompanhantes */}
                                {!somenteAdicionandoAcompanhantes && (
                                  <p className="flex justify-between">
                                    <span>
                                      {formData.nome || 'Você'}
                                      {permiteInscricaoAdolescente && categoriaTitularId
                                        ? ` (${categoriasTitular.find((c) => String(c.id) === String(categoriaTitularId))?.nome || 'Adulto'})`
                                        : ' (Adulto)'}
                                      :
                                    </span>
                                    <span className="font-medium">
                                      {formatarValor(parseFloat(evento.valor_inscricao))}
                                    </span>
                                  </p>
                                )}
                                {/* Acompanhantes com suas categorias */}
                                {acompanhantes.map((acomp, index) => {
                                  const cat = categorias.find(c => c.id == acomp.categoria_id)
                                  return (
                                    <p key={index} className="flex justify-between">
                                      <span>{acomp.nome} ({cat?.nome || 'Adulto'}):</span>
                                      <span className="font-medium">{formatarValor(calcularValorAcompanhante(acomp.categoria_id))}</span>
                                    </p>
                                  )
                                })}
                                <div className="border-t border-amber-300 pt-2 mt-2">
                                  <p className="flex justify-between text-base font-bold text-amber-900">
                                    <span>Total:</span>
                                    <span>{formatarValor(calcularValorTotal())}</span>
                                  </p>
                                </div>
                              </div>
                              <p className="text-xs text-amber-600 mt-2">
                                * Pagamento será solicitado após a confirmação
                              </p>
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={inscricaoLoading || buscandoParticipante}
                            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {inscricaoLoading
                              ? 'Processando...'
                              : buscandoParticipante
                                ? 'Verificando telefone…'
                                : precisaQuestionarioPendente
                                  ? 'Responder questionário *'
                                  : `Confirmar inscrição${totalPessoasInscricao > 0 ? ` (${totalPessoasInscricao} ${totalPessoasInscricao === 1 ? 'pessoa' : 'pessoas'})` : ''}`}
                          </button>
                        </form>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modal de Confirmação de Inscrição */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={realizarInscricao}
        title={somenteAdicionandoAcompanhantes ? 'Confirmar Acompanhantes' : 'Confirmar Inscrição'}
        message={somenteAdicionandoAcompanhantes
          ? `Deseja adicionar ${acompanhantes.length} acompanhante(s) à sua inscrição no evento "${evento?.titulo}"?`
          : `Deseja confirmar sua inscrição no evento "${evento?.titulo}"?`}
        type="confirm"
        confirmText="Confirmar"
        cancelText="Voltar"
        loading={inscricaoLoading}
      >
        {/* Resumo da inscrição - Responsivo */}
        <div className="bg-gray-50 rounded-xl p-3 sm:p-4 text-left">
          <div className="space-y-2 sm:space-y-3">
            {/* Participante - só mostra quando não for apenas adição de acompanhantes */}
            {!somenteAdicionandoAcompanhantes && (
              <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-800 text-sm sm:text-base truncate">{formData.nome}</p>
                  <p className="text-xs sm:text-sm text-gray-500">{formData.telefone}</p>
                </div>
              </div>
            )}
            
            {/* Acompanhantes */}
            {acompanhantes.length > 0 && (
              <div className="pt-1 sm:pt-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 sm:mb-2">
                  Acompanhantes ({acompanhantes.length})
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {acompanhantes.map((acomp, idx) => {
                    const cat = categorias.find(c => c.id == acomp.categoria_id)
                    return (
                      <p key={idx} className="text-xs sm:text-sm text-gray-700 flex justify-between items-center">
                        <span className="truncate flex-1">• {acomp.nome}</span>
                        {cat && <span className="text-gray-500 text-xs ml-2 flex-shrink-0">{cat.nome}</span>}
                      </p>
                    )
                  })}
                </div>
              </div>
            )}
            
            {/* Valor total (eventos pagos) */}
            {evento?.evento_pago && (
              <div className="pt-2 sm:pt-3 mt-1 sm:mt-2 border-t border-gray-200">
                <p className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Valor Total:</span>
                  <span className="text-base sm:text-lg font-bold text-primary-600">
                    {formatarValor(calcularValorTotal())}
                  </span>
                </p>
              </div>
            )}
            
            {/* Total de pessoas */}
            <div className="bg-primary-50 rounded-lg py-2 px-3 text-center">
              <p className="text-xs sm:text-sm text-primary-700">
                <span className="font-bold text-base sm:text-lg">{totalPessoasInscricao}</span> pessoa(s) {somenteAdicionandoAcompanhantes ? 'a adicionar' : 'inscrita(s)'}
              </p>
            </div>

            {exigeQuestionarioInscricao && (
              <div className="pt-2 text-center border-t border-gray-200 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmModal(false)
                    setShowFormularioModal(true)
                  }}
                  disabled={inscricaoLoading}
                  className="text-sm text-primary-700 font-medium hover:underline disabled:opacity-50"
                >
                  Voltar e ajustar o questionário
                </button>
              </div>
            )}
          </div>
        </div>
      </ConfirmModal>

      {/* Questionário (campos dinâmicos) em modal – respostas privadas para admins */}
      {showFormularioModal && formularioDinamico && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-questionario-evento"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
            aria-label="Voltar à inscrição"
            onClick={() => !inscricaoLoading && setShowFormularioModal(false)}
          />
          <div
            className="relative w-full max-w-lg max-h-[min(90vh,720px)] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl sm:max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2
                  id="titulo-questionario-evento"
                  className="text-base sm:text-lg font-bold text-church-navy"
                >
                  {formularioDinamico.nome || 'Questionário do evento'}
                </h2>
                {formularioDinamico.descricao && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{formularioDinamico.descricao}</p>
                )}
              </div>
              <button
                type="button"
                disabled={inscricaoLoading}
                onClick={() => setShowFormularioModal(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
                aria-label="Fechar questionário"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
              <FormularioDinamico
                variant="modal"
                formulario={formularioDinamico}
                valores={respostasForm}
                arquivos={arquivosForm}
                errors={errosForm}
                disabled={inscricaoLoading}
                onChange={(novosValores, novosArquivos) => {
                  setRespostasForm(novosValores)
                  setArquivosForm(novosArquivos)
                  setQuestionarioSalvo(false)
                  setErrosForm({})
                }}
              />
            </div>
            <div className="border-t border-gray-100 px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                disabled={inscricaoLoading}
                onClick={() => setShowFormularioModal(false)}
                className="w-full sm:w-auto order-2 sm:order-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 inline-flex items-center justify-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar à inscrição
              </button>
              <button
                type="button"
                disabled={inscricaoLoading}
                onClick={() => {
                  setErrosForm({})
                  setInscricaoErro('')
                  if (!formularioDinamico?.campos) {
                    setShowFormularioModal(false)
                    return
                  }
                  const validacao = validarQuestionarioInscricao(
                    formularioDinamico,
                    respostasForm,
                    arquivosForm,
                    false,
                    questionarioSalvo
                  )
                  if (!validacao.ok) {
                    setErrosForm(validacao.erros)
                    return
                  }
                  setQuestionarioSalvo(true)
                  setShowFormularioModal(false)
                  setInscricaoErro('')
                }}
                className="w-full sm:w-auto order-1 sm:order-2 btn-primary"
              >
                Salvar e continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EventoDetalhe
