import axios from 'axios'

// Usar variável de ambiente se disponível, caso contrário usar proxy relativo
// Remover barra final da URL base para evitar dupla barra
const baseUrl = import.meta.env.VITE_API_URL 
  ? import.meta.env.VITE_API_URL.replace(/\/+$/, '') // Remove barras no final
  : ''

// Em produção (preview/build), VITE_API_URL DEVE estar definida
// Em desenvolvimento, pode usar proxy relativo '/api'
const isProduction = import.meta.env.MODE === 'production' || import.meta.env.PROD
const API_BASE_URL = baseUrl 
  ? `${baseUrl}/api` 
  : (isProduction ? '' : '/api') // Em produção sem VITE_API_URL, vai dar erro (esperado)

// Debug: log da URL da API sendo usada
console.log('🔍 API Configuration:')
console.log('  VITE_API_URL:', import.meta.env.VITE_API_URL || '(não definida)')
console.log('  API Base URL:', API_BASE_URL || '(ERRO: não configurada)')
console.log('  Mode:', import.meta.env.MODE)
console.log('  Is Production:', isProduction)

// Aviso se em produção sem VITE_API_URL
if (isProduction && !baseUrl) {
  console.error('❌ ERRO: VITE_API_URL não está definida em produção!')
  console.error('   Configure VITE_API_URL no Coolify antes do build')
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Aumentar timeout para 30s
  headers: {
    'Content-Type': 'application/json',
  },
})

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
