import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Gift, Shuffle, Users, Search, Check, X, Trophy, RefreshCw, UserCheck, AlertCircle,
  Maximize2, Minimize2, ChevronDown, ChevronUp, Settings2, History, Calendar, Trash2, Play,
} from 'lucide-react'
import api from '../../services/api'
import { dispararFogosSorteio } from '../../utils/fogosSorteio'
import { useAuth } from '../../contexts/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'

function ganhadorConfirmado(ganhador) {
  return !ganhador?.status || ganhador.status === 'confirmado'
}

function contagemPremiosSorteio(item) {
  const ganhadores = item?.ganhadores || []
  const premios = item?.total_ganhadores ?? ganhadores.filter(ganhadorConfirmado).length
  const rodadas = item?.total_rodadas ?? ganhadores.length
  const ausentes = ganhadores.filter((g) => g.status === 'ausente').length
  return { premios, rodadas, ausentes }
}

function premioDaSessao(sorteioData) {
  const ganhadores = sorteioData?.ganhadores || []
  if (!ganhadores.length) return ''
  const comPremio = ganhadores.find((g) => (g.premio || '').trim())
  return (comPremio?.premio || ganhadores[0]?.premio || '').trim()
}

function linhaDetalheGanhador(ganhador) {
  if (!ganhador) return null
  if (ganhador.is_acompanhante && ganhador.responsavel_nome) {
    return `acompanhante de ${ganhador.responsavel_nome}`
  }
  if (ganhador.is_acompanhante) return 'acompanhante'
  if (ganhador.membro_telefone_mascarado) return ganhador.membro_telefone_mascarado
  return null
}

const DURACAO_ANIMACAO_MS = 8000
const INTERVALO_ANIMACAO_MS = 100

function extrairLista(data) {
  if (Array.isArray(data)) return data
  if (data?.results && Array.isArray(data.results)) return data.results
  return []
}

function paramsPeriodo(periodo, dataInicio, dataFim) {
  const params = { periodo }
  if (periodo === 'personalizado') {
    params.data_inicio = dataInicio
    params.data_fim = dataFim
  }
  return params
}

function periodoPronto(periodo, dataInicio, dataFim) {
  if (periodo !== 'personalizado') return true
  return Boolean(dataInicio && dataFim)
}

function sorteioPodeContinuar(item) {
  return item?.status === 'rascunho' || item?.status === 'em_andamento'
}

