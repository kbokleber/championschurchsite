/**
 * Versão exibida no admin (ex: 1.15).
 * Injetada em build (vite define __APP_VERSION__):
 * - VITE_APP_VERSION / APP_VERSION (build args / Coolify)
 * - ficheiro frontend/VERSION (recomendado em Docker)
 * - Git (dev) → package.json → 1.0
 */
export const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0')
