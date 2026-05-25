/**
 * Utilitários para o frontend
 */

// URL base para arquivos de mídia
// Produção e dev local (sem VITE_API_URL): mesma origem (/media via proxy Nginx ou Vite)
// Dev apontando para API remota: prefixo VITE_API_URL
const isProduction = import.meta.env.MODE === 'production' || import.meta.env.PROD
const remoteApi = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const BACKEND_URL = isProduction ? '' : (remoteApi || '')

function normalizeMediaPath(path) {
  let normalized = String(path).replace(/^\//, '')
  if (!normalized.startsWith('media/')) {
    normalized = `media/${normalized}`
  }
  return normalized
}

/**
 * Retorna a URL completa para um arquivo de mídia
 * @param {string} path - Caminho do arquivo (ex: /media/eventos/imagem.jpg)
 * @returns {string|null} URL completa ou null se não houver caminho
 */
export function getMediaUrl(path) {
  if (!path) return null

  // URLs absolutas de outro ambiente → usar só o caminho /media/...
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const parsed = new URL(path)
      if (parsed.pathname.includes('/media/')) {
        return getMediaUrl(parsed.pathname)
      }
    } catch {
      // ignore
    }
    return path
  }

  const normalized = normalizeMediaPath(path)
  if (!BACKEND_URL) {
    return `/${normalized}`
  }
  return `${BACKEND_URL}/${normalized}`
}

/**
 * Formata data no padrão brasileiro
 * @param {string} dateString - Data em formato ISO
 * @returns {string} Data formatada DD/MM/YYYY HH:MM:SS
 */
export function formatDateTimeBR(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * Formata data no padrão brasileiro (sem hora)
 * @param {string} dateString - Data em formato ISO
 * @returns {string} Data formatada DD/MM/YYYY
 */
export function formatDateBR(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Formata hora no padrão brasileiro
 * @param {string} dateString - Data em formato ISO
 * @returns {string} Hora formatada HH:MM
 */
export function formatTimeBR(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
