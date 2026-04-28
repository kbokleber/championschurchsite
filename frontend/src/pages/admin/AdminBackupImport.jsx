import { useState } from 'react'
import { DatabaseBackup, Upload, AlertTriangle, Loader2 } from 'lucide-react'
import api, { formatApiError } from '../../services/api'

function AdminBackupImport() {
  const [exportando, setExportando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [arquivo, setArquivo] = useState(null)
  const [mensagem, setMensagem] = useState(null)
  const [erro, setErro] = useState(null)

  const limparFeedback = () => {
    setMensagem(null)
    setErro(null)
  }

  const handleExportar = async () => {
    limparFeedback()
    setExportando(true)
    try {
      const response = await api.post('/admin/backup/exportar/', {}, { responseType: 'blob' })
      const contentType = response.headers['content-type'] || ''
      if (contentType.includes('application/json')) {
        const text = await response.data.text()
        const data = JSON.parse(text)
        throw new Error(data.detail || 'Falha ao exportar backup.')
      }

      const disposition = response.headers['content-disposition'] || ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const fileName = match?.[1] || `champions_backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.tar.gz`

      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setMensagem('Backup gerado e download iniciado com sucesso.')
    } catch (error) {
      const fallback = error.message || 'Não foi possível gerar o backup.'
      setErro(formatApiError(error, fallback))
    } finally {
      setExportando(false)
    }
  }

  const handleImportar = async (e) => {
    e.preventDefault()
    limparFeedback()

    if (!arquivo) {
      setErro('Selecione um arquivo .tar.gz para importar.')
      return
    }

    const confirmar = window.confirm(
      'Esta ação irá substituir o banco PostgreSQL e os arquivos de mídia atuais. Deseja continuar?'
    )
    if (!confirmar) return

    setImportando(true)
    try {
      const formData = new FormData()
      formData.append('arquivo', arquivo)
      const response = await api.post('/admin/backup/importar/', formData)
      setMensagem(response?.data?.detail || 'Backup importado com sucesso.')
      setArquivo(null)
    } catch (error) {
      setErro(formatApiError(error, 'Falha ao importar backup.'))
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup e Restore</h1>
        <p className="text-gray-600">Ferramenta administrativa para backup completo do banco e dos arquivos de mídia.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Atenção</p>
            <p className="text-sm text-amber-700">
              O restore substitui os dados atuais (PostgreSQL + media). Faça download de um backup antes de importar.
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
            Gera um arquivo `.tar.gz` contendo dump do PostgreSQL e pasta de mídia.
          </p>
          <button
            type="button"
            onClick={handleExportar}
            disabled={exportando || importando}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
          >
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
            {exportando ? 'Gerando backup...' : 'Gerar e baixar backup'}
          </button>
        </div>

        <form onSubmit={handleImportar} className="bg-white rounded-xl shadow-md p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Importar backup completo</h2>
          </div>
          <p className="text-sm text-gray-600">
            Envie um backup `.tar.gz` gerado pelo sistema para restaurar banco e mídia.
          </p>
          <input
            type="file"
            accept=".tar.gz,.tgz,application/gzip"
            onChange={(event) => setArquivo(event.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
            disabled={importando || exportando}
          />
          <button
            type="submit"
            disabled={importando || exportando}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
          >
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importando ? 'Importando...' : 'Importar backup'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default AdminBackupImport
