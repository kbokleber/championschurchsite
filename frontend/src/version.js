/**
 * Versão exibida no admin (ex.: 1.16). Definida em build: vite.config.js → getAppVersion().
 * Prioridade: VITE_APP_VERSION/APP_VERSION → package.json → (opcional) VERSION → git → 1.0
 * Só o package.json não “subia” antes: frontend/VERSION (1.15) tinha prioridade. Corrigido no Vite.
 * Em produção, se ainda vir versão antiga, ver VITE_APP_VERSION/APP_VERSION no Coolify.
 */
export const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0')
