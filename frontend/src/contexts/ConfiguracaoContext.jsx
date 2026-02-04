import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

const ConfiguracaoContext = createContext(null)

export function ConfiguracaoProvider({ children }) {
  const [configuracao, setConfiguracao] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarConfiguracao()
  }, [])

  const carregarConfiguracao = async () => {
    try {
      const response = await api.get('/configuracao/')
      setConfiguracao(response.data)
    } catch (error) {
      console.error('Erro ao carregar configurações:', error)
      // Configuração padrão em caso de erro
      setConfiguracao({
        nome_igreja: 'Champions Church',
        slogan: '',
        descricao: 'Uma igreja para toda a família.',
        email: '',
        telefone: '',
        whatsapp: '',
        endereco: '',
        cidade: '',
        estado: '',
        facebook: '',
        instagram: '',
        youtube: ''
      })
    } finally {
      setLoading(false)
    }
  }

  const atualizarConfiguracao = async (dados) => {
    try {
      const response = await api.patch('/admin/configuracao/', dados)
      setConfiguracao(response.data)
      return { success: true, data: response.data }
    } catch (error) {
      console.error('Erro ao atualizar configurações:', error)
      return { success: false, error }
    }
  }

  const recarregar = () => {
    carregarConfiguracao()
  }

  // Helper para obter URL completa de imagem
  const getImageUrl = (path) => {
    if (!path) return null
    if (path.startsWith('http')) return path
    // Em produção usa mesma origem (''), Nginx faz proxy de /media
    const isProd = import.meta.env.MODE === 'production'
    const baseUrl = isProd ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:8000')
    return `${baseUrl}${path}`
  }

  return (
    <ConfiguracaoContext.Provider value={{
      configuracao,
      loading,
      atualizarConfiguracao,
      recarregar,
      getImageUrl
    }}>
      {children}
    </ConfiguracaoContext.Provider>
  )
}

export function useConfiguracao() {
  const context = useContext(ConfiguracaoContext)
  if (!context) {
    throw new Error('useConfiguracao deve ser usado dentro de ConfiguracaoProvider')
  }
  return context
}
