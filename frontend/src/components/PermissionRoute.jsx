import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from './LoadingSpinner'

/**
 * Componente de rota protegida por permissão de menu.
 * Verifica se o usuário tem permissão para acessar uma rota específica.
 * 
 * @param {string} permission - Código da permissão de menu necessária
 * @param {ReactNode} children - Componente a ser renderizado se tiver permissão
 */
function PermissionRoute({ permission, children }) {
  const { user, loading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text="Verificando permissões..." />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  // Superusuários têm acesso a tudo
  if (user?.is_superuser) {
    return children
  }

  // Verificar se o usuário tem a permissão necessária
  const temPermissao = user?.menus_permitidos?.includes(permission)

  if (!temPermissao) {
    // Redirecionar para dashboard se não tiver permissão
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-md text-center">
          <div className="text-red-600 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Acesso Negado</h2>
          <p className="text-gray-600 mb-6">
            Você não tem permissão para acessar esta página.
          </p>
          <Navigate to="/admin" replace />
        </div>
      </div>
    )
  }

  return children
}

export default PermissionRoute
