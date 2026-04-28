import { useState, useEffect } from 'react'
import { Save, Upload, X, Church, Mail, Phone, MapPin, Facebook, Instagram, Youtube, Twitter, Globe, Webhook, ToggleLeft, ToggleRight, CreditCard, AlertTriangle, CheckCircle, Eye, EyeOff, MessageSquare, Download, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import api from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useConfiguracao } from '../../contexts/ConfiguracaoContext'
import { useAuth } from '../../contexts/AuthContext'

// Abas visíveis apenas para superusuário (admin)
const TABS_SOMENTE_ADMIN = ['integracoes', 'whatsapp', 'mercadopago']

const novoDestaqueHome = () => ({
  id: null,
  titulo: '',
  descricao: '',
  ativo: true,
  ordem: 0,
  imagem: null,
  imagemPreview: null,
  imagemAlterada: false
})

const DESTAQUES_HOME_PADRAO = [
  {
    titulo: 'CONECTION:',
    descricao:
      'O momento de conexão com nossos pastores, para todos aqueles que desejam se conectar com nossa igreja como membro, caminhar conosco e conhecer a nossa história.',
  },
  {
    titulo: 'DIRECTION:',
    descricao:
      'O mesmo que direção, é o nosso momento de estudo da palavra. Onde recebemos ensinamentos e direcionamos de acordo com a palavra do senhor.',
  },
  {
    titulo: 'DEEPER:',
    descricao:
      'Deeper significa mais fundo, é onde entramos na história e mergulhamos mais fundo nas escrituras.',
  },
  {
    titulo: 'CÉLULA – Partir do pão:',
    descricao:
      'É onde a fé se torna prática, onde vidas se conectam e o pão é repartido, assim como o amor de Cristo.',
  },
]

