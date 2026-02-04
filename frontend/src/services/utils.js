/**
 * Utilitários para o frontend
 */

// URL base para arquivos de mídia
// Em produção com Nginx: usar '' (mesma origem) para /media/ ser proxyado - evita ERR_CERT_AUTHORITY_INVALID
// Em dev: usar localhost:8000 ou deixar o proxy do Vite tratar
const isProduction = import.meta.env.MODE === 'production' || import.meta.env.PROD
const BACKEND_URL = isProduction ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:8000')

/**
 * Retorna a URL completa para um arquivo de mídia
 * @param {string} path - Caminho do arquivo (ex: /media/eventos/imagem.jpg)
 * @returns {string|null} URL completa ou null se não houver caminho
 */
export function getMediaUrl(path) {
  if (!path) return null
  
  // Se já é uma URL completa, retorna como está
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  
  // Garantir barra no início para ser relativo à origem (evita /admin/eventos/media/...)
  const pathFromRoot = path.startsWith('/') ? path : `/${path}`
  return `${BACKEND_URL}${pathFromRoot}`
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
