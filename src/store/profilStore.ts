import { create } from 'zustand'
import { profilGet, profilList, profilApply, getParametres } from '@/lib/ipc'
import type { ProfilModules, ProfilListEntry, ProfilComplet } from '@/types'

interface ProfilState {
  current: ProfilComplet | null
  liste: ProfilListEntry[]
  charge: boolean
  load: () => Promise<void>
  apply: (id: string) => Promise<void>
  aModule: (mod: keyof ProfilModules) => boolean
  hasForfait: () => boolean
}

function parseModules(raw: string | undefined | null): ProfilModules | null {
  if (!raw) return null
  try {
    const m = JSON.parse(raw)
    return typeof m !== 'object' || m === null ? null : m as ProfilModules
  } catch {
    return null
  }
}

export const useProfilStore = create<ProfilState>()((set, get) => ({
  current: null,
  liste: [],
  charge: false,

  load: async () => {
    try {
      const [cur, liste, params] = await Promise.all([
        profilGet(),
        profilList(),
        getParametres(),
      ])
      const entry = cur ? liste.find(l => l.id === cur.id) : undefined
      if (!cur) {
        set({ current: null, liste, charge: true })
        return
      }
      const modules = parseModules((params as any)?.modules_actifs)
      const mode_paiements: string[] = (() => {
        try {
          const raw = (params as any)?.modes_paiement_actifs
          if (!raw) return []
          const v = JSON.parse(raw)
          return Array.isArray(v) ? v : []
        } catch { return [] }
      })()
      set({
        current: {
          id: cur.id,
          label: cur.label,
          icone: entry?.icone ?? '🏪',
          couleur: entry?.couleur ?? '#3b82f6',
          devise: (params as any)?.monnaie ?? 'FCFA',
          unite_defaut: (params as any)?.unite_defaut ?? 'pièce',
          tva_defaut: Number((params as any)?.tva_taux ?? 0),
          modules: modules ?? {
            pesee: false, variantes: false, peremption: false, forfaits_client: false,
            fidelite: true, ardoise: false, devis: false, commandes_fournisseurs: false,
            inventaire: true, promotions: false, campagnes: false, multi_entrepots: false,
            factures: true, retours: true, sms: false,
          },
          mode_paiements,
          champs_client: [],
        },
        liste,
        charge: true,
      })
    } catch {
      set({ charge: true })
    }
  },

  apply: async (id: string) => {
    await profilApply(id)
    await get().load()
  },

  aModule: (mod) => {
    const c = get().current
    if (!c || !c.modules || typeof c.modules[mod] !== 'boolean') return true
    return c.modules[mod]
  },

  hasForfait: () => get().aModule('forfaits_client'),
}))