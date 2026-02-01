import { useState, useEffect, useRef } from 'react'
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode'
import { QrCode, Check, X, AlertCircle, User, Calendar, MapPin, RefreshCw } from 'lucide-react'
import api from '../../services/api'

function Checkin() {
  const [scanning, setScanning] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [codigoManual, setCodigoManual] = useState('')
  const scannerRef = useRef(null)
  const html5QrcodeScannerRef = useRef(null)

  useEffect(() => {
    return () => {
      // Limpar scanner ao desmontar
      if (html5QrcodeScannerRef.current) {
        html5QrcodeScannerRef.current.clear().catch(console.error)
      }
    }
  }, [])

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
          (decodedText) => {
            // QR Code lido com sucesso
            realizarCheckin(decodedText)
          },
          (errorMessage) => {
            // Erro durante scan (ignoramos erros de leitura contínua)
          }
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
    // Parar scanner durante o processamento
    pararScanner()
    setLoading(true)
    setErro('')
    setResultado(null)

    try {
      const response = await api.post('/inscricoes/checkin/', { codigo })
      setResultado({
        sucesso: true,
        ...response.data
      })
    } catch (error) {
      console.error('Erro no check-in:', error)
      if (error.response?.data) {
        setResultado({
          sucesso: false,
          ...error.response.data
        })
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

  const novoCheckin = () => {
    setResultado(null)
    setErro('')
    iniciarScanner()
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
          <QrCode className="h-8 w-8 text-primary-600" />
        </div>
        <h1 className="text-3xl font-bold text-church-navy">Check-in de Evento</h1>
        <p className="text-gray-600 mt-2">
          Escaneie o QR Code da inscrição para confirmar a presença
        </p>
      </div>

      {/* Scanner Area */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        {!scanning && !resultado && !loading && (
          <div className="text-center">
            <button
              onClick={iniciarScanner}
              className="btn-primary inline-flex items-center text-lg px-8 py-4"
            >
              <QrCode className="h-6 w-6 mr-3" />
              Iniciar Scanner
            </button>
            
            {/* Check-in Manual */}
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
                <button type="submit" className="btn-primary">
                  Verificar
                </button>
              </form>
            </div>
          </div>
        )}

        {scanning && (
          <div>
            <div 
              id="qr-reader" 
              ref={scannerRef}
              className="mx-auto"
              style={{ maxWidth: '500px' }}
            />
            <div className="text-center mt-4">
              <button
                onClick={pararScanner}
                className="btn-outline inline-flex items-center"
              >
                <X className="h-5 w-5 mr-2" />
                Cancelar
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Processando check-in...</p>
          </div>
        )}

        {erro && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-red-800 mb-2">Erro</h3>
            <p className="text-red-600 mb-6">{erro}</p>
            <button onClick={novoCheckin} className="btn-primary inline-flex items-center">
              <RefreshCw className="h-5 w-5 mr-2" />
              Tentar Novamente
            </button>
          </div>
        )}

        {resultado && (
          <div className="text-center py-6">
            {resultado.sucesso ? (
              <>
                {/* Sucesso */}
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4 animate-bounce">
                  <Check className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-green-800 mb-2">
                  Check-in Realizado!
                </h3>
                <p className="text-green-600 mb-6">{resultado.message}</p>
                
                {/* Dados do Participante */}
                <div className="bg-green-50 rounded-lg p-6 text-left max-w-md mx-auto mb-6">
                  <div className="flex items-center mb-4">
                    <User className="h-5 w-5 text-green-600 mr-3" />
                    <div>
                      <p className="text-sm text-green-600">Participante</p>
                      <p className="font-bold text-green-800">{resultado.participante?.nome}</p>
                      <p className="text-sm text-green-700">{resultado.participante?.email}</p>
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
                    <p className="text-sm text-green-600">
                      Check-in realizado às {resultado.data_checkin}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Erro ou já fez check-in */}
                <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
                  resultado.ja_checkin ? 'bg-yellow-100' : 'bg-red-100'
                }`}>
                  {resultado.ja_checkin ? (
                    <AlertCircle className="h-10 w-10 text-yellow-600" />
                  ) : (
                    <X className="h-10 w-10 text-red-600" />
                  )}
                </div>
                <h3 className={`text-2xl font-bold mb-2 ${
                  resultado.ja_checkin ? 'text-yellow-800' : 'text-red-800'
                }`}>
                  {resultado.ja_checkin ? 'Já Registrado' : 'Check-in Inválido'}
                </h3>
                <p className={`mb-6 ${
                  resultado.ja_checkin ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {resultado.error}
                </p>
                
                {/* Mostrar dados se disponíveis */}
                {resultado.inscricao && (
                  <div className={`rounded-lg p-6 text-left max-w-md mx-auto mb-6 ${
                    resultado.ja_checkin ? 'bg-yellow-50' : 'bg-red-50'
                  }`}>
                    <div className="flex items-center mb-4">
                      <User className={`h-5 w-5 mr-3 ${
                        resultado.ja_checkin ? 'text-yellow-600' : 'text-red-600'
                      }`} />
                      <div>
                        <p className={`text-sm ${resultado.ja_checkin ? 'text-yellow-600' : 'text-red-600'}`}>
                          Participante
                        </p>
                        <p className={`font-bold ${resultado.ja_checkin ? 'text-yellow-800' : 'text-red-800'}`}>
                          {resultado.inscricao.membro_nome}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Calendar className={`h-5 w-5 mr-3 ${
                        resultado.ja_checkin ? 'text-yellow-600' : 'text-red-600'
                      }`} />
                      <div>
                        <p className={`text-sm ${resultado.ja_checkin ? 'text-yellow-600' : 'text-red-600'}`}>
                          Evento
                        </p>
                        <p className={`font-bold ${resultado.ja_checkin ? 'text-yellow-800' : 'text-red-800'}`}>
                          {resultado.inscricao.evento_titulo}
                        </p>
                      </div>
                    </div>
                    {resultado.ja_checkin && resultado.data_checkin && (
                      <div className={`pt-4 mt-4 border-t ${
                        resultado.ja_checkin ? 'border-yellow-200' : 'border-red-200'
                      }`}>
                        <p className="text-sm text-yellow-600">
                          Check-in realizado às {resultado.data_checkin}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            
            <button onClick={novoCheckin} className="btn-primary inline-flex items-center">
              <QrCode className="h-5 w-5 mr-2" />
              Próximo Check-in
            </button>
          </div>
        )}
      </div>

      {/* Instruções */}
      <div className="bg-blue-50 rounded-xl p-6">
        <h3 className="font-semibold text-blue-800 mb-3">Instruções</h3>
        <ul className="text-sm text-blue-700 space-y-2">
          <li>1. Clique em "Iniciar Scanner" para ativar a câmera</li>
          <li>2. Aponte a câmera para o QR Code da inscrição</li>
          <li>3. O check-in será realizado automaticamente</li>
          <li>4. Verifique os dados do participante na tela</li>
        </ul>
      </div>
    </div>
  )
}

export default Checkin
