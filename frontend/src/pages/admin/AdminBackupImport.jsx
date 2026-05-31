import { useEffect, useState } from 'react'
import { DatabaseBackup, Upload, AlertTriangle, Loader2, Cloud, HardDrive, Settings2, FileJson } from 'lucide-react'
import api, {
  formatApiError,
  parseApiErrorDetail,
  resolveBackupExportApiBaseUrl,
  resolveBackupImportApiBaseUrl,
} from '../../services/api'
import ConfirmModal from '../../components/ConfirmModal'
import DriveBrowseModal from '../../components/admin/DriveBrowseModal'
import {
  baixarBackupDoDrive,
  consumirRetornoOAuthNoHash,
  DRIVE_OAUTH_PENDING_KEY,
  isGoogleOAuthCancelado,
  solicitarTokenGoogleComFallback,
  solicitarTokenGooglePopup,
  uploadBackupParaDrive,
  validarAcessoDrive,
} from '../../utils/googleDriveClient'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const BACKUP_EXPORT_API_BASE = resolveBackupExportApiBaseUrl()
const BACKUP_IMPORT_API_BASE = resolveBackupImportApiBaseUrl()
const MAIN_API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const BACKUP_API_URL = (import.meta.env.VITE_BACKUP_API_URL || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const backupViaServidorRemoto = Boolean(
  BACKUP_API_URL && MAIN_API_URL && BACKUP_API_URL !== MAIN_API_URL
)
const importViaBackendLocal = BACKUP_IMPORT_API_BASE.includes('127.0.0.1:8000') || BACKUP_IMPORT_API_BASE.includes('localhost:8000')

function AdminBackupImport() {
  const [exportandoLocal, setExportandoLocal] = useState(false)
  const [salvandoDrive, setSalvandoDrive] = useState(false)
  const [autenticandoGoogle, setAutenticandoGoogle] = useState(false)
  const [importando, setImportando] = useState(false)
  const [arquivo, setArquivo] = useState(null)
  const [mensagem, setMensagem] = useState(null)
  const [erro, setErro] = useState(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [exportandoConfig, setExportandoConfig] = useState(false)
  const [importandoConfig, setImportandoConfig] = useState(false)
  const [arquivoConfig, setArquivoConfig] = useState(null)
  const [showConfigImportConfirm, setShowConfigImportConfirm] = useState(false)
  const [importOrigem, setImportOrigem] = useState('local')
  const [driveFileId, setDriveFileId] = useState('')
  const [driveFileName, setDriveFileName] = useState('')
  const [driveModal, setDriveModal] = useState({
    open: false,
    mode: 'folder',
    accessToken: '',
  })

  const googlePronto = Boolean(GOOGLE_CLIENT_ID)

  const abrirDriveModalAposLogin = async (accessToken, intent) => {
    await validarAcessoDrive(accessToken)
    setDriveModal({
      open: true,
      mode: intent === 'import' ? 'file' : 'folder',
      accessToken,
    })
  }

  const liberarOAuthSeTravado = () => {
    window.setTimeout(() => {
      sessionStorage.removeItem(DRIVE_OAUTH_PENDING_KEY)
      setAutenticandoGoogle(false)
    }, 5000)
  }

  useEffect(() => {
    if (!googlePronto) return undefined

    const retornoHash = consumirRetornoOAuthNoHash()
    if (retornoHash?.error) {
      setErro(retornoHash.error)
      setAutenticandoGoogle(false)
      return undefined
    }
    if (retornoHash?.accessToken) {
      setAutenticandoGoogle(true)
      abrirDriveModalAposLogin(retornoHash.accessToken, retornoHash.intent)
        .catch((error) => setErro(error.message || 'Falha ao validar acesso ao Google Drive.'))
        .finally(() => setAutenticandoGoogle(false))
    }

    return undefined
  }, [googlePronto])

  const limparFeedback = () => {
    setMensagem(null)
    setErro(null)
  }

  const extrairNomeBackup = (response, fallback) => {
    const disposition = response.headers['content-disposition'] || ''
    const match = disposition.match(/filename="?([^"]+)"?/)
    return match?.[1] || fallback
  }

  const gerarBackupBlob = async () => {
    try {
      const response = await api.post('/admin/backup/exportar/', {}, {
        baseURL: BACKUP_EXPORT_API_BASE,
        responseType: 'blob',
        timeout: 600000,
      })
      const contentType = response.headers['content-type'] || ''
      if (contentType.includes('application/json')) {
        const text = await response.data.text()
        const data = JSON.parse(text)
        throw new Error(data.detail || 'Falha ao exportar backup.')
      }
      const fileName = extrairNomeBackup(
        response,
        `champions_backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.tar.gz`
      )
      return { blob: response.data, fileName }
    } catch (error) {
      if (error.response?.status === 401 && backupViaServidorRemoto) {
        throw new Error(
          'Sessão inválida no servidor de backup. Use VITE_API_URL=https://dev.championschurch.com.br, reinicie o Vite e faça login novamente.'
        )
      }
      const detail = await parseApiErrorDetail(
        error,
        'Não foi possível gerar o backup. Exportação exige backend com PostgreSQL (use VITE_BACKUP_API_URL).'
      )
      throw new Error(detail)
    }
  }

  const handleExportarDownload = async () => {
    limparFeedback()
    setExportandoLocal(true)
    try {
      const { blob, fileName } = await gerarBackupBlob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setMensagem('Backup gerado e download iniciado com sucesso.')
    } catch (error) {
      setErro(error.message || formatApiError(error, 'Não foi possível gerar o backup.'))
    } finally {
      setExportandoLocal(false)
    }
  }

  const handleExportarDrive = async () => {
    limparFeedback()
    if (!googlePronto) {
      setErro('Configure VITE_GOOGLE_CLIENT_ID no build do frontend (Coolify) e faça rebuild.')
      return
    }
    setAutenticandoGoogle(true)
    let redirecionando = false
    try {
      const accessToken = await solicitarTokenGoogleComFallback(GOOGLE_CLIENT_ID, 'export')
      if (!accessToken) {
        redirecionando = true
        liberarOAuthSeTravado()
        return
      }
      await abrirDriveModalAposLogin(accessToken, 'export')
    } catch (error) {
      if (!isGoogleOAuthCancelado(error)) {
        setErro(error.message || formatApiError(error, 'Falha ao entrar no Google.'))
      }
    } finally {
      if (!redirecionando) setAutenticandoGoogle(false)
    }
  }

  const concluirExportDrive = async (pasta) => {
    const accessToken = driveModal.accessToken
    setDriveModal((m) => ({ ...m, open: false }))
    setSalvandoDrive(true)
    try {
      const { blob, fileName } = await gerarBackupBlob()
      const uploaded = await uploadBackupParaDrive(accessToken, pasta.id, fileName, blob)
      setMensagem(`Backup salvo no seu Google Drive: ${uploaded.name} (pasta ${pasta.name}).`)
    } catch (error) {
      setErro(error.message || formatApiError(error, error.message || 'Falha ao exportar para o Google Drive.'))
    } finally {
      setSalvandoDrive(false)
    }
  }

  const handleSelecionarArquivoDrive = async () => {
    limparFeedback()
    if (!googlePronto) {
      setErro('Configure VITE_GOOGLE_CLIENT_ID no build do frontend (Coolify) e faça rebuild.')
      return
    }
    setAutenticandoGoogle(true)
    let redirecionando = false
    try {
      const accessToken = await solicitarTokenGoogleComFallback(GOOGLE_CLIENT_ID, 'import')
      if (!accessToken) {
        redirecionando = true
        liberarOAuthSeTravado()
        return
      }
      await abrirDriveModalAposLogin(accessToken, 'import')
    } catch (error) {
      if (!isGoogleOAuthCancelado(error)) {
        setErro(error.message || 'Falha ao entrar no Google.')
      }
    } finally {
      if (!redirecionando) setAutenticandoGoogle(false)
    }
  }

  const executarImportacao = async () => {
    limparFeedback()
    setImportando(true)
    try {
      let response
      if (importOrigem === 'drive') {
        if (!driveFileId) {
          throw new Error('Selecione um arquivo .tar.gz no Google Drive.')
        }
        if (!googlePronto) {
          throw new Error('Google Drive não configurado no frontend.')
        }
        const accessToken = await solicitarTokenGooglePopup(GOOGLE_CLIENT_ID)
        const { blob, name } = await baixarBackupDoDrive(accessToken, driveFileId)
        const formData = new FormData()
        formData.append('arquivo', blob, name)
        response = await api.post('/admin/backup/importar/', formData, {
          baseURL: BACKUP_IMPORT_API_BASE,
          timeout: 600000,
        })
      } else {
        if (!arquivo) {
          throw new Error('Selecione um arquivo .tar.gz para importar.')
        }
        const formData = new FormData()
        formData.append('arquivo', arquivo)
        response = await api.post('/admin/backup/importar/', formData, {
          baseURL: BACKUP_IMPORT_API_BASE,
          timeout: 600000,
        })
      }

      const detail = response?.data?.detail || 'Backup importado com sucesso.'
      const media = response?.data?.media
      setMensagem(
        media
          ? `${detail} (confira no admin se as fotos da loja abrem.)`
          : detail
      )
      setArquivo(null)
      setDriveFileId('')
      setDriveFileName('')
      setShowImportConfirm(false)
    } catch (error) {
      if (error.response?.status === 401 && importViaBackendLocal) {
        setErro(
          'O import usa o backend local (localhost:8000), mas você está logado no servidor remoto. '
          + 'Comente VITE_API_URL em frontend/.env.local, reinicie o Vite, faça login de novo '
          + '(se necessário: python manage.py createsuperuser no backend) e tente o import.'
        )
      } else {
        setErro(formatApiError(error, 'Falha ao importar backup.'))
      }
      setShowImportConfirm(false)
    } finally {
      setImportando(false)
    }
  }

  const handleSubmitImport = (e) => {
    e.preventDefault()
    limparFeedback()
    if (importOrigem === 'drive') {
      if (!driveFileId) {
        setErro('Selecione um arquivo .tar.gz no Google Drive.')
        return
      }
    } else if (!arquivo) {
      setErro('Selecione um arquivo .tar.gz para importar.')
      return
    }
    setShowImportConfirm(true)
  }

  const handleExportarConfigIntegracoes = async () => {
    limparFeedback()
    setExportandoConfig(true)
    try {
      const response = await api.get('/admin/config/integracoes/exportar/', {
        baseURL: BACKUP_IMPORT_API_BASE,
        responseType: 'blob',
        timeout: 60000,
      })
      const fileName = extrairNomeBackup(
        response,
        `config_integracoes_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
      )
      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setMensagem('Configurações de integração exportadas. Guarde o arquivo antes de restaurar um backup de outro ambiente.')
    } catch (error) {
      if (error.response?.status === 401 && importViaBackendLocal) {
        setErro(
          'Export usa o backend local (localhost:8000). Faça login com usuário do backend local ou ajuste VITE_API_URL.'
        )
      } else {
        const detail = await parseApiErrorDetail(error, 'Falha ao exportar configurações de integração.')
        setErro(detail)
      }
    } finally {
      setExportandoConfig(false)
    }
  }

  const executarImportacaoConfig = async () => {
    limparFeedback()
    setImportandoConfig(true)
    try {
      if (!arquivoConfig) {
        throw new Error('Selecione um arquivo .json de configurações.')
      }
      const formData = new FormData()
      formData.append('arquivo', arquivoConfig)
      const response = await api.post('/admin/config/integracoes/importar/', formData, {
        baseURL: BACKUP_IMPORT_API_BASE,
        timeout: 60000,
      })
      const detail = response?.data?.detail || 'Configurações importadas com sucesso.'
      setMensagem(detail)
      setArquivoConfig(null)
      setShowConfigImportConfirm(false)
    } catch (error) {
      if (error.response?.status === 401 && importViaBackendLocal) {
        setErro(
          'O import de config usa o backend local (localhost:8000). Faça login com usuário do backend local.'
        )
      } else {
        setErro(formatApiError(error, 'Falha ao importar configurações de integração.'))
      }
      setShowConfigImportConfirm(false)
    } finally {
      setImportandoConfig(false)
    }
  }

  const handleSubmitConfigImport = (e) => {
    e.preventDefault()
    limparFeedback()
    if (!arquivoConfig) {
      setErro('Selecione um arquivo .json de configurações.')
      return
    }
    setShowConfigImportConfirm(true)
  }

  const operacaoEmAndamento = exportandoLocal || salvandoDrive || importando || exportandoConfig || importandoConfig

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup e Restore</h1>
        <p className="text-gray-600">
          Exporte ou restaure backup completo (banco + mídia) e gerencie credenciais de integração por ambiente.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Atenção</p>
            <p className="text-sm text-amber-700">
              O restore substitui os dados atuais (banco + media). Faça backup antes de importar.
            </p>
            {import.meta.env.DEV && (
              <p className="text-xs text-amber-600 mt-2">
                Export: <code className="bg-amber-100 px-1 rounded">{BACKUP_EXPORT_API_BASE}</code>
                {' · '}
                Import: <code className="bg-amber-100 px-1 rounded">{BACKUP_IMPORT_API_BASE}</code>
                {importViaBackendLocal
                  ? ' — import no seu PC (localhost:8000). Faça login com usuário do backend local.'
                  : BACKUP_API_URL
                    ? ' — import remoto (VITE_API_URL). O restore altera esse servidor.'
                    : ' — backend local. No Windows use CHURCH_USE_SQLITE=1 no backend/.env.'}
              </p>
            )}
          </div>
        </div>
      </div>

      {mensagem && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
          {mensagem}
        </div>
      )}
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {erro}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900">Configurações de integração</h2>
        </div>
        <p className="text-sm text-gray-600">
          Exporte Mercado Pago, WhatsApp/Evolution (URL, token da instância,{' '}
          <strong>GLOBAL_API_KEY</strong> do Evolution Go, instâncias eventos/loja e templates) e webhooks deste
          ambiente. Após restaurar um backup de produção, importe o JSON salvo para voltar às credenciais de dev sem
          perder os dados reais.
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Fluxo recomendado</p>
          <ol className="mt-1 list-decimal list-inside space-y-0.5">
            <li>Exportar config de integrações do ambiente atual (ex.: dev)</li>
            <li>Importar backup completo de produção</li>
            <li>Importar o JSON exportado no passo 1</li>
          </ol>
          <p className="mt-2 text-amber-800">
            O arquivo JSON contém tokens em texto claro. Não commite nem compartilhe publicamente.
          </p>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <button
            type="button"
            onClick={handleExportarConfigIntegracoes}
            disabled={operacaoEmAndamento}
            className="btn-secondary inline-flex items-center justify-center gap-2 disabled:opacity-60 shrink-0"
          >
            {exportandoConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
            Exportar config (integrações)
          </button>
          <form onSubmit={handleSubmitConfigImport} className="flex flex-col sm:flex-row gap-3 flex-1">
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => setArquivoConfig(event.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
              disabled={operacaoEmAndamento}
            />
            <button
              type="submit"
              disabled={operacaoEmAndamento}
              className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-60 shrink-0"
            >
              {importandoConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importandoConfig ? 'Importando...' : 'Importar config'}
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
          <div className="flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Gerar backup completo</h2>
          </div>
          <p className="text-sm text-gray-600">
            Gera um `.tar.gz` com dump do PostgreSQL e pasta de mídia.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleExportarDownload}
              disabled={operacaoEmAndamento}
              className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {exportandoLocal ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
              Baixar localmente
            </button>
            <button
              type="button"
              onClick={handleExportarDrive}
              disabled={operacaoEmAndamento || autenticandoGoogle || !googlePronto}
              className="btn-secondary inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {salvandoDrive || autenticandoGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
              {autenticandoGoogle ? 'Abrindo Google...' : salvandoDrive ? 'Salvando...' : 'Salvar no meu Google Drive'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmitImport} className="bg-white rounded-xl shadow-md p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Importar backup completo</h2>
          </div>
          <p className="text-sm text-gray-600">
            Restaure um backup `.tar.gz` gerado pelo sistema (local ou Google Drive).
          </p>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="importOrigem"
                value="local"
                checked={importOrigem === 'local'}
                onChange={() => {
                  setImportOrigem('local')
                  setDriveFileId('')
                  setDriveFileName('')
                }}
                disabled={operacaoEmAndamento}
              />
              Arquivo local
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="importOrigem"
                value="drive"
                checked={importOrigem === 'drive'}
                onChange={() => {
                  setImportOrigem('drive')
                  setArquivo(null)
                }}
                disabled={operacaoEmAndamento || autenticandoGoogle || !googlePronto}
              />
              Meu Google Drive
            </label>
          </div>

          {importOrigem === 'local' ? (
            <input
              type="file"
              accept=".tar.gz,.tgz,application/gzip"
              onChange={(event) => setArquivo(event.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
              disabled={operacaoEmAndamento}
            />
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleSelecionarArquivoDrive}
                disabled={operacaoEmAndamento || autenticandoGoogle || !googlePronto}
                className="btn-secondary inline-flex items-center gap-2 disabled:opacity-60"
              >
                {autenticandoGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                {autenticandoGoogle ? 'Abrindo Google...' : 'Escolher arquivo no meu Drive'}
              </button>
              {driveFileName && (
                <p className="text-sm text-gray-600 truncate">Selecionado: {driveFileName}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={operacaoEmAndamento}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
          >
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importando ? 'Importando...' : 'Importar backup'}
          </button>
        </form>
      </div>

      <DriveBrowseModal
        open={driveModal.open}
        mode={driveModal.mode}
        accessToken={driveModal.accessToken}
        onClose={() => {
          setDriveModal((m) => ({ ...m, open: false }))
          setSalvandoDrive(false)
          setAutenticandoGoogle(false)
        }}
        onSelectFolder={concluirExportDrive}
        onSelectFile={(arq) => {
          setDriveFileId(arq.id)
          setDriveFileName(arq.name)
          setImportOrigem('drive')
          setArquivo(null)
          setDriveModal((m) => ({ ...m, open: false }))
          setMensagem(`Arquivo selecionado no seu Drive: ${arq.name}`)
        }}
      />

      <ConfirmModal
        isOpen={showConfigImportConfirm}
        onClose={() => !importandoConfig && setShowConfigImportConfirm(false)}
        onConfirm={executarImportacaoConfig}
        type="warning"
        title="Importar configurações de integração"
        message="Isso substituirá Mercado Pago, WhatsApp/Evolution e webhooks atuais pelos valores do arquivo JSON."
        confirmText="Importar config"
        cancelText="Cancelar"
        loading={importandoConfig}
      />

      <ConfirmModal
        isOpen={showImportConfirm}
        onClose={() => !importando && setShowImportConfirm(false)}
        onConfirm={executarImportacao}
        type="danger"
        title="Confirmação de Restore"
        message="Este processo é irreversível e substituirá o banco PostgreSQL e os arquivos de mídia atuais."
        confirmText="Aceitar e importar"
        cancelText="Cancelar"
        loading={importando}
      >
        <p className="text-sm text-red-600 text-center font-medium">
          Confirme apenas se você tem certeza.
        </p>
      </ConfirmModal>
    </div>
  )
}

export default AdminBackupImport
