import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor para adicionar token de autenticação
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
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

    // Se o erro for 401 e não for uma tentativa de refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const response = await axios.post('/api/auth/refresh/', {
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
