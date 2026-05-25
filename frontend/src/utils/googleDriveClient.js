/** Google Drive no navegador: login em tempo real (sem tokens no backend). */

export const DRIVE_SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ')

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

/**
 * Abre popup do Google para o usuário entrar e autorizar (token efêmero, só na sessão).
 */
export async function solicitarTokenGoogle(clientId, { timeoutMs = 120000, prompt = 'consent select_account' } = {}) {
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID não configurado no frontend.')
  }
  await ensureGoogleIdentityLoaded()
  if (!window.google?.accounts?.oauth2?.initTokenClient) {
    throw new Error(
      'Não foi possível carregar o login Google. Desbloqueie pop-ups para dev.championschurch.com.br e recarregue a página.'
    )
  }

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
        new Error(
          'Login Google não concluiu a tempo. Desbloqueie pop-ups do navegador ou feche e abra o login do Google.'
        )
      )
    }, timeoutMs)

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          finish(reject, new Error(response.error_description || response.error))
          return
        }
        if (!response.access_token) {
          finish(reject, new Error('Google não devolveu token de acesso.'))
          return
        }
        finish(resolve, response.access_token)
      },
      error_callback: (err) => {
        const msg = err?.message || err?.type || 'Login Google cancelado ou bloqueado.'
        finish(reject, new Error(msg))
      },
    })

    try {
      client.requestAccessToken({ prompt, use_fedcm_for_prompt: false })
    } catch (err) {
      finish(reject, err instanceof Error ? err : new Error('Falha ao abrir login Google.'))
    }
  })
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
