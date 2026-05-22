/** ID fixo exigido pelo MP — não usar classe, só id estável e visível no DOM */
export const MP_CARD_BRICK_CONTAINER_ID = 'champions-mp-card-payment-brick'

export function unmountGlobalCardBrick() {
  const ctrl = window.__championsCardBrick
  if (ctrl?.unmount) {
    try {
      ctrl.unmount()
    } catch {
      /* ignore */
    }
  }
  window.__championsCardBrick = null
}

export function formatBrickError(brickErr) {
  if (!brickErr) return 'erro desconhecido'
  if (typeof brickErr === 'string') return brickErr
  const parts = [
    brickErr.message,
    brickErr.cause,
    brickErr.type,
    brickErr.error,
  ].filter(Boolean)
  if (parts.length) return parts.join(' — ')
  try {
    return JSON.stringify(brickErr)
  } catch {
    return 'erro desconhecido'
  }
}

/** MP: texto vazio mantém o padrão "Preencha seus dados" — ocultamos no DOM. */
export function esconderTituloSecaoEmailBrick(container) {
  if (!container) return
  const titulos = container.querySelectorAll('h1, h2, h3, h4, p, legend, span, div')
  titulos.forEach((node) => {
    if (node.children.length > 0) return
    const texto = (node.textContent || '').trim().toLowerCase()
    if (
      texto === 'preencha seus dados' ||
      texto === 'fill in your details' ||
      texto === 'completa tus datos'
    ) {
      node.style.setProperty('display', 'none', 'important')
      node.setAttribute('aria-hidden', 'true')
    }
  })
}

export function brickContainerHasFields(el) {
  if (!el) return false
  if (el.querySelector('iframe')) return true
  if (el.querySelector('[class*="secure"], [data-testid], form, input')) return true
  return el.children.length > 0 && el.innerText.trim().length > 20
}
