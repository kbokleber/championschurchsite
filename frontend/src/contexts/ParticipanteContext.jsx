import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

const CACHE_KEY_PARTICIPANTE = 'participante_cache'
const CACHE_KEY_INGRESSOS = 'ingressos_cache'

function salvarCache(participante, ingressos) {
  try {
    if (participante) localStorage.setItem(CACHE_KEY_PARTICIPANTE, JSON.stringify(participante))
    if (ingressos != null) localStorage.setItem(CACHE_KEY_INGRESSOS, JSON.stringify(ingressos))
  } catch (e) {
    console.warn('Erro ao salvar cache participante:', e)
  }
}

function lerCache() {
  try {
    const p = localStorage.getItem(CACHE_KEY_PARTICIPANTE)
    const i = localStorage.getItem(CACHE_KEY_INGRESSOS)
    const participante = p ? JSON.parse(p) : null
    let ingressos = []
    if (i) {
      try {
        const parsed = JSON.parse(i)
        ingressos = Array.isArray(parsed) ? parsed : []
      } catch (_) {}
    }
    return { participante, ingressos }
  } catch (e) {
    return { participante: null, ingressos: [] }
  }
}

function limparCache() {
  try {
    localStorage.removeItem(CACHE_KEY_PARTICIPANTE)
    localStorage.removeItem(CACHE_KEY_INGRESSOS)
  } catch (_) {}
}

function limparCacheIngressos() {
  try {
    localStorage.removeItem(CACHE_KEY_INGRESSOS)
  } catch (_) {}
}

const ParticipanteContext = createContext(null)

export function ParticipanteProvider({ children }) {
  const [participante, setParticipante] = useState(null)
  const [ingressos, setIngressos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Ao montar: priorizar cache. Se tiver token + cache, mostrar cache e só então atualizar em background.
  // Se tiver token mas sem cache, carregar da API. Se não tiver token, pedir login.
  useEffect(() => {
    const token = localStorage.getItem('participante_token')
    if (!token) {
      setLoading(false)
      return
    }
    const cache = lerCache()
    if (cache.participante) {
      setParticipante(cache.participante)
      setIngressos(cache.ingressos)
      setLoadError(false)
      setLoading(false)
      carregarPerfil(token, { isRefresh: true, silent: true })
      return
    }
    carregarPerfil(token)
  }, [])

  const carregarPerfil = async (token, options = {}) => {
    const { isRefresh = false, silent = false } = options
    if (!silent) setLoadError(false)
    try {
      const response = await api.get('/participante/perfil/', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        params: { token, _: Date.now() }
      })
      const p = response.data.participante
      const i = Array.isArray(response.data.ingressos) ? response.data.ingressos : []
      setParticipante(p)
      setIngressos(i)
      salvarCache(p, i)
      return { success: true }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error)
      const isUnauthorized = error.response?.status === 401
      if (isUnauthorized) {
        localStorage.removeItem('participante_token')
        setParticipante(null)
        setIngressos([])
        limparCache()
        if (!silent) setLoadError(false)
        return { success: false }
      }
      const temCache = !!lerCache().participante
      if (temCache) {
        if (!silent) setLoadError(false)
        return { success: false }
      }
      if (!silent) setLoadError(true)
      return { success: false }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const login = async (telefone, senha) => {
    try {
      const response = await api.post('/participante/login/', { telefone, senha })
      if (response.data.success) {
        const token = response.data.token
        const p = response.data.participante
        const i = response.data.ingressos || []
        localStorage.setItem('participante_token', token)
        setParticipante(p)
        setIngressos(i)
        salvarCache(p, i)
        return { success: true }
      }
      return { success: false, error: response.data.error }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.status === 401
        ? 'Telefone ou senha incorretos.'
        : 'Erro ao fazer login. Tente novamente.'
      return { success: false, error: msg }
    }
  }

  const registrar = async (dados) => {
    const response = await api.post('/participante/registro/', dados)
    if (response.data.success) {
      const token = response.data.token
      const p = response.data.participante
      if (token) {
        localStorage.setItem('participante_token', token)
        setParticipante(p)
        limparCacheIngressos()
        await carregarPerfil(token, { isRefresh: true })
      } else {
        setParticipante(p || null)
      }
      return { success: true, data: response.data }
    }
    return { success: false, error: response.data.error }
  }

  const logout = () => {
    localStorage.removeItem('participante_token')
    limparCache()
    setParticipante(null)
    setIngressos([])
    setLoadError(false)
  }

  const atualizarIngressos = async (opcoes = {}) => {
    const token = localStorage.getItem('participante_token')
    if (!token) return { success: false }
    if (opcoes.forcar) limparCacheIngressos()
    return await carregarPerfil(token, { isRefresh: true })
  }

  const getToken = () => {
    return localStorage.getItem('participante_token')
  }

  const tentarCarregarNovamente = async () => {
    const token = localStorage.getItem('participante_token')
    if (token) return await carregarPerfil(token, { isRefresh: true })
    return { success: false }
  }

  return (
    <ParticipanteContext.Provider value={{
      participante,
      ingressos,
      loading,
      isLoggedIn: !!participante,
      loadError,
      login,
      registrar,
      logout,
      atualizarIngressos,
      tentarCarregarNovamente,
      getToken
    }}>
      {children}
    </ParticipanteContext.Provider>
  )
}

export function useParticipante() {
  const context = useContext(ParticipanteContext)
  if (!context) {
    throw new Error('useParticipante deve ser usado dentro de ParticipanteProvider')
  }
  return context
}
