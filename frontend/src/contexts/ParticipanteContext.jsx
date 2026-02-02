import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

const ParticipanteContext = createContext(null)

export function ParticipanteProvider({ children }) {
  const [participante, setParticipante] = useState(null)
  const [ingressos, setIngressos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verificar se há token salvo
    const token = localStorage.getItem('participante_token')
    if (token) {
      carregarPerfil(token)
    } else {
      setLoading(false)
    }
  }, [])

  const carregarPerfil = async (token) => {
    try {
      const response = await api.get('/participante/perfil/', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      setParticipante(response.data.participante)
      setIngressos(response.data.ingressos)
    } catch (error) {
      console.error('Erro ao carregar perfil:', error)
      // Token inválido ou expirado
      localStorage.removeItem('participante_token')
      setParticipante(null)
      setIngressos([])
    } finally {
      setLoading(false)
    }
  }

  const login = async (telefone, senha) => {
    const response = await api.post('/participante/login/', { telefone, senha })

    if (response.data.success) {
      localStorage.setItem('participante_token', response.data.token)
      setParticipante(response.data.participante)
      setIngressos(response.data.ingressos)
      return { success: true }
    }

    return { success: false, error: response.data.error }
  }

  const registrar = async (dados) => {
    const response = await api.post('/participante/registro/', dados)

    if (response.data.success) {
      localStorage.setItem('participante_token', response.data.token)
      setParticipante(response.data.participante)
      // Recarregar ingressos após registro
      await carregarPerfil(response.data.token)
      return {
        success: true,
        data: response.data
      }
    }

    return { success: false, error: response.data.error }
  }

  const logout = () => {
    localStorage.removeItem('participante_token')
    setParticipante(null)
    setIngressos([])
  }

  const atualizarIngressos = async () => {
    const token = localStorage.getItem('participante_token')
    if (token) {
      await carregarPerfil(token)
    }
  }

  const getToken = () => {
    return localStorage.getItem('participante_token')
  }

  const buscarParticipante = async (telefone) => {
    const response = await api.get(`/participante/buscar/?telefone=${telefone}`)
    return response.data
  }

  const resetarSenha = async (telefone) => {
    const response = await api.post('/participante/reset-senha/', { telefone })
    return response.data
  }

  return (
    <ParticipanteContext.Provider value={{
      participante,
      ingressos,
      loading,
      isLoggedIn: !!participante,
      login,
      registrar,
      logout,
      atualizarIngressos,
      getToken,
      buscarParticipante,
      resetarSenha
    }}>
      {children}
    </ParticipanteContext.Provider>
  )
}

export function useParticipante() {
  const context = useContext(ParticipanteContext)
  if (!context) {
    throw new Error('useParticipante deve ser usado dentro de ParticipanteProvider')
  }
  return context
}
