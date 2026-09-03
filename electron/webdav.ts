import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { Buffer } from 'buffer'

export interface WebDavConfig {
  url: string        // ex: https://dav.example.com/remote.php/dav/files/user/kb-pos
  username: string
  password: string
}

// Construit un chemin propre en joignant l'URL de base et un chemin relatif
function buildUrl(base: string, rel: string): string {
  const trimmed = base.replace(/\/+$/, '')
  const relClean = rel.replace(/^\/+/, '')
  return `${trimmed}/${relClean}`
}

// Envoie une requête WebDAV générique et retourne la réponse
function davRequest(method: string, davUrl: string, config: WebDavConfig, body?: Buffer | string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let url: URL
    try { url = new URL(davUrl) } catch { return reject(new Error('URL WebDAV invalide')) }
    const isHttps = url.protocol === 'https:'
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64')

    const options: any = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'KB-POS',
        ...headers
      }
    }

    const lib = isHttps ? https : http
    const req = lib.request(options, res => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (c: string) => { data += c })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
    })
    req.on('error', e => reject(e))
    if (body) req.write(body)
    req.end()
  })
}

// Vérifie qu'un dossier distant existe ; le crée s'il n'existe pas
export async function ensureRemoteDir(config: WebDavConfig, dirPath?: string): Promise<void> {
  const target = dirPath ? buildUrl(config.url, dirPath) : config.url
  try {
    const r = await davRequest('PROPFIND', target, config, undefined, { Depth: '0' })
    if (r.status >= 200 && r.status < 300) return
    if (r.status === 404) {
      const mk = await davRequest('MKCOL', target, config)
      if (mk.status === 201 || mk.status === 405) return // 405 = existe déjà
      throw new Error(`Impossible de créer le dossier distant (HTTP ${mk.status})`)
    }
    if (r.status === 401 || r.status === 403) throw new Error('Identifiants WebDAV incorrects (401/403)')
    throw new Error(`Le dossier distant n'est pas accessible (HTTP ${r.status})`)
  } catch (e: any) {
    if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'ETIMEDOUT' || e.code === 'EHOSTUNREACH') {
      throw new Error(`Serveur WebDAV injoignable (${e.code})`)
    }
    throw e
  }
}

// Liste les noms de fichiers dans un dossier distant (PROPFIND Depth 1)
export async function listRemoteDir(config: WebDavConfig, dirPath?: string): Promise<string[]> {
  const target = dirPath ? buildUrl(config.url, dirPath) : config.url
  const r = await davRequest('PROPFIND', target, config, undefined, { Depth: '1' })
  if (r.status !== 207 && !(r.status >= 200 && r.status < 300)) {
    return []
  }
  // Extraire les href des réponses multistatus
  const names: string[] = []
  const hrefRe = /<d:href>([^<]+)<\/d:href>|<href>([^<]+)<\/href>/g
  let m: RegExpExecArray | null
  while ((m = hrefRe.exec(r.body)) !== null) {
    const href = (m[1] || m[2] || '').trim()
    if (!href) continue
    const clean = decodeURIComponent(href.split('/').filter(Boolean).pop() || '')
    if (clean) names.push(clean)
  }
  return names
}

// Upload un fichier local vers le dossier distant via PUT
export async function uploadFile(config: WebDavConfig, localPath: string, remoteName: string, dirPath?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!fs.existsSync(localPath)) return { success: false, error: 'Fichier source introuvable' }
    const content = fs.readFileSync(localPath)
    const target = dirPath ? buildUrl(buildUrl(config.url, dirPath), remoteName) : buildUrl(config.url, remoteName)
    // Sécurise le nom de fichier distant
    const safeName = remoteName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const safeTarget = target.replace(/[^/]*$/, safeName)
    const r = await davRequest('PUT', safeTarget, config, content, { 'Content-Type': 'application/octet-stream' })
    if (r.status >= 200 && r.status < 300) return { success: true }
    return { success: false, error: `Échec upload (HTTP ${r.status})` }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Upload un fichier local (ex: un backup) vers le cloud
export async function uploadLocalFile(config: WebDavConfig, localPath: string, remoteName?: string, dirPath?: string): Promise<{ success: boolean; error?: string }> {
  const name = remoteName || path.basename(localPath)
  try {
    await ensureRemoteDir(config, dirPath)
    return await uploadFile(config, localPath, name, dirPath)
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
