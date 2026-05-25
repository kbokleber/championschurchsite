import { useCallback, useEffect, useState } from 'react'
import { GitBranch, ExternalLink, RefreshCw, Map } from 'lucide-react'
import api, { formatApiError } from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'

const TIPO_LABEL = {
  feat: { label: 'Feature', className: 'bg-emerald-100 text-emerald-800' },
  fix: { label: 'Correção', className: 'bg-red-100 text-red-800' },
  docs: { label: 'Docs', className: 'bg-sky-100 text-sky-800' },
  refactor: { label: 'Refactor', className: 'bg-violet-100 text-violet-800' },
  chore: { label: 'Chore', className: 'bg-gray-100 text-gray-700' },
  other: { label: 'Outro', className: 'bg-amber-100 text-amber-800' },
}

function formatarDataHora(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatarDataGrupo(isoDate) {
  if (!isoDate || isoDate === '—') return isoDate
  try {
    const [y, m, d] = isoDate.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(dt)
  } catch {
    return isoDate
  }
}

function BadgeTipo({ tipo }) {
  const info = TIPO_LABEL[tipo] || TIPO_LABEL.other
  return (
    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${info.className}`}>
      {info.label}
    </span>
  )
}

function AdminRoadmap() {
  const [branch, setBranch] = useState('dev')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [dados, setDados] = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const { data } = await api.get('/admin/roadmap/commits/', {
        params: { branch, page, per_page: 30, agrupar: 1 },
      })
      setDados(data)
    } catch (error) {
      setErro(formatApiError(error, 'Não foi possível carregar o roadmap.'))
      setDados(null)
    } finally {
      setLoading(false)
    }
  }, [branch, page])

  useEffect(() => {
    carregar()
  }, [carregar])

  const grupos = dados?.grupos || []
  const commits = dados?.commits || []

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Map className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Roadmap / Changelog</h1>
          </div>
          <p className="text-gray-600 mt-1">
            Evolução do sistema a partir dos commits enviados ao Git ({dados?.fonte || '…'}).
          </p>
          {dados?.repo && (
            <p className="text-xs text-gray-500 mt-1 break-all">Repositório: {dados.repo}</p>
          )}
        </div>
        <button
          type="button"
          onClick={carregar}
          disabled={loading}
          className="btn-secondary inline-flex items-center gap-2 self-start"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {['dev', 'main'].map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => { setBranch(b); setPage(1) }}
              className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 ${
                branch === b ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <GitBranch className="h-4 w-4" />
              {b}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500">Página {page}</span>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{erro}</div>
      )}

      {loading && !dados ? (
        <div className="py-16 flex justify-center">
          <LoadingSpinner size="lg" text="Carregando commits..." />
        </div>
      ) : (
        <div className="space-y-8">
          {grupos.length === 0 && !loading && (
            <p className="text-gray-500 text-center py-8">Nenhum commit encontrado nesta branch.</p>
          )}

          {grupos.map((grupo) => (
            <section key={grupo.data}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 sticky top-0 bg-gray-50 py-2">
                {formatarDataGrupo(grupo.data)}
              </h2>
              <ol className="relative border-l border-gray-200 ml-3 space-y-4">
                {grupo.commits.map((c) => (
                  <li key={c.sha} className="ml-6">
                    <span className="absolute -left-1.5 mt-2 h-3 w-3 rounded-full bg-primary-500 ring-4 ring-white" />
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <BadgeTipo tipo={c.tipo} />
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                          {c.sha_curto}
                        </code>
                        <span className="text-xs text-gray-500">{formatarDataHora(c.data)}</span>
                      </div>
                      <p className="font-medium text-gray-900">{c.mensagem}</p>
                      {c.corpo && (
                        <pre className="mt-2 text-sm text-gray-600 whitespace-pre-wrap font-sans">{c.corpo}</pre>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <span>{c.autor}</span>
                        {c.url && (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary-600 hover:underline"
                          >
                            Ver no GitHub
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-4">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="btn-secondary disabled:opacity-50"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={loading || dados?.has_next === false}
          onClick={() => setPage((p) => p + 1)}
          className="btn-secondary disabled:opacity-50"
        >
          Próxima
        </button>
      </div>
    </div>
  )
}

export default AdminRoadmap
