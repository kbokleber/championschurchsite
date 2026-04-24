/**
 * Texto vindo do admin com \r\n reais ou literais (ex.: "\\r\\n") vira linhas legíveis.
 */
export function linhasDeHorario(raw) {
  if (raw == null || String(raw).trim() === '') return []
  let s = String(raw)
  s = s.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')
  return s
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, '').trim())
    .filter(Boolean)
}
