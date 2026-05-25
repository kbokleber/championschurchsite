import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from './LoadingSpinner'

/** Rota exclusiva para super administradores (is_superuser). */
function SuperuserRoute({ children }) {
  const { user, loading, isAuthenticated } = useAuth()

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <LoadingSpinner size="lg" text="Verificando permissões..." />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  if (!user?.is_superuser) {
    return (
      <div className="bg-white rounded-xl shadow-md p-8 max-w-md text-center mx-auto mt-10">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Acesso restrito</h2>
        <p className="text-gray-600">Somente super administradores podem acessar o roadmap.</p>
      </div>
    )
  }

  return children
}

export default SuperuserRoute
