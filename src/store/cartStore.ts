import { create } from 'zustand'
import type { CartItem, Produit, ModePaiement } from '@/types'

export const cartKey = (produitId: number, varianteId?: number, details?: string) =>
  `${produitId}::${varianteId ?? ''}::${details || ''}`

// Placeholder "Article libre" (vente libre sans code-barres) — voir DB seed
export const LIBRE_PRODUIT_ID = 99999998

interface CartState {
  items: CartItem[]
  remise: number
  clientId: number | null
  modePaiement: ModePaiement
  addItem: (produit: Produit, quantite?: number, details?: string, varianteId?: number, stockMax?: number) => void
  addVenteLibre: (nom: string, prix: number, quantite?: number) => void
  removeItem: (key: string) => void
  updateQuantite: (key: string, quantite: number) => void
  updatePrix: (key: string, prix: number) => void
  setRemise: (remise: number) => void
  setClientId: (id: number | null) => void
  setModePaiement: (mode: ModePaiement) => void
  clearCart: () => void
  total: () => number
  sousTotal: () => number
  nbArticles: () => number
}

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  remise: 0,
  clientId: null,
  modePaiement: 'especes',

  addItem: (produit, quantite = 1, details, varianteId, stockMax) => {
    const { items } = get()
    const key = cartKey(produit.id, varianteId, details)
    const existing = items.find(i => i.key === key)
    if (existing) {
      const plafond = existing.stockMax
      const somme = existing.quantite + quantite
      const nouvelleQte = plafond != null ? Math.min(somme, plafond) : somme
      set({
        items: items.map(i =>
          i.key === key
            ? { ...i, quantite: nouvelleQte, total_ligne: nouvelleQte * i.prix_unitaire }
            : i
        )
      })
    } else {
      set({
        items: [...items, {
          key,
          produit,
          quantite,
          prix_unitaire: produit.prix_vente,
          total_ligne: produit.prix_vente * quantite,
          details,
          variante_id: varianteId,
          stockMax
        }]
      })
    }
  },

addVenteLibre: (nom, prix, quantite = 1) => {
    const { items } = get()
    // Un article libre de même nom/prix se fusionne au panier
    const existing = items.find(i => i.nom_libre && i.nom_libre === nom && i.prix_unitaire === prix)
    if (existing) {
      set({
        items: items.map(i =>
          i.key === existing.key
            ? { ...i, quantite: i.quantite + quantite, total_ligne: i.total_ligne + prix * quantite }
            : i
        )
      })
    } else {
      const produit: Produit = {
        id: LIBRE_PRODUIT_ID,
        nom,
        prix_vente: prix,
        categorie_id: 0,
        prix_achat: prix,
        unite: 'pce',
        stock_actuel: 0,
        stock_minimum: 0,
        actif: 1
      }
      set({
        items: [...items, {
          key: `libre::${nom}::${prix}`,
          produit,
          quantite,
          prix_unitaire: prix,
          total_ligne: prix * quantite,
          nom_libre: nom
        }]
      })
    }
  },

  removeItem: (key) =>
    set(state => ({ items: state.items.filter(i => i.key !== key) })),

  updateQuantite: (key, quantite) => {
    if (quantite <= 0) {
      get().removeItem(key)
      return
    }
    set(state => ({
      items: state.items.map(i => {
        if (i.key !== key) return i
        const q = i.stockMax != null ? Math.min(quantite, i.stockMax) : quantite
        return { ...i, quantite: q, total_ligne: q * i.prix_unitaire }
      })
    }))
  },

  updatePrix: (key, prix) =>
    set(state => ({
      items: state.items.map(i =>
        i.key === key
          ? { ...i, prix_unitaire: prix, total_ligne: i.quantite * prix }
          : i
      )
    })),

  setRemise: (remise) => set({ remise }),
  setClientId: (id) => set({ clientId: id }),
  setModePaiement: (mode) => set({ modePaiement: mode }),

  clearCart: () => set({ items: [], remise: 0, clientId: null, modePaiement: 'especes' }),

  sousTotal: () => get().items.reduce((sum, i) => sum + i.total_ligne, 0),
  total: () => Math.max(0, get().sousTotal() - get().remise),
  nbArticles: () => get().items.reduce((sum, i) => sum + i.quantite, 0)
}))