/**
 * Versão exibida no admin (ex: 1.0, 1.15).
 * Injetada em build (vite define __APP_VERSION__):
 * - Produção/Docker: defina VITE_APP_VERSION (ou APP_VERSION) no build — ex. 1.15
 * - Dev com repo: última tag Git + commits desde a tag (ver vite.config.js)
 * - Fallback: package.json ou 1.0
 */
export const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0')
