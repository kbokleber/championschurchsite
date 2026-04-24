import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** "1.2.3", "v1.15" ou "1.15" → "1.2" / "1.15" / "1.15" */
function versionFromEnv(raw) {
  if (raw == null) return null
  const s = String(raw).trim().replace(/^v/i, '')
  if (!s) return null
  const parts = s.split('.').filter((p) => p !== '')
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`
  if (parts.length === 1) return `${parts[0]}.0`
  return null
}

/**
 * Ordem:
 * (1) VITE_APP_VERSION / APP_VERSION (Coolify build arg ou CI)
 * (2) ficheiro frontend/VERSION (uma linha, versionado — funciona em Docker sem .git)
 * (3) Git na raiz do repo (dev local)
 * (4) package.json
 * (5) 1.0
 */
function readVersionFile() {
  try {
    const p = path.join(__dirname, 'VERSION')
    const line = readFileSync(p, 'utf-8').trim().split(/\r?\n/)[0]?.trim() || ''
    return versionFromEnv(line)
  } catch {
    return null
  }
}

function getAppVersion() {
  const fromEnv = versionFromEnv(process.env.VITE_APP_VERSION || process.env.APP_VERSION)
  if (fromEnv) return fromEnv

  const fromFile = readVersionFile()
  if (fromFile) return fromFile

  const gitCwd = path.join(__dirname, '..')
  try {
    const tag = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8', cwd: gitCwd }).trim()
    const count = execSync(`git rev-list --count ${tag}..HEAD`, { encoding: 'utf-8', cwd: gitCwd }).trim()
    const match = tag.match(/^v?(\d+)\.(\d+)/)
    const major = match ? match[1] : '1'
    const minorFromTag = match ? parseInt(match[2], 10) : 0
    const commits = parseInt(count, 10) || 0
    const minor = minorFromTag + commits
    return `${major}.${minor}`
  } catch {
    try {
      const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf-8'))
      const [major, minor] = (pkg.version || '1.0.0').split('.')
      return `${major}.${minor || '0'}`
    } catch {
      return '1.0'
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 80,
    host: '0.0.0.0',
    strictPort: false,
    // Permitir todos os hosts - usar true para desabilitar verificação
    allowedHosts: true,
    cors: true,
    // IMPORTANTE: Não configurar proxy aqui - o código JavaScript usa VITE_API_URL
    // O proxy do Vite Preview não funciona bem com containers separados
  },
  build: {
    // Garantir que o build gere arquivos estáticos corretos
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
