/** Google Drive no navegador: login em tempo real (sem tokens no backend). */

export const DRIVE_SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ')

export const DRIVE_OAUTH_PENDING_KEY = 'champions_drive_oauth_pending'

export function driveOAuthRedirectUri() {
  return `${window.location.origin}/admin/backup-import`
}

export function formatGoogleOAuthError(message) {
  const msg = String(message || '').trim()
  const lower = msg.toLowerCase()
  if (lower.includes('popup') && lower.includes('closed')) {
    return (
      'Login Google não concluído. Se apareceu "O Google não verificou este app", clique em Avançado e em ' +
      '"Acessar… (não seguro)" para continuar, ou clique de novo — o login abrirá nesta aba.'
    )
  }
  if (lower.includes('popup') && lower.includes('block')) {
    return 'O navegador bloqueou a janela do Google. Permita pop-ups para este site ou use o login nesta aba.'
  }
  if (lower.includes('access_denied') || lower.includes('cancel')) {
    return 'Login Google cancelado. Tente novamente e autorize o acesso ao Drive.'
  }
  if (lower.includes('server_error') || lower.includes('500')) {
    return (
      'Erro 500 do Google ao autorizar o app. No Google Cloud: adicione os escopos do Drive na tela ' +
      'de consentimento, cadastre a URI de redirecionamento exata e inclua seu e-mail em usuários de teste.'
    )
  }
  if (lower.includes('redirect_uri_mismatch')) {
    return (
      `URI de redirecionamento não cadastrada no Google Cloud. Adicione exatamente: ${driveOAuthRedirectUri()}`
    )
  }
  return msg || 'Falha ao entrar no Google.'
}

