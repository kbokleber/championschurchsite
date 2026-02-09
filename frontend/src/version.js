/**
 * Versão exibida no admin (ex: 1.0, 1.1, 1.2).
 * No build: usa a última tag Git (ex: v1.0) + quantidade de commits desde a tag.
 * Ex.: tag v1.0 e 0 commits = 1.0; 1 commit = 1.1; 2 commits = 1.2.
 * Para a primeira vez: crie a tag v1.0 no commit que quiser (git tag v1.0 && git push origin v1.0).
 * Atualizado para teste de versionamento automático.
 */
export const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0')
