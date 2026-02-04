import { useState, useEffect, useRef, useCallback } from 'react'
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode'
import { QrCode, Check, X, AlertCircle, User, Calendar, RefreshCw, UserCheck } from 'lucide-react'
import api from '../../services/api'

function Checkin() {
  const [modo, setModo] = useState('qr') // 'qr' | 'manual'
  const [scanning, setScanning] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [codigoManual, setCodigoManual] = useState('')
  const scannerRef = useRef(null)
  const html5QrcodeScannerRef = useRef(null)

  // Check-in manual
  const [eventosAndamento, setEventosAndamento] = useState([])
  const [eventoSelecionado, setEventoSelecionado] = useState('')
  const [nomeBusca, setNomeBusca] = useState('')
  const [listaInscricoes, setListaInscricoes] = useState(null) // null = não buscou, [] = vazio, [...] = resultados
  const [loadingBusca, setLoadingBusca] = useState(false)
  const [loadingCheckinId, setLoadingCheckinId] = useState(null)
  const [mensagemManual, setMensagemManual] = useState(null) // { tipo: 'sucesso'|'erro', texto }
  const debounceRef = useRef(null)

  useEffect(() => {
    return () => {
      if (html5QrcodeScannerRef.current) {
        html5QrcodeScannerRef.current.clear().catch(console.error)
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    if (modo === 'manual') {
      api.get('/eventos/em_andamento/')
        .then(({ data }) => setEventosAndamento(data || []))
        .catch(() => setEventosAndamento([]))
      setEventoSelecionado('')
      setNomeBusca('')
      setListaInscricoes(null)
      setMensagemManual(null)
    }
  }, [modo])

  // Busca automática ao selecionar evento ou ao digitar (com debounce)
  const buscarInscritos = useCallback(async () => {
    if (!eventoSelecionado) return
    const nome = nomeBusca.trim()
    if (nome.length === 1) return // backend exige mínimo 2 caracteres
    setLoadingBusca(true)
    setMensagemManual(null)
    try {
      const params = new URLSearchParams({ evento_id: eventoSelecionado })
      if (nome) params.set('nome', nome)
      const { data } = await api.get(`/inscricoes/buscar_para_checkin/?${params}`)
      setListaInscricoes(data.inscricoes || [])
      if (!(data.inscricoes?.length)) {
        setMensagemManual({ tipo: 'erro', texto: 'Nenhum participante encontrado. Digite outro nome ou apague para listar todos.' })
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao buscar. Tente novamente.'
      setMensagemManual({ tipo: 'erro', texto: msg })
      setListaInscricoes([])
    } finally {
      setLoadingBusca(false)
    }
  }, [eventoSelecionado, nomeBusca])

  useEffect(() => {
    if (modo !== 'manual' || !eventoSelecionado) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (nomeBusca.trim().length === 1) {
      setListaInscricoes([])
      setMensagemManual({ tipo: 'erro', texto: 'Digite ao menos 2 caracteres para filtrar.' })
      return
    }
    const delay = nomeBusca.trim() ? 400 : 200 // digitação = debounce; limpar = busca rápida
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      buscarInscritos()
    }, delay)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [modo, eventoSelecionado, nomeBusca, buscarInscritos])

  const iniciarScanner = () => {
    setScanning(true)
    setResultado(null)
    setErro('')

    setTimeout(() => {
      if (scannerRef.current && !html5QrcodeScannerRef.current) {
        html5QrcodeScannerRef.current = new Html5QrcodeScanner(
          "qr-reader",
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            rememberLastUsedCamera: true,
          },
          false
        )
        html5QrcodeScannerRef.current.render(
          (decodedText) => realizarCheckin(decodedText),
          () => {}
        )
      }
    }, 100)
  }

  const pararScanner = () => {
    if (html5QrcodeScannerRef.current) {
      html5QrcodeScannerRef.current.clear().catch(console.error)
      html5QrcodeScannerRef.current = null
    }
    setScanning(false)
  }

  const realizarCheckin = async (codigo) => {
    pararScanner()
    setLoading(true)
    setErro('')
    setResultado(null)
    try {
      const response = await api.post('/inscricoes/checkin/', { codigo })
      setResultado({ sucesso: true, ...response.data })
    } catch (error) {
      if (error.response?.data) {
        setResultado({ sucesso: false, ...error.response.data })
      } else {
        setErro('Erro de conexão. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCheckinManual = (e) => {
    e.preventDefault()
    if (codigoManual.trim()) {
      realizarCheckin(codigoManual.trim())
      setCodigoManual('')
    }
  }

  const darEntradaManual = async (inscricaoId) => {
    setLoadingCheckinId(inscricaoId)
    setMensagemManual(null)
    try {
      const { data } = await api.post(`/inscricoes/${inscricaoId}/marcar_presenca_manual/`)
      setMensagemManual({ tipo: 'sucesso', texto: `Check-in de ${data.participante?.nome} realizado às ${data.data_checkin}.` })
      setListaInscricoes((prev) => {
        if (!Array.isArray(prev)) return prev
        return prev.map((i) =>
          i.id === inscricaoId
            ? { ...i, presente: true, data_checkin: data.data_checkin }
            : i
        )
      })
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao registrar check-in.'
      setMensagemManual({ tipo: 'erro', texto: msg })
    } finally {
      setLoadingCheckinId(null)
    }
  }

  const novoCheckin = () => {
    setResultado(null)
    setErro('')
    iniciarScanner()
  }

  const renderResultadoQR = () => {
    if (!resultado) return null
    if (resultado.sucesso) {
      return (
        <>
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4 animate-bounce">
            <Check className="h-10 w-10 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-green-800 mb-2">Check-in Realizado!</h3>
          <p className="text-green-600 mb-6">{resultado.message}</p>
          <div className="bg-green-50 rounded-lg p-6 text-left max-w-md mx-auto mb-6">
            <div className="flex items-center mb-4">
              <User className="h-5 w-5 text-green-600 mr-3" />
              <div>
                <p className="text-sm text-green-600">Participante</p>
                <p className="font-bold text-green-800">{resultado.participante?.nome}</p>
              </div>
            </div>
            <div className="flex items-center mb-4">
              <Calendar className="h-5 w-5 text-green-600 mr-3" />
              <div>
                <p className="text-sm text-green-600">Evento</p>
                <p className="font-bold text-green-800">{resultado.evento?.titulo}</p>
                <p className="text-sm text-green-700">{resultado.evento?.data}</p>
              </div>
            </div>
            <div className="pt-4 border-t border-green-200">
              <p className="text-sm text-green-600">Check-in realizado às {resultado.data_checkin}</p>
            </div>
          </div>
        </>
      )
    }
    return (
      <>
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${resultado.ja_checkin ? 'bg-yellow-100' : 'bg-red-100'}`}>
          {resultado.ja_checkin ? <AlertCircle className="h-10 w-10 text-yellow-600" /> : <X className="h-10 w-10 text-red-600" />}
        </div>
        <h3 className={`text-2xl font-bold mb-2 ${resultado.ja_checkin ? 'text-yellow-800' : 'text-red-800'}`}>
          {resultado.ja_checkin ? 'Já Registrado' : resultado.evento_nao_iniciado ? 'Evento ainda não começou' : resultado.evento_encerrado ? 'Evento já encerrado' : resultado.evento_inativo ? 'Evento inativo' : 'Check-in Inválido'}
        </h3>
        <p className={`mb-6 ${resultado.ja_checkin ? 'text-yellow-600' : 'text-red-600'}`}>{resultado.error}</p>
        {(resultado.data_inicio_evento || resultado.data_fim_evento) && (
          <p className="text-sm text-gray-600 mb-4">
            {resultado.evento_nao_iniciado && resultado.data_inicio_evento && <>Início do evento: {resultado.data_inicio_evento}</>}
            {resultado.evento_encerrado && resultado.data_fim_evento && <>Término do evento: {resultado.data_fim_evento}</>}
          </p>
        )}
        {resultado.inscricao && (
          <div className={`rounded-lg p-6 text-left max-w-md mx-auto mb-6 ${resultado.ja_checkin ? 'bg-yellow-50' : 'bg-red-50'}`}>
            <div className="flex items-center mb-4">
              <User className={`h-5 w-5 mr-3 ${resultado.ja_checkin ? 'text-yellow-600' : 'text-red-600'}`} />
              <div>
                <p className={`text-sm ${resultado.ja_checkin ? 'text-yellow-600' : 'text-red-600'}`}>Participante</p>
                <p className={`font-bold ${resultado.ja_checkin ? 'text-yellow-800' : 'text-red-800'}`}>{resultado.inscricao.membro_nome}</p>
              </div>
            </div>
            <div className="flex items-center">
              <Calendar className={`h-5 w-5 mr-3 ${resultado.ja_checkin ? 'text-yellow-600' : 'text-red-600'}`} />
              <div>
                <p className={`text-sm ${resultado.ja_checkin ? 'text-yellow-600' : 'text-red-600'}`}>Evento</p>
                <p className={`font-bold ${resultado.ja_checkin ? 'text-yellow-800' : 'text-red-800'}`}>{resultado.inscricao.evento_titulo}</p>
              </div>
            </div>
            {resultado.ja_checkin && resultado.data_checkin && (
              <div className="pt-4 mt-4 border-t border-yellow-200">
                <p className="text-sm text-yellow-600">Check-in realizado às {resultado.data_checkin}</p>
              </div>
            )}
          </div>
        )}
      </>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
          <QrCode className="h-8 w-8 text-primary-600" />
        </div>
        <h1 className="text-3xl font-bold text-church-navy">Check-in de Evento</h1>
        <p className="text-gray-600 mt-2">
          {modo === 'qr' ? 'Escaneie o QR Code ou use o check-in manual' : 'Busque pelo evento e nome do participante'}
        </p>
      </div>

      {/* Abas: QR Code | Check-in manual */}
      <div className="flex rounded-t-xl overflow-hidden border border-gray-200 bg-gray-100 mb-0">
        <button
          type="button"
          onClick={() => setModo('qr')}
          className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 ${modo === 'qr' ? 'bg-white text-primary-700 border-b-2 border-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <QrCode className="h-5 w-5" />
          QR Code
        </button>
        <button
          type="button"
          onClick={() => setModo('manual')}
          className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 ${modo === 'manual' ? 'bg-white text-primary-700 border-b-2 border-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <UserCheck className="h-5 w-5" />
          Check-in manual
        </button>
      </div>

      <div className="bg-white rounded-b-xl rounded-tr-xl shadow-lg p-6 mb-6 border border-t-0 border-gray-200">
        {modo === 'qr' && (
          <>
            {!scanning && !resultado && !loading && (
              <div className="text-center">
                <button
                  onClick={iniciarScanner}
                  className="btn-primary inline-flex items-center text-lg px-8 py-4"
                >
                  <QrCode className="h-6 w-6 mr-3" />
                  Iniciar Scanner
                </button>
                <div className="mt-8 pt-8 border-t">
                  <p className="text-gray-600 mb-4">Ou digite o código manualmente:</p>
                  <form onSubmit={handleCheckinManual} className="flex gap-3 max-w-md mx-auto">
                    <input
                      type="text"
                      value={codigoManual}
                      onChange={(e) => setCodigoManual(e.target.value)}
                      placeholder="Cole o código aqui..."
                      className="input-field flex-1"
                    />
                    <button type="submit" className="btn-primary">Verificar</button>
                  </form>
                </div>
              </div>
            )}

            {scanning && (
              <div>
                <div id="qr-reader" ref={scannerRef} className="mx-auto" style={{ maxWidth: '500px' }} />
                <div className="text-center mt-4">
                  <button type="button" onClick={pararScanner} className="btn-outline inline-flex items-center">
                    <X className="h-5 w-5 mr-2" />
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4" />
                <p className="text-gray-600">Processando check-in...</p>
              </div>
            )}

            {erro && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
                <p className="text-red-600 mb-6">{erro}</p>
                <button type="button" onClick={novoCheckin} className="btn-primary inline-flex items-center">
                  <RefreshCw className="h-5 w-5 mr-2" />
                  Tentar Novamente
                </button>
              </div>
            )}

            {resultado && (
              <div className="text-center py-6">
                {renderResultadoQR()}
                <button type="button" onClick={novoCheckin} className="btn-primary inline-flex items-center mt-4">
                  <QrCode className="h-5 w-5 mr-2" />
                  Próximo Check-in
                </button>
              </div>
            )}
          </>
        )}

        {modo === 'manual' && (
          <div>
            <div className="space-y-4">
              <div>
                <label className="label">Evento em andamento</label>
                <select
                  value={eventoSelecionado}
                  onChange={(e) => { setEventoSelecionado(e.target.value); setMensagemManual(null) }}
                  className="input-field w-full"
                >
                  <option value="">Selecione o evento</option>
                  {eventosAndamento.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.titulo} {ev.data_inicio_formatada ? `— ${ev.data_inicio_formatada}` : ''}
                    </option>
                  ))}
                </select>
                {eventosAndamento.length === 0 && (
                  <p className="text-sm text-amber-600 mt-1">Nenhum evento em andamento no momento.</p>
                )}
              </div>
              <div>
                <label className="label">Nome do participante (opcional)</label>
                <input
                  type="text"
                  value={nomeBusca}
                  onChange={(e) => setNomeBusca(e.target.value)}
                  placeholder="Digite o nome para filtrar (mín. 2 letras). Deixe em branco para listar todos."
                  className="input-field w-full"
                />
                {loadingBusca && (
                  <p className="text-sm text-gray-500 mt-1">Buscando...</p>
                )}
              </div>
            </div>

            {mensagemManual && (
              <div className={`mt-4 p-4 rounded-lg ${mensagemManual.tipo === 'sucesso' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {mensagemManual.texto}
              </div>
            )}

            {listaInscricoes && listaInscricoes.length > 0 && (
              <div className="mt-6 border-t pt-6">
                <h3 className="font-semibold text-church-navy mb-3">Inscritos</h3>
                <ul className="space-y-2 max-h-80 overflow-y-auto">
                  {listaInscricoes.map((ins) => (
                    <li
                      key={ins.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {ins.membro_nome}
                          {ins.is_acompanhante && <span className="text-gray-500 text-sm ml-1">(acompanhante)</span>}
                        </p>
                        {ins.presente ? (
                          <p className="text-sm text-green-600 flex items-center gap-1">
                            <Check className="h-4 w-4" />
                            Check-in realizado às {ins.data_checkin}
                          </p>
                        ) : null}
                      </div>
                      {!ins.presente && (
                        <button
                          type="button"
                          disabled={loadingCheckinId === ins.id}
                          onClick={() => darEntradaManual(ins.id)}
                          className="btn-primary flex-shrink-0 py-2 px-4 text-sm disabled:opacity-50"
                        >
                          {loadingCheckinId === ins.id ? 'Registrando...' : 'Dar entrada'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {listaInscricoes && listaInscricoes.length === 0 && !loadingBusca && eventoSelecionado && (
              <p className="mt-6 text-gray-500 text-center">Nenhum participante encontrado com esse filtro.</p>
            )}
          </div>
        )}
      </div>

      <div className="bg-blue-50 rounded-xl p-6">
        <h3 className="font-semibold text-blue-800 mb-3">Instruções</h3>
        <ul className="text-sm text-blue-700 space-y-2">
          {modo === 'qr' ? (
            <>
              <li>1. Clique em &quot;Iniciar Scanner&quot; e aponte para o QR Code da inscrição</li>
              <li>2. Ou use o <strong>Check-in manual</strong> se a pessoa não tiver o QR Code</li>
            </>
          ) : (
            <>
              <li>1. Selecione o evento que está ocorrendo agora</li>
              <li>2. Digite o nome para filtrar (a lista atualiza sozinha). Deixe em branco para listar todos</li>
              <li>3. Clique em &quot;Dar entrada&quot; na pessoa correta</li>
            </>
          )}
        </ul>
      </div>
    </div>
  )
}

export default Checkin
