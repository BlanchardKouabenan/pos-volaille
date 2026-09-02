import { createHash } from 'crypto'
import { getAllParametres, setParametre, getForfaitInfo, ForfaitInfo } from './database'

// Secret interne utilisé pour signer les licences d'extension.
const SECRET = 'kbpos-forfait-2026-licence-secret'
const PREFIX = 'KBPOS'

export type { ForfaitInfo }
export { getForfaitInfo }

// Prolonge le forfait de N mois à partir d'aujourd'hui (ou de l'expiration si elle est future).
export function prolongerForfaitLocal(mois: number): ForfaitInfo {
  const moisChoisi = Math.floor(mois)
  if (!moisChoisi || moisChoisi <= 0) throw new Error('Nombre de mois invalide')
  const current = getForfaitInfo()
  let base = new Date()
  if (current.expiration && !current.expire) {
    const d = new Date(current.expiration + 'T00:00:00')
    if (!isNaN(d.getTime())) base = d
  }
  base.setMonth(base.getMonth() + moisChoisi)
  const newExp = base.toISOString().slice(0, 10)
  setParametre('forfait_expiration', newExp)
  return getForfaitInfo()
}

// Génère un token de licence pour une expiration donnée (utilisé côté "admin à distance").
// L'admin peut générer un token pour X mois et l'appliquer sur une autre caisse (ou via fichier .kbkey).
export function genererLicence(mois: number): string {
  const moisChoisi = Math.floor(mois)
  if (!moisChoisi || moisChoisi <= 0) throw new Error('Nombre de mois invalide')
  const expiry = prolongerForfaitLocal(moisChoisi).expiration
  return signLicence(expiry)
}

function signLicence(expiration: string): string {
  const payload = JSON.stringify({ exp: expiration, ts: Date.now() })
  const checksum = createHash('sha256').update(SECRET + payload).digest('hex').slice(0, 12)
  const raw = `${PREFIX}.${Buffer.from(payload).toString('base64url')}.${checksum}`
  return Buffer.from(raw).toString('base64url')
}

// Vérifie et applique une licence. Renvoie les infos mises à jour si valide, sinon lève une erreur.
export function appliquerLicence(token: string): ForfaitInfo {
  const cleaned = String(token || '').trim()
  if (!cleaned) throw new Error('Token vide')
  let raw: string
  try { raw = Buffer.from(cleaned, 'base64url').toString('utf8') } catch { throw new Error('Token invalide') }
  const parts = raw.split('.')
  if (parts.length < 3 || parts[0] !== PREFIX) throw new Error('Licence non reconnue')
  const payloadB64 = parts[1]
  const checksum = parts[2]
  const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8')
  const expected = createHash('sha256').update(SECRET + payloadJson).digest('hex').slice(0, 12)
  if (checksum !== expected) throw new Error('Licence invalide (signature incorrecte)')
  let data: any
  try { data = JSON.parse(payloadJson) } catch { throw new Error('Licence corrompue') }
  if (!data?.exp) throw new Error("Licence sans date d'expiration")
  // Ne pas accepter une licence qui diminuerait l'abonnement (éviter un retour en arrière)
  const current = getForfaitInfo()
  const newDate = new Date(data.exp + 'T00:00:00').getTime()
  if (current.expiration) {
    const curDate = new Date(current.expiration + 'T00:00:00').getTime()
    if (newDate < curDate) throw new Error("Cette licence ne prolonge pas l'abonnement actuel")
  }
  setParametre('forfait_expiration', data.exp)
  return getForfaitInfo()
}
