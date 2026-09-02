import https from 'https'
import http from 'http'

interface SmsParams {
  to: string
  message: string
  provider: string   // 'twilio' | 'orange_ci' | 'generic_http'
  apiKey: string     // Twilio: AccountSID:AuthToken | generic: Bearer token
  from: string       // Numéro ou nom expéditeur
  webhookUrl?: string  // Pour generic_http
  accountSid?: string  // Twilio spécifique
}

// ─── Twilio SMS ───────────────────────────────────────────────────────────────
function sendTwilio(params: SmsParams): Promise<{ success: boolean; error?: string }> {
  return new Promise(resolve => {
    const [sid, token] = params.apiKey.split(':')
    if (!sid || !token) return resolve({ success: false, error: 'Twilio: format apiKey invalide (SID:TOKEN)' })

    const body = new URLSearchParams({
      From: params.from,
      To: params.to,
      Body: params.message
    }).toString()

    const auth = Buffer.from(`${sid}:${token}`).toString('base64')
    const options = {
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${sid}/Messages.json`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }

    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true })
        } else {
          try {
            const j = JSON.parse(data)
            resolve({ success: false, error: j.message || `HTTP ${res.statusCode}` })
          } catch {
            resolve({ success: false, error: `HTTP ${res.statusCode}` })
          }
        }
      })
    })
    req.on('error', e => resolve({ success: false, error: e.message }))
    req.write(body)
    req.end()
  })
}

// ─── Generic HTTP Webhook ─────────────────────────────────────────────────────
function sendGenericHttp(params: SmsParams): Promise<{ success: boolean; error?: string }> {
  return new Promise(resolve => {
    if (!params.webhookUrl) return resolve({ success: false, error: 'URL webhook manquante' })
    const payload = JSON.stringify({ to: params.to, message: params.message, from: params.from })
    const url = new URL(params.webhookUrl)
    const isHttps = url.protocol === 'https:'
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(params.apiKey ? { 'Authorization': `Bearer ${params.apiKey}` } : {})
      }
    }
    const lib = isHttps ? https : http
    const req = (lib as typeof https).request(options as any, res => {
      let data = ''
      res.on('data', (c: string) => { data += c })
      res.on('end', () => {
        resolve({ success: (res.statusCode ?? 0) < 400 })
      })
    })
    req.on('error', (e: Error) => resolve({ success: false, error: e.message }))
    req.write(payload)
    req.end()
  })
}

// ─── Entrée principale ────────────────────────────────────────────────────────
export async function sendSms(params: SmsParams): Promise<{ success: boolean; error?: string }> {
  try {
    // Normaliser le numéro (Côte d'Ivoire: 225 + 10 chiffres)
    let to = params.to.replace(/[\s\-\.]/g, '')
    if (to.startsWith('0') && !to.startsWith('00')) {
      // Numéro local CI → international
      to = '+225' + to.slice(1)
    } else if (!to.startsWith('+')) {
      to = '+' + to
    }

    switch (params.provider) {
      case 'twilio': return sendTwilio({ ...params, to })
      case 'generic_http': return sendGenericHttp({ ...params, to })
      default: return { success: false, error: `Fournisseur inconnu: ${params.provider}` }
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ─── Formatage du message ticket SMS ─────────────────────────────────────────
export function formatSmsTicket(data: {
  nom_entreprise: string
  ticket: string
  total: number
  monnaie: string
  mode_paiement: string
  points_gagnes?: number
  solde_points?: number
  valeur_point_fcfa?: number
  monnaie_creditee_wallet?: number
  footer?: string
}): string {
  const modeLabels: Record<string, string> = {
    especes: 'Espèces', wave: 'Wave', orange_money: 'Orange Money',
    mtn: 'MTN Money', carte: 'Carte', ardoise: 'Ardoise'
  }
  const vp = data.valeur_point_fcfa ?? 1
  const lines: string[] = [
    `✅ ${data.nom_entreprise}`,
    `Ticket: ${data.ticket}`,
    `Total: ${data.total.toLocaleString('fr-FR')} ${data.monnaie}`,
    `Paiement: ${modeLabels[data.mode_paiement] || data.mode_paiement}`,
  ]
  if (data.points_gagnes && data.points_gagnes > 0) {
    lines.push(`★ +${data.points_gagnes} pts gagnés (${Math.round(data.points_gagnes * vp).toLocaleString('fr-FR')} ${data.monnaie})`)
  }
  if (data.solde_points !== undefined) {
    lines.push(`Solde fidélité: ${data.solde_points} pts = ${Math.round(data.solde_points * vp).toLocaleString('fr-FR')} ${data.monnaie}`)
  }
  if (data.monnaie_creditee_wallet && data.monnaie_creditee_wallet > 0) {
    lines.push(`💳 +${data.monnaie_creditee_wallet.toLocaleString('fr-FR')} ${data.monnaie} ajouté à votre porte-monnaie`)
  }
  if (data.footer) lines.push(data.footer)
  else lines.push('Merci pour votre confiance ! 🙏')
  return lines.join('\n')
}
