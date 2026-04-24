import { useCallback, useMemo } from 'react'
import { AlertCircle, FileText, Paperclip } from 'lucide-react'

/**
 * FormularioDinamico
 *
 * Renderiza um formulário de inscrição dinâmico com base na estrutura vinda
 * do backend (`formulario.campos`). Não controla estado interno: o pai passa
 * `valores`, `arquivos` e recebe `onChange` a cada alteração.
 *
 * IMPORTANTE: este componente é apenas de ENTRADA. As respostas são enviadas
 * junto com a inscrição e NUNCA devem ser exibidas ao participante após o
 * envio (as respostas são privadas ao administrador).
 *
 * Props:
 *  - formulario: { id, nome, descricao, campos: [{id,label,tipo,obrigatorio,placeholder,help_text,opcoes,tamanho_max}] }
 *  - valores: { [campo_id]: valor }
 *  - arquivos: { [campo_id]: File }
 *  - errors: { [campo_id]: string }
 *  - onChange(novosValores, novosArquivos)
 *  - disabled: bool
 *  - variant: "default" | "modal" — em "modal" omite título/borda duplicados (cabeçalho fica no modal)
 */
function FormularioDinamico({
  formulario,
  valores = {},
  arquivos = {},
  errors = {},
  onChange,
  disabled = false,
  variant = 'default',
}) {
  const campos = useMemo(() => {
    if (!formulario || !Array.isArray(formulario.campos)) return []
    return [...formulario.campos].sort((a, b) => {
      if (a.ordem !== b.ordem) return (a.ordem ?? 0) - (b.ordem ?? 0)
      return (a.id ?? 0) - (b.id ?? 0)
    })
  }, [formulario])

  const atualizar = useCallback(
    (campoId, novoValor) => {
      const novosValores = { ...valores, [campoId]: novoValor }
      onChange?.(novosValores, arquivos)
    },
    [valores, arquivos, onChange]
  )

  const atualizarArquivo = useCallback(
    (campoId, file) => {
      const novosArquivos = { ...arquivos }
      if (file) {
        novosArquivos[campoId] = file
      } else {
        delete novosArquivos[campoId]
      }
      onChange?.(valores, novosArquivos)
    },
    [valores, arquivos, onChange]
  )

  const toggleMultiplo = useCallback(
    (campoId, opcao) => {
      const atual = Array.isArray(valores[campoId]) ? valores[campoId] : []
      const existe = atual.includes(opcao)
      const novo = existe ? atual.filter((v) => v !== opcao) : [...atual, opcao]
      atualizar(campoId, novo)
    },
    [valores, atualizar]
  )

  if (!formulario || campos.length === 0) {
    return null
  }

  const isModal = variant === 'modal'

  return (
    <div className={isModal ? 'pt-0' : 'border-t pt-4 mt-4'}>
      {!isModal && (
        <div className="mb-3 flex items-start gap-2">
          <FileText className="h-4 w-4 text-primary-600 mt-1 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-church-navy">
              {formulario.nome || 'Informações adicionais'}
            </p>
            {formulario.descricao && (
              <p className="text-xs text-gray-500 mt-0.5">{formulario.descricao}</p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {campos.map((campo) => {
          const erro = errors?.[campo.id] || errors?.[String(campo.id)]
          return (
            <CampoRenderer
              key={campo.id}
              campo={campo}
              valor={valores[campo.id]}
              arquivo={arquivos[campo.id]}
              erro={erro}
              disabled={disabled}
              onChangeValor={(v) => atualizar(campo.id, v)}
              onChangeArquivo={(f) => atualizarArquivo(campo.id, f)}
              onToggleMultiplo={(op) => toggleMultiplo(campo.id, op)}
            />
          )
        })}
      </div>
    </div>
  )
}

function CampoRenderer({
  campo,
  valor,
  arquivo,
  erro,
  disabled,
  onChangeValor,
  onChangeArquivo,
  onToggleMultiplo,
}) {
  const inputId = `campo_${campo.id}`
  const inputClass = `input-field ${erro ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`
  const commonProps = {
    id: inputId,
    name: inputId,
    disabled,
    placeholder: campo.placeholder || '',
  }

  const labelNode = (
    <label htmlFor={inputId} className="label">
      {campo.label}
      {campo.obrigatorio && <span className="text-red-500 ml-1">*</span>}
    </label>
  )

  const helpNode = campo.help_text ? (
    <p className="text-xs text-gray-500 mt-1">{campo.help_text}</p>
  ) : null

  const erroNode = erro ? (
    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
      <AlertCircle className="h-3 w-3" />
      {erro}
    </p>
  ) : null

  switch (campo.tipo) {
    case 'texto_longo':
      return (
        <div>
          {labelNode}
          <textarea
            {...commonProps}
            value={valor ?? ''}
            onChange={(e) => onChangeValor(e.target.value)}
            maxLength={campo.tamanho_max || undefined}
            className={inputClass}
            rows={3}
          />
          {helpNode}
          {erroNode}
        </div>
      )

    case 'numero':
      return (
        <div>
          {labelNode}
          <input
            type="number"
            {...commonProps}
            value={valor ?? ''}
            onChange={(e) => onChangeValor(e.target.value)}
            className={inputClass}
          />
          {helpNode}
          {erroNode}
        </div>
      )

    case 'data':
      return (
        <div>
          {labelNode}
          <input
            type="date"
            {...commonProps}
            value={valor ?? ''}
            onChange={(e) => onChangeValor(e.target.value)}
            className={inputClass}
          />
          {helpNode}
          {erroNode}
        </div>
      )

    case 'boolean': {
      // Sim/Não explícitos: checkbox obrigatório forçava “Sim”; aqui dá para responder Não.
      const groupName = `formulario_bool_${campo.id}`
      const labelBooleanId = `${inputId}_pergunta`
      return (
        <div>
          <p id={labelBooleanId} className="label mb-1.5">
            {campo.label}
            {campo.obrigatorio && <span className="text-red-500 ml-1">*</span>}
          </p>
          <div
            className={`flex flex-wrap gap-4 rounded-lg border px-3 py-2 ${
              erro ? 'border-red-400 bg-red-50/50' : 'border-gray-200 bg-white'
            }`}
            role="radiogroup"
            aria-labelledby={labelBooleanId}
          >
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-800">
              <input
                type="radio"
                name={groupName}
                disabled={disabled}
                checked={valor === true}
                onChange={() => onChangeValor(true)}
                className="h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500"
              />
              Sim
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-800">
              <input
                type="radio"
                name={groupName}
                disabled={disabled}
                checked={valor === false}
                onChange={() => onChangeValor(false)}
                className="h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500"
              />
              Não
            </label>
          </div>
          {helpNode}
          {erroNode}
        </div>
      )
    }

    case 'select_unico':
      return (
        <div>
          {labelNode}
          <select
            {...commonProps}
            value={valor ?? ''}
            onChange={(e) => onChangeValor(e.target.value)}
            className={inputClass}
          >
            <option value="">Selecione...</option>
            {(campo.opcoes || []).map((op, idx) => (
              <option key={idx} value={op}>
                {op}
              </option>
            ))}
          </select>
          {helpNode}
          {erroNode}
        </div>
      )

    case 'select_multiplo': {
      const selecionadas = Array.isArray(valor) ? valor : []
      return (
        <div>
          {labelNode}
          <div className="space-y-1 border border-gray-200 rounded-lg p-2 bg-gray-50">
            {(campo.opcoes || []).map((op, idx) => {
              const checked = selecionadas.includes(op)
              return (
                <label key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={checked}
                    onChange={() => onToggleMultiplo(op)}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span>{op}</span>
                </label>
              )
            })}
          </div>
          {helpNode}
          {erroNode}
        </div>
      )
    }

    case 'email':
      return (
        <div>
          {labelNode}
          <input
            type="email"
            {...commonProps}
            value={valor ?? ''}
            onChange={(e) => onChangeValor(e.target.value)}
            className={inputClass}
          />
          {helpNode}
          {erroNode}
        </div>
      )

    case 'telefone':
      return (
        <div>
          {labelNode}
          <input
            type="tel"
            {...commonProps}
            value={valor ?? ''}
            onChange={(e) => onChangeValor(formatarTelefoneInput(e.target.value))}
            maxLength={16}
            className={inputClass}
          />
          {helpNode}
          {erroNode}
        </div>
      )

    case 'cpf':
      return (
        <div>
          {labelNode}
          <input
            type="text"
            {...commonProps}
            value={valor ?? ''}
            onChange={(e) => onChangeValor(formatarCpfInput(e.target.value))}
            maxLength={14}
            className={inputClass}
          />
          {helpNode}
          {erroNode}
        </div>
      )

    case 'arquivo':
      return (
        <div>
          {labelNode}
          <label
            htmlFor={inputId}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer text-sm ${
              erro ? 'border-red-500 text-red-700 bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <Paperclip className="h-4 w-4" />
            <span className="truncate">
              {arquivo?.name || 'Selecionar arquivo (pdf, jpg ou png, até 5 MB)'}
            </span>
          </label>
          <input
            id={inputId}
            name={inputId}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0] || null
              onChangeArquivo(f)
            }}
            className="hidden"
          />
          {arquivo && (
            <button
              type="button"
              onClick={() => onChangeArquivo(null)}
              disabled={disabled}
              className="text-xs text-red-600 hover:underline mt-1"
            >
              Remover arquivo
            </button>
          )}
          {helpNode}
          {erroNode}
        </div>
      )

    case 'texto_curto':
    default:
      return (
        <div>
          {labelNode}
          <input
            type="text"
            {...commonProps}
            value={valor ?? ''}
            onChange={(e) => onChangeValor(e.target.value)}
            maxLength={campo.tamanho_max || undefined}
            className={inputClass}
          />
          {helpNode}
          {erroNode}
        </div>
      )
  }
}

function formatarTelefoneInput(valor) {
  const n = (valor || '').replace(/\D/g, '')
  if (n.length <= 2) return n
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`
  if (n.length <= 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7, 11)}`
}

function formatarCpfInput(valor) {
  const n = (valor || '').replace(/\D/g, '').slice(0, 11)
  if (n.length <= 3) return n
  if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`
  if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`
}

export default FormularioDinamico
