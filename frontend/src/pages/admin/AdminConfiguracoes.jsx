import { useState, useEffect } from 'react'
import { Save, Upload, X, Church, Mail, Phone, MapPin, Facebook, Instagram, Youtube, Twitter, Globe, Webhook, ToggleLeft, ToggleRight, CreditCard, AlertTriangle, CheckCircle } from 'lucide-react'
import api from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'

function AdminConfiguracoes() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [activeTab, setActiveTab] = useState('geral')
  
  const [formData, setFormData] = useState({
    nome_igreja: '',
    slogan: '',
    descricao: '',
    email: '',
    telefone: '',
    whatsapp: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    facebook: '',
    instagram: '',
    youtube: '',
    tiktok: '',
    twitter: '',
    horarios: '',
    google_maps_embed: '',
    webhook_inscricao: '',
    webhook_ativo: false,
    // Mercado Pago
    mp_ambiente: 'sandbox',
    mp_ativo: false,
    mp_public_key_sandbox: '',
    mp_access_token_sandbox: '',
    mp_public_key_production: '',
    mp_access_token_production: ''
  })

  const [logoPreview, setLogoPreview] = useState(null)
  const [logoBrancoPreview, setLogoBrancoPreview] = useState(null)
  const [newLogo, setNewLogo] = useState(null)
  const [newLogoBranco, setNewLogoBranco] = useState(null)

  useEffect(() => {
    fetchConfiguracao()
  }, [])

  const fetchConfiguracao = async () => {
    try {
      const response = await api.get('/admin/configuracao/')
      const data = response.data
      
      setFormData({
        nome_igreja: data.nome_igreja || '',
        slogan: data.slogan || '',
        descricao: data.descricao || '',
        email: data.email || '',
        telefone: data.telefone || '',
        whatsapp: data.whatsapp || '',
        endereco: data.endereco || '',
        cidade: data.cidade || '',
        estado: data.estado || '',
        cep: data.cep || '',
        facebook: data.facebook || '',
        instagram: data.instagram || '',
        youtube: data.youtube || '',
        tiktok: data.tiktok || '',
        twitter: data.twitter || '',
        horarios: data.horarios || '',
        google_maps_embed: data.google_maps_embed || '',
        webhook_inscricao: data.webhook_inscricao || '',
        webhook_ativo: data.webhook_ativo || false,
        // Mercado Pago
        mp_ambiente: data.mp_ambiente || 'sandbox',
        mp_ativo: data.mp_ativo || false,
        mp_public_key_sandbox: data.mp_public_key_sandbox || '',
        mp_access_token_sandbox: data.mp_access_token_sandbox || '',
        mp_public_key_production: data.mp_public_key_production || '',
        mp_access_token_production: data.mp_access_token_production || ''
      })

      if (data.logo) {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
        setLogoPreview(data.logo.startsWith('http') ? data.logo : `${baseUrl}${data.logo}`)
      }
      if (data.logo_branco) {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
        setLogoBrancoPreview(data.logo_branco.startsWith('http') ? data.logo_branco : `${baseUrl}${data.logo_branco}`)
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error)
      setMessage({ type: 'error', text: 'Erro ao carregar configurações' })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleLogoChange = (e, type) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (type === 'logo') {
          setLogoPreview(reader.result)
          setNewLogo(file)
        } else {
          setLogoBrancoPreview(reader.result)
          setNewLogoBranco(file)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const removeLogo = (type) => {
    if (type === 'logo') {
      setLogoPreview(null)
      setNewLogo(null)
    } else {
      setLogoBrancoPreview(null)
      setNewLogoBranco(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage({ type: '', text: '' })

    try {
      const data = new FormData()
      
      // Adiciona todos os campos de texto
      Object.keys(formData).forEach(key => {
        data.append(key, formData[key])
      })

      // Adiciona logos se houver novos
      if (newLogo) {
        data.append('logo', newLogo)
      }
      if (newLogoBranco) {
        data.append('logo_branco', newLogoBranco)
      }

      await api.patch('/admin/configuracao/', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' })
      setNewLogo(null)
      setNewLogoBranco(null)
      
      // Recarrega para atualizar URLs das imagens
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (error) {
      console.error('Erro ao salvar:', error)
      setMessage({ type: 'error', text: 'Erro ao salvar configurações' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingSpinner text="Carregando configurações..." />
  }

  const tabs = [
    { id: 'geral', label: 'Informações Gerais', icon: Church },
    { id: 'contato', label: 'Contato', icon: Phone },
    { id: 'endereco', label: 'Endereço', icon: MapPin },
    { id: 'redes', label: 'Redes Sociais', icon: Globe },
    { id: 'visual', label: 'Logo e Visual', icon: Upload },
    { id: 'integracoes', label: 'Integrações', icon: Webhook },
    { id: 'mercadopago', label: 'Mercado Pago', icon: CreditCard }
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-church-navy">Configurações do Site</h1>
        <p className="text-gray-600 mt-1">Gerencie as informações que aparecem no site</p>
      </div>

      {/* Message */}
      {message.text && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 
          'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="border-b">
          <div className="flex overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 bg-primary-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="h-5 w-5 mr-2" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Tab: Geral */}
          {activeTab === 'geral' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome da Igreja *
                </label>
                <input
                  type="text"
                  name="nome_igreja"
                  value={formData.nome_igreja}
                  onChange={handleChange}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Slogan
                </label>
                <input
                  type="text"
                  name="slogan"
                  value={formData.slogan}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Uma frase curta que define a igreja"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição
                </label>
                <textarea
                  name="descricao"
                  value={formData.descricao}
                  onChange={handleChange}
                  rows={4}
                  className="input-field"
                  placeholder="Texto sobre a igreja para o rodapé e outras áreas"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Horários dos Cultos
                </label>
                <textarea
                  name="horarios"
                  value={formData.horarios}
                  onChange={handleChange}
                  rows={4}
                  className="input-field"
                  placeholder="Ex: Domingos: 9h e 18h&#10;Quartas: 19h30 - Estudo Bíblico"
                />
              </div>
            </div>
          )}

          {/* Tab: Contato */}
          {activeTab === 'contato' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Mail className="inline h-4 w-4 mr-1" />
                  E-mail de Contato
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="contato@igreja.com.br"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Phone className="inline h-4 w-4 mr-1" />
                    Telefone
                  </label>
                  <input
                    type="text"
                    name="telefone"
                    value={formData.telefone}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    WhatsApp
                  </label>
                  <input
                    type="text"
                    name="whatsapp"
                    value={formData.whatsapp}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="5511999999999 (apenas números)"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Código do país + DDD + número (sem espaços)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Endereço */}
          {activeTab === 'endereco' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Endereço
                </label>
                <input
                  type="text"
                  name="endereco"
                  value={formData.endereco}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Rua, número, bairro"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cidade
                  </label>
                  <input
                    type="text"
                    name="cidade"
                    value={formData.cidade}
                    onChange={handleChange}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado (UF)
                  </label>
                  <input
                    type="text"
                    name="estado"
                    value={formData.estado}
                    onChange={handleChange}
                    className="input-field"
                    maxLength={2}
                    placeholder="SP"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CEP
                  </label>
                  <input
                    type="text"
                    name="cep"
                    value={formData.cep}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="00000-000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Código Embed do Google Maps
                </label>
                <textarea
                  name="google_maps_embed"
                  value={formData.google_maps_embed}
                  onChange={handleChange}
                  rows={4}
                  className="input-field font-mono text-sm"
                  placeholder='<iframe src="..." ...></iframe>'
                />
                <p className="text-xs text-gray-500 mt-1">
                  Cole o código iframe copiado do Google Maps (Compartilhar &gt; Incorporar mapa)
                </p>
              </div>
            </div>
          )}

          {/* Tab: Redes Sociais */}
          {activeTab === 'redes' && (
            <div className="space-y-6">
              <p className="text-sm text-gray-600 mb-4">
                Insira as URLs completas dos perfis nas redes sociais
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Facebook className="inline h-4 w-4 mr-1 text-blue-600" />
                  Facebook
                </label>
                <input
                  type="url"
                  name="facebook"
                  value={formData.facebook}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="https://facebook.com/suaigreja"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Instagram className="inline h-4 w-4 mr-1 text-pink-600" />
                  Instagram
                </label>
                <input
                  type="url"
                  name="instagram"
                  value={formData.instagram}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="https://instagram.com/suaigreja"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Youtube className="inline h-4 w-4 mr-1 text-red-600" />
                  YouTube
                </label>
                <input
                  type="url"
                  name="youtube"
                  value={formData.youtube}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="https://youtube.com/@suaigreja"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  TikTok
                </label>
                <input
                  type="url"
                  name="tiktok"
                  value={formData.tiktok}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="https://tiktok.com/@suaigreja"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Twitter className="inline h-4 w-4 mr-1" />
                  Twitter / X
                </label>
                <input
                  type="url"
                  name="twitter"
                  value={formData.twitter}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="https://x.com/suaigreja"
                />
              </div>
            </div>
          )}

          {/* Tab: Visual */}
          {activeTab === 'visual' && (
            <div className="space-y-8">
              {/* Logo Principal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Logo Principal
                </label>
                <div className="flex items-start space-x-4">
                  {logoPreview ? (
                    <div className="relative">
                      <img
                        src={logoPreview}
                        alt="Logo"
                        className="h-24 w-auto object-contain border rounded-lg p-2 bg-gray-50"
                      />
                      <button
                        type="button"
                        onClick={() => removeLogo('logo')}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-24 w-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                      <Church className="h-10 w-10 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <label className="btn-outline cursor-pointer inline-flex items-center">
                      <Upload className="h-4 w-4 mr-2" />
                      Selecionar Logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleLogoChange(e, 'logo')}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-2">
                      Formatos: PNG, JPG. Recomendado: fundo transparente
                    </p>
                  </div>
                </div>
              </div>

              {/* Logo Branco */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Logo Branco (para fundos escuros)
                </label>
                <div className="flex items-start space-x-4">
                  {logoBrancoPreview ? (
                    <div className="relative">
                      <img
                        src={logoBrancoPreview}
                        alt="Logo Branco"
                        className="h-24 w-auto object-contain border rounded-lg p-2 bg-church-navy"
                      />
                      <button
                        type="button"
                        onClick={() => removeLogo('logo_branco')}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-24 w-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-church-navy">
                      <Church className="h-10 w-10 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <label className="btn-outline cursor-pointer inline-flex items-center">
                      <Upload className="h-4 w-4 mr-2" />
                      Selecionar Logo Branco
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleLogoChange(e, 'logo_branco')}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-2">
                      Versão clara do logo para usar no rodapé e áreas escuras
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Integrações */}
          {activeTab === 'integracoes' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-blue-800 mb-2">Webhook de Inscrição</h3>
                <p className="text-sm text-blue-700">
                  Configure um webhook para receber os dados de cada nova inscrição em tempo real.
                  Ideal para integrar com sistemas de automação, WhatsApp, e-mail marketing, etc.
                </p>
              </div>

              {/* Toggle Ativo/Inativo */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="font-medium text-gray-700">Webhook Ativo</label>
                  <p className="text-sm text-gray-500">
                    {formData.webhook_ativo 
                      ? 'O webhook será enviado a cada nova inscrição' 
                      : 'O webhook está desativado'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, webhook_ativo: !prev.webhook_ativo }))}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    formData.webhook_ativo ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${
                      formData.webhook_ativo ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Webhook className="inline h-4 w-4 mr-1" />
                  URL do Webhook
                </label>
                <input
                  type="url"
                  name="webhook_inscricao"
                  value={formData.webhook_inscricao}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="https://seu-servidor.com/webhook/inscricao"
                />
                <p className="text-xs text-gray-500 mt-1">
                  URL que receberá uma requisição POST com os dados da inscrição
                </p>
              </div>

              {/* Exemplo de Payload */}
              <div className="mt-6">
                <h4 className="font-medium text-gray-700 mb-2">Exemplo de dados enviados:</h4>
                <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
{`{
  "tipo": "nova_inscricao",
  "timestamp": "2024-01-15T10:30:00Z",
  
  "participante": {
    "id": 123,
    "nome": "João Silva",
    "telefone": "11999999999",
    "telefone_formatado": "(11) 99999-9999",
    "email": "joao@email.com",
    "senha": "123456",
    "novo_cadastro": true
  },
  
  "inscricao": {
    "id": 456,
    "codigo": "abc123-def456-...",
    "qrcode_url": "http://site.com/media/qrcodes/...",
    "status": "confirmada"
  },
  
  "evento": {
    "id": 789,
    "titulo": "Conferência 2024",
    "data_inicio": "20/01/2024 19:00",
    "local": "Templo Principal",
    "evento_pago": false
  },
  
  "igreja": {
    "nome": "Champions Church",
    "telefone": "(11) 99999-9999",
    "email": "contato@igreja.com"
  }
}`}
                </pre>
              </div>
            </div>
          )}

          {/* Tab: Mercado Pago */}
          {activeTab === 'mercadopago' && (
            <div className="space-y-6">
              {/* Aviso Ambiente */}
              <div className={`border rounded-lg p-4 ${
                formData.mp_ambiente === 'production' 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                <div className="flex items-start">
                  {formData.mp_ambiente === 'production' ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mr-3 mt-0.5" />
                  )}
                  <div>
                    <h3 className={`font-medium ${
                      formData.mp_ambiente === 'production' ? 'text-green-800' : 'text-yellow-800'
                    }`}>
                      {formData.mp_ambiente === 'production' 
                        ? 'Ambiente de Produção' 
                        : 'Ambiente de Testes (Sandbox)'}
                    </h3>
                    <p className={`text-sm mt-1 ${
                      formData.mp_ambiente === 'production' ? 'text-green-700' : 'text-yellow-700'
                    }`}>
                      {formData.mp_ambiente === 'production' 
                        ? 'Os pagamentos serão processados de verdade. Tenha cuidado!' 
                        : 'Use cartões e dados de teste. Nenhum pagamento real será processado.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Toggle Ativo/Inativo */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="font-medium text-gray-700">Mercado Pago Ativo</label>
                  <p className="text-sm text-gray-500">
                    {formData.mp_ativo 
                      ? 'Pagamentos via PIX estão habilitados' 
                      : 'Pagamentos via Mercado Pago estão desativados'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, mp_ativo: !prev.mp_ativo }))}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    formData.mp_ativo ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${
                      formData.mp_ativo ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Seleção de Ambiente */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ambiente
                </label>
                <div className="flex gap-4">
                  <label className={`flex-1 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    formData.mp_ambiente === 'sandbox' 
                      ? 'border-yellow-500 bg-yellow-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="mp_ambiente"
                      value="sandbox"
                      checked={formData.mp_ambiente === 'sandbox'}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    <div className="flex items-center">
                      <AlertTriangle className={`h-5 w-5 mr-2 ${
                        formData.mp_ambiente === 'sandbox' ? 'text-yellow-600' : 'text-gray-400'
                      }`} />
                      <div>
                        <p className="font-medium">Sandbox (Testes)</p>
                        <p className="text-xs text-gray-500">Para desenvolvimento e testes</p>
                      </div>
                    </div>
                  </label>
                  <label className={`flex-1 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    formData.mp_ambiente === 'production' 
                      ? 'border-green-500 bg-green-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="mp_ambiente"
                      value="production"
                      checked={formData.mp_ambiente === 'production'}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    <div className="flex items-center">
                      <CheckCircle className={`h-5 w-5 mr-2 ${
                        formData.mp_ambiente === 'production' ? 'text-green-600' : 'text-gray-400'
                      }`} />
                      <div>
                        <p className="font-medium">Produção</p>
                        <p className="text-xs text-gray-500">Pagamentos reais</p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Credenciais Sandbox */}
              <div className="border border-yellow-200 rounded-lg p-4 bg-yellow-50/50">
                <h4 className="font-medium text-gray-800 mb-4 flex items-center">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" />
                  Credenciais de Teste (Sandbox)
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Public Key (Sandbox)
                    </label>
                    <input
                      type="text"
                      name="mp_public_key_sandbox"
                      value={formData.mp_public_key_sandbox}
                      onChange={handleChange}
                      className="input-field font-mono text-sm"
                      placeholder="APP_USR-..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Access Token (Sandbox)
                    </label>
                    <input
                      type="password"
                      name="mp_access_token_sandbox"
                      value={formData.mp_access_token_sandbox}
                      onChange={handleChange}
                      className="input-field font-mono text-sm"
                      placeholder="APP_USR-..."
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Mantenha este token em segredo
                    </p>
                  </div>
                </div>
              </div>

              {/* Credenciais Produção */}
              <div className="border border-green-200 rounded-lg p-4 bg-green-50/50">
                <h4 className="font-medium text-gray-800 mb-4 flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  Credenciais de Produção
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Public Key (Produção)
                    </label>
                    <input
                      type="text"
                      name="mp_public_key_production"
                      value={formData.mp_public_key_production}
                      onChange={handleChange}
                      className="input-field font-mono text-sm"
                      placeholder="APP_USR-..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Access Token (Produção)
                    </label>
                    <input
                      type="password"
                      name="mp_access_token_production"
                      value={formData.mp_access_token_production}
                      onChange={handleChange}
                      className="input-field font-mono text-sm"
                      placeholder="APP_USR-..."
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Mantenha este token em segredo
                    </p>
                  </div>
                </div>
              </div>

              {/* Instruções */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2">Como obter as credenciais</h4>
                <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
                  <li>Acesse <a href="https://www.mercadopago.com.br/developers" target="_blank" rel="noopener noreferrer" className="underline">mercadopago.com.br/developers</a></li>
                  <li>Crie uma aplicação ou selecione uma existente</li>
                  <li>Vá em "Credenciais" no menu lateral</li>
                  <li>Copie a Public Key e o Access Token</li>
                  <li>Para testes, use as credenciais da seção "Credenciais de teste"</li>
                </ol>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="mt-8 pt-6 border-t flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5 mr-2" />
                  Salvar Configurações
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AdminConfiguracoes
