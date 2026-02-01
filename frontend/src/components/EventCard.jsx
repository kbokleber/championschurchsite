import { Link } from 'react-router-dom'
import { Calendar, MapPin, Users, Tag } from 'lucide-react'
import { getMediaUrl, formatDateTimeBR } from '../services/utils'

function EventCard({ evento }) {
  const imagemUrl = getMediaUrl(evento.imagem)

  return (
    <div className="card">
      {/* Image */}
      <div className="relative h-48 bg-gradient-to-br from-primary-600 to-church-navy">
        {imagemUrl ? (
          <img
            src={imagemUrl}
            alt={evento.titulo}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Calendar className="h-16 w-16 text-white/30" />
          </div>
        )}
        {/* Badge de destaque */}
        {evento.destaque && (
          <span className="absolute top-3 right-3 bg-church-gold text-church-navy text-xs font-bold px-3 py-1 rounded-full">
            Destaque
          </span>
        )}
        {/* Badge de preço */}
        <span className={`absolute top-3 left-3 text-xs font-bold px-3 py-1 rounded-full ${
          evento.evento_pago 
            ? 'bg-green-500 text-white' 
            : 'bg-blue-500 text-white'
        }`}>
          {evento.valor_inscricao_formatado || (evento.evento_pago ? `R$ ${evento.valor_inscricao}` : 'Gratuito')}
        </span>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <span className="text-xs font-medium text-church-gold uppercase">
            {evento.tipo_display || evento.tipo}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="text-lg font-bold text-church-navy mb-2 line-clamp-2">
          {evento.titulo}
        </h3>

        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-gray-600">
            <Calendar className="h-4 w-4 mr-2 text-primary-500" />
            <span>{formatDateTimeBR(evento.data_inicio)}</span>
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <MapPin className="h-4 w-4 mr-2 text-primary-500" />
            <span className="truncate">{evento.local}</span>
          </div>
          {evento.vagas_disponiveis !== null && (
            <div className="flex items-center text-sm text-gray-600">
              <Users className="h-4 w-4 mr-2 text-primary-500" />
              <span>
                {evento.vagas_disponiveis > 0
                  ? `${evento.vagas_disponiveis} vagas disponíveis`
                  : 'Esgotado'}
              </span>
            </div>
          )}
        </div>

        <Link
          to={`/eventos/${evento.id}`}
          className="btn-outline w-full text-center block text-sm py-2"
        >
          Ver Detalhes
        </Link>
      </div>
    </div>
  )
}

export default EventCard