function FiltroPeriodo({
  label,
  periodo,
  onPeriodoChange,
  dataInicio,
  onDataInicioChange,
  dataFim,
  onDataFimChange,
  onAplicar,
  aplicando = false,
}) {
  return (
    <div className="space-y-2">
      {label && <span className="text-sm font-medium text-gray-700 block">{label}</span>}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="input-field w-auto min-w-[140px]"
          value={periodo}
          onChange={(e) => onPeriodoChange(e.target.value)}
        >
          <option value="hoje">Hoje</option>
          <option value="mes">Este mês</option>
          <option value="personalizado">Personalizado</option>
        </select>
        {periodo === 'personalizado' && (
          <>
            <input
              type="date"
              className="input-field w-auto"
              value={dataInicio}
              onChange={(e) => onDataInicioChange(e.target.value)}
            />
            <span className="text-gray-400 text-sm">até</span>
            <input
              type="date"
              className="input-field w-auto"
              value={dataFim}
              onChange={(e) => onDataFimChange(e.target.value)}
            />
            <button
              type="button"
              onClick={onAplicar}
              disabled={!periodoPronto('personalizado', dataInicio, dataFim) || aplicando}
              className="btn-outline text-sm py-2"
            >
              Filtrar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function TabelaGanhadores({
  ganhadores,
  compacto = false,
  encerrado = false,
  onAusencia,
  marcandoAusenteId = null,
}) {
  if (!ganhadores?.length) {
    return <p className="text-sm text-gray-500 py-2">Nenhum ganhador registrado.</p>
  }

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Rodada</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Ganhador</th>
            {!compacto && (
              <>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Telefone</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Categoria</th>
              </>
            )}
            <th className="px-3 py-2 text-left font-medium text-gray-500">Prêmio</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Sorteado em</th>
            {!encerrado && onAusencia && (
              <th className="px-3 py-2 text-left font-medium text-gray-500">Ação</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {ganhadores.map((g) => {
            const detalheGanhador = linhaDetalheGanhador(g)
            return (
            <tr key={g.id} className={!ganhadorConfirmado(g) ? 'bg-amber-50/60' : ''}>
              <td className="px-3 py-2 text-gray-700">{g.rodada}</td>
              <td className="px-3 py-2">
                <div className={`font-medium text-gray-900 ${!ganhadorConfirmado(g) ? 'line-through opacity-70' : ''}`}>
                  {g.membro_nome}
                </div>
                {detalheGanhador && (
                  <div className={`text-xs text-gray-500 ${!ganhadorConfirmado(g) ? 'line-through opacity-70' : ''}`}>
                    {detalheGanhador}
                  </div>
                )}
              </td>
              {!compacto && (
                <>
                  <td className="px-3 py-2 text-gray-600">{g.membro_telefone_mascarado || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{g.categoria_nome || '—'}</td>
                </>
              )}
              <td className="px-3 py-2 text-gray-700">{g.premio || '—'}</td>
              <td className="px-3 py-2">
                {ganhadorConfirmado(g) ? (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Confirmado
                  </span>
                ) : (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    Ausente
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{g.sorteado_em}</td>
              {!encerrado && onAusencia && (
                <td className="px-3 py-2 whitespace-nowrap">
                  {ganhadorConfirmado(g) ? (
                    <button
                      type="button"
                      disabled={marcandoAusenteId === g.id}
                      onClick={() => onAusencia(g.id, true)}
                      className="text-xs text-amber-800 hover:text-amber-900 underline disabled:opacity-50"
                    >
                      {marcandoAusenteId === g.id ? 'Salvando...' : 'Marcar ausente'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={marcandoAusenteId === g.id}
                      onClick={() => onAusencia(g.id, false)}
                      className="text-xs text-primary-700 hover:text-primary-800 underline disabled:opacity-50"
                    >
                      {marcandoAusenteId === g.id ? 'Salvando...' : 'Desfazer'}
                    </button>
                  )}
                </td>
              )}
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AdminSorteio() {
  const { user } = useAuth()
  const isSuperAdmin = Boolean(user?.is_superuser)
  const [searchParams] = useSearchParams()
  const eventoIdInicial = searchParams.get('evento_id') || ''

  const [eventos, setEventos] = useState([])
  const [eventoSelecionado, setEventoSelecionado] = useState(eventoIdInicial)
  const [sorteio, setSorteio] = useState(null)
  const [elegiveis, setElegiveis] = useState([])
  const [busca, setBusca] = useState('')
  const [premio, setPremio] = useState('')
  const [loadingEventos, setLoadingEventos] = useState(true)
  const [loadingSessao, setLoadingSessao] = useState(false)
  const [loadingElegiveis, setLoadingElegiveis] = useState(false)
  const [sorteando, setSorteando] = useState(false)
  const [animacaoNome, setAnimacaoNome] = useState('')
  const [ultimoGanhador, setUltimoGanhador] = useState(null)
  const [erro, setErro] = useState('')
  const [confirmEncerrar, setConfirmEncerrar] = useState(false)
  const [modoApresentacao, setModoApresentacao] = useState(false)
  const [configRecolhida, setConfigRecolhida] = useState(false)
  const [historicoSorteios, setHistoricoSorteios] = useState([])
  const [historicoEventoFiltro, setHistoricoEventoFiltro] = useState('')
  const [historicoExpandidoId, setHistoricoExpandidoId] = useState(null)
  const [loadingHistorico, setLoadingHistorico] = useState(false)
  const [eventosHistoricoOpcoes, setEventosHistoricoOpcoes] = useState([])
  const [eventoPeriodo, setEventoPeriodo] = useState('hoje')
  const [eventoDataInicio, setEventoDataInicio] = useState('')
  const [eventoDataFim, setEventoDataFim] = useState('')
  const [historicoPeriodo, setHistoricoPeriodo] = useState('hoje')
  const [historicoDataInicio, setHistoricoDataInicio] = useState('')
  const [historicoDataFim, setHistoricoDataFim] = useState('')
  const [confirmExcluirSorteio, setConfirmExcluirSorteio] = useState(null)
  const [excluindoSorteio, setExcluindoSorteio] = useState(false)
  const [abrindoSorteioId, setAbrindoSorteioId] = useState(null)
  const [marcandoAusenteId, setMarcandoAusenteId] = useState(null)
  const animacaoRef = useRef(null)
  const apresentacaoRef = useRef(null)

  const carregarEventos = useCallback(async () => {
    if (!periodoPronto(eventoPeriodo, eventoDataInicio, eventoDataFim)) return
    setLoadingEventos(true)
    setErro('')
    try {
      const periodoParams = paramsPeriodo(eventoPeriodo, eventoDataInicio, eventoDataFim)

      const [andamentoRes, todosRes] = await Promise.all([
        api.get('/eventos/em_andamento/').catch(() => ({ data: [] })),
        api.get('/eventos/', {
          params: {
            incluir_particulares: 'true',
            page_size: 500,
            ...periodoParams,
          },
        }),
      ])

      const map = new Map()
      extrairLista(andamentoRes.data).forEach((e) => map.set(e.id, e))
      extrairLista(todosRes.data)
        .filter((e) => !e.status || e.status !== 'cancelado')
        .forEach((e) => map.set(e.id, e))

      const lista = Array.from(map.values()).sort(
        (a, b) => new Date(b.data_inicio) - new Date(a.data_inicio)
      )
      setEventos(lista)
      if (eventoSelecionado && !lista.some((e) => String(e.id) === String(eventoSelecionado))) {
        if (!sorteio) setEventoSelecionado('')
      }
    } catch (err) {
      console.error('Erro ao carregar eventos:', err)
      setEventos([])
      setErro('Erro ao carregar eventos.')
    } finally {
      setLoadingEventos(false)
    }
  }, [eventoPeriodo, eventoDataInicio, eventoDataFim])

  const carregarOpcoesHistorico = useCallback(async () => {
    if (!periodoPronto(historicoPeriodo, historicoDataInicio, historicoDataFim)) return
    try {
      const { data } = await api.get('/eventos/', {
        params: {
          incluir_particulares: 'true',
          page_size: 500,
          ...paramsPeriodo(historicoPeriodo, historicoDataInicio, historicoDataFim),
        },
      })
      setEventosHistoricoOpcoes(extrairLista(data))
    } catch (err) {
      console.error('Erro ao carregar eventos do histórico:', err)
      setEventosHistoricoOpcoes([])
    }
  }, [historicoPeriodo, historicoDataInicio, historicoDataFim])

  const carregarHistorico = useCallback(async () => {
    if (!periodoPronto(historicoPeriodo, historicoDataInicio, historicoDataFim)) return
    setLoadingHistorico(true)
    try {
      const params = {
        page_size: 100,
        com_ganhadores: 'true',
        incluir_ativos: 'true',
        ...paramsPeriodo(historicoPeriodo, historicoDataInicio, historicoDataFim),
      }
      if (historicoEventoFiltro) params.evento_id = historicoEventoFiltro
      const { data } = await api.get('/sorteios/', { params })
      setHistoricoSorteios(extrairLista(data))
      await carregarOpcoesHistorico()
    } catch (err) {
      console.error('Erro ao carregar histórico:', err)
    } finally {
      setLoadingHistorico(false)
    }
  }, [
    historicoEventoFiltro,
    historicoPeriodo,
    historicoDataInicio,
    historicoDataFim,
    carregarOpcoesHistorico,
  ])

  useEffect(() => {
    if (historicoPeriodo !== 'personalizado') {
      carregarHistorico()
    }
  }, [historicoPeriodo, historicoEventoFiltro, carregarHistorico])

  useEffect(() => {
    if (eventoPeriodo !== 'personalizado') {
      carregarEventos()
    }
  }, [eventoPeriodo, carregarEventos])

  useEffect(() => {
    if (!eventoSelecionado || sorteio) return
    if (!eventos.some((e) => String(e.id) === String(eventoSelecionado))) {
      setEventoSelecionado('')
    }
  }, [eventos, eventoSelecionado, sorteio])

  useEffect(() => {
    if (eventoIdInicial) {
      setEventoSelecionado(eventoIdInicial)
    }
  }, [eventoIdInicial])

  const carregarElegiveis = useCallback(async (sorteioId, opts = {}) => {
    if (!sorteioId) return
    const atualizarLista = opts.atualizarLista !== false
    if (atualizarLista) {
      setLoadingElegiveis(true)
    }
    setErro('')
    try {
      const params = new URLSearchParams()
      if (opts.q) params.set('q', opts.q)
      if (opts.presente) params.set('presente', 'true')
      if (opts.somenteTitulares) params.set('acompanhante', 'false')
      if (opts.premio) params.set('premio', opts.premio)
      const qs = params.toString()
      const url = `/sorteios/${sorteioId}/elegiveis/${qs ? `?${qs}` : ''}`
      const { data } = await api.get(url)
      if (atualizarLista) {
        setElegiveis(data.elegiveis || [])
      }
      setSorteio((prev) => (
        prev && String(prev.id) === String(sorteioId)
          ? {
              ...prev,
              total_elegiveis: data.total_participa,
              total_pool: data.total_pool,
            }
          : prev
      ))
      return data
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao carregar participantes.'
      setErro(msg)
      if (atualizarLista) setElegiveis([])
      return null
    } finally {
      if (atualizarLista) setLoadingElegiveis(false)
    }
  }, [])

  const iniciarSorteio = async () => {
    if (!eventoSelecionado) {
      setErro('Selecione um evento.')
      return
    }
    setLoadingSessao(true)
    setErro('')
    setUltimoGanhador(null)
    setPremio('')
    try {
      const { data } = await api.post('/sorteios/', { evento_id: Number(eventoSelecionado) })
      setSorteio(data)
      setEventoSelecionado(String(data.evento))
      const premioExistente = premioDaSessao(data)
      setPremio(premioExistente)
      await carregarElegiveis(data.id)
    } catch (err) {
      setErro(err.response?.data?.error || err.response?.data?.evento_id?.[0] || 'Erro ao iniciar sorteio.')
    } finally {
      setLoadingSessao(false)
    }
  }

  const abrirSorteio = async (item) => {
    if (!sorteioPodeContinuar(item)) return
    setAbrindoSorteioId(item.id)
    setErro('')
    try {
      const { data } = await api.get(`/sorteios/${item.id}/`)
      setSorteio(data)
      setEventoSelecionado(String(data.evento))
      setConfigRecolhida(false)
      setModoApresentacao(false)
      const ganhadores = data.ganhadores || []
      setUltimoGanhador(ganhadores.length ? ganhadores[ganhadores.length - 1] : null)
      setPremio(premioDaSessao(data))
      await carregarElegiveis(data.id, { q: busca.trim() })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao abrir sorteio.')
    } finally {
      setAbrindoSorteioId(null)
    }
  }

  useEffect(() => {
    if (!sorteio?.id) return
    const delay = busca.trim() ? 400 : 0
    const t = setTimeout(() => {
      carregarElegiveis(sorteio.id, { q: busca.trim() })
    }, delay)
    return () => clearTimeout(t)
  }, [sorteio?.id, busca, carregarElegiveis])

  useEffect(() => {
    if (!sorteio?.id) return
    const premioNome = premio.trim()
    if (!premioNome) {
      setSorteio((prev) => (prev ? { ...prev, total_pool: null } : prev))
      return
    }
    const t = setTimeout(() => {
      carregarElegiveis(sorteio.id, { premio: premioNome, atualizarLista: false })
    }, 300)
    return () => clearTimeout(t)
  }, [sorteio?.id, premio, carregarElegiveis])

  const recarregarElegiveisAposPatch = async () => {
    if (!sorteio?.id) return
    await carregarElegiveis(sorteio.id, { q: busca.trim() })
  }

  const atualizarParticipacao = async (inscricaoId, participa) => {
    if (!sorteio || sorteio.status === 'encerrado') return
    try {
      await api.patch(`/sorteios/${sorteio.id}/elegiveis/atualizar/`, {
        atualizacoes: [{ inscricao_id: inscricaoId, participa }],
      })
      await recarregarElegiveisAposPatch()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao atualizar participante.')
    }
  }

  const acaoEmLote = async (acao) => {
    if (!sorteio || sorteio.status === 'encerrado') return
    try {
      await api.patch(`/sorteios/${sorteio.id}/elegiveis/atualizar/`, {
        acao,
      })
      await recarregarElegiveisAposPatch()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro na ação em lote.')
    }
  }

  const executarAnimacaoSuspense = (nomes) => {
    const lista = nomes.length ? nomes : ['...']
    return new Promise((resolve) => {
      let i = 0
      const total = Math.ceil(DURACAO_ANIMACAO_MS / INTERVALO_ANIMACAO_MS)
      setAnimacaoNome(lista[0])
      animacaoRef.current = setInterval(() => {
        i += 1
        setAnimacaoNome(lista[i % lista.length])
        if (i >= total) {
          clearInterval(animacaoRef.current)
          animacaoRef.current = null
          resolve()
        }
      }, INTERVALO_ANIMACAO_MS)
    })
  }

  const buscarNomesPoolAnimacao = async (sorteioId, premioNome) => {
    const poolRes = await carregarElegiveis(sorteioId, {
      premio: premioNome,
      atualizarLista: false,
    })
    const elegiveisPool = poolRes?.elegiveis || []
    const nomesElegiveis = elegiveisPool
      .filter((e) => e.elegivel_para_premio)
      .map((e) => e.membro_nome)
    if (nomesElegiveis.length >= 2) return nomesElegiveis
    const nomesParticipa = elegiveisPool
      .filter((e) => e.participa)
      .map((e) => e.membro_nome)
    return nomesParticipa.length ? nomesParticipa : nomesElegiveis
  }

  const sortear = async () => {
    if (!sorteio || sorteio.status === 'encerrado') return
    const premioNome = premio.trim()
    if (!premioNome) {
      setErro('Informe o nome do prêmio antes de sortear.')
      return
    }
    setSorteando(true)
    setErro('')
    setUltimoGanhador(null)
    setAnimacaoNome('...')
    try {
      const nomesAnimacao = await buscarNomesPoolAnimacao(sorteio.id, premioNome)
      const [{ data }] = await Promise.all([
        api.post(`/sorteios/${sorteio.id}/executar/`, { premio: premioNome }),
        executarAnimacaoSuspense(nomesAnimacao),
      ])
      setAnimacaoNome(data.ganhador.membro_nome)
      setUltimoGanhador(data.ganhador)
      setSorteio(data.sorteio)
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => dispararFogosSorteio(apresentacaoRef.current))
      })
      await recarregarElegiveisAposPatch()
      await carregarElegiveis(sorteio.id, { premio: premioNome, atualizarLista: false })
      carregarHistorico()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao sortear.')
      setAnimacaoNome('')
      if (animacaoRef.current) {
        clearInterval(animacaoRef.current)
        animacaoRef.current = null
      }
    } finally {
      setSorteando(false)
    }
  }

  const atualizarAusenciaGanhador = async (ganhadorId, ausente) => {
    if (!sorteio || sorteio.status === 'encerrado') return
    setMarcandoAusenteId(ganhadorId)
    setErro('')
    try {
      const { data } = await api.post(
        `/sorteios/${sorteio.id}/ganhadores/${ganhadorId}/ausencia/`,
        { ausente, premio: premio.trim() },
      )
      setSorteio(data.sorteio)
      if (ultimoGanhador?.id === ganhadorId) {
        setUltimoGanhador(data.ganhador)
      }
      if (premio.trim()) {
        await carregarElegiveis(sorteio.id, { premio: premio.trim(), atualizarLista: false })
      }
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao atualizar status do ganhador.')
    } finally {
      setMarcandoAusenteId(null)
    }
  }

  const encerrarSorteio = async () => {
    if (!sorteio) return
    try {
      const { data } = await api.post(`/sorteios/${sorteio.id}/encerrar/`)
      setSorteio(data)
      setConfirmEncerrar(false)
      carregarHistorico()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao encerrar sorteio.')
    }
  }

  const excluirSorteio = async () => {
    if (!confirmExcluirSorteio) return
    setExcluindoSorteio(true)
    setErro('')
    try {
      await api.delete(`/sorteios/${confirmExcluirSorteio.id}/`)
      if (sorteio?.id === confirmExcluirSorteio.id) {
        setSorteio(null)
        setElegiveis([])
        setUltimoGanhador(null)
        setPremio('')
        setConfigRecolhida(false)
      }
      if (historicoExpandidoId === confirmExcluirSorteio.id) {
        setHistoricoExpandidoId(null)
      }
      setConfirmExcluirSorteio(null)
      carregarHistorico()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao excluir sorteio.')
      setConfirmExcluirSorteio(null)
    } finally {
      setExcluindoSorteio(false)
    }
  }

  useEffect(() => () => {
    if (animacaoRef.current) clearInterval(animacaoRef.current)
  }, [])

  const entrarApresentacao = () => {
    setConfigRecolhida(true)
    setModoApresentacao(true)
  }

  const sairApresentacao = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen()
      } catch {
        /* ignore */
      }
    }
    setModoApresentacao(false)
  }

  useEffect(() => {
    if (!modoApresentacao || !apresentacaoRef.current) return
    apresentacaoRef.current.requestFullscreen?.().catch(() => {})
  }, [modoApresentacao])

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setModoApresentacao(false)
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const eventoAtual = eventos.find((e) => String(e.id) === String(eventoSelecionado))

  const premioPreenchido = premio.trim().length > 0
  const { premios: totalPremiosConfirmados, rodadas: totalRodadasSessao } = contagemPremiosSorteio(sorteio)
  const premioTravado = totalRodadasSessao > 0
  const totalParticipa = sorteio?.total_elegiveis ?? elegiveis.filter((e) => e.participa).length
  const totalPool = premioPreenchido
    ? (sorteio?.total_pool ?? elegiveis.filter((e) => e.elegivel_para_premio).length)
    : 0
  const premioAtualLabel = premioPreenchido ? premio.trim() : 'informe o prêmio'
  const encerrado = sorteio?.status === 'encerrado'

  const painelAoVivo = (grande = false) => (
    <>
      {!encerrado && (
        <>
          <label className={`block font-medium text-gray-700 mb-1 ${grande ? 'text-lg' : 'text-sm'}`}>
            Nome do prêmio <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            required
            readOnly={premioTravado}
            className={`input-field mb-1 ${grande ? 'text-xl py-3' : ''} ${premioTravado ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            placeholder="Ex.: Kit casal, Voucher jantar..."
            value={premio}
            onChange={(e) => setPremio(e.target.value)}
          />
          {premioTravado && (
            <p className={`text-gray-500 mb-1 ${grande ? 'text-sm' : 'text-xs'}`}>
              Prêmio fixo desta sessão. Para sortear outro prêmio, inicie uma nova sessão.
            </p>
          )}
          {!premioPreenchido && (
            <p className={`text-amber-700 mb-4 ${grande ? 'text-base' : 'text-sm'}`}>
              O nome do prêmio é obrigatório para sortear.
            </p>
          )}
          {premioPreenchido && (
            <p className={`text-gray-500 mb-4 ${grande ? 'text-sm' : 'text-xs'}`}>
              {totalPool} participante{totalPool !== 1 ? 's' : ''} no pool · quem já ganhou este prêmio no evento não entra.
            </p>
          )}
          <button
            type="button"
            onClick={sortear}
            disabled={sorteando || !premioPreenchido || totalPool < 1}
            className={`w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 ${
              grande ? 'py-6 text-2xl' : 'py-4 text-lg'
            }`}
          >
            {sorteando ? (
              <>
                <RefreshCw className={`animate-spin ${grande ? 'h-7 w-7' : 'h-5 w-5'}`} />
                Sorteando...
              </>
            ) : (
              <>
                <Shuffle className={grande ? 'h-7 w-7' : 'h-5 w-5'} />
                Sortear agora
              </>
            )}
          </button>
          {premioPreenchido && totalPool < 1 && (
            <p className={`text-amber-700 mt-2 ${grande ? 'text-base' : 'text-sm'}`}>
              Nenhum participante disponível para o prêmio &quot;{premioAtualLabel}&quot;.
              Quem já ganhou o mesmo prêmio neste evento não entra no sorteio.
            </p>
          )}
        </>
      )}

      {(sorteando || animacaoNome || ultimoGanhador) && (
        <div
          className={`mt-6 rounded-xl bg-gradient-to-br from-primary-600 to-church-navy text-white text-center flex flex-col justify-center ${
            grande ? 'p-12 min-h-[280px]' : 'p-6 min-h-[140px]'
          }`}
        >
          {sorteando && !ultimoGanhador && (
            <p className={`font-bold animate-pulse ${grande ? 'text-5xl' : 'text-2xl'}`}>
              {animacaoNome || '...'}
            </p>
          )}
          {ultimoGanhador && (() => {
            const detalhe = linhaDetalheGanhador(ultimoGanhador)
            const confirmado = ganhadorConfirmado(ultimoGanhador)
            return (
            <>
              <p className={`uppercase tracking-wide opacity-90 mb-2 ${grande ? 'text-xl' : 'text-sm'}`}>
                {ultimoGanhador.premio ? `Prêmio: ${ultimoGanhador.premio}` : `Rodada ${ultimoGanhador.rodada}`}
              </p>
              {!confirmado && (
                <p className={`uppercase tracking-wide text-amber-200 mb-2 ${grande ? 'text-lg' : 'text-xs'}`}>
                  Ausente — prêmio não entregue
                </p>
              )}
              <p className={`font-bold ${grande ? 'text-6xl' : 'text-3xl'} ${!confirmado ? 'line-through opacity-80' : ''}`}>
                {ultimoGanhador.membro_nome}
              </p>
              {detalhe && (
                <p className={`opacity-90 mt-2 ${grande ? 'text-2xl' : 'text-sm'}`}>
                  {detalhe}
                </p>
              )}
            </>
            )
          })()}
        </div>
      )}

      {sorteio?.ganhadores?.length > 0 && (
        <div className={`mt-6 ${grande ? 'max-w-4xl mx-auto w-full' : ''}`}>
          <h3 className={`font-semibold text-gray-700 mb-2 ${grande ? 'text-lg' : 'text-sm'}`}>
            Rodadas desta sessão
          </h3>
          <TabelaGanhadores
            ganhadores={[...(sorteio.ganhadores || [])].reverse()}
            compacto={grande}
            encerrado={encerrado}
            onAusencia={encerrado ? null : atualizarAusenciaGanhador}
            marcandoAusenteId={marcandoAusenteId}
          />
        </div>
      )}

      {!encerrado && sorteio?.ganhadores?.length > 0 && (
        <button
          type="button"
          onClick={() => setConfirmEncerrar(true)}
          className={`w-full mt-6 btn-outline text-red-700 border-red-200 hover:bg-red-50 ${
            grande ? 'max-w-md mx-auto' : ''
          }`}
        >
          Encerrar sorteio
        </button>
      )}

      {encerrado && (
        <p className={`mt-4 text-gray-500 text-center ${grande ? 'text-lg' : 'text-sm'}`}>
          Sorteio encerrado.
        </p>
      )}
    </>
  )

  const blocoConfiguracao = (
    <div className={`space-y-6 ${configRecolhida && sorteio ? 'hidden' : ''}`}>
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">1. Evento</h2>
        <div className="mb-4">
          <FiltroPeriodo
            label="Período do evento"
            periodo={eventoPeriodo}
            onPeriodoChange={setEventoPeriodo}
            dataInicio={eventoDataInicio}
            onDataInicioChange={setEventoDataInicio}
            dataFim={eventoDataFim}
            onDataFimChange={setEventoDataFim}
            onAplicar={carregarEventos}
            aplicando={loadingEventos}
          />
        </div>
        {loadingEventos ? (
          <LoadingSpinner />
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              className="input-field flex-1"
              value={eventoSelecionado}
              onChange={(e) => {
                setEventoSelecionado(e.target.value)
                setSorteio(null)
                setElegiveis([])
                setUltimoGanhador(null)
                setPremio('')
                setConfigRecolhida(false)
              }}
              disabled={!!sorteio && !encerrado}
            >
              <option value="">Selecione um evento...</option>
              {eventos.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.titulo} — {ev.data_inicio_formatada || ev.data_inicio}
                </option>
              ))}
            </select>
            {!sorteio && (
              <button
                type="button"
                onClick={iniciarSorteio}
                disabled={!eventoSelecionado || loadingSessao}
                className="btn-primary whitespace-nowrap flex items-center justify-center gap-2"
              >
                {loadingSessao ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
                Iniciar sorteio
              </button>
            )}
          </div>
        )}
        {!loadingEventos && eventos.length === 0 && (
          <p className="text-sm text-gray-500 mt-3">
            Nenhum evento encontrado para o período selecionado.
          </p>
        )}
        {sorteio && (
          <p className="text-sm text-gray-500 mt-3">
            Sessão #{sorteio.id} — {sorteio.status_display}
            {sorteio.criado_por_nome ? ` · por ${sorteio.criado_por_nome}` : ''}
          </p>
        )}
      </div>

      {sorteio && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5" />
              2. Curadoria
              <span className="text-sm font-normal bg-primary-100 text-primary-800 px-2 py-0.5 rounded-full">
                {totalParticipa} marcados para participar
              </span>
            </h2>
            {!encerrado && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => acaoEmLote('marcar_todos')} className="btn-outline text-sm py-1.5">
                  Marcar todos
                </button>
                <button type="button" onClick={() => acaoEmLote('desmarcar_todos')} className="btn-outline text-sm py-1.5">
                  Desmarcar todos
                </button>
                <button type="button" onClick={() => acaoEmLote('marcar_presentes')} className="btn-outline text-sm py-1.5 flex items-center gap-1">
                  <UserCheck className="h-4 w-4" />
                  Só presentes
                </button>
                <button type="button" onClick={() => acaoEmLote('marcar_acompanhantes')} className="btn-outline text-sm py-1.5">
                  Marcar acompanhantes
                </button>
                <button type="button" onClick={() => acaoEmLote('desmarcar_acompanhantes')} className="btn-outline text-sm py-1.5">
                  Desmarcar acompanhantes
                </button>
              </div>
            )}
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              className="input-field pl-10"
              placeholder="Buscar por nome ou telefone..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {loadingElegiveis ? (
            <LoadingSpinner />
          ) : elegiveis.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nenhum inscrito confirmado encontrado.</p>
          ) : (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Participa</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Presente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {elegiveis.map((item) => {
                    const bloqueadoPremio = item.ja_ganhou_premio_evento
                    return (
                    <tr
                      key={item.inscricao_id}
                      className={
                        bloqueadoPremio
                          ? 'bg-amber-50 opacity-80'
                          : !item.participa
                            ? 'bg-gray-50 opacity-70'
                            : ''
                      }
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={item.participa}
                          disabled={encerrado}
                          onChange={(e) => atualizarParticipacao(item.inscricao_id, e.target.checked)}
                          className="rounded border-gray-300 h-4 w-4"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{item.membro_nome}</div>
                        <div className="text-xs text-gray-500">{item.membro_telefone_mascarado}</div>
                        {item.is_acompanhante && item.responsavel_nome && (
                          <div className="text-xs text-gray-400">Acomp. de {item.responsavel_nome}</div>
                        )}
                        {bloqueadoPremio && item.motivo_bloqueio && (
                          <div className="text-xs text-amber-700 mt-1">{item.motivo_bloqueio}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {item.is_acompanhante ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800">
                            Acompanhante
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Inscrito
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{item.categoria_nome || '—'}</td>
                      <td className="px-4 py-3">
                        {item.presente ? (
                          <span className="inline-flex items-center gap-1 text-green-700 text-sm">
                            <Check className="h-4 w-4" /> Sim
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">Não</span>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )

  if (modoApresentacao && sorteio) {
    return (
      <>
        <div
          ref={apresentacaoRef}
          className="fixed inset-0 z-[200] bg-gray-100 flex flex-col overflow-y-auto"
        >
          <header className="shrink-0 bg-white border-b shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-gray-500">Sorteio ao vivo</p>
              <h1 className="text-lg sm:text-xl font-bold text-church-navy truncate">
                {sorteio.evento_titulo || eventoAtual?.titulo || 'Evento'}
              </h1>
              <p className="text-sm text-gray-600">
                {premioPreenchido
                  ? `${totalPool} no pool (${premio.trim()})`
                  : `${totalParticipa} marcados na curadoria · informe o prêmio`}
              </p>
            </div>
            <button
              type="button"
              onClick={sairApresentacao}
              className="btn-outline flex items-center gap-2 shrink-0"
            >
              <Minimize2 className="h-4 w-4" />
              Sair da apresentação
            </button>
          </header>

          {erro && (
            <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-4 text-red-800">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{erro}</span>
              <button type="button" onClick={() => setErro('')} className="ml-auto">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 max-w-4xl mx-auto w-full">
            <div className="w-full bg-white rounded-2xl shadow-lg p-6 sm:p-10">
              {painelAoVivo(true)}
            </div>
          </main>
        </div>

        <ConfirmModal
          isOpen={confirmEncerrar}
          title="Encerrar sorteio?"
          message="Não será possível sortear novamente nesta sessão."
          confirmText="Encerrar"
          type="danger"
          onConfirm={encerrarSorteio}
          onClose={() => setConfirmEncerrar(false)}
        />
      </>
    )
  }

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-church-navy flex items-center gap-3">
            <Gift className="h-8 w-8 text-primary-600" />
            Sorteio
          </h1>
          <p className="text-gray-600 mt-1">
            Selecione os participantes e sorteie ao vivo durante o evento.
          </p>
        </div>
        {sorteio && (
          <div className="flex flex-wrap gap-2 shrink-0">
            {configRecolhida ? (
              <button
                type="button"
                onClick={() => setConfigRecolhida(false)}
                className="btn-outline flex items-center gap-2"
              >
                <Settings2 className="h-4 w-4" />
                Mostrar configuração
                <ChevronDown className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfigRecolhida(true)}
                className="btn-outline flex items-center gap-2"
              >
                <ChevronUp className="h-4 w-4" />
                Recolher configuração
              </button>
            )}
            <button
              type="button"
              onClick={entrarApresentacao}
              className="btn-primary flex items-center gap-2"
            >
              <Maximize2 className="h-4 w-4" />
              Apresentar em tela cheia
            </button>
          </div>
        )}
      </div>

      {erro && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-4 text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{erro}</span>
          <button type="button" onClick={() => setErro('')} className="ml-auto text-red-600 hover:text-red-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {configRecolhida && sorteio ? (
        <div className="bg-white rounded-xl shadow-md p-6 sm:p-10 max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Trophy className="h-6 w-6 text-amber-500" />
                Sorteio ao vivo
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {sorteio.evento_titulo || eventoAtual?.titulo}
                {premioPreenchido ? ` · ${totalPool} no pool (${premio.trim()})` : ` · ${totalParticipa} marcados na curadoria`}
              </p>
            </div>
            <button
              type="button"
              onClick={entrarApresentacao}
              className="btn-primary flex items-center gap-2 shrink-0"
            >
              <Maximize2 className="h-4 w-4" />
              Tela cheia
            </button>
          </div>
          {painelAoVivo(true)}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-6 ${sorteio ? 'xl:grid-cols-3' : ''}`}>
          <div className={sorteio ? 'xl:col-span-2' : ''}>{blocoConfiguracao}</div>

          {sorteio && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-md p-6 xl:sticky xl:top-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  3. Sortear ao vivo
                </h2>
                {painelAoVivo(false)}
              </div>
            </div>
          )}
        </div>
      )}

      {!modoApresentacao && (
        <div className="mt-10 bg-white rounded-xl shadow-md p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <History className="h-6 w-6 text-primary-600" />
                Histórico de sorteios
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Consulte sessões anteriores, retome sorteios em andamento ou encerre-os.
              </p>
            </div>
            <div className="flex flex-col gap-4 lg:items-end">
              <FiltroPeriodo
                label="Período"
                periodo={historicoPeriodo}
                onPeriodoChange={(v) => {
                  setHistoricoExpandidoId(null)
                  setHistoricoPeriodo(v)
                }}
                dataInicio={historicoDataInicio}
                onDataInicioChange={setHistoricoDataInicio}
                dataFim={historicoDataFim}
                onDataFimChange={setHistoricoDataFim}
                onAplicar={carregarHistorico}
                aplicando={loadingHistorico}
              />
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <select
                  className="input-field sm:min-w-[240px]"
                  value={historicoEventoFiltro}
                  onChange={(e) => {
                    setHistoricoExpandidoId(null)
                    setHistoricoEventoFiltro(e.target.value)
                  }}
                >
                  <option value="">Todos os eventos</option>
                  {eventosHistoricoOpcoes.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.titulo}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={carregarHistorico}
                  disabled={loadingHistorico}
                  className="btn-outline flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingHistorico ? 'animate-spin' : ''}`} />
                  Atualizar
                </button>
              </div>
            </div>
          </div>

          {loadingHistorico ? (
            <LoadingSpinner />
          ) : historicoSorteios.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Nenhum sorteio encontrado para o período selecionado.
            </p>
          ) : (
            <div className="space-y-3">
              {historicoSorteios.map((item) => {
                const expandido = historicoExpandidoId === item.id
                const tituloSessao = item.titulo || `Sessão #${item.id}`
                const ativo = sorteioPodeContinuar(item)
                const sessaoCarregada = sorteio?.id === item.id
                const sessaoEmAndamento = sessaoCarregada && ativo
                return (
                  <div
                    key={item.id}
                    className={`border rounded-lg overflow-hidden ${
                      sessaoEmAndamento ? 'ring-2 ring-primary-500 border-primary-300' : ''
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-stretch gap-0 sm:gap-2 bg-gray-50">
                      <button
                        type="button"
                        onClick={() => setHistoricoExpandidoId(expandido ? null : item.id)}
                        className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 hover:bg-gray-100 text-left transition-colors min-w-0"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {item.evento_titulo}
                            {item.titulo ? ` · ${tituloSessao}` : ''}
                            {sessaoEmAndamento && (
                              <span className="ml-2 text-xs font-normal text-primary-700">(sessão em andamento)</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                            {item.evento_data_inicio_formatada && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                Evento: {item.evento_data_inicio_formatada}
                              </span>
                            )}
                            {item.criado_em_formatado && (
                              <span>Sorteio: {item.criado_em_formatado}</span>
                            )}
                            {item.criado_por_nome && <span>por {item.criado_por_nome}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          {(() => {
                            const { premios, rodadas, ausentes } = contagemPremiosSorteio(item)
                            return (
                              <>
                                <span className="text-sm bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                  {premios} prêmio{premios !== 1 ? 's' : ''} sorteado{premios !== 1 ? 's' : ''}
                                </span>
                                {ausentes > 0 && (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                    {rodadas} rodadas · {ausentes} ausente{ausentes !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </>
                            )
                          })()}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            item.status === 'encerrado'
                              ? 'bg-gray-200 text-gray-700'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {item.status_display}
                          </span>
                          {expandido ? (
                            <ChevronUp className="h-5 w-5 text-gray-500" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-gray-500" />
                          )}
                        </div>
                      </button>
                      {isSuperAdmin && (
                        <div className="px-4 pb-2 sm:py-3 sm:pr-2 flex items-center shrink-0">
                          <button
                            type="button"
                            title="Excluir registro"
                            onClick={() => setConfirmExcluirSorteio(item)}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      {ativo && (
                        <div className="px-4 pb-3 sm:py-3 sm:pr-4 flex items-center shrink-0">
                          <button
                            type="button"
                            onClick={() => abrirSorteio(item)}
                            disabled={abrindoSorteioId === item.id}
                            className="btn-primary text-sm flex items-center gap-2 whitespace-nowrap w-full sm:w-auto justify-center"
                          >
                            {abrindoSorteioId === item.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                            {sessaoCarregada ? 'Continuar' : 'Abrir sorteio'}
                          </button>
                        </div>
                      )}
                    </div>
                    {expandido && (
                      <div className="p-4 border-t bg-white">
                        {ativo && !sessaoCarregada && (
                          <p className="text-sm text-gray-600 mb-3">
                            Este sorteio ainda está ativo. Clique em &quot;Abrir sorteio&quot; para sortear mais
                            prêmios ou encerrar a sessão.
                          </p>
                        )}
                        {(item.ganhadores?.length ?? 0) > 0 ? (
                          <TabelaGanhadores ganhadores={item.ganhadores || []} />
                        ) : (
                          <p className="text-sm text-gray-500">Nenhum ganhador registrado ainda.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmEncerrar}
        title="Encerrar sorteio?"
        message="Não será possível sortear novamente nesta sessão."
        confirmText="Encerrar"
        type="danger"
        onConfirm={encerrarSorteio}
        onClose={() => setConfirmEncerrar(false)}
      />

      <ConfirmModal
        isOpen={Boolean(confirmExcluirSorteio)}
        title="Excluir sorteio?"
        message={
          confirmExcluirSorteio
            ? `Excluir permanentemente a sessão de "${confirmExcluirSorteio.evento_titulo}" com ${contagemPremiosSorteio(confirmExcluirSorteio).premios} prêmio(s) sorteado(s)? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmText={excluindoSorteio ? 'Excluindo...' : 'Excluir'}
        type="danger"
        onConfirm={excluirSorteio}
        onClose={() => !excluindoSorteio && setConfirmExcluirSorteio(null)}
      />
    </div>
  )
}

export default AdminSorteio
