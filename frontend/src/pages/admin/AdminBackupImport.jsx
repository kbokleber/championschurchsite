import { useEffect, useState } from 'react'
import { DatabaseBackup, Upload, AlertTriangle, Loader2, Cloud, HardDrive } from 'lucide-react'
import api, { formatApiError, parseApiErrorDetail, resolveBackupApiBaseUrl } from '../../services/api'
import ConfirmModal from '../../components/ConfirmModal'
import DriveBrowseModal from '../../components/admin/DriveBrowseModal'
import {
  baixarBackupDoDrive,
  consumirRetornoOAuthNoHash,
  DRIVE_OAUTH_PENDING_KEY,
  solicitarTokenGoogleComFallback,
  solicitarTokenGooglePopup,
  uploadBackupParaDrive,
  validarAcessoDrive,
} from '../../utils/googleDriveClient'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const BACKUP_API_BASE = resolveBackupApiBaseUrl()
const MAIN_API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const BACKUP_API_URL = (import.meta.env.VITE_BACKUP_API_URL || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const backupViaServidorRemoto = Boolean(
  BACKUP_API_URL && MAIN_API_URL && BACKUP_API_URL !== MAIN_API_URL
)

function AdminBackupImport() {
  const [exportandoLocal, setExportandoLocal] = useState(false)
  const [salvandoDrive, setSalvandoDrive] = useState(false)
  const [autenticandoGoogle, setAutenticandoGoogle] = useState(false)
  const [importando, setImportando] = useState(false)
  const [arquivo, setArquivo] = useState(null)
  const [mensagem, setMensagem] = useState(null)
  const [erro, setErro] = useState(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
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
      if (!sessionStorage.getItem(DRIVE_OAUTH_PENDING_KEY)) {
        setAutenticandoGoogle(false)
        return
      }
      sessionStorage.removeItem(DRIVE_OAUTH_PENDING_KEY)
      setAutenticandoGoogle(false)
      setErro(
        'O login Google não redirecionou. Recarregue a página e tente de novo. ' +
        'Confira no Google Cloud a URI de redirecionamento: ' +
        `${window.location.origin}/admin/backup-import`
      )
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
        baseURL: BACKUP_API_BASE,
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
        setMensagem(
          'Abrindo login Google nesta aba. Se aparecer "app não verificado", clique em Avançado e continue.'
        )
        liberarOAuthSeTravado()
        return
      }
      await abrirDriveModalAposLogin(accessToken, 'export')
    } catch (error) {
      setErro(error.message || formatApiError(error, 'Falha ao entrar no Google.'))
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
        setMensagem(
          'Abrindo login Google nesta aba. Se aparecer "app não verificado", clique em Avançado e continue.'
        )
        liberarOAuthSeTravado()
        return
      }
      await abrirDriveModalAposLogin(accessToken, 'import')
    } catch (error) {
      setErro(error.message || 'Falha ao entrar no Google.')
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
          baseURL: BACKUP_API_BASE,
          timeout: 600000,
        })
      } else {
        if (!arquivo) {
          throw new Error('Selecione um arquivo .tar.gz para importar.')
        }
        const formData = new FormData()
        formData.append('arquivo', arquivo)
        response = await api.post('/admin/backup/importar/', formData, {
          baseURL: BACKUP_API_BASE,
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
      setErro(formatApiError(error, 'Falha ao importar backup.'))
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup e Restore</h1>
        <p className="text-gray-600">
          Exporte ou restaure backup completo (banco + mídia).
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Atenção</p>
            <p className="text-sm text-amber-700">
              O restore substitui os dados atuais (PostgreSQL + media). Faça backup antes de importar.
            </p>
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
              disabled={exportandoLocal || salvandoDrive || importando}
              className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {exportandoLocal ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
              Baixar localmente
            </button>
            <button
              type="button"
              onClick={handleExportarDrive}
              disabled={exportandoLocal || salvandoDrive || importando || autenticandoGoogle || !googlePronto}
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
                disabled={importando || exportandoLocal || salvandoDrive}
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
                disabled={importando || exportandoLocal || salvandoDrive || autenticandoGoogle || !googlePronto}
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
              disabled={importando || exportandoLocal || salvandoDrive}
            />
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleSelecionarArquivoDrive}
                disabled={importando || exportandoLocal || salvandoDrive || autenticandoGoogle || !googlePronto}
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
            disabled={importando || exportandoLocal || salvandoDrive}
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
