import axios from 'axios'

// Em produção atrás do Nginx: usar sempre URL relativa '/api' (mesma origem) para evitar
// ERR_CERT_AUTHORITY_INVALID e CORS - o Nginx faz proxy para o backend
const isProduction = import.meta.env.MODE === 'production' || import.meta.env.PROD
const baseUrl = !isProduction && import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/+$/, '')
  : ''

const API_BASE_URL = baseUrl ? `${baseUrl}/api` : '/api'

// Debug: log da URL da API sendo usada
console.log('API Configuration:', { API_BASE_URL, isProduction, mode: import.meta.env.MODE })

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Aumentar timeout para 30s
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Extrai mensagem legível de erros DRF/Axios (detail, campos, 500 genérico).
 */
export function formatApiError(error, fallback = 'Ocorreu um erro. Tente novamente.') {
  const status = error.response?.status
  const data = error.response?.data

  if (data == null) {
    if (error.code === 'ECONNABORTED') return 'Tempo esgotado. Verifique se o backend está rodando.'
    if (error.message === 'Network Error') return 'Não foi possível conectar ao servidor. Verifique o backend e a URL da API.'
    return fallback
  }

  if (typeof data === 'string') {
    const s = data.replace(/<[^>]+>/g, '').trim()
    if (s.length > 0 && s.length < 400) return s
    if (status >= 500) return 'Erro no servidor. Veja o terminal do Django para o traceback.'
    return fallback
  }

  if (data.detail != null) {
    const d = data.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d.length) {
      const first = d[0]
      if (typeof first === 'string') return first
      if (first && typeof first === 'object' && first.string) return String(first.string)
    }
  }

  if (typeof data.error === 'string' && data.error.trim()) return data.error.trim()
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim()

  const fieldKeys = Object.keys(data).filter(
    (k) => k !== 'detail' && k !== 'status' && k !== 'success' && k !== 'mp_http_status',
  )
  for (const k of fieldKeys) {
    const v = data[k]
    if (typeof v === 'string' && v.trim()) return `${k}: ${v}`
    if (Array.isArray(v) && v.length) {
      const first = v[0]
      if (typeof first === 'string') return `${k}: ${first}`
      if (first != null && typeof first === 'object') {
        const s = first.string != null ? String(first.string) : String(first)
        if (s && s !== '[object Object]') return `${k}: ${s}`
      }
    }
  }

  if (status >= 500) {
    return 'Erro no servidor (500). Confira o log do Django e se as migrations foram aplicadas (ex.: token_blacklist).'
  }

  return fallback
}

/** Extrai `detail` quando a resposta veio como Blob (ex.: export backup com responseType blob). */
export async function parseApiErrorDetail(error, fallback = 'Ocorreu um erro. Tente novamente.') {
  const data = error?.response?.data
  if (data instanceof Blob) {
    try {
      const text = await data.text()
      if (text.trim().startsWith('{')) {
        const parsed = JSON.parse(text)
        if (parsed.detail != null) {
          return typeof parsed.detail === 'string' ? parsed.detail : fallback
        }
      }
      if (text.length > 0 && text.length < 400) return text
    } catch {
      /* ignore */
    }
  }
  return formatApiError(error, fallback)
}

function isLocalFrontendHost() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1'
}

function remoteBackupApiBase() {
  const backup = (import.meta.env.VITE_BACKUP_API_URL || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
  return backup ? `${backup}/api` : ''
}

/** Export de backup (exige PostgreSQL — pode apontar para dev remoto). */
export function resolveBackupExportApiBaseUrl() {
  if (isProduction) return API_BASE_URL
  return remoteBackupApiBase() || API_BASE_URL
}

const LOCAL_BACKEND_API = (import.meta.env.VITE_LOCAL_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

/** Import de backup: em localhost sempre no backend local (SQLite), direto na :8000. */
export function resolveBackupImportApiBaseUrl() {
  if (isProduction) return API_BASE_URL
  const importOverride = (import.meta.env.VITE_BACKUP_IMPORT_API_URL || '').replace(/\/+$/, '')
  if (importOverride) return `${importOverride}/api`
  if (isLocalFrontendHost()) return `${LOCAL_BACKEND_API}/api`
  return remoteBackupApiBase() || API_BASE_URL
}

/** @deprecated use resolveBackupExportApiBaseUrl ou resolveBackupImportApiBaseUrl */
export function resolveBackupApiBaseUrl() {
  return resolveBackupExportApiBaseUrl()
}

// Interceptor para adicionar token de autenticação (apenas para rotas do admin)
// Rotas /participante/ usam o token do participante passado no header de cada requisição
api.interceptors.request.use(
  (config) => {
    const isParticipante = config.url && config.url.includes('/participante/')
    if (!isParticipante) {
      const token = localStorage.getItem('access_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    // FormData: o boundary é obrigatório; nunca forçar multipart sem boundary (falha no parse no Django)
    if (config.data instanceof FormData) {
      const h = config.headers
      if (h && typeof h.delete === 'function') {
        h.delete('Content-Type')
        h.delete('content-type')
      } else if (h) {
        delete h['Content-Type']
        delete h['content-type']
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Interceptor para tratamento de erros e refresh token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Se o erro for 401 e não for uma tentativa de refresh (só refresh para rotas do admin)
    const isParticipante = originalRequest.url && originalRequest.url.includes('/participante/')
    if (error.response?.status === 401 && !originalRequest._retry && !isParticipante) {
      originalRequest._retry = true

      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
            refresh: refreshToken
          })
          
          const { access } = response.data
          localStorage.setItem('access_token', access)
          
          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${access}`
          return api(originalRequest)
        } catch (refreshError) {
          // Refresh failed, clear tokens and redirect to login
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/admin/login'
          return Promise.reject(refreshError)
        }
      }
    }

    if (error.response) {
      console.error('Erro na resposta:', error.response.status, error.response.data)
    } else if (error.request) {
      console.error('Sem resposta do servidor:', error.request)
    } else {
      console.error('Erro:', error.message)
    }
    return Promise.reject(error)
  }
)

export default api
