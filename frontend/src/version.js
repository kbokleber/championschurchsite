/**
 * Versão base (major.minor) e build id automático.
 * APP_BUILD_ID muda a cada rebuild (timestamp UTC + commit curto quando disponível).
 */
export const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0')
export const APP_BUILD_ID =
  (typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'local')
