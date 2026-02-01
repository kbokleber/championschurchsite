import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Church, LogIn, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  
  const from = location.state?.from?.pathname || '/admin'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(username, password)
    
    if (result.success) {
      navigate(from, { replace: true })
    } else {
      setError(result.error)
    }
    
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-church-navy via-primary-900 to-church-navy flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center space-x-3">
            <Church className="h-12 w-12 text-church-gold" />
            <div>
              <span className="text-3xl font-serif font-bold text-white">Champions</span>
              <span className="text-3xl font-serif font-bold text-church-gold"> Church</span>
            </div>
          </Link>
          <p className="text-primary-200 mt-2">Painel Administrativo</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-2xl font-bold text-church-navy mb-6 text-center">
            Acesso Restrito
          </h1>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="label">
                Usuário
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="input-field"
                placeholder="Digite seu usuário"
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Senha
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-field"
                placeholder="Digite sua senha"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                'Entrando...'
              ) : (
                <>
                  <LogIn className="h-5 w-5 mr-2" />
                  Entrar
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/" className="text-sm text-primary-600 hover:text-primary-700">
              Voltar para o site
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
