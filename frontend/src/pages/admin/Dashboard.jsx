import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Calendar, Users, FileText, Mail, 
  Plus, ArrowRight, TrendingUp 
} from 'lucide-react'
import api from '../../services/api'
import { formatDateTimeBR } from '../../services/utils'
import LoadingSpinner from '../../components/LoadingSpinner'

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/dashboard/stats/')
        setStats(response.data)
      } catch (error) {
        console.error('Erro ao carregar estatísticas:', error)
        // Dados de exemplo
        setStats({
          total_eventos: 12,
          eventos_futuros: 5,
          total_membros: 150,
          total_inscricoes: 89,
          contatos_nao_lidos: 3,
          proximos_eventos: []
        })
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner text="Carregando dashboard..." />
      </div>
    )
  }

  const cards = [
    {
      title: 'Eventos Futuros',
      value: stats?.eventos_futuros || 0,
      icon: <Calendar className="h-8 w-8" />,
      color: 'bg-blue-500',
      link: '/admin/eventos',
    },
    {
      title: 'Total de Membros',
      value: stats?.total_membros || 0,
      icon: <Users className="h-8 w-8" />,
      color: 'bg-green-500',
      link: '/admin/membros',
    },
    {
      title: 'Inscrições Confirmadas',
      value: stats?.total_inscricoes || 0,
      icon: <FileText className="h-8 w-8" />,
      color: 'bg-purple-500',
      link: '/admin/inscricoes',
    },
    {
      title: 'Mensagens Não Lidas',
      value: stats?.contatos_nao_lidos || 0,
      icon: <Mail className="h-8 w-8" />,
      color: 'bg-orange-500',
      link: '/admin/contatos',
    },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-church-navy">Dashboard</h1>
        <p className="text-gray-600 mt-1">Visão geral do sistema</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card, index) => (
          <Link
            key={index}
            to={card.link}
            className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">{card.title}</p>
                <p className="text-3xl font-bold text-church-navy">{card.value}</p>
              </div>
              <div className={`${card.color} p-3 rounded-lg text-white`}>
                {card.icon}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions & Próximos Eventos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-church-navy mb-4 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2" />
            Ações Rápidas
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Link
              to="/admin/eventos/novo"
              className="flex items-center p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
            >
              <Plus className="h-5 w-5 text-primary-600 mr-3" />
              <span className="font-medium text-primary-700">Novo Evento</span>
            </Link>
            <Link
              to="/admin/membros/novo"
              className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
            >
              <Plus className="h-5 w-5 text-green-600 mr-3" />
              <span className="font-medium text-green-700">Novo Membro</span>
            </Link>
            <Link
              to="/admin/eventos"
              className="flex items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Calendar className="h-5 w-5 text-blue-600 mr-3" />
              <span className="font-medium text-blue-700">Ver Eventos</span>
            </Link>
            <Link
              to="/admin/contatos"
              className="flex items-center p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
            >
              <Mail className="h-5 w-5 text-orange-600 mr-3" />
              <span className="font-medium text-orange-700">Ver Mensagens</span>
            </Link>
          </div>
        </div>

        {/* Próximos Eventos */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-church-navy flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              Próximos Eventos
            </h2>
            <Link
              to="/admin/eventos"
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center"
            >
              Ver todos
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
          
          {stats?.proximos_eventos?.length > 0 ? (
            <div className="space-y-3">
              {stats.proximos_eventos.map((evento) => (
                <Link
                  key={evento.id}
                  to={`/admin/eventos/${evento.id}`}
                  className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mr-4">
                    <span className="text-sm font-bold text-primary-600">
                      {formatDateTimeBR(evento.data_inicio)}
                    </span>
                  </div>
                  <div className="flex-grow">
                    <p className="font-medium text-church-navy">{evento.titulo}</p>
                    <p className="text-sm text-gray-500">{evento.local}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              Nenhum evento agendado
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
