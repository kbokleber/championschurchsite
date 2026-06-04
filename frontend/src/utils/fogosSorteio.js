import confetti from 'canvas-confetti'

const CANVAS_ID = 'fogos-sorteio-canvas'
const instancias = new WeakMap()

function estilosCanvas(dentroFullscreen) {
  const base = [
    'pointer-events:none',
    'z-index:99999',
    'width:100%',
    'height:100%',
  ]
  if (dentroFullscreen) {
    return [...base, 'position:absolute', 'inset:0'].join(';')
  }
  return [...base, 'position:fixed', 'inset:0'].join(';')
}

function resolverContainer(containerEl) {
  if (document.fullscreenElement) return document.fullscreenElement
  if (containerEl?.nodeType === 1) return containerEl
  return document.body
}

function obterConfetti(containerEl) {
  const container = resolverContainer(containerEl)
  const dentroFullscreen = container !== document.body

  let canvas = container.querySelector(`#${CANVAS_ID}`)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.id = CANVAS_ID
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.cssText = estilosCanvas(dentroFullscreen)
    if (dentroFullscreen && container instanceof HTMLElement) {
      const pos = window.getComputedStyle(container).position
      if (pos === 'static') {
        container.style.position = 'relative'
      }
    }
    container.appendChild(canvas)
  }

  if (!instancias.has(canvas)) {
    instancias.set(
      canvas,
      confetti.create(canvas, {
        resize: true,
        useWorker: false,
      }),
    )
  }

  return instancias.get(canvas)
}

function randomInRange(min, max) {
  return Math.random() * (max - min) + min
}

/** @param {HTMLElement | null | undefined} containerEl Ref do painel de apresentação (tela cheia) */
export function dispararFogosSorteio(containerEl) {
  if (typeof window === 'undefined') return

  const fire = obterConfetti(containerEl)

  fire({
    particleCount: 140,
    spread: 90,
    startVelocity: 50,
    origin: { y: 0.62 },
  })

  const duration = 3200
  const end = Date.now() + duration
  const defaults = {
    startVelocity: 32,
    spread: 360,
    ticks: 60,
    colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#FFFFFF', '#FFA500', '#E040FB', '#60A5FA'],
  }

  const interval = window.setInterval(() => {
    const timeLeft = end - Date.now()
    if (timeLeft <= 0) {
      window.clearInterval(interval)
      return
    }

    const count = Math.max(12, Math.floor(45 * (timeLeft / duration)))
    fire({
      ...defaults,
      particleCount: count,
      origin: { x: randomInRange(0.05, 0.25), y: randomInRange(0.08, 0.32) },
    })
    fire({
      ...defaults,
      particleCount: count,
      origin: { x: randomInRange(0.75, 0.95), y: randomInRange(0.08, 0.32) },
    })
  }, 200)
}
