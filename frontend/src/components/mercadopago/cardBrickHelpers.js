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

export function brickContainerHasFields(el) {
  if (!el) return false
  if (el.querySelector('iframe')) return true
  if (el.querySelector('[class*="secure"], [data-testid], form, input')) return true
  return el.children.length > 0 && el.innerText.trim().length > 20
}
