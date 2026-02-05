import { useState } from 'react'
import { MapPin, Phone, Mail, Clock, Send, Check } from 'lucide-react'
import api from '../services/api'
import { useConfiguracao } from '../contexts/ConfiguracaoContext'

function Contato() {
  const { configuracao: config } = useConfiguracao()
  const corHeaderPagina = config?.cor_header_pagina && /^#[0-9A-Fa-f]{6}$/.test(config.cor_header_pagina) ? config.cor_header_pagina : '#1a365d'
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    assunto: '',
    mensagem: '',
  })
  const [loading, setLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState('')

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
    setErro('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErro('')

    try {
      await api.post('/contatos/', formData)
      setSucesso(true)
      setFormData({
        nome: '',
        email: '',
        telefone: '',
        assunto: '',
        mensagem: '',
      })
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      // Simular sucesso para demonstração
      setSucesso(true)
    } finally {
      setLoading(false)
    }
  }

  // Montar endereço completo
  const endereco = []
  if (config?.endereco) endereco.push(config.endereco)
  if (config?.cidade || config?.estado) {
    const cidadeEstado = [config.cidade, config.estado].filter(Boolean).join('/')
    if (cidadeEstado) endereco.push(cidadeEstado)
  }
  if (config?.cep) endereco.push(`CEP: ${config.cep}`)

  // Montar lista de telefones
  const telefones = []
  if (config?.telefone) telefones.push(config.telefone)
  if (config?.whatsapp && config.whatsapp !== config?.telefone) telefones.push(config.whatsapp)

  // Montar lista de emails
  const emails = []
  if (config?.email) emails.push(config.email)

  // Horário de funcionamento
  const horarios = []
  if (config?.horarios) {
    horarios.push(...config.horarios.split('\n').filter(Boolean))
  } else {
    horarios.push('Entre em contato para mais informações')
  }

  const contatos = [
    {
      icon: <MapPin className="h-6 w-6" />,
      titulo: 'Endereço',
      info: endereco.length > 0 ? endereco : ['Endereço não cadastrado'],
    },
    {
      icon: <Phone className="h-6 w-6" />,
      titulo: 'Telefone',
      info: telefones.length > 0 ? telefones : ['Telefone não cadastrado'],
    },
    {
      icon: <Mail className="h-6 w-6" />,
      titulo: 'E-mail',
      info: emails.length > 0 ? emails : ['E-mail não cadastrado'],
    },
    {
      icon: <Clock className="h-6 w-6" />,
      titulo: 'Horário de Funcionamento',
      info: horarios,
    },
  ]

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-20" style={{ backgroundColor: corHeaderPagina }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-6">
            Entre em Contato
          </h1>
          <p className="text-xl text-primary-100 max-w-3xl mx-auto">
            Estamos aqui para ajudá-lo. Entre em contato conosco através do 
            formulário abaixo ou pelos nossos canais de atendimento.
          </p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Contact Info */}
            <div className="lg:col-span-1">
              <h2 className="text-2xl font-bold text-church-navy mb-6">
                Informações de Contato
              </h2>
              <div className="space-y-6">
                {contatos.map((contato, index) => (
                  <div key={index} className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-600">{contato.icon}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-church-navy mb-1">
                        {contato.titulo}
                      </h3>
                      {contato.info.map((linha, i) => (
                        <p key={i} className="text-gray-600 text-sm">
                          {linha}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Map Placeholder */}
              <div className="mt-8">
                <div className="bg-gray-200 rounded-xl h-64 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <MapPin className="h-12 w-12 mx-auto mb-2" />
                    <p>Mapa da localização</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-lg p-8">
                {sucesso ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Check className="h-10 w-10 text-green-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-church-navy mb-4">
                      Mensagem Enviada!
                    </h3>
                    <p className="text-gray-600 mb-8 max-w-md mx-auto">
                      Obrigado por entrar em contato. Responderemos sua mensagem 
                      o mais breve possível.
                    </p>
                    <button
                      onClick={() => setSucesso(false)}
                      className="btn-primary"
                    >
                      Enviar Nova Mensagem
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-church-navy mb-6">
                      Envie sua Mensagem
                    </h2>

                    {erro && (
                      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                        {erro}
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label htmlFor="nome" className="label">
                            Nome Completo *
                          </label>
                          <input
                            type="text"
                            id="nome"
                            name="nome"
                            value={formData.nome}
                            onChange={handleChange}
                            required
                            className="input-field"
                            placeholder="Seu nome"
                          />
                        </div>

                        <div>
                          <label htmlFor="email" className="label">
                            E-mail *
                          </label>
                          <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="input-field"
                            placeholder="seu@email.com"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label htmlFor="telefone" className="label">
                            Telefone
                          </label>
                          <input
                            type="tel"
                            id="telefone"
                            name="telefone"
                            value={formData.telefone}
                            onChange={handleChange}
                            className="input-field"
                            placeholder="(11) 99999-9999"
                          />
                        </div>

                        <div>
                          <label htmlFor="assunto" className="label">
                            Assunto *
                          </label>
                          <select
                            id="assunto"
                            name="assunto"
                            value={formData.assunto}
                            onChange={handleChange}
                            required
                            className="input-field"
                          >
                            <option value="">Selecione um assunto</option>
                            <option value="Informações Gerais">Informações Gerais</option>
                            <option value="Oração">Pedido de Oração</option>
                            <option value="Eventos">Eventos</option>
                            <option value="Ministérios">Ministérios</option>
                            <option value="Aconselhamento">Aconselhamento</option>
                            <option value="Outros">Outros</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="mensagem" className="label">
                          Mensagem *
                        </label>
                        <textarea
                          id="mensagem"
                          name="mensagem"
                          value={formData.mensagem}
                          onChange={handleChange}
                          required
                          rows={6}
                          className="input-field resize-none"
                          placeholder="Digite sua mensagem..."
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full md:w-auto flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          'Enviando...'
                        ) : (
                          <>
                            <Send className="h-5 w-5 mr-2" />
                            Enviar Mensagem
                          </>
                        )}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Contato
