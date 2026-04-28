import { createContext, useContext, useState, useEffect } from 'react'
import api, { formatApiError } from '../services/api'

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
      const userData = response.data
      
      // Se não for superusuário, buscar menus permitidos
      if (!userData.is_superuser) {
        try {
          const menusResponse = await api.get('/auth/menus-permitidos/')
          userData.menus_permitidos = menusResponse.data.codigos || []
        } catch (error) {
          console.error('Erro ao carregar menus permitidos:', error)
          userData.menus_permitidos = []
        }
      } else {
        // Superusuário tem acesso a tudo
        userData.menus_permitidos = ['dashboard', 'eventos', 'membros', 'inscricoes', 'cobrancas', 'checkin', 'contatos', 'categorias', 'configuracoes', 'usuarios', 'grupos', 'formularios_inscricao', 'loja', 'backup_import']
      }
      
      setUser(userData)
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
      const status = error.response?.status
      const isAuthFailed = status === 401 || status === 400
      const defaultMsg = isAuthFailed
        ? 'Usuário e/ou senha incorreto(s)'
        : 'Não foi possível entrar. Tente novamente.'
      return {
        success: false,
        error: formatApiError(error, defaultMsg),
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
