import { Notification } from 'electron'

// Les types de notifications desktop et leurs paramètres de configuration
export type NotifType = 'vente' | 'stock' | 'ardoise' | 'fidelite' | 'rapport'

export interface NotifState {
  enabled: { [K in NotifType]?: boolean }
}

let state: NotifState = { enabled: {} }
let lastShown: Record<string, number> = {}

export function configureNotifications(enabled: { [K in NotifType]?: boolean }) {
  state = { enabled: { ...enabled } }
}

function isEnabled(type: NotifType): boolean {
  return state.enabled?.[type] !== false
}

// Anti-spam : empêche plus de N notifications du même type par minute
function rateLimit(type: NotifType, perMinute = 2): boolean {
  const now = Date.now()
  const arr = lastShown[type] ?? []
  const filtered = arr.filter(t => now - t < 60_000)
  if (filtered.length >= perMinute) return false
  filtered.push(now)
  lastShown[type] = filtered
  return true
}

export function notifyDesktop(type: NotifType, title: string, body: string): void {
  try {
    if (!isEnabled(type)) return
    if (!rateLimit(type, type === 'vente' ? 3 : 2)) return
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body })
    n.on('click', () => {})
    n.show()
  } catch {}
}

// Alias pratique
export function notifyStock(title: string, body: string) { notifyDesktop('stock', title, body) }
export function notifyVente(title: string, body: string) { notifyDesktop('vente', title, body) }
export function notifyArdoise(title: string, body: string) { notifyDesktop('ardoise', title, body) }
export function notifyFidelite(title: string, body: string) { notifyDesktop('fidelite', title, body) }
export function notifyRapport(title: string, body: string) { notifyDesktop('rapport', title, body) }