function AdminConfiguracoes() {
  const { user } = useAuth()
  const { getImageUrl } = useConfiguracao()
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
    cor_header: '#1a365d',
    cor_rodape: '#1a365d',
    cor_header_pagina: '#1a365d',
    webhook_inscricao: '',
    webhook_ativo: false,
    // Mercado Pago
    mp_ambiente: 'sandbox',
    mp_ativo: false,
    mp_cartao_em_sandbox: false,
    mp_public_key_sandbox: '',
    mp_access_token_sandbox: '',
    mp_public_key_production: '',
    mp_access_token_production: '',
    mp_webhook_secret: '',
    // WhatsApp Evolution API
    evolution_api_url: '',
    evolution_api_key: '',
    evolution_api_instance: ''
  })

  const [logoPreview, setLogoPreview] = useState(null)
  const [logoBrancoPreview, setLogoBrancoPreview] = useState(null)
  const [newLogo, setNewLogo] = useState(null)
  const [newLogoBranco, setNewLogoBranco] = useState(null)
  const [clearLogoRequested, setClearLogoRequested] = useState(false)
  const [clearLogoBrancoRequested, setClearLogoBrancoRequested] = useState(false)
  const [bannerPreview, setBannerPreview] = useState(null)
  const [newBanner, setNewBanner] = useState(null)
  const [clearBannerRequested, setClearBannerRequested] = useState(false)
  const [showAccessTokenSandbox, setShowAccessTokenSandbox] = useState(false)
  const [showAccessTokenProduction, setShowAccessTokenProduction] = useState(false)
  const [showEvolutionApiKey, setShowEvolutionApiKey] = useState(false)
  const [destaquesHome, setDestaquesHome] = useState([novoDestaqueHome()])

  useEffect(() => {
    fetchConfiguracao()
  }, [])

  useEffect(() => {
    if (!user) return
    if (!user.is_superuser && TABS_SOMENTE_ADMIN.includes(activeTab)) {
      setActiveTab('geral')
    }
  }, [user?.is_superuser, activeTab])

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
        cor_header: data.cor_header || '#1a365d',
        cor_rodape: data.cor_rodape || '#1a365d',
        cor_header_pagina: data.cor_header_pagina || '#1a365d',
        webhook_inscricao: data.webhook_inscricao || '',
        webhook_ativo: data.webhook_ativo || false,
        // Mercado Pago
        mp_ambiente: data.mp_ambiente || 'sandbox',
        mp_ativo: data.mp_ativo || false,
        mp_cartao_em_sandbox: data.mp_cartao_em_sandbox || false,
        mp_public_key_sandbox: data.mp_public_key_sandbox || '',
        mp_access_token_sandbox: data.mp_access_token_sandbox || '',
        mp_public_key_production: data.mp_public_key_production || '',
        mp_access_token_production: data.mp_access_token_production || '',
        mp_webhook_secret: data.mp_webhook_secret || '',
        // WhatsApp Evolution API
        evolution_api_url: data.evolution_api_url || '',
        evolution_api_key: data.evolution_api_key || '',
        evolution_api_instance: data.evolution_api_instance || ''
      })

      if (data.logo) {
        setLogoPreview(getImageUrl(data.logo))
        setClearLogoRequested(false)
      } else {
        setLogoPreview(null)
      }
      if (data.logo_branco) {
        setLogoBrancoPreview(getImageUrl(data.logo_branco))
        setClearLogoBrancoRequested(false)
      } else {
        setLogoBrancoPreview(null)
      }
      if (data.imagem_banner) {
        setBannerPreview(getImageUrl(data.imagem_banner))
        setClearBannerRequested(false)
      } else {
        setBannerPreview(null)
      }

      const itensHome = Array.isArray(data.destaques_home) ? data.destaques_home : []
      if (itensHome.length > 0) {
        setDestaquesHome(
          itensHome.map((item, index) => ({
            id: item.id ?? null,
            titulo: item.titulo || '',
            descricao: item.descricao || '',
            ativo: item.ativo !== false,
            ordem: Number.isFinite(item.ordem) ? item.ordem : index,
            imagem: null,
            imagemPreview: item.imagem ? getImageUrl(item.imagem) : null,
            imagemAlterada: false
          }))
        )
      } else {
        setDestaquesHome(
          DESTAQUES_HOME_PADRAO.map((item, index) => ({
            id: null,
            titulo: item.titulo,
            descricao: item.descricao,
            ativo: true,
            ordem: index,
            imagem: null,
            imagemPreview: null,
            imagemAlterada: false
          }))
        )
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
          setClearLogoRequested(false)
        } else {
          setLogoBrancoPreview(reader.result)
          setNewLogoBranco(file)
          setClearLogoBrancoRequested(false)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const removeLogo = (type) => {
    if (type === 'logo') {
      setLogoPreview(null)
      setNewLogo(null)
      setClearLogoRequested(true)
    } else if (type === 'logo_branco') {
      setLogoBrancoPreview(null)
      setNewLogoBranco(null)
      setClearLogoBrancoRequested(true)
    } else if (type === 'banner') {
      setBannerPreview(null)
      setNewBanner(null)
      setClearBannerRequested(true)
    }
  }

  const handleBannerChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setBannerPreview(reader.result)
        setNewBanner(file)
        setClearBannerRequested(false)
      }
      reader.readAsDataURL(file)
    }
  }

  const getDownloadName = (url, fallback) => {
    if (!url) return fallback
    if (url.startsWith('data:')) return fallback
    const clean = url.split('?')[0]
    const parts = clean.split('/')
    const last = parts[parts.length - 1]
    return last || fallback
  }

  const handleDownloadImage = async (url, fallbackName) => {
    if (!url) return
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Falha ao baixar imagem')
      }
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = getDownloadName(url, fallbackName)
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Erro ao baixar imagem:', error)
      setMessage({ type: 'error', text: 'Não foi possível baixar a imagem.' })
    }
  }

  const getCarouselDownloadName = (item, index) => {
    const titulo = (item?.titulo || `item-${index + 1}`)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return `carrossel-${titulo || `item-${index + 1}`}.png`
  }

  const adicionarDestaqueHome = () => {
    setDestaquesHome(prev => [
      ...prev,
      { ...novoDestaqueHome(), ordem: prev.length }
    ])
  }

  const atualizarDestaqueHome = (index, campo, valor) => {
    setDestaquesHome(prev =>
      prev.map((item, i) => (i === index ? { ...item, [campo]: valor } : item))
    )
  }

  const handleImagemDestaqueHome = (index, file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setDestaquesHome(prev =>
        prev.map((item, i) => (
          i === index
            ? { ...item, imagem: file, imagemPreview: reader.result, imagemAlterada: true }
            : item
        ))
      )
    }
    reader.readAsDataURL(file)
  }

  const removerDestaqueHome = (index) => {
    setDestaquesHome(prev => {
      const next = prev.filter((_, i) => i !== index)
      if (next.length === 0) return [novoDestaqueHome()]
      return next.map((item, i) => ({ ...item, ordem: i }))
    })
  }

  const moverDestaqueHome = (index, direcao) => {
    setDestaquesHome(prev => {
      const targetIndex = direcao === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= prev.length) return prev
      const next = [...prev]
      const temp = next[index]
      next[index] = next[targetIndex]
      next[targetIndex] = temp
      return next.map((item, i) => ({ ...item, ordem: i }))
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage({ type: '', text: '' })

    try {
      const data = new FormData()
      
      // Processar descrição: converter \n literal em quebras de linha reais
      const descricaoProcessada = formData.descricao
        ? formData.descricao.replace(/\\n/g, '\n')
        : formData.descricao
      
      // Adiciona todos os campos (nunca null/undefined — vira "null" na string e quebra validação)
      Object.keys(formData).forEach(key => {
        if (key === 'descricao') {
          data.append(key, descricaoProcessada ?? '')
        } else {
          const v = formData[key]
          if (v === null || v === undefined) {
            data.append(key, '')
          } else {
            data.append(key, v)
          }
        }
      })

      // Adiciona logos se houver novos
      if (newLogo) {
        data.append('logo', newLogo)
      }
      if (newLogoBranco) {
        data.append('logo_branco', newLogoBranco)
      }
      // Sinalizar remoção do logo para o backend limpar
      if (clearLogoRequested) {
        data.append('clear_logo', 'true')
      }
      if (clearLogoBrancoRequested) {
        data.append('clear_logo_branco', 'true')
      }
      if (newBanner) {
        data.append('imagem_banner', newBanner)
      }
      if (clearBannerRequested) {
        data.append('clear_imagem_banner', 'true')
      }

      const payloadDestaquesHome = destaquesHome.map((item, index) => ({
        id: item.id || null,
        titulo: item.titulo || '',
        descricao: item.descricao || '',
        ativo: !!item.ativo,
        ordem: index,
        imagem_removida: !item.imagemPreview
      }))
      data.append('destaques_home_json', JSON.stringify(payloadDestaquesHome))
      destaquesHome.forEach((item, index) => {
        if (item.imagem) {
          data.append(`destaque_home_imagem_${index}`, item.imagem)
        }
      })

      // Não defina Content-Type: o axios/boundary é obrigatório em multipart
      await api.patch('/admin/configuracao/', data)

      setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' })
      setNewLogo(null)
      setNewLogoBranco(null)
      setNewBanner(null)
      setClearLogoRequested(false)
      setClearLogoBrancoRequested(false)
      setClearBannerRequested(false)
      
      // Recarrega para atualizar URLs das imagens
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (error) {
      console.error('Erro ao salvar:', error)
      const d = error.response?.data
      let errText = 'Erro ao salvar configurações'
      if (d) {
        if (typeof d === 'string') {
          errText = d
        } else if (d.detail) {
          errText = Array.isArray(d.detail) ? d.detail.map((x) => x).join(' ') : String(d.detail)
        } else {
          const entries = Object.entries(d).filter(([, v]) => v != null && v !== '')
          if (entries.length) {
            const [k, v] = entries[0]
            const part = Array.isArray(v) ? v[0] : v
            errText = `${k}: ${typeof part === 'string' ? part : JSON.stringify(part)}`
          }
        }
      }
      setMessage({ type: 'error', text: errText })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingSpinner text="Carregando configurações..." />
  }

  const todasAsTabs = [
    { id: 'geral', label: 'Informações Gerais', icon: Church },
    { id: 'contato', label: 'Contato', icon: Phone },
    { id: 'endereco', label: 'Endereço', icon: MapPin },
    { id: 'redes', label: 'Redes Sociais', icon: Globe },
    { id: 'visual', label: 'Logo e Visual', icon: Upload },
    { id: 'home_carrossel', label: 'Home Carrossel', icon: Upload },
    { id: 'integracoes', label: 'Integrações', icon: Webhook },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
    { id: 'mercadopago', label: 'Mercado Pago', icon: CreditCard }
  ]

  const tabs = user?.is_superuser
    ? todasAsTabs
    : todasAsTabs.filter(t => !TABS_SOMENTE_ADMIN.includes(t.id))

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
                <p className="text-xs text-gray-500 mt-1">
                  💡 Dica: Pressione Enter para criar uma nova linha. Se digitar \n, será convertido automaticamente em quebra de linha.
                </p>
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
              {/* Cor do header */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cor do header (menu superior)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    value={formData.cor_header?.startsWith('#') ? formData.cor_header : '#1a365d'}
                    onChange={(e) => setFormData(prev => ({ ...prev, cor_header: e.target.value }))}
                    className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.cor_header || '#1a365d'}
                    onChange={(e) => setFormData(prev => ({ ...prev, cor_header: e.target.value || '#1a365d' }))}
                    placeholder="#1a365d"
                    className="flex-1 max-w-[140px] px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Cor de fundo do menu no topo do site</p>
              </div>

              {/* Cor do rodapé */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cor do rodapé
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    value={formData.cor_rodape?.startsWith('#') ? formData.cor_rodape : '#1a365d'}
                    onChange={(e) => setFormData(prev => ({ ...prev, cor_rodape: e.target.value }))}
                    className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.cor_rodape || '#1a365d'}
                    onChange={(e) => setFormData(prev => ({ ...prev, cor_rodape: e.target.value || '#1a365d' }))}
                    placeholder="#1a365d"
                    className="flex-1 max-w-[140px] px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Cor de fundo do rodapé do site</p>
              </div>

              {/* Cor do header das páginas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cor do header das páginas
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    value={formData.cor_header_pagina?.startsWith('#') ? formData.cor_header_pagina : '#1a365d'}
                    onChange={(e) => setFormData(prev => ({ ...prev, cor_header_pagina: e.target.value }))}
                    className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.cor_header_pagina || '#1a365d'}
                    onChange={(e) => setFormData(prev => ({ ...prev, cor_header_pagina: e.target.value || '#1a365d' }))}
                    placeholder="#1a365d"
                    className="flex-1 max-w-[140px] px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Cor da faixa de título (Meus Ingressos, Eventos, Sobre, Contato, etc.)</p>
              </div>

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
                      PNG com fundo transparente (exporte sem o quadriculado do editor)
                    </p>
                    {logoPreview && (
                      <button
                        type="button"
                        onClick={() => handleDownloadImage(logoPreview, 'logo-principal.png')}
                        className="mt-3 btn-outline inline-flex items-center"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Baixar imagem
                      </button>
                    )}
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
                      Versão clara do logo para o header e áreas escuras. Use PNG com fundo transparente (sem quadriculado).
                    </p>
                    {logoBrancoPreview && (
                      <button
                        type="button"
                        onClick={() => handleDownloadImage(logoBrancoPreview, 'logo-branco.png')}
                        className="mt-3 btn-outline inline-flex items-center"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Baixar imagem
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Imagem do Banner (página inicial) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Imagem do Banner (página inicial)
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Substitui o fundo azul da seção de boas-vindas na página inicial. Recomendado: imagem em paisagem (ex.: 1920×600).
                </p>
                <div className="flex items-start space-x-4">
                  {bannerPreview ? (
                    <div className="relative">
                      <img
                        src={bannerPreview}
                        alt="Banner"
                        className="h-32 w-auto max-w-md object-cover border rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeLogo('banner')}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-32 w-64 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 text-gray-500 text-sm">
                      Nenhuma imagem
                    </div>
                  )}
                  <div>
                    <label className="btn-outline cursor-pointer inline-flex items-center">
                      <Upload className="h-4 w-4 mr-2" />
                      Selecionar imagem do banner
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBannerChange}
                        className="hidden"
                      />
                    </label>
                    {bannerPreview && (
                      <button
                        type="button"
                        onClick={() => handleDownloadImage(bannerPreview, 'banner-home.png')}
                        className="mt-3 btn-outline inline-flex items-center"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Baixar imagem
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Home Carrossel */}
          {activeTab === 'home_carrossel' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-800 mb-1">Carrossel da seção destacada da Home</h3>
                <p className="text-sm text-blue-700">
                  Configure os cards que aparecem no carrossel: título, descrição e imagem.
                </p>
              </div>

              {destaquesHome.map((item, index) => (
                <div key={`destaque-home-${index}`} className="border border-gray-200 rounded-xl p-4 space-y-4 bg-white">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-church-navy">Item {index + 1}</h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moverDestaqueHome(index, 'up')}
                        className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-40"
                        disabled={index === 0}
                        title="Mover para cima"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moverDestaqueHome(index, 'down')}
                        className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-40"
                        disabled={index === destaquesHome.length - 1}
                        title="Mover para baixo"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removerDestaqueHome(index)}
                        className="p-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                        title="Remover item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                    <input
                      type="text"
                      value={item.titulo}
                      onChange={(e) => atualizarDestaqueHome(index, 'titulo', e.target.value)}
                      className="input-field"
                      placeholder="Ex: CONECTION:"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                    <textarea
                      value={item.descricao}
                      onChange={(e) => atualizarDestaqueHome(index, 'descricao', e.target.value)}
                      rows={4}
                      className="input-field"
                      placeholder="Descrição do card no carrossel"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Imagem</label>
                    <div className="flex items-start gap-4">
                      {item.imagemPreview ? (
                        <img
                          src={item.imagemPreview}
                          alt={`Prévia ${item.titulo || `Item ${index + 1}`}`}
                          className="h-24 w-24 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="h-24 w-24 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-xs text-gray-500 text-center px-1">
                          Sem imagem
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="btn-outline cursor-pointer inline-flex items-center">
                          <Upload className="h-4 w-4 mr-2" />
                          Enviar imagem
                          <input
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.avif,image/*"
                            onChange={(e) => handleImagemDestaqueHome(index, e.target.files?.[0])}
                            className="hidden"
                          />
                        </label>
                        <p className="text-xs text-gray-500">
                          Formatos aceitos: PNG, JPG, WEBP, GIF, BMP, TIFF e AVIF.
                        </p>
                        {item.imagemPreview && (
                          <button
                            type="button"
                            onClick={() => handleDownloadImage(item.imagemPreview, getCarouselDownloadName(item, index))}
                            className="btn-outline inline-flex items-center"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Baixar imagem
                          </button>
                        )}
                        {item.imagemPreview && (
                          <button
                            type="button"
                            onClick={() => {
                              setDestaquesHome(prev =>
                                prev.map((d, i) => (
                                  i === index
                                    ? { ...d, imagem: null, imagemPreview: null, imagemAlterada: true }
                                    : d
                                ))
                              )
                            }}
                            className="btn-outline text-red-600 border-red-200 hover:bg-red-50"
                          >
                            Remover imagem
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!item.ativo}
                      onChange={(e) => atualizarDestaqueHome(index, 'ativo', e.target.checked)}
                    />
                    Item ativo no carrossel
                  </label>
                </div>
              ))}

              <button
                type="button"
                onClick={adicionarDestaqueHome}
                className="btn-outline inline-flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar item
              </button>
            </div>
          )}

          {/* Tab: Integrações */}
          {activeTab === 'integracoes' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-blue-800 mb-2">Webhook</h3>
                <p className="text-sm text-blue-700">
                  Uma única URL recebe, em tempo real, novas inscrições, reset de senha (Meus Ingressos) e
                  alterações de eventos no admin. O corpo do POST traz o campo <code className="bg-blue-100 px-1 rounded">tipo</code> para
                  o automação (ex.: n8n) decidir o fluxo. Quando o WhatsApp estiver configurado na aba WhatsApp, o JSON também inclui{' '}
                  <code className="bg-blue-100 px-1 rounded">integracao_evolution</code> com <code className="bg-blue-100 px-1 rounded">api_url</code> e{' '}
                  <code className="bg-blue-100 px-1 rounded">instance</code> (use isso no fluxo; os headers X-Evolution-* continuam sendo enviados).
                  Pagamentos do Mercado Pago usam outro fluxo.
                </p>
              </div>

              {/* Toggle Ativo/Inativo */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="font-medium text-gray-700">Webhook Ativo</label>
                  <p className="text-sm text-gray-500">
                    {formData.webhook_ativo
                      ? 'A URL abaixo receberá inscrições, reset de senha e avisos de evento'
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
                  Requisição POST em JSON. Use o campo <span className="font-mono">tipo</span> (ex.:{' '}
                  <span className="font-mono">nova_inscricao</span>, <span className="font-mono">reset_senha</span>, <span className="font-mono">evento</span>) no seu fluxo.
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

          {/* Tab: WhatsApp Evolution API */}
          {activeTab === 'whatsapp' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-blue-800 mb-2">Integração com WhatsApp via Evolution API</h3>
                <p className="text-sm text-blue-700">
                  Configure a integração com WhatsApp usando a Evolution API para envio automático de mensagens,
                  notificações de inscrições e outras funcionalidades.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL da API Evolution *
                </label>
                <input
                  type="url"
                  name="evolution_api_url"
                  value={formData.evolution_api_url}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="https://api.evolution.com.br"
                />
                <p className="text-xs text-gray-500 mt-1">
                  URL base da API Evolution (sem barra no final)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chave de API *
                </label>
                <div className="relative">
                  <input
                    type={showEvolutionApiKey ? 'text' : 'password'}
                    name="evolution_api_key"
                    value={formData.evolution_api_key}
                    onChange={handleChange}
                    className="input-field font-mono text-sm pr-10"
                    placeholder="Sua chave de API da Evolution"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEvolutionApiKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-700 rounded"
                    title={showEvolutionApiKey ? 'Ocultar chave' : 'Mostrar chave'}
                  >
                    {showEvolutionApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Chave de autenticação fornecida pela Evolution API
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Instância *
                </label>
                <input
                  type="text"
                  name="evolution_api_instance"
                  value={formData.evolution_api_instance}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="nome-da-instancia"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Nome da instância configurada na Evolution API
                </p>
              </div>

              {/* Instruções */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-800 mb-2">Como obter as credenciais</h4>
                <ol className="text-sm text-gray-700 list-decimal list-inside space-y-1">
                  <li>Acesse o painel da Evolution API</li>
                  <li>Vá em "Instâncias" e crie ou selecione uma instância</li>
                  <li>Copie a URL da API, a chave de API e o nome da instância</li>
                  <li>Certifique-se de que a instância está conectada e ativa</li>
                </ol>
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

              {/* Cartão em sandbox (PIX em produção, cartão em teste) */}
              {formData.mp_ambiente === 'production' && (
                <div className="border border-amber-200 rounded-lg p-4 bg-amber-50/50">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.mp_cartao_em_sandbox || false}
                      onChange={(e) => setFormData(prev => ({ ...prev, mp_cartao_em_sandbox: e.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="font-medium text-gray-800">Cartão em Sandbox (testes)</span>
                      <p className="text-sm text-gray-600 mt-1">
                        PIX continua em produção (obrigatório). Pagamento com cartão usa credenciais de teste: você pode testar com cartões de teste do MP sem cobrança real.
                      </p>
                    </div>
                  </label>
                </div>
              )}

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
                    <div className="relative">
                      <input
                        type={showAccessTokenSandbox ? 'text' : 'password'}
                        name="mp_access_token_sandbox"
                        value={formData.mp_access_token_sandbox}
                        onChange={handleChange}
                        className="input-field font-mono text-sm pr-10"
                        placeholder="APP_USR-..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowAccessTokenSandbox((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-700 rounded"
                        title={showAccessTokenSandbox ? 'Ocultar token' : 'Mostrar token'}
                      >
                        {showAccessTokenSandbox ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
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
                    <div className="relative">
                      <input
                        type={showAccessTokenProduction ? 'text' : 'password'}
                        name="mp_access_token_production"
                        value={formData.mp_access_token_production}
                        onChange={handleChange}
                        className="input-field font-mono text-sm pr-10"
                        placeholder="APP_USR-..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowAccessTokenProduction((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-700 rounded"
                        title={showAccessTokenProduction ? 'Ocultar token' : 'Mostrar token'}
                      >
                        {showAccessTokenProduction ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Mantenha este token em segredo
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Webhook Secret
                    </label>
                    <input
                      type="password"
                      name="mp_webhook_secret"
                      value={formData.mp_webhook_secret}
                      onChange={handleChange}
                      className="input-field font-mono text-sm"
                      placeholder="Secret do painel MP (Webhooks)"
                      autoComplete="off"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Painel MP → Webhooks → Configurar notificações. Usado para validar a assinatura das notificações.
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
