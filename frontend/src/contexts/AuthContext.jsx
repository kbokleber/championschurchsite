import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verificar se há token salvo ao carregar
    const token = localStorage.getItem('access_token')
    if (token) {
      loadUser()
    } else {
      setLoading(false)
    }
  }, [])

  const loadUser = async () => {
    try {
      const response = await api.get('/auth/me/')
      setUser(response.data)
    } catch (error) {
      console.error('Erro ao carregar usuário:', error)
      logout()
    } finally {
      setLoading(false)
    }
  }

  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login/', { username, password })
      const { access, refresh } = response.data
      
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      
      // Carregar dados do usuário
      await loadUser()
      
      return { success: true }
    } catch (error) {
      console.error('Erro no login:', error)
      return {
        success: false,
        error: error.response?.data?.detail || 'Credenciais inválidas'
      }
    }
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
  }

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
