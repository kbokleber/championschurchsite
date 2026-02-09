/**
 * Versão exibida no admin (ex: 1.0, 1.1).
 * Vem do package.json (campo "version") no momento do build — só major.minor.
 * Para a próxima subida: no frontend rode "npm run version:next" (ou altere "version" no package.json) e depois faça o build e o push.
 */
export const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0')
