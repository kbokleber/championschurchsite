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

  // Ao montar: verificar se tem token válido. Se não tiver token, limpar cache e pedir login.
  // Se tiver token + cache, mostrar cache e só então atualizar em background.
  // Se tiver token mas sem cache, carregar da API.
  useEffect(() => {
    const token = localStorage.getItem('participante_token')
    if (!token) {
      // Sem token = não está logado. Limpar cache e mostrar formulário de login
      limparCache()
      setParticipante(null)
      setIngressos([])
      setLoading(false)
      return
    }
    // Verificar se o token é válido (não expirado)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const exp = payload.exp * 1000
      const agora = Date.now()
      if (exp < agora) {
        // Token expirado - limpar tudo e pedir login
        localStorage.removeItem('participante_token')
        limparCache()
        setParticipante(null)
        setIngressos([])
        setLoading(false)
        return
      }
    } catch (e) {
      // Token inválido - limpar tudo
      localStorage.removeItem('participante_token')
      limparCache()
      setParticipante(null)
      setIngressos([])
      setLoading(false)
      return
    }
    
    // Token válido - carregar dados
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

  // Verifica se o token está próximo de expirar (menos de 30 dias)
  const isTokenProximoExpiracao = (token) => {
    if (!token) return true
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const exp = payload.exp * 1000 // Converter para milissegundos
      const agora = Date.now()
      const diasRestantes = (exp - agora) / (1000 * 60 * 60 * 24)
      return diasRestantes < 30 // Considerar próximo de expirar se faltar menos de 30 dias
    } catch {
      return false // Se não conseguir decodificar, considerar válido (será validado no backend)
    }
  }

  const carregarPerfil = async (token, options = {}) => {
    const { isRefresh = false, silent = false } = options
    if (!silent) setLoadError(false)
    
    // Verificar se o token está próximo de expirar e tentar renovar
    if (isTokenProximoExpiracao(token)) {
      console.log('Token próximo de expirar, tentando renovar...')
      // Por enquanto, apenas logamos - a renovação será feita no backend se necessário
    }
    
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
      const isUnauthorized = error.response?.status === 401
      // 401 em outro navegador ou sessão expirada é esperado — não logar como erro crítico
      if (!isUnauthorized) console.error('Erro ao carregar perfil:', error)
      else if (!silent) console.warn('Sessão inválida ou expirada. Faça login novamente neste navegador.')
      
      if (isUnauthorized) {
        // Verificar se é erro de token expirado ou inválido
        const errorMsg = error.response?.data?.error || ''
        const isTokenExpirado = errorMsg.includes('expirado') || errorMsg.includes('expired')
        
        // Se o token expirou e temos cache, manter logado usando o cache
        // O usuário continuará logado visualmente, mas precisará fazer login novamente
        // apenas quando tentar fazer uma ação que requer token válido
        if (isTokenExpirado) {
          const cache = lerCache()
          if (cache.participante) {
            // Manter dados do cache e não fazer logout imediato
            // O usuário permanecerá logado visualmente
            console.warn('Token expirado, mas mantendo sessão com cache. Faça login novamente para atualizar.')
            if (!silent) setLoadError(false)
            return { success: false, tokenExpirado: true }
          }
        }
        
        // Erro 401 = não autorizado. Limpar token e cache, fazer logout
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

  // Verificar se está realmente logado: precisa ter token válido E participante
  const token = localStorage.getItem('participante_token')
  const temTokenValido = token && (() => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const exp = payload.exp * 1000
      return exp > Date.now()
    } catch {
      return false
    }
  })()
  const isLoggedIn = !!(temTokenValido && participante)

  return (
    <ParticipanteContext.Provider value={{
      participante,
      ingressos,
      loading,
      isLoggedIn,
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
