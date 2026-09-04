// ─── MODE CLIENT-SERVEUR — CÔTÉ CAISSE CLIENTE ───────────────────────────────
// Une caisse configurée en "client" consulte le catalogue et le stock sur le PC
// serveur central (source de vérité), et y remonte ses décréments de stock.
// Tolérance de panne : si le serveur est injoignable, la caisse enregistre la
// vente localement et met le décrément en file d'attente (réessai au retour).

import { getAllParametres } from './database'

type LigneVente = {
  produit_id: number; quantite: number; prix_unitaire: number; total_ligne: number;
  code_barre?: string; nom?: string; categorie_id?: number; variante_id?: number; nom_libre?: string; details?: string
}

let localCatalogCache: { produits: any[]; variantes: any[]; categories: any[] } | null = null
let localConfigCache: any = null
let offlineQueue: { items: LigneVente[]; caissier_id: number; ticket: string; time: string; venteData: any }[] = []
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
export async function refreshRtCatalog(): Promise<{ ok: boolean; offline: boolean; categories?: any[]; produits?: any[]; variantes?: any[] }> {
  try {
    const data = await rtFetch('/api/rt/catalog')
    localCatalogCache = { produits: data.produits ?? [], variantes: data.variantes ?? [], categories: data.categories ?? [] }
    online = true
    return { ok: true, offline: false, categories: data.categories, produits: data.produits, variantes: data.variantes }
  } catch {
    online = false
    return { ok: localCatalogCache !== null, offline: true, categories: localCatalogCache?.categories, produits: localCatalogCache?.produits, variantes: localCatalogCache?.variantes }
  }
}

export function getRtCatalogCache(): { produits: any[]; variantes: any[]; categories: any[] } {
  return localCatalogCache ?? { produits: [], variantes: [], categories: [] }
}

// Récupère la configuration du serveur (types de commerce, paramètres, attributs…)
export async function refreshRtConfig(): Promise<{ ok: boolean; offline: boolean; config?: any }> {
  try {
    const data = await rtFetch('/api/rt/config')
    localConfigCache = data.config ?? null
    online = true
    return { ok: true, offline: false, config: localConfigCache }
  } catch {
    online = false
    return { ok: localConfigCache !== null, offline: true, config: localConfigCache }
  }
}

export function getRtConfigCache(): any {
  return localConfigCache
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
export async function rtSendDecrement(
  items: LigneVente[], caissierId: number, ticket: string,
  venteData: { total: number; remise: number; montant_paye: number; monnaie_rendue: number; mode_paiement: string; client_id?: number; client_nom?: string; paiements?: { mode: string; montant: number }[] }
): Promise<{ ok: boolean; queued: boolean }> {
  const base = rtBase()
  if (!base) return { ok: true, queued: false }
  const caisseId = getAllParametres()?.caisse_id || '1'
  try {
    const data = await rtFetch('/api/rt/decrement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, caissier_id: caissierId, ticket, caisse_id: caisseId, vente_data: venteData })
    })
    online = true
    return { ok: data.ok !== false, queued: false }
  } catch {
    online = false
    offlineQueue.push({ items, caissier_id: caissierId, ticket, time: new Date().toISOString(), venteData })
    return { ok: true, queued: true }
  }
}

// Vide la file d'attente hors-ligne quand le serveur revient.
export async function flushRtQueue(): Promise<number> {
  if (offlineQueue.length === 0) return 0
  try {
    await rtFetch('/api/rt/catalog')
    online = true
  } catch {
    online = false
    return 0
  }
  const caisseId = getAllParametres()?.caisse_id || '1'
  let sent = 0
  const remaining: typeof offlineQueue = []
  for (const entry of offlineQueue) {
    try {
      const data = await rtFetch('/api/rt/decrement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: entry.items, caissier_id: entry.caissier_id, ticket: entry.ticket, caisse_id: caisseId, vente_data: entry.venteData })
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

// ─── HÉRITAGE DE CONFIGURATION (force le pull complet catalogue + config) ──────
// Bouton "Hériter" côté client : force un rafraîchissement complet du catalogue
// et de la configuration depuis le serveur.
export async function rtInherit(): Promise<{ ok: boolean; error?: string }> {
  try {
    const cat = await rtFetch('/api/rt/catalog')
    localCatalogCache = { produits: cat.produits ?? [], variantes: cat.variantes ?? [], categories: cat.categories ?? [] }
    online = true
    return { ok: true }
  } catch (e: any) {
    online = false
    return { ok: false, error: e?.message || 'Serveur injoignable' }
  }
}

// ─── RAPPORT DE CLÔTURE DE CAISSE (client → serveur) ──────────────────────────
// Envoie les données de clôture de session au serveur pour le tableau de bord.
export async function rtSendCloture(data: {
  caisse_id: string; user_nom?: string; date: string; heure?: string;
  nb_ventes: number; total_ventes: number; total_especes: number; total_mobile: number;
  fond_caisse: number; montant_final_especes: number; ecart?: number
}): Promise<{ ok: boolean; error?: string }> {
  const base = rtBase()
  if (!base) return { ok: true }
  try {
    const resp = await rtFetch('/api/rt/cloture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    online = true
    return { ok: resp.ok !== false }
  } catch (e: any) {
    online = false
    return { ok: false, error: e?.message || 'Serveur injoignable' }
  }
}
