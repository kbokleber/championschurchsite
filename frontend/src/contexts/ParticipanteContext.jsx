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

  // Ao montar: se tiver token + cache, mantém experiência logada e atualiza em background.
  // Não desloga automaticamente por expiração local do JWT; somente logout explícito
  // ou retorno de token inválido no backend deve derrubar sessão.
  useEffect(() => {
    const token = localStorage.getItem('participante_token')
    if (!token) {
      // Sem token = não está logado neste navegador
      setParticipante(null)
      setIngressos([])
      setLoading(false)
      return
    }
    
    // Token presente - carregar dados (cache primeiro, API depois)
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
          'X-Participante-Token': token,
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
        const errorMsg = (error.response?.data?.error || '').toLowerCase()
        const isTokenInvalido =
          errorMsg.includes('inválido') ||
          errorMsg.includes('invalido') ||
          errorMsg.includes('não fornecido') ||
          errorMsg.includes('nao fornecido')

        // Token inválido (ex.: participante removido após restore de banco):
        // limpar sessão local para forçar novo login imediatamente.
        if (isTokenInvalido) {
          localStorage.removeItem('participante_token')
          setParticipante(null)
          setIngressos([])
          limparCache()
          if (!silent) setLoadError(false)
          return { success: false, unauthorized: true, tokenInvalido: true }
        }

        // Regra de consistência: em qualquer 401, deslogar completamente.
        // Evita "login fantasma" (mostra logado, mas sem ingressos atualizados).
        localStorage.removeItem('participante_token')
        setParticipante(null)
        setIngressos([])
        limparCache()
        if (!silent) setLoadError(false)
        return { success: false, unauthorized: true, tokenInvalido: isTokenInvalido }
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
      const apiError = err.response?.data?.error
      const msg = apiError
        ? apiError
        : err.response?.status === 401
          ? 'Telefone ou senha incorretos.'
          : 'Erro ao fazer login. Tente novamente.'
      return { success: false, error: msg }
    }
  }

  const registrar = async (dados) => {
    const tokenAtual = localStorage.getItem('participante_token')
    const isFormData = typeof FormData !== 'undefined' && dados instanceof FormData
    const headers = {}
    if (tokenAtual) {
      headers['X-Participante-Token'] = tokenAtual
    }
    if (isFormData) {
      headers['Content-Type'] = 'multipart/form-data'
    }
    const config = Object.keys(headers).length > 0 ? { headers } : undefined
    try {
      const response = await api.post('/participante/registro/', dados, config)
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
      return {
        success: false,
        error: response.data.error,
        errors_por_campo: response.data.errors_por_campo,
      }
    } catch (err) {
      const data = err.response?.data || {}
      if (data.errors_por_campo && typeof data.errors_por_campo === 'object') {
        return {
          success: false,
          error: data.error || 'Revise os campos do formulário.',
          errors_por_campo: data.errors_por_campo,
        }
      }
      const apiError = data.error
      const msg = apiError
        ? apiError
        : err.response?.status === 401
          ? 'Telefone ou senha incorretos.'
          : err.response?.status >= 500
            ? 'Erro ao realizar inscrição. Tente novamente em instantes.'
            : 'Erro ao realizar inscrição. Tente novamente.'
      return { success: false, error: msg }
    }
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
    // Não limpar cache antes da resposta da API.
    // Se a consulta falhar (ex.: 401 transitório/rede), manter ingressos já exibidos.
    return await carregarPerfil(token, { isRefresh: true, silent: !!opcoes.silent })
  }

  const getToken = () => {
    return localStorage.getItem('participante_token')
  }

  const tentarCarregarNovamente = async () => {
    const token = localStorage.getItem('participante_token')
    if (token) return await carregarPerfil(token, { isRefresh: true })
    return { success: false }
  }

  // Sessão logada baseada em participante em memória/cache.
  // Token pode expirar em background e ser atualizado no próximo login manual.
  const isLoggedIn = !!participante

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
