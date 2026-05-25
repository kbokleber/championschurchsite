import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Folder, FileArchive, Loader2, X } from 'lucide-react'
import { listarArquivosBackupDrive, listarPastasDrive } from '../../utils/googleDriveClient'

export default function DriveBrowseModal({
  open,
  mode,
  accessToken,
  onClose,
  onSelectFolder,
  onSelectFile,
}) {
  const [pastaAtual, setPastaAtual] = useState('root')
  const [caminho, setCaminho] = useState([{ id: 'root', name: 'Meu Drive' }])
  const [pastas, setPastas] = useState([])
  const [arquivos, setArquivos] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!open || !accessToken) return
    setCarregando(true)
    setErro('')
    try {
      const [listaPastas, listaArquivos] = await Promise.all([
        listarPastasDrive(accessToken, pastaAtual),
        mode === 'file' ? listarArquivosBackupDrive(accessToken, pastaAtual) : Promise.resolve([]),
      ])
      setPastas(listaPastas)
      setArquivos(listaArquivos)
    } catch (error) {
      setErro(error.message || 'Erro ao listar Drive.')
      setPastas([])
      setArquivos([])
    } finally {
      setCarregando(false)
    }
  }, [accessToken, mode, open, pastaAtual])

  useEffect(() => {
    if (open) {
      setPastaAtual('root')
      setCaminho([{ id: 'root', name: 'Meu Drive' }])
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  useEffect(() => {
    carregar()
  }, [carregar])

  const entrarPasta = (pasta) => {
    setPastaAtual(pasta.id)
    setCaminho((prev) => [...prev, pasta])
  }

  const irPara = (index) => {
    const destino = caminho[index]
    setCaminho(caminho.slice(0, index + 1))
    setPastaAtual(destino.id)
  }

  if (!open) return null

  const pastaAtualInfo = caminho[caminho.length - 1]

  const conteudo = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-900">
            {mode === 'folder' ? 'Escolher pasta no Drive' : 'Escolher backup no Drive'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {mode === 'folder' && (
          <div className="px-4 py-3 text-sm text-primary-800 bg-primary-50 border-b border-primary-100">
            Navegue pelas pastas ou clique em <strong>Salvar nesta pasta</strong> para usar a pasta atual.
          </div>
        )}

        <div className="px-4 py-2 text-sm text-gray-600 flex flex-wrap items-center gap-1 border-b bg-gray-50">
          {caminho.map((item, index) => (
            <span key={item.id} className="inline-flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3 w-3 text-gray-400" />}
              <button
                type="button"
                onClick={() => irPara(index)}
                className="hover:text-primary-600 hover:underline"
              >
                {item.name}
              </button>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-[240px]">
          {carregando ? (
            <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando...
            </div>
          ) : erro ? (
            <p className="text-sm text-red-600 p-4">{erro}</p>
          ) : (
            <>
              {mode === 'file' && arquivos.map((arq) => (
                <button
                  key={arq.id}
                  type="button"
                  onClick={() => onSelectFile({ id: arq.id, name: arq.name })}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary-50 text-left"
                >
                  <FileArchive className="h-5 w-5 text-primary-600 shrink-0" />
                  <span className="truncate text-sm text-gray-800">{arq.name}</span>
                </button>
              ))}
              {pastas.map((pasta) => (
                <button
                  key={pasta.id}
                  type="button"
                  onClick={() => entrarPasta(pasta)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-left"
                >
                  <Folder className="h-5 w-5 text-amber-500 shrink-0" />
                  <span className="truncate text-sm text-gray-800">{pasta.name}</span>
                  <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />
                </button>
              ))}
              {!carregando && pastas.length === 0 && (mode === 'folder' || arquivos.length === 0) && (
                <p className="text-sm text-gray-500 text-center py-8">
                  {mode === 'folder'
                    ? 'Nenhuma subpasta aqui. Use o botão abaixo para salvar nesta pasta.'
                    : 'Nenhum item nesta pasta.'}
                </p>
              )}
            </>
          )}
        </div>

        {mode === 'folder' && (
          <div className="px-4 py-3 border-t flex justify-end gap-2 bg-gray-50">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onSelectFolder({ id: pastaAtualInfo.id, name: pastaAtualInfo.name })}
              className="btn-primary"
            >
              Salvar nesta pasta ({pastaAtualInfo.name})
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(conteudo, document.body)
}
