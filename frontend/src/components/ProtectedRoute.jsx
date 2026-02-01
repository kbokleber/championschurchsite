import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from './LoadingSpinner'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text="Verificando autenticação..." />
      </div>
    )
  }

  if (!isAuthenticated) {
    // Redireciona para login, salvando a página que o usuário tentou acessar
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  return children
}

export default ProtectedRoute