/** Lê token ou erro OAuth no hash (#access_token= / #error=) após redirect. */
export function consumirRetornoOAuthNoHash() {
  const hash = window.location.hash?.replace(/^#/, '')
  if (!hash) return null

  const params = new URLSearchParams(hash)
  const cleanUrl = `${window.location.pathname}${window.location.search}`
  window.history.replaceState(null, '', cleanUrl)

  const error = params.get('error')
  if (error) {
    sessionStorage.removeItem(DRIVE_OAUTH_PENDING_KEY)
    return {
      error: formatGoogleOAuthError(params.get('error_description') || error),
    }
  }

  const accessToken = params.get('access_token')
  if (!accessToken) return null

  const intent = sessionStorage.getItem(DRIVE_OAUTH_PENDING_KEY)
  sessionStorage.removeItem(DRIVE_OAUTH_PENDING_KEY)
  if (!intent) return null

  return { accessToken, intent }
}

/** @deprecated use consumirRetornoOAuthNoHash */
export function consumirErroOAuthNoHash() {
  const result = consumirRetornoOAuthNoHash()
  return result?.error || null
}

export function isPopupOAuthFailure(error) {
  const msg = String(error?.message || error || '').toLowerCase()
  return (
    (msg.includes('popup') && (msg.includes('closed') || msg.includes('block'))) ||
    msg.includes('popup_failed') ||
    msg.includes('popup_closed')
  )
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Falha ao carregar script: ${src}`))
    document.head.appendChild(script)
  })
}

export async function ensureGoogleIdentityLoaded() {
  await loadScript('https://accounts.google.com/gsi/client')
}

async function driveFetch(accessToken, url) {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!resp.ok) {
    let googleMsg = ''
    try {
      const data = await resp.json()
      googleMsg = data?.error?.message || ''
    } catch {
      googleMsg = await resp.text().catch(() => '')
    }
    if (resp.status === 401) {
      throw new Error('Sessão Google expirou. Clique de novo em Salvar no Google Drive.')
    }
    if (resp.status === 403) {
      throw new Error(
        googleMsg ||
          'Sem permissão no Google Drive. Autorize o acesso ao Drive na conta Google e confira se a Drive API está ativa no Google Cloud.'
      )
    }
    throw new Error(googleMsg || 'Não foi possível acessar o Google Drive.')
  }
  return resp.json()
}

export async function validarAcessoDrive(accessToken) {
  const url = new URL('https://www.googleapis.com/drive/v3/about')
  url.searchParams.set('fields', 'user(displayName)')
  await driveFetch(accessToken, url.toString())
}

function assertGoogleOAuthReady() {
  if (!window.google?.accounts?.oauth2?.initTokenClient) {
    throw new Error(
      'Não foi possível carregar o login Google. Recarregue a página e tente novamente.'
    )
  }
}

/**
 * Login Google via pop-up (rápido quando o navegador permite).
 */
export async function solicitarTokenGooglePopup(clientId, { timeoutMs = 120000, prompt = 'consent select_account' } = {}) {
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID não configurado no frontend.')
  }
  await ensureGoogleIdentityLoaded()
  assertGoogleOAuthReady()

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }

    const timer = setTimeout(() => {
      finish(
        reject,
        new Error('Login Google não concluiu a tempo. Tente de novo — usaremos o login nesta aba.')
      )
    }, timeoutMs)

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          finish(reject, new Error(formatGoogleOAuthError(response.error_description || response.error)))
          return
        }
        if (!response.access_token) {
          finish(reject, new Error('Google não devolveu token de acesso.'))
          return
        }
        finish(resolve, response.access_token)
      },
      error_callback: (err) => {
        finish(reject, new Error(formatGoogleOAuthError(err?.message || err?.type)))
      },
    })

    try {
      client.requestAccessToken({ prompt })
    } catch (err) {
      finish(reject, err instanceof Error ? err : new Error('Falha ao abrir login Google.'))
    }
  })
}

/** @deprecated use solicitarTokenGooglePopup */
export async function solicitarTokenGoogle(clientId, options) {
  return solicitarTokenGooglePopup(clientId, options)
}

/**
 * Login Google redirecionando a aba inteira (mais confiável que GIS redirect no Brave).
 * intent: 'export' | 'import'
 */
export function iniciarTokenGoogleRedirect(clientId, intent) {
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID não configurado no frontend.')
  }
  sessionStorage.setItem(DRIVE_OAUTH_PENDING_KEY, intent)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: driveOAuthRedirectUri(),
    response_type: 'token',
    scope: DRIVE_SCOPE,
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
  })

  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}

/**
 * Após redirect do Google, processa token no hash da URL.
 * Retorna true se havia retorno OAuth pendente.
 */
export async function processarRetornoOAuthRedirect(clientId, { onToken, onError }) {
  if (!clientId) return false

  const retorno = consumirRetornoOAuthNoHash()
  if (!retorno) return false

  if (retorno.error) {
    onError(new Error(retorno.error))
    return true
  }

  onToken(retorno.accessToken, retorno.intent)
  return true
}

export async function solicitarTokenGoogleComFallback(clientId, intent) {
  try {
    return await solicitarTokenGooglePopup(clientId)
  } catch (error) {
    if (isPopupOAuthFailure(error)) {
      iniciarTokenGoogleRedirect(clientId, intent)
      return null
    }
    throw error
  }
}

export async function listarPastasDrive(accessToken, parentId = 'root') {
  const parent = parentId || 'root'
  const q = [
    "mimeType='application/vnd.google-apps.folder'",
    `'${parent}' in parents`,
    'trashed=false',
  ].join(' and ')
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', q)
  url.searchParams.set('fields', 'files(id,name)')
  url.searchParams.set('orderBy', 'name')
  url.searchParams.set('pageSize', '200')
  const data = await driveFetch(accessToken, url.toString())
  return data.files || []
}

export async function listarArquivosBackupDrive(accessToken, parentId = 'root') {
  const parent = parentId || 'root'
  const q = [
    `'${parent}' in parents`,
    'trashed=false',
    "(name contains '.tar.gz' or name contains '.tgz')",
  ].join(' and ')
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', q)
  url.searchParams.set('fields', 'files(id,name,modifiedTime,size)')
  url.searchParams.set('orderBy', 'modifiedTime desc')
  url.searchParams.set('pageSize', '200')
  const data = await driveFetch(accessToken, url.toString())
  return data.files || []
}

export async function uploadBackupParaDrive(accessToken, folderId, filename, blob) {
  const initResp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ name: filename, parents: [folderId] }),
    }
  )
  if (!initResp.ok) {
    const body = await initResp.text().catch(() => '')
    throw new Error(
      body.includes('accessNotConfigured') || body.includes('Drive API')
        ? 'Ative a Google Drive API no projeto Google Cloud (APIs e serviços → Biblioteca).'
        : `Google Drive recusou o upload (${initResp.status}). Verifique a pasta e as permissões OAuth.`
    )
  }
  const uploadUrl = initResp.headers.get('Location')
  if (!uploadUrl) {
    throw new Error('Resposta inválida do Google Drive (sem URL de upload).')
  }
  const doneResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/gzip',
      'Content-Length': String(blob.size),
    },
    body: blob,
  })
  if (!doneResp.ok) {
    throw new Error('Upload do backup para o Google Drive falhou.')
  }
  const fileMeta = await doneResp.json()
  return { fileId: fileMeta.id, name: fileMeta.name || filename }
}

export async function baixarBackupDoDrive(accessToken, fileId) {
  const metaResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!metaResp.ok) {
    throw new Error('Arquivo não encontrado no Google Drive ou sem permissão.')
  }
  const { name } = await metaResp.json()
  const lower = (name || '').toLowerCase()
  if (!lower.endsWith('.tar.gz') && !lower.endsWith('.tgz')) {
    throw new Error('Selecione um arquivo de backup .tar.gz no Google Drive.')
  }

  const dlResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!dlResp.ok) {
    throw new Error('Não foi possível baixar o backup do Google Drive.')
  }
  const blob = await dlResp.blob()
  return { blob, name: name || 'backup.tar.gz' }
}
