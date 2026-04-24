import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Save, Plus, Trash2, ArrowUp, ArrowDown, Lock, Copy,
} from 'lucide-react'
import api from '../../services/api'
import LoadingSpinner from '../../components/LoadingSpinner'

const TIPOS_CAMPO = [
  { value: 'texto_curto', label: 'Texto curto' },
  { value: 'texto_longo', label: 'Texto longo' },
  { value: 'numero', label: 'Número' },
  { value: 'data', label: 'Data' },
  { value: 'boolean', label: 'Sim/Não' },
  { value: 'select_unico', label: 'Seleção única' },
  { value: 'select_multiplo', label: 'Seleção múltipla' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'cpf', label: 'CPF' },
  { value: 'arquivo', label: 'Arquivo (PDF, JPG, PNG — até 5MB)' },
]

const TIPOS_COM_OPCOES = new Set(['select_unico', 'select_multiplo'])
const TIPOS_COM_TAMANHO = new Set(['texto_curto', 'texto_longo'])

function campoVazio(ordem = 0) {
  return {
    _localId: Math.random().toString(36).slice(2, 10),
    ordem,
    label: '',
    tipo: 'texto_curto',
    obrigatorio: false,
    placeholder: '',
    help_text: '',
    opcoes: [],
    tamanho_max: null,
  }
}

function FormularioForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id

  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formData, setFormData] = useState({ nome: '', descricao: '', ativo: true })
  const [campos, setCampos] = useState([campoVazio(0)])
  /** Há inscrições usando eventos com este formulário (apenas informativo / avisos) */
  const [emUso, setEmUso] = useState(false)
  const [totalInscricoes, setTotalInscricoes] = useState(0)

  useEffect(() => {
    if (isEditing) fetchFormulario()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const fetchFormulario = async () => {
    try {
      const response = await api.get(`/formularios/${id}/`)
      const f = response.data
      setFormData({
        nome: f.nome || '',
        descricao: f.descricao || '',
        ativo: f.ativo ?? true,
      })
      setEmUso(!!f.tem_inscricoes)
      setTotalInscricoes(f.total_inscricoes || 0)
      const camposCarregados = (f.campos || []).map((c, idx) => ({
        ...c,
        _localId: `srv-${c.id}`,
        ordem: c.ordem ?? idx,
        opcoes: Array.isArray(c.opcoes) ? c.opcoes : [],
        tamanho_max: c.tamanho_max ?? null,
      }))
      setCampos(camposCarregados.length > 0 ? camposCarregados : [campoVazio(0)])
    } catch (err) {
      console.error('Erro ao carregar formulário:', err)
      setError('Erro ao carregar formulário.')
    } finally {
      setLoading(false)
    }
  }

  const handleChangeForm = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setError('')
  }

  const atualizarCampo = (idx, patch) => {
    setCampos(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
    setFieldErrors(prev => {
      if (!prev[idx]) return prev
      const novo = { ...prev }
      delete novo[idx]
      return novo
    })
  }

  const adicionarCampo = () => {
    setCampos(prev => [...prev, campoVazio(prev.length)])
  }

  const removerCampo = (idx) => {
    setCampos(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, ordem: i })))
  }

  const moverCampo = (idx, direcao) => {
    setCampos(prev => {
      const novo = [...prev]
      const destino = idx + direcao
      if (destino < 0 || destino >= novo.length) return prev
      const tmp = novo[idx]
      novo[idx] = novo[destino]
      novo[destino] = tmp
      return novo.map((c, i) => ({ ...c, ordem: i }))
    })
  }

  const atualizarOpcao = (campoIdx, opcaoIdx, valor) => {
    setCampos(prev => prev.map((c, i) => {
      if (i !== campoIdx) return c
      const opcoes = [...(c.opcoes || [])]
      opcoes[opcaoIdx] = valor
      return { ...c, opcoes }
    }))
  }

  const adicionarOpcao = (campoIdx) => {
    setCampos(prev => prev.map((c, i) => {
      if (i !== campoIdx) return c
      return { ...c, opcoes: [...(c.opcoes || []), ''] }
    }))
  }

  const removerOpcao = (campoIdx, opcaoIdx) => {
    setCampos(prev => prev.map((c, i) => {
      if (i !== campoIdx) return c
      return { ...c, opcoes: (c.opcoes || []).filter((_, k) => k !== opcaoIdx) }
    }))
  }

  const handleDuplicar = async () => {
    try {
      const response = await api.post(`/formularios/${id}/duplicar/`)
      navigate(`/admin/formularios/${response.data.id}`)
    } catch (err) {
      console.error('Erro ao duplicar:', err)
      alert('Erro ao duplicar formulário.')
    }
  }

  const validarLocal = () => {
    const errs = {}
    if (!formData.nome.trim()) {
      setError('O nome do formulário é obrigatório.')
      return false
    }
    if (campos.length === 0) {
      setError('Adicione pelo menos um campo ao formulário.')
      return false
    }
    campos.forEach((c, idx) => {
      const eCampo = {}
      if (!c.label || !c.label.trim()) {
        eCampo.label = 'Rótulo é obrigatório.'
      }
      if (TIPOS_COM_OPCOES.has(c.tipo)) {
        const opcoes = (c.opcoes || []).map(o => (o || '').trim()).filter(Boolean)
        const unicas = new Set(opcoes)
        if (opcoes.length < 2 || unicas.size < 2) {
          eCampo.opcoes = 'Informe ao menos 2 opções distintas.'
        }
      }
      if (Object.keys(eCampo).length > 0) errs[idx] = eCampo
    })
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      setError('Corrija os erros indicados nos campos antes de salvar.')
      return false
    }
    setError('')
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validarLocal()) return

    setSaving(true)
    setError('')

    const payload = {
      nome: formData.nome.trim(),
      descricao: formData.descricao || '',
      ativo: !!formData.ativo,
      campos: campos.map((c, idx) => {
        const field = {
          ordem: idx,
          label: c.label.trim(),
          tipo: c.tipo,
          obrigatorio: !!c.obrigatorio,
          placeholder: c.placeholder || '',
          help_text: c.help_text || '',
          opcoes: TIPOS_COM_OPCOES.has(c.tipo)
            ? (c.opcoes || []).map(o => String(o || '').trim()).filter(Boolean)
            : [],
          tamanho_max: TIPOS_COM_TAMANHO.has(c.tipo) && c.tamanho_max
            ? parseInt(c.tamanho_max, 10)
            : null,
        }
        if (c.id != null && Number.isFinite(Number(c.id)) && Number(c.id) > 0) {
          field.id = Number(c.id)
        }
        return field
      }),
    }

    try {
      if (isEditing) {
        await api.put(`/formularios/${id}/`, payload)
      } else {
        await api.post('/formularios/', payload)
      }
      navigate('/admin/formularios')
    } catch (err) {
      console.error('Erro ao salvar formulário:', err)
      const data = err?.response?.data
      if (data) {
        if (typeof data === 'string') setError(data)
        else if (data.detail) setError(data.detail)
        else setError(Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`).join('; '))
      } else {
        setError('Erro ao salvar formulário.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Carregando formulário..." />

  return (
    <div>
      <div className="mb-6">
        <Link to="/admin/formularios" className="inline-flex items-center text-gray-600 hover:text-primary-600 mb-4">
          <ArrowLeft className="h-5 w-5 mr-2" />
          Voltar para Formulários
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-church-navy">
              {isEditing ? 'Editar Formulário' : 'Novo Formulário'}
            </h1>
            {isEditing && emUso && (
              <p className="text-sm text-amber-800 mt-2 inline-flex items-start gap-2 max-w-2xl">
                <Lock className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Já existem {totalInscricoes} inscrição(ões) com respostas enviadas. Novos campos passarão
                  a ser exigidos para quem se inscrever a partir de agora. <strong>Remover um campo</strong> apaga
                  permanentemente as respostas vinculadas a ele. Duplique se quiser uma versão limpa, sem
                  inscrições antigas.
                </span>
              </p>
            )}
          </div>
          {isEditing && emUso && (
            <button
              type="button"
              onClick={handleDuplicar}
              className="btn-outline inline-flex items-center gap-2"
            >
              <Copy className="h-5 w-5" />
              Duplicar
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 lg:p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset className="space-y-6">
            <div>
              <label htmlFor="nome" className="label">Nome do formulário *</label>
              <input
                id="nome"
                name="nome"
                type="text"
                value={formData.nome}
                onChange={handleChangeForm}
                required
                className="input-field"
                placeholder="Ex: Inscrição Retiro 2026"
              />
            </div>

            <div>
              <label htmlFor="descricao" className="label">Descrição (opcional)</label>
              <textarea
                id="descricao"
                name="descricao"
                value={formData.descricao}
                onChange={handleChangeForm}
                rows={2}
                className="input-field resize-none"
                placeholder="Descrição interna do formulário (não exibida para o participante)"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="ativo"
                name="ativo"
                checked={formData.ativo}
                onChange={handleChangeForm}
                className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="ativo" className="text-sm font-medium text-gray-700">
                Formulário ativo (disponível para uso em eventos)
              </label>
            </div>

            <div className="border-t pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-church-navy">Campos do formulário</h3>
                <button type="button" onClick={adicionarCampo} className="btn-outline inline-flex items-center gap-2 text-sm">
                  <Plus className="h-4 w-4" />
                  Adicionar campo
                </button>
              </div>

              <div className="space-y-4">
                {campos.map((campo, idx) => {
                  const errs = fieldErrors[idx] || {}
                  return (
                    <div key={campo._localId || idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-gray-500">Campo #{idx + 1}</span>
                        <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moverCampo(idx, -1)}
                              disabled={idx === 0}
                              className="p-1.5 text-gray-500 hover:text-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Mover para cima"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moverCampo(idx, 1)}
                              disabled={idx === campos.length - 1}
                              className="p-1.5 text-gray-500 hover:text-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Mover para baixo"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removerCampo(idx)}
                              className="p-1.5 text-red-500 hover:text-red-700"
                              title="Remover campo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="label">Rótulo *</label>
                          <input
                            type="text"
                            value={campo.label || ''}
                            onChange={(e) => atualizarCampo(idx, { label: e.target.value })}
                            className="input-field"
                            placeholder="Ex: Camisa (tamanho)"
                          />
                          {errs.label && <p className="text-xs text-red-600 mt-1">{errs.label}</p>}
                        </div>
                        <div>
                          <label className="label">Tipo *</label>
                          <select
                            value={campo.tipo}
                            onChange={(e) => {
                              const novoTipo = e.target.value
                              const patch = { tipo: novoTipo }
                              if (!TIPOS_COM_OPCOES.has(novoTipo)) patch.opcoes = []
                              else if (!campo.opcoes || campo.opcoes.length === 0) patch.opcoes = ['', '']
                              if (!TIPOS_COM_TAMANHO.has(novoTipo)) patch.tamanho_max = null
                              atualizarCampo(idx, patch)
                            }}
                            className="input-field"
                          >
                            {TIPOS_CAMPO.map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="md:col-span-2 flex items-center gap-3">
                          <input
                            type="checkbox"
                            id={`obrigatorio-${campo._localId}`}
                            checked={!!campo.obrigatorio}
                            onChange={(e) => atualizarCampo(idx, { obrigatorio: e.target.checked })}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <label htmlFor={`obrigatorio-${campo._localId}`} className="text-sm text-gray-700">
                            Preenchimento obrigatório
                          </label>
                        </div>

                        <div>
                          <label className="label">Placeholder (opcional)</label>
                          <input
                            type="text"
                            value={campo.placeholder || ''}
                            onChange={(e) => atualizarCampo(idx, { placeholder: e.target.value })}
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="label">Texto de ajuda (opcional)</label>
                          <input
                            type="text"
                            value={campo.help_text || ''}
                            onChange={(e) => atualizarCampo(idx, { help_text: e.target.value })}
                            className="input-field"
                          />
                        </div>

                        {TIPOS_COM_TAMANHO.has(campo.tipo) && (
                          <div>
                            <label className="label">Tamanho máximo (caracteres)</label>
                            <input
                              type="number"
                              min="1"
                              value={campo.tamanho_max || ''}
                              onChange={(e) => atualizarCampo(idx, { tamanho_max: e.target.value })}
                              className="input-field"
                              placeholder="Opcional"
                            />
                          </div>
                        )}

                        {TIPOS_COM_OPCOES.has(campo.tipo) && (
                          <div className="md:col-span-2">
                            <label className="label">Opções *</label>
                            <div className="space-y-2">
                              {(campo.opcoes || []).map((op, oidx) => (
                                <div key={oidx} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={op}
                                    onChange={(e) => atualizarOpcao(idx, oidx, e.target.value)}
                                    className="input-field"
                                    placeholder={`Opção ${oidx + 1}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removerOpcao(idx, oidx)}
                                    className="p-2 text-red-500 hover:text-red-700"
                                    title="Remover opção"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => adicionarOpcao(idx)}
                                className="btn-outline inline-flex items-center gap-2 text-sm"
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar opção
                              </button>
                            </div>
                            {errs.opcoes && <p className="text-xs text-red-600 mt-1">{errs.opcoes}</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </fieldset>

          <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Salvando...' : (
                <>
                  <Save className="h-5 w-5 mr-2" />
                  {isEditing ? 'Salvar Alterações' : 'Criar Formulário'}
                </>
              )}
            </button>
            <Link to="/admin/formularios" className="btn-outline text-center">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default FormularioForm
