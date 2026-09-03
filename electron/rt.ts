// ─── MODE CLIENT-SERVEUR — CÔTÉ CAISSE CLIENTE ───────────────────────────────
// Une caisse configurée en "client" consulte le catalogue et le stock sur le PC
// serveur central (source de vérité), et y remonte ses décréments de stock.
// Tolérance de panne : si le serveur est injoignable, la caisse enregistre la
// vente localement et met le décrément en file d'attente (réessai au retour).

import { getAllParametres } from './database'

type LigneStock = { produit_id: number; quantite: number; variante_id?: number; nom_libre?: string }

let localCatalogCache: { produits: any[]; variantes: any[] } | null = null
let offlineQueue: { items: LigneStock[]; caissier_id: number; ticket: string; time: string }[] = []
let online = false

function rtBase(): string | null {
  const p = getAllParametres()
  if (p.reseau_role !== 'client') return null
  const ip = p.reseau_serveur_ip || ''
  const port = p.reseau_serveur_port || '7890'
  if (!ip) return null
  return `http://${ip}:${port}`
}

export function isRtClient(): boolean {
  return !!rtBase()
}

export function isRtOnline(): boolean {
  return online
}

async function rtFetch(path: string, init?: RequestInit): Promise<any> {
  const base = rtBase()
  if (!base) throw new Error('mode client non configuré')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const resp = await fetch(base + path, { ...init, signal: ctrl.signal })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || data?.ok === false) {
      const e = new Error(data?.error || `HTTP ${resp.status}`) as any
      e.remote = data
      throw e
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

// Chargement du catalogue depuis le serveur (avec cache local en fallback).
export async function refreshRtCatalog(): Promise<{ ok: boolean; offline: boolean; produits?: any[]; variantes?: any[] }> {
  try {
    const data = await rtFetch('/api/rt/catalog')
    localCatalogCache = { produits: data.produits ?? [], variantes: data.variantes ?? [] }
    online = true
    return { ok: true, offline: false, produits: data.produits, variantes: data.variantes }
  } catch {
    online = false
    return { ok: localCatalogCache !== null, offline: true, produits: localCatalogCache?.produits, variantes: localCatalogCache?.variantes }
  }
}

export function getRtCatalogCache(): { produits: any[]; variantes: any[] } {
  return localCatalogCache ?? { produits: [], variantes: [] }
}

// Synchronise la réplication des clients (fidélité / solde) depuis le serveur.
export async function refreshRtClients(): Promise<{ ok: boolean; offline: boolean }> {
  try {
    await rtFetch('/api/rt/clients')
    online = true
    return { ok: true, offline: false }
  } catch {
    online = false
    return { ok: false, offline: true }
  }
}

// Vérification du stock côté serveur avant encaissement (consultatif).
export async function rtCheckStock(items: { produit_id: number; variante_id?: number }[]): Promise<{ disponible: boolean; dispo: number }[]> {
  try {
    const data = await rtFetch('/api/rt/check-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    })
    online = true
    return (data.items ?? []) as { disponible: boolean; dispo: number }[]
  } catch {
    online = false
    return items.map(() => ({ disponible: true, dispo: -1 }))
  }
}

// Remontée "encaisser d'abord, décrémenter après" : tente l'envoi immédiat,
// sinon met en file d'attente pour réessai.
export async function rtSendDecrement(items: LigneStock[], caissierId: number, ticket: string): Promise<{ ok: boolean; queued: boolean }> {
  const base = rtBase()
  if (!base) return { ok: true, queued: false } // pas en mode client
  try {
    const data = await rtFetch('/api/rt/decrement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, caissier_id: caissierId, ticket })
    })
    online = true
    return { ok: data.ok !== false, queued: false }
  } catch {
    online = false
    offlineQueue.push({ items, caissier_id: caissierId, ticket, time: new Date().toISOString() })
    return { ok: true, queued: true }
  }
}

// Vide la file d'attente hors-ligne quand le serveur revient.
export async function flushRtQueue(): Promise<number> {
  if (offlineQueue.length === 0) return 0
  try {
    await rtFetch('/api/rt/catalog') // ping connexion
    online = true
  } catch {
    online = false
    return 0
  }
  let sent = 0
  const remaining: typeof offlineQueue = []
  for (const entry of offlineQueue) {
    try {
      const data = await rtFetch('/api/rt/decrement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: entry.items, caissier_id: entry.caissier_id, ticket: entry.ticket })
      })
      if (data.ok !== false) sent++
      else remaining.push(entry)
    } catch {
      remaining.push(entry)
    }
  }
  offlineQueue = remaining
  return sent
}

export function getRtQueueLength(): number {
  return offlineQueue.length
}
