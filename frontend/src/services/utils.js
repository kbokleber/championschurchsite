/**
 * Utilitários para o frontend
 */

// URL base do backend para arquivos de mídia
const BACKEND_URL = 'http://localhost:8000'

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

  // Se é um caminho relativo, adiciona a URL do backend
  return `${BACKEND_URL}${path}`
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
 * Formata telefone para exibição (Máscara brasileira)
 * @param {string} valor - Valor bruto do telefone
 * @returns {string} Telefone formatado
 */
export function formatarTelefone(valor) {
  if (!valor) return ''
  const numeros = valor.replace(/\D/g, '')
  if (numeros.length <= 2) return numeros
  if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`
  if (numeros.length <= 11) return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7, 11)}`
}
