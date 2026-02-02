import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Ticket, QrCode, Calendar, MapPin, Download, Check, Clock, X, LogIn, Phone, Lock, LogOut, User, Users, DollarSign, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { useParticipante } from '../contexts/ParticipanteContext'
import { getMediaUrl } from '../services/utils'
import LoadingSpinner from '../components/LoadingSpinner'

function MeusIngressos() {
  const navigate = useNavigate()
  const { participante, ingressos, isLoggedIn, loading, login, logout, atualizarIngressos, buscarParticipante, resetarSenha } = useParticipante()
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [atualizando, setAtualizando] = useState(false)
  const [isTelefoneCadastrado, setIsTelefoneCadastrado] = useState(false)
  const [verificandoTelefone, setVerificandoTelefone] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMensagem, setResetMensagem] = useState({ tipo: '', texto: '' })

  // Verificar se telefone está cadastrado quando mudar
  useEffect(() => {
    const numeros = telefone.replace(/\D/g, '')
    if (numeros.length === 11) {
      verificarCadastro(numeros)
    } else {
      setIsTelefoneCadastrado(false)
    }
  }, [telefone])

  const verificarCadastro = async (num) => {
    setVerificandoTelefone(true)
    try {
      const resp = await buscarParticipante(num)
      setIsTelefoneCadastrado(resp.encontrado)
    } catch (error) {
      console.error('Erro ao verificar telefone:', error)
    } finally {
      setVerificandoTelefone(false)
    }
  }

  const handleResetSenha = async () => {
    const numeros = telefone.replace(/\D/g, '')
    if (numeros.length !== 11) return

    setResetLoading(true)
    setResetMensagem({ tipo: '', texto: '' })
    try {
      const resp = await resetarSenha(numeros)
      if (resp.success) {
        setResetMensagem({ tipo: 'success', texto: resp.message })
      } else {
        setResetMensagem({ tipo: 'error', texto: resp.error || 'Erro ao resetar senha' })
      }
    } catch (error) {
      setResetMensagem({ tipo: 'error', texto: 'Erro ao conectar com o servidor' })
    } finally {
      setResetLoading(false)
    }
  }

  // Atualizar ao montar a página se logado
  useEffect(() => {
    if (isLoggedIn && !loading) {
      console.log('[MeusIngressos] Página montada, atualizando ingressos...')
      atualizarIngressos()
    }
  }, []) // Executar apenas na montagem

  // Listener para quando a página voltar a ficar visível (voltou de outra aba/MP)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isLoggedIn) {
        console.log('[MeusIngressos] Página visível novamente, atualizando...')
        atualizarIngressos()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isLoggedIn, atualizarIngressos])

  // Função para atualizar manualmente
  const handleAtualizar = async () => {
    setAtualizando(true)
    try {
      await atualizarIngressos()
    } finally {
      setAtualizando(false)
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

  const handleTelefoneChange = (e) => {
    setTelefone(formatarTelefone(e.target.value))
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!telefone.trim() || !senha.trim()) return

    setLoginLoading(true)
    setErro('')

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="bg-gradient-to-r from-church-navy to-primary-800 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-full mb-6">
            <Ticket className="h-10 w-10 text-church-gold" />
          </div>
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-white mb-4">
            Meus Ingressos
          </h1>
          <p className="text-lg text-primary-200 max-w-2xl mx-auto">
            {isLoggedIn
              ? `Olá, ${participante?.nome}! Veja seus ingressos abaixo.`
              : 'Faça login para acessar seus ingressos e QR Codes'}
          </p>
        </div>
      </section>

      {/* Conteúdo */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

          {!isLoggedIn ? (
            /* Formulário de Login */
            <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 max-w-md mx-auto">
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

              {resetMensagem.texto && (
                <div className={`mb-4 p-3 rounded-lg text-sm flex items-center ${resetMensagem.tipo === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                  {resetMensagem.tipo === 'success' ? <Check className="h-4 w-4 mr-2" /> : <X className="h-4 w-4 mr-2" />}
                  {resetMensagem.texto}
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
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Digite sua senha"
                    required
                    className="input-field"
                    maxLength={10}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Senha de 6 dígitos enviada por WhatsApp
                  </p>

                  {isTelefoneCadastrado && (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleResetSenha}
                        disabled={resetLoading}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium underline flex items-center gap-1 disabled:opacity-50"
                      >
                        {resetLoading ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Lock className="h-3 w-3" />
                        )}
                        Esqueci minha senha / Reenviar Senha
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="btn-primary w-full disabled:opacity-50"
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
          ) : (
            /* Área Logada */
            <div>
              {/* Info do participante */}
              <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mr-4">
                      <User className="h-6 w-6 text-primary-600" />
                    </div>
                    <div>
                      <p className="font-bold text-church-navy">{participante?.nome}</p>
                      <p className="text-sm text-gray-600">
                        <Phone className="h-3 w-3 inline mr-1" />
                        {participante?.telefone}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleAtualizar}
                      disabled={atualizando}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center disabled:opacity-50"
                      title="Atualizar ingressos"
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${atualizando ? 'animate-spin' : ''}`} />
                      {atualizando ? 'Atualizando...' : 'Atualizar'}
                    </button>
                    <button
                      onClick={handleLogout}
                      className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center"
                    >
                      <LogOut className="h-4 w-4 mr-1" />
                      Sair
                    </button>
                  </div>
                </div>
              </div>

              {/* Lista de Ingressos */}
              {ingressos.length > 0 ? (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-church-navy flex items-center">
                    <Ticket className="h-5 w-5 mr-2" />
                    Seus Ingressos ({ingressos.length})
                  </h2>

                  {ingressos.map((ingresso) => (
                    <div
                      key={ingresso.id}
                      className="bg-white rounded-xl shadow-lg overflow-hidden"
                    >
                      <div className="md:flex">
                        {/* QR Code */}
                        <div className="md:w-64 bg-gray-50 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r">
                          {ingresso.qrcode ? (
                            /* Ingresso liberado - tem QR Code */
                            <>
                              <img
                                src={getMediaUrl(ingresso.qrcode)}
                                alt="QR Code"
                                className="w-40 h-40 mb-3"
                              />
                              <a
                                href={getMediaUrl(ingresso.qrcode)}
                                download={`ingresso-${ingresso.evento.titulo.replace(/\s+/g, '-')}.png`}
                                className="inline-flex items-center text-primary-600 hover:text-primary-700 text-sm"
                              >
                                <Download className="h-4 w-4 mr-1" />
                                Salvar QR Code
                              </a>
                            </>
                          ) : ingresso.pagamento_pendente ? (
                            /* Pagamento Pendente - aguardando para gerar QR Code */
                            <div className="text-center">
                              <div className="w-40 h-40 mx-auto mb-3 bg-amber-100 rounded-lg flex flex-col items-center justify-center">
                                <AlertCircle className="h-12 w-12 text-amber-500 mb-1" />
                                <DollarSign className="h-6 w-6 text-amber-600" />
                              </div>
                              <p className="text-sm font-medium text-amber-700">Aguardando Pagamento</p>
                              {ingresso.valor_total > 0 && (
                                <p className="text-lg font-bold text-amber-800 mt-1">
                                  {formatarValor(ingresso.valor_total)}
                                </p>
                              )}

                              {/* Botão Pagar Agora - navega para página de pagamento */}
                              {ingresso.cobranca_id && (
                                <button
                                  onClick={() => navigate(`/pagamento/${ingresso.cobranca_id}?auto=true`)}
                                  className="mt-3 w-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
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
                            <div className="text-center text-gray-400">
                              <QrCode className="h-16 w-16 mx-auto mb-2" />
                              <p className="text-sm">QR Code indisponível</p>
                            </div>
                          )}
                        </div>

                        {/* Info do Evento */}
                        <div className="flex-grow p-6">
                          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                            <div>
                              <h3 className="text-xl font-bold text-church-navy mb-1">
                                {ingresso.evento.titulo}
                              </h3>
                              {getStatusBadge(ingresso)}
                            </div>
                            {ingresso.evento.imagem && (
                              <img
                                src={getMediaUrl(ingresso.evento.imagem)}
                                alt={ingresso.evento.titulo}
                                className="w-20 h-20 object-cover rounded-lg hidden sm:block"
                              />
                            )}
                          </div>

                          <div className="space-y-3 text-gray-600">
                            <div className="flex items-start">
                              <Calendar className="h-5 w-5 text-primary-500 mr-3 mt-0.5" />
                              <div>
                                <p className="font-medium">{ingresso.evento.data_inicio}</p>
                                {ingresso.evento.data_fim && (
                                  <p className="text-sm">até {ingresso.evento.data_fim}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-start">
                              <MapPin className="h-5 w-5 text-primary-500 mr-3 mt-0.5" />
                              <div>
                                <p className="font-medium">{ingresso.evento.local}</p>
                                {ingresso.evento.endereco && (
                                  <p className="text-sm">{ingresso.evento.endereco}</p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Info adicional */}
                          <div className="mt-4 pt-4 border-t text-sm text-gray-500 flex flex-wrap gap-4">
                            <span>Inscrito em: {ingresso.data_inscricao}</span>
                            {ingresso.presente && ingresso.data_checkin && (
                              <span className="text-green-600">
                                Check-in: {ingresso.data_checkin}
                              </span>
                            )}
                          </div>

                          {/* Acompanhantes */}
                          {ingresso.acompanhantes && ingresso.acompanhantes.length > 0 && (
                            <div className="mt-4 pt-4 border-t">
                              <h4 className="font-semibold text-church-navy mb-3 flex items-center">
                                <Users className="h-4 w-4 mr-2" />
                                Acompanhantes ({ingresso.acompanhantes.length})
                              </h4>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {ingresso.acompanhantes.map((acomp) => (
                                  <div
                                    key={acomp.id}
                                    className={`rounded-lg p-3 text-center ${acomp.qrcode ? 'bg-gray-50' : 'bg-amber-50'}`}
                                  >
                                    {acomp.qrcode ? (
                                      /* Tem QR Code - pagamento confirmado */
                                      <img
                                        src={getMediaUrl(acomp.qrcode)}
                                        alt={`QR Code - ${acomp.nome}`}
                                        className="w-20 h-20 mx-auto mb-2"
                                      />
                                    ) : (
                                      /* Sem QR Code - aguardando pagamento */
                                      <div className="w-20 h-20 mx-auto mb-2 bg-amber-100 rounded flex items-center justify-center">
                                        <Lock className="h-8 w-8 text-amber-500" />
                                      </div>
                                    )}
                                    <p className="text-sm font-medium text-gray-700 truncate">
                                      {acomp.nome}
                                    </p>
                                    {acomp.categoria && (
                                      <p className="text-xs text-gray-500">{acomp.categoria}</p>
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
                                        <a
                                          href={getMediaUrl(acomp.qrcode)}
                                          download={`ingresso-${acomp.nome.replace(/\s+/g, '-')}.png`}
                                          className="text-xs text-primary-600 hover:underline flex items-center justify-center mt-1"
                                        >
                                          <Download className="h-3 w-3 mr-1" />
                                          Salvar
                                        </a>
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
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                  <Ticket className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-700 mb-2">Nenhum ingresso</h3>
                  <p className="text-gray-600 mb-6">
                    Você ainda não está inscrito em nenhum evento.
                  </p>
                  <Link to="/eventos" className="btn-primary">
                    Ver Eventos Disponíveis
                  </Link>
                </div>
              )}

              {/* Instruções */}
              {ingressos.length > 0 && (
                <div className="mt-8 bg-blue-50 rounded-xl p-6">
                  <h3 className="font-semibold text-blue-800 mb-3 flex items-center">
                    <QrCode className="h-5 w-5 mr-2" />
                    Como usar seu ingresso
                  </h3>
                  <ul className="text-sm text-blue-700 space-y-2">
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
