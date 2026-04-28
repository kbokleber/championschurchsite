import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Ticket, QrCode, Calendar, MapPin, Download, Check, Clock, X, LogIn, Phone, Lock, LogOut, User, Users, DollarSign, AlertCircle, ExternalLink, RefreshCw, HelpCircle } from 'lucide-react'
import { useParticipante } from '../contexts/ParticipanteContext'
import { useConfiguracao } from '../contexts/ConfiguracaoContext'
import { getMediaUrl } from '../services/utils'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../services/api'

function MeusIngressos() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { configuracao } = useConfiguracao()
  const { participante, ingressos, isLoggedIn, loading, loadError, login, logout, atualizarIngressos, tentarCarregarNovamente, getToken } = useParticipante()
  const corHeaderPagina = configuracao?.cor_header_pagina && /^#[0-9A-Fa-f]{6}$/.test(configuracao.cor_header_pagina) ? configuracao.cor_header_pagina : '#1a365d'
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [atualizando, setAtualizando] = useState(false)
  const [esqueciSenhaLoading, setEsqueciSenhaLoading] = useState(false)
  const [esqueciSenhaMsg, setEsqueciSenhaMsg] = useState('')
  /** 'success' | 'warning' | 'neutral' — só definido após resposta 200; erros de rede = warning */
  const [esqueciSenhaMsgTipo, setEsqueciSenhaMsgTipo] = useState('neutral')
  const [telefoneEncontrado, setTelefoneEncontrado] = useState(false) // true só quando a API confirma que o telefone está cadastrado
  const [mostrarEventosPassados, setMostrarEventosPassados] = useState(false) // filtro: exibir eventos já realizados
  const [filtroAno, setFiltroAno] = useState('') // '' = todos, '2026', '2025'...
  const [filtroMes, setFiltroMes] = useState('') // '' = todos, '1' a '12'
  const [tentandoNovamente, setTentandoNovamente] = useState(false)
  const atualizacaoEmAndamentoRef = useRef(false)

  // Extrai ano da data de início do evento
  const getAnoEvento = (ingresso) => {
    const ev = ingresso?.evento
    if (!ev) return null
    const iso = ev.data_inicio_iso || ev.data_inicio
    if (iso && typeof iso === 'string' && iso.length >= 4) {
      if (iso.startsWith('20') || iso.startsWith('19')) return iso.slice(0, 4)
      const [parteData] = (ev.data_inicio || '').split(' ')
      const partes = (parteData || '').split('/')
      if (partes.length >= 3) return partes[2]
    }
    return null
  }

  // Extrai mês (1-12) da data de início do evento
  const getMesEvento = (ingresso) => {
    const ev = ingresso?.evento
    if (!ev) return null
    const iso = ev.data_inicio_iso || ev.data_inicio
    if (iso && typeof iso === 'string') {
      if (iso.length >= 7 && (iso.startsWith('20') || iso.startsWith('19'))) return parseInt(iso.slice(5, 7), 10)
      const [parteData] = (ev.data_inicio || '').split(' ')
      const partes = (parteData || '').split('/')
      if (partes.length >= 2) return parseInt(partes[1], 10)
    }
    return null
  }

  // Retorna true se o evento já acabou (baseado na data/hora de TÉRMINO do evento, ou início se não tiver término)
  const isEventoPassado = (ingresso) => {
    const ev = ingresso?.evento
    if (!ev) return false
    // Usar data_fim do evento quando existir; senão data_inicio
    const iso = ev.data_fim_iso || ev.data_inicio_iso
    if (iso) {
      const fimEvento = new Date(iso)
      const agora = new Date()
      return fimEvento < agora
    }
    // Fallback: parse "DD/MM/YYYY HH:MM" (data_fim ou data_inicio)
    const s = ev.data_fim || ev.data_inicio || ''
    const [parteData, parteHora] = s.split(' ')
    const [dia, mes, ano] = (parteData || '').split('/').map(Number)
    const [h = 0, min = 0] = (parteHora || '').split(':').map(Number)
    if (!ano || !mes || !dia) return false
    const fimEvento = new Date(ano, mes - 1, dia, h, min, 0, 0)
    const agora = new Date()
    return fimEvento < agora
  }

  // Lista filtrada: eventos passados (checkbox) + ano + mês
  const ingressosPorPassados = mostrarEventosPassados
    ? ingressos
    : ingressos.filter((i) => !isEventoPassado(i))
  const anosDisponiveis = [...new Set(ingressosPorPassados.map(getAnoEvento).filter(Boolean))].sort((a, b) => (b || '').localeCompare(a || ''))
  const ingressosFiltrados = ingressosPorPassados.filter((i) => {
    if (filtroAno) {
      const ano = getAnoEvento(i)
      if (ano !== filtroAno) return false
      if (filtroMes) {
        const mes = getMesEvento(i)
        if (!mes || String(mes) !== filtroMes) return false
      }
    } else if (filtroMes) {
      const mes = getMesEvento(i)
      if (!mes || String(mes) !== filtroMes) return false
    }
    return true
  })

  const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

  const sanitizeFileName = (value) => {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
  }

  const downloadQrCode = async (qrPath, fileName, pessoaNome, eventoTitulo, dataInicioEvento) => {
    try {
      const url = getMediaUrl(qrPath)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Falha ao baixar QR Code')
      }
      const blob = await response.blob()
      const qrBitmap = await createImageBitmap(blob)

      const nomeLinha = pessoaNome || 'Participante'
      const eventoLinha = eventoTitulo || 'Evento'
      const dataLinha = dataInicioEvento ? `Início: ${dataInicioEvento}` : ''
      const padding = 24
      const lineGap = 8
      const fontPrimary = 'bold 22px Arial, sans-serif'
      const fontSecondary = '18px Arial, sans-serif'
      const fontDate = '16px Arial, sans-serif'

      const tempCanvas = document.createElement('canvas')
      const tempCtx = tempCanvas.getContext('2d')
      tempCtx.font = fontPrimary
      const nomeWidth = tempCtx.measureText(nomeLinha).width
      tempCtx.font = fontSecondary
      const eventoWidth = tempCtx.measureText(eventoLinha).width
      tempCtx.font = fontDate
      const dataWidth = dataLinha ? tempCtx.measureText(dataLinha).width : 0
      const textMaxWidth = Math.max(nomeWidth, eventoWidth, dataWidth)

      const canvasWidth = Math.ceil(Math.max(qrBitmap.width, textMaxWidth + padding * 2))
      const textAreaHeight = dataLinha ? 112 : 84
      const canvasHeight = qrBitmap.height + textAreaHeight

      const canvas = document.createElement('canvas')
      canvas.width = canvasWidth
      canvas.height = canvasHeight
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)

      const qrX = Math.floor((canvasWidth - qrBitmap.width) / 2)
      ctx.drawImage(qrBitmap, qrX, 0)

      const centerX = canvasWidth / 2
      const textStartY = qrBitmap.height + 34
      ctx.textAlign = 'center'
      ctx.fillStyle = '#0f172a'
      ctx.font = fontPrimary
      ctx.fillText(nomeLinha, centerX, textStartY)
      ctx.font = fontSecondary
      ctx.fillStyle = '#334155'
      ctx.fillText(eventoLinha, centerX, textStartY + 24 + lineGap)
      if (dataLinha) {
        ctx.font = fontDate
        ctx.fillStyle = '#475569'
        ctx.fillText(dataLinha, centerX, textStartY + 24 + lineGap + 24 + 6)
      }

      const finalBlob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png')
      })

      if (!finalBlob) {
        throw new Error('Falha ao gerar imagem final do QR Code')
      }

      const blobUrl = window.URL.createObjectURL(finalBlob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Erro ao baixar QR Code:', error)
      setErro('Não foi possível baixar o QR Code. Tente novamente.')
    }
  }

  const formatarTelefone = (valor) => {
    // Remove tudo que não é número
    const numeros = valor.replace(/\D/g, '')
    
    // Aplica máscara
    if (numeros.length <= 2) {
      return numeros
    } else if (numeros.length <= 7) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`
    } else if (numeros.length <= 11) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
    }
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7, 11)}`
  }

  // Garantir que se não estiver logado, não há dados residuais
  useEffect(() => {
    const token = getToken()
    if (!token && isLoggedIn) {
      // Se não tem token mas está marcado como logado, fazer logout
      // Usar setTimeout para evitar problemas de renderização
      setTimeout(() => logout(), 0)
    }
  }, []) // Executar apenas uma vez ao montar

  // Pré-preencher telefone se vier via query string (quando vem da página de detalhes do evento)
  useEffect(() => {
    const telefoneParam = searchParams.get('telefone')
    if (telefoneParam && !isLoggedIn && !telefone) {
      const telefoneFormatado = formatarTelefone(telefoneParam)
      setTelefone(telefoneFormatado)
      // Limpar o parâmetro da URL após usar
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.delete('telefone')
      const newUrl = newSearchParams.toString() ? `/meus-ingressos?${newSearchParams.toString()}` : '/meus-ingressos'
      navigate(newUrl, { replace: true })
    }
  }, [searchParams, isLoggedIn, navigate, telefone])

  // Buscar se o telefone está cadastrado (para exibir "Esqueci minha senha" somente quando encontrar)
  useEffect(() => {
    const numeros = (telefone || '').replace(/\D/g, '')
    if (numeros.length < 10) {
      setTelefoneEncontrado(false)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/participante/buscar/', { params: { telefone: telefone.trim() } })
        setTelefoneEncontrado(data.encontrado === true)
      } catch {
        setTelefoneEncontrado(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [telefone])

  // Função para atualizar manualmente/automaticamente (força busca no servidor e atualiza a lista)
  const handleAtualizar = useCallback(async ({ silent = false } = {}) => {
    if (atualizacaoEmAndamentoRef.current) {
      return { success: false, skipped: true }
    }
    atualizacaoEmAndamentoRef.current = true
    setAtualizando(true)
    try {
      const resultado = await atualizarIngressos({ forcar: true, silent })
      if (!resultado?.success && !silent && !resultado?.skipped) {
        setErro('Não foi possível atualizar seus ingressos agora. Tente novamente.')
      } else if (resultado?.success) {
        setErro('')
      }
      return resultado
    } catch (e) {
      if (!silent) setErro('Falha ao atualizar ingressos. Verifique sua conexão e tente novamente.')
      return { success: false, error: e?.message || 'erro' }
    } finally {
      atualizacaoEmAndamentoRef.current = false
      setAtualizando(false)
    }
  }, [atualizarIngressos])

  // Sempre que a rota de Meus Ingressos for aberta novamente (ou usuário logar),
  // consultar ingressos no backend da pessoa logada.
  useEffect(() => {
    if (isLoggedIn) {
      setFiltroAno('')
      setFiltroMes('')
      handleAtualizar({ silent: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, location.key])

  // Quando a lista de ingressos é atualizada (ex.: após inscrição ou atualizar), resetar filtros para o novo ingresso aparecer
  useEffect(() => {
    if (ingressos.length > 0) {
      setFiltroAno('')
      setFiltroMes('')
    }
  }, [ingressos])

  // Listener para quando a página voltar a ficar visível (voltou de outra aba/MP)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isLoggedIn) {
        // Atualização silenciosa ao voltar para a aba: não deve derrubar a tela.
        atualizarIngressos({ silent: true })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isLoggedIn, atualizarIngressos])

  const handleTelefoneChange = (e) => {
    setTelefone(formatarTelefone(e.target.value))
    if (esqueciSenhaMsg) {
      setEsqueciSenhaMsg('')
      setEsqueciSenhaMsgTipo('neutral')
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!telefone.trim() || !senha.trim()) return

    setLoginLoading(true)
    setErro('')
    // Evita confusão visual: ao tentar login, limpamos feedback antigo de "esqueci senha".
    setEsqueciSenhaMsg('')
    setEsqueciSenhaMsgTipo('neutral')

    try {
      const result = await login(telefone, senha)
      if (!result.success) {
        setErro(result.error || 'Erro ao fazer login')
      }
    } catch (error) {
      console.error('Erro no login:', error)
      setErro(error.response?.data?.error || 'Erro ao fazer login. Tente novamente.')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    setTelefone('')
    setSenha('')
  }

  const handleEsqueciSenha = async (e) => {
    e.preventDefault()
    if (!telefone.trim() || esqueciSenhaLoading) return
    setEsqueciSenhaMsg('')
    setEsqueciSenhaMsgTipo('neutral')
    setEsqueciSenhaLoading(true)
    try {
      const { data } = await api.post('/participante/esqueci-senha/', { telefone: telefone.trim() })
      setEsqueciSenhaMsg(
        data.message
        || 'Se este número estiver cadastrado, a solicitação foi processada.'
      )
      const enviada =
        data.mensagem_enviada !== undefined
          ? data.mensagem_enviada
          : data.envio_integracao_ok !== undefined
            ? data.envio_integracao_ok
            : null
      if (enviada === true) {
        setEsqueciSenhaMsgTipo('success')
      } else if (enviada === false) {
        setEsqueciSenhaMsgTipo('warning')
      } else {
        setEsqueciSenhaMsgTipo('neutral')
      }
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.response?.data?.detail
      setEsqueciSenhaMsg(
        apiMsg
        || 'Não foi possível processar o pedido agora. Verifique a conexão e tente de novo.'
      )
      setEsqueciSenhaMsgTipo('warning')
    } finally {
      setEsqueciSenhaLoading(false)
    }
  }

  const getStatusBadge = (ingresso) => {
    // Primeiro verificar se pagamento está pendente
    if (ingresso.pagamento_pendente) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          <DollarSign className="h-3 w-3 mr-1" />
          Aguardando pagamento
        </span>
      )
    }
    
    if (ingresso.presente) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <Check className="h-3 w-3 mr-1" />
          Check-in realizado
        </span>
      )
    }
    
    // Verificar se evento já passou (usar data_fim)
    const dataFim = ingresso.evento.data_fim || ingresso.evento.data_inicio
    const [dia, mes, anoHora] = dataFim.split('/')
    const [ano, hora] = anoHora.split(' ')
    const eventoDataFim = new Date(`${ano}-${mes}-${dia}T${hora || '23:59'}`)
    const agora = new Date()
    
    if (ingresso.evento.status === 'finalizado' || eventoDataFim < agora) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          <Clock className="h-3 w-3 mr-1" />
          Evento encerrado
        </span>
      )
    }
    
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        <Ticket className="h-3 w-3 mr-1" />
        Válido
      </span>
    )
  }
  
  const formatarValor = (valor) => {
    return `R$ ${(valor || 0).toFixed(2).replace('.', ',')}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner text="Carregando..." />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      {/* Header */}
      <section className="py-10 sm:py-16" style={{ backgroundColor: corHeaderPagina }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-white/10 rounded-full mb-4 sm:mb-6">
            <Ticket className="h-8 w-8 sm:h-10 sm:w-10 text-church-gold" />
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-white mb-3 sm:mb-4 px-1">
            Meus Ingressos
          </h1>
          <p className="text-base sm:text-lg text-primary-200 max-w-2xl mx-auto px-1">
            {isLoggedIn 
              ? `Olá, ${participante?.nome}! Veja seus ingressos abaixo.`
              : 'Faça login para acessar seus ingressos e QR Codes'}
          </p>
        </div>
      </section>

      {/* Conteúdo */}
      <section className="py-6 sm:py-12">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8">
          
          {!isLoggedIn ? (
            loadError && getToken() ? (
              /* Tem token mas a carga falhou (ex.: após F5) – Tentar novamente sem pedir senha */
              <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 md:p-8 max-w-md mx-auto">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
                    <RefreshCw className="h-8 w-8 text-amber-600" />
                  </div>
                  <h2 className="text-xl font-bold text-church-navy">Recarregar seus dados</h2>
                  <p className="text-gray-600 text-sm mt-2">
                    Não foi possível carregar seus ingressos. Tente novamente ou saia para fazer login.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      setTentandoNovamente(true)
                      await tentarCarregarNovamente()
                      setTentandoNovamente(false)
                    }}
                    disabled={tentandoNovamente}
                    className="btn-primary flex-1 min-h-[44px] py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${tentandoNovamente ? 'animate-spin' : ''}`} />
                    {tentandoNovamente ? 'Carregando...' : 'Tentar novamente'}
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="btn-outline min-h-[44px] py-2.5 flex items-center justify-center gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair e fazer login
                  </button>
                </div>
              </div>
            ) : (
            /* Formulário de Login */
            <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 md:p-8 max-w-md mx-auto">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
                  <LogIn className="h-8 w-8 text-primary-600" />
                </div>
                <h2 className="text-xl font-bold text-church-navy">Acesse sua conta</h2>
                <p className="text-gray-600 text-sm mt-1">
                  Use o telefone e senha que você recebeu
                </p>
              </div>

              {erro && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center">
                  <X className="h-4 w-4 mr-2 flex-shrink-0" />
                  {erro}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="telefone" className="label">
                    <Phone className="h-4 w-4 inline mr-1" />
                    Telefone/WhatsApp
                  </label>
                  <input
                    type="tel"
                    id="telefone"
                    value={telefone}
                    onChange={handleTelefoneChange}
                    placeholder="(11) 99999-9999"
                    required
                    className="input-field"
                    maxLength={16}
                  />
                </div>
                
                <div>
                  <label htmlFor="senha" className="label">
                    <Lock className="h-4 w-4 inline mr-1" />
                    Senha
                  </label>
                  <input
                    type="password"
                    id="senha"
                    value={senha}
                    onChange={(e) => {
                      setSenha(e.target.value)
                      if (esqueciSenhaMsg) {
                        setEsqueciSenhaMsg('')
                        setEsqueciSenhaMsgTipo('neutral')
                      }
                    }}
                    placeholder="Digite sua senha"
                    required
                    className="input-field"
                    maxLength={10}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Senha de 6 dígitos enviada por WhatsApp
                  </p>
                  {telefoneEncontrado && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={handleEsqueciSenha}
                        disabled={esqueciSenhaLoading}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 disabled:opacity-50"
                      >
                        <HelpCircle className="h-4 w-4" />
                        {esqueciSenhaLoading ? 'Enviando...' : 'Esqueci minha senha'}
                      </button>
                    </div>
                  )}
                </div>

                {esqueciSenhaMsg && (
                  <div
                    className={
                      esqueciSenhaMsgTipo === 'success'
                        ? 'p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm'
                        : esqueciSenhaMsgTipo === 'warning'
                          ? 'p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm'
                          : 'p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm'
                    }
                    role="status"
                  >
                    {esqueciSenhaMsgTipo === 'warning' && (
                      <span className="block font-medium mb-1">Atenção</span>
                    )}
                    {esqueciSenhaMsg}
                  </div>
                )}

<button
                        type="submit"
                        disabled={loginLoading}
                        className="btn-primary w-full disabled:opacity-50 min-h-[44px] py-2.5"
                      >
                  {loginLoading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t text-center">
                <p className="text-sm text-gray-600 mb-2">
                  Ainda não tem cadastro?
                </p>
                <Link to="/eventos" className="text-primary-600 hover:underline font-medium">
                  Inscreva-se em um evento
                </Link>
              </div>
            </div>
            )
          ) : (
            /* Área Logada */
            <div>
              {/* Info do participante */}
              <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-6 sm:mb-8">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center min-w-0">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 bg-primary-100 rounded-full flex items-center justify-center mr-3 sm:mr-4 flex-shrink-0">
                      <User className="h-5 w-5 sm:h-6 sm:w-6 text-primary-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-church-navy truncate">{participante?.nome}</p>
                      <p className="text-sm text-gray-600 truncate">
                        <Phone className="h-3 w-3 inline mr-1 flex-shrink-0" />
                        {participante?.telefone}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <button
                      onClick={handleAtualizar}
                      disabled={atualizando}
                      className="min-h-[44px] px-3 py-2.5 text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center disabled:opacity-50 rounded-lg border border-primary-200 sm:border-0"
                      title="Atualizar ingressos"
                    >
                      <RefreshCw className={`h-4 w-4 sm:mr-1 ${atualizando ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">{atualizando ? 'Atualizando...' : 'Atualizar'}</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="min-h-[44px] px-3 py-2.5 text-red-600 hover:text-red-700 text-sm font-medium flex items-center rounded-lg border border-red-200 sm:border-0"
                    >
                      <LogOut className="h-4 w-4 sm:mr-1" />
                      Sair
                    </button>
                  </div>
                </div>
              </div>

              {/* Lista de Ingressos */}
              {ingressos.length > 0 ? (
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-church-navy flex items-center">
                      <Ticket className="h-5 w-5 mr-2 flex-shrink-0" />
                      Seus Ingressos ({ingressosFiltrados.length}{!mostrarEventosPassados && ingressos.length !== ingressosFiltrados.length ? ` de ${ingressos.length}` : ''})
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Por padrão exibindo apenas eventos futuros e de hoje. Use os filtros para encontrar por data.
                    </p>
                    {/* Filtros: eventos passados + ano + mês */}
                    <div className="mt-3 space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={mostrarEventosPassados}
                          onChange={(e) => setMostrarEventosPassados(e.target.checked)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span>Mostrar eventos já realizados</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <label className="flex items-center gap-2">
                          <span className="text-gray-600">Ano:</span>
                          <select
                            value={filtroAno}
                            onChange={(e) => { setFiltroAno(e.target.value); if (!e.target.value) setFiltroMes('') }}
                            className="rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:ring-primary-500 focus:border-primary-500"
                          >
                            <option value="">Todos</option>
                            {anosDisponiveis.map((a) => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="text-gray-600">Mês:</span>
                          <select
                            value={filtroMes}
                            onChange={(e) => setFiltroMes(e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1.5 text-gray-800 focus:ring-primary-500 focus:border-primary-500"
                          >
                            <option value="">Todos</option>
                            {MESES.slice(1).map((nome, idx) => (
                              <option key={idx} value={String(idx + 1)}>{nome}</option>
                            ))}
                          </select>
                        </label>
                        {(filtroAno || filtroMes) && (
                          <button
                            type="button"
                            onClick={() => { setFiltroAno(''); setFiltroMes('') }}
                            className="text-primary-600 hover:text-primary-700 font-medium"
                          >
                            Limpar filtros
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {ingressosFiltrados.length > 0 ? (
                  ingressosFiltrados.map((ingresso) => (
                    <div 
                      key={ingresso.id}
                      className="bg-white rounded-xl shadow-lg overflow-hidden"
                    >
                      <div className="flex flex-col md:flex-row">
                        {/* QR Code */}
                        <div className="md:w-64 bg-gray-50 p-4 sm:p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r">
                          {ingresso.qrcode ? (
                            /* Ingresso liberado - tem QR Code */
                            <>
                              <img
                                src={getMediaUrl(ingresso.qrcode)}
                                alt="QR Code"
                                className="w-36 h-36 sm:w-40 sm:h-40 mb-2 sm:mb-3"
                              />
                              {participante?.nome && (
                                <p className="text-sm sm:text-base font-bold text-church-navy mb-2 sm:mb-3 text-center">
                                  {participante.nome}
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  downloadQrCode(
                                    ingresso.qrcode,
                                    `qrcode-${sanitizeFileName(participante?.nome || 'participante')}-${sanitizeFileName(ingresso.evento.titulo || 'evento')}.png`
                                    ,
                                    participante?.nome || 'Participante',
                                    ingresso.evento.titulo || 'Evento',
                                    ingresso.evento.data_inicio || ''
                                  )
                                }
                                className="inline-flex items-center text-primary-600 hover:text-primary-700 text-sm min-h-[44px] py-2"
                              >
                                <Download className="h-4 w-4 mr-1" />
                                Salvar QR Code
                              </button>
                            </>
                          ) : ingresso.pagamento_pendente ? (
                            /* Pagamento Pendente - aguardando para gerar QR Code */
                            <div className="text-center w-full">
                              <div className="w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-2 sm:mb-3 bg-amber-100 rounded-lg flex flex-col items-center justify-center">
                                <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-amber-500 mb-1" />
                                <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
                              </div>
                              <p className="text-xs sm:text-sm font-medium text-amber-700">Aguardando Pagamento</p>
                              {ingresso.valor_total > 0 && (
                                <p className="text-base sm:text-lg font-bold text-amber-800 mt-1">
                                  {formatarValor(ingresso.valor_total)}
                                </p>
                              )}
                              
                              {ingresso.cobranca_id && (
                                <button
                                  onClick={() => navigate(`/pagamento/${ingresso.cobranca_id}?auto=true`)}
                                  className="mt-3 w-full min-h-[44px] bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Pagar Agora
                                </button>
                              )}
                              
                              <p className="text-xs text-amber-600 mt-2">
                                Ingresso liberado após pagamento
                              </p>
                            </div>
                          ) : (
                            <div className="text-center text-gray-400 py-4">
                              <QrCode className="h-14 w-14 sm:h-16 sm:w-16 mx-auto mb-2" />
                              <p className="text-sm">QR Code indisponível</p>
                            </div>
                          )}
                        </div>

                        {/* Info do Evento */}
                        <div className="flex-grow p-4 sm:p-6 min-w-0">
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-3 sm:mb-4">
                            <div className="min-w-0 flex-1">
                              <h3 className="text-lg sm:text-xl font-bold text-church-navy mb-1 break-words">
                                {ingresso.evento.titulo}
                              </h3>
                              {getStatusBadge(ingresso)}
                            </div>
                            {ingresso.evento.imagem && (
                              <img
                                src={getMediaUrl(ingresso.evento.imagem)}
                                alt={ingresso.evento.titulo}
                                className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg flex-shrink-0 hidden sm:block"
                              />
                            )}
                          </div>

                          <div className="space-y-2 sm:space-y-3 text-gray-600 text-sm sm:text-base">
                            <div className="flex items-start gap-2">
                              <Calendar className="h-5 w-5 text-primary-500 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium">{ingresso.evento.data_inicio}</p>
                                {ingresso.evento.data_fim && (
                                  <p className="text-xs sm:text-sm">até {ingresso.evento.data_fim}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <MapPin className="h-5 w-5 text-primary-500 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0 break-words">
                                <p className="font-medium">{ingresso.evento.local}</p>
                                {ingresso.evento.endereco && (
                                  <p className="text-xs sm:text-sm">{ingresso.evento.endereco}</p>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t text-xs sm:text-sm text-gray-500 flex flex-wrap gap-3 sm:gap-4">
                            <span>Inscrito em: {ingresso.data_inscricao}</span>
                            {ingresso.presente && ingresso.data_checkin && (
                              <span className="text-green-600">
                                Check-in: {ingresso.data_checkin}
                              </span>
                            )}
                          </div>
                          
                          {ingresso.acompanhantes && ingresso.acompanhantes.length > 0 && (
                            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t">
                              <h4 className="font-semibold text-church-navy mb-2 sm:mb-3 flex items-center text-sm sm:text-base">
                                <Users className="h-4 w-4 mr-2" />
                                Acompanhantes ({ingresso.acompanhantes.length})
                              </h4>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                                {ingresso.acompanhantes.map((acomp) => (
                                  <div 
                                    key={acomp.id}
                                    className={`rounded-lg p-2 sm:p-3 text-center min-w-0 ${acomp.qrcode ? 'bg-gray-50' : 'bg-amber-50'}`}
                                  >
                                    {acomp.qrcode ? (
                                      <img
                                        src={getMediaUrl(acomp.qrcode)}
                                        alt={`QR Code - ${acomp.nome}`}
                                        className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-1 sm:mb-2"
                                      />
                                    ) : (
                                      <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-1 sm:mb-2 bg-amber-100 rounded flex items-center justify-center">
                                        <Lock className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500" />
                                      </div>
                                    )}
                                    <p className="text-xs sm:text-sm font-medium text-gray-700 truncate">
                                      {acomp.nome}
                                    </p>
                                    {acomp.categoria && (
                                      <p className="text-xs text-gray-500 truncate">{acomp.categoria}</p>
                                    )}
                                    {!acomp.qrcode && acomp.valor > 0 && (
                                      <p className="text-xs font-medium text-amber-700">{formatarValor(acomp.valor)}</p>
                                    )}
                                    {acomp.qrcode && (
                                      acomp.presente ? (
                                        <span className="text-xs text-green-600 flex items-center justify-center mt-1">
                                          <Check className="h-3 w-3 mr-1" />
                                          Check-in OK
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            downloadQrCode(
                                              acomp.qrcode,
                                              `qrcode-${sanitizeFileName(acomp.nome || 'acompanhante')}-${sanitizeFileName(ingresso.evento.titulo || 'evento')}.png`,
                                              acomp.nome || 'Acompanhante',
                                              ingresso.evento.titulo || 'Evento',
                                              ingresso.evento.data_inicio || ''
                                            )
                                          }
                                          className="text-xs text-primary-600 hover:underline flex items-center justify-center mt-1 min-h-[36px]"
                                        >
                                          <Download className="h-3 w-3 mr-1" />
                                          Salvar
                                        </button>
                                      )
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                  ) : (
                    <p className="text-gray-500 text-sm py-4">
                      Nenhum ingresso com o filtro atual.
                      {!mostrarEventosPassados && ingressos.some(isEventoPassado) && (
                        <> Marque &quot;Mostrar eventos já realizados&quot; para ver eventos passados.</>
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-lg p-6 sm:p-12 text-center">
                  <Ticket className="h-14 w-14 sm:h-16 sm:w-16 text-gray-300 mx-auto mb-3 sm:mb-4" />
                  <h3 className="text-lg sm:text-xl font-bold text-gray-700 mb-2">Nenhum ingresso</h3>
                  <p className="text-gray-600 mb-4 sm:mb-6 text-sm sm:text-base">
                    Você ainda não está inscrito em nenhum evento.
                  </p>
                  <Link to="/eventos" className="btn-primary min-h-[44px] inline-flex items-center justify-center py-2.5 px-4">
                    Ver Eventos Disponíveis
                  </Link>
                </div>
              )}

              {/* Instruções */}
              {ingressos.length > 0 && (
                <div className="mt-6 sm:mt-8 bg-blue-50 rounded-xl p-4 sm:p-6">
                  <h3 className="font-semibold text-blue-800 mb-2 sm:mb-3 flex items-center text-sm sm:text-base">
                    <QrCode className="h-5 w-5 mr-2 flex-shrink-0" />
                    Como usar seu ingresso
                  </h3>
                  <ul className="text-xs sm:text-sm text-blue-700 space-y-1.5 sm:space-y-2">
                    <li>1. Salve ou tire um print do QR Code</li>
                    <li>2. No dia do evento, apresente o QR Code na entrada</li>
                    <li>3. Aguarde a confirmação do check-in</li>
                    <li>4. Aproveite o evento!</li>
                  </ul>
                </div>
              )}
            </div>
          )}

        </div>
      </section>
    </div>
  )
}

export default MeusIngressos
