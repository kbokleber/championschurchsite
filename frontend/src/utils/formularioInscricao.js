/** Campo marcado como obrigatório (aceita boolean do JSON ou legado numérico/string). */
export function isCampoObrigatorio(campo) {
  if (!campo) return false
  const o = campo.obrigatorio
  return o === true || o === 1 || o === '1' || o === 'true'
}

export function getValorRespostaCampo(campo, respostasForm, arquivosForm) {
  if (!campo) return undefined
  const id = campo.id
  const sid = String(id)
  if (campo.tipo === 'arquivo') {
    return arquivosForm[id] ?? arquivosForm[sid]
  }
  return respostasForm[id] ?? respostasForm[sid]
}

export function validarCamposObrigatoriosQuestionario(formulario, respostasForm, arquivosForm) {
  const novosErros = {}
  if (!formulario?.campos?.length) return { ok: true, erros: novosErros }

  for (const campo of formulario.campos) {
    if (!isCampoObrigatorio(campo)) continue

    if (campo.tipo === 'arquivo') {
      if (!getValorRespostaCampo(campo, respostasForm, arquivosForm)) {
        novosErros[campo.id] = 'Arquivo obrigatório.'
      }
      continue
    }

    if (campo.tipo === 'boolean') {
      const v = getValorRespostaCampo(campo, respostasForm, arquivosForm)
      if (v !== true && v !== false) {
        novosErros[campo.id] = 'Selecione Sim ou Não.'
      }
      continue
    }

    const v = getValorRespostaCampo(campo, respostasForm, arquivosForm)
    const vazio = v === undefined || v === null
      || (typeof v === 'string' && !v.trim())
      || (Array.isArray(v) && v.length === 0)
    if (vazio) {
      novosErros[campo.id] = 'Campo obrigatório.'
    }
  }

  return { ok: Object.keys(novosErros).length === 0, erros: novosErros }
}

export function eventoTemQuestionarioInscricao(evento) {
  if (!evento?.formulario_inscricao) return false
  const campos = evento.formulario_inscricao_detalhe?.campos
  return Array.isArray(campos) && campos.length > 0
}

/** Valida questionário e retorna estado pronto para UI (modal / submit). */
export function validarQuestionarioInscricao(formulario, respostasForm, arquivosForm, exigeSalvo, questionarioSalvo) {
  if (!formulario?.campos?.length) {
    return { ok: true, erros: {}, precisaSalvar: false }
  }
  const { ok, erros } = validarCamposObrigatoriosQuestionario(formulario, respostasForm, arquivosForm)
  if (exigeSalvo && !questionarioSalvo) {
    return { ok: false, erros, precisaSalvar: true }
  }
  return { ok, erros, precisaSalvar: false }
}
