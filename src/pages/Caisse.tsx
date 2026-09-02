import { useState, useEffect, useRef } from 'react'
import { useCartStore, cartKey } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import { useSessionStore } from '@/store/sessionStore'
import { useProfilStore } from '@/store/profilStore'
import {
  getProduits, getCategories, createVente, getParametres,
  printReceipt, getReceiptText, getClients, formatCurrency, getPrixClients,
  ouvrirTiroir, verifieCodeSuperviseur, getSessionOuverte, getPromotions,
  commercialAjouterPoints, commercialVendreACredit,
  commercialGetFideliteRegle, commercialGetClientSolde,
  commercialCrediterPortefeuille, commercialDebiterPortefeuille,
  commercialUtiliserPoints,
  createClient,
  rotationVerifier, rotationGenerer, rotationGetInfo,
  customerOpen, customerClose, customerIsOpen, customerPush,
  smsSend,
  getAttributionsTousProduits,
  createMouvementCaisse, getMouvementsCaisse
} from '@/lib/ipc'
import type { Produit, Categorie, Client, ModePaiement, AttributionProduit, CartItem, MouvementCaisse } from '@/types'
import {
  Search, ShoppingCart, Trash2, Plus, Minus, X, Printer,
  CreditCard, Smartphone, Banknote, RotateCcw,
  User, Check, AlertCircle, Package, UnlockKeyhole,
  ShieldAlert, Clock, Wallet, Star, ArrowDownToLine, ArrowUpFromLine
} from 'lucide-react'
import CaBarComponent from '@/components/CaBarComponent'
import ProductVisual from '@/components/ProductVisual'
import BalanceModal, { isUnitesPoids } from '@/components/BalanceModal'
import VariantModal from '@/components/VariantModal'
import RetourModal from '@/components/RetourModal'
import PeremptionBadge, { getPeremptionStatus } from '@/components/PeremptionBadge'

const MODE_PAIEMENT_CONFIG: { id: ModePaiement; label: string; icon: JSX.Element; color: string; bgColor: string }[] = [
  { id: 'especes', label: 'Espèces', icon: <Banknote size={24} />, color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
  { id: 'wave', label: 'Wave', icon: <Smartphone size={24} />, color: 'text-cyan-700', bgColor: 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100' },
  { id: 'orange_money', label: 'Orange Money', icon: <Smartphone size={24} />, color: 'text-orange-700', bgColor: 'bg-orange-50 border-orange-200 hover:bg-orange-100' },
  { id: 'mtn', label: 'MTN Money', icon: <Smartphone size={24} />, color: 'text-yellow-700', bgColor: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100' },
  { id: 'carte', label: 'Carte', icon: <CreditCard size={24} />, color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200 hover:bg-purple-100' },
  { id: 'ardoise', label: 'Ardoise', icon: <CreditCard size={24} />, color: 'text-red-700', bgColor: 'bg-red-50 border-red-200 hover:bg-red-100' }
]

// Bip de confirmation de douchette (Web Audio, sans fichier)
function scannerBeep(kind: 'ok' | 'err') {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AC()
    const notes = kind === 'ok' ? [880, 1180] : [200, 150]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'square'
      o.frequency.value = f
      g.gain.value = 0.045
      o.connect(g)
      g.connect(ctx.destination)
      const t = ctx.currentTime + i * 0.09
      o.start(t)
      o.stop(t + 0.09)
    })
    setTimeout(() => { try { ctx.close() } catch {} }, 500)
  } catch {}
}

function NumPad({ value, onChange, onConfirm }: { value: string; onChange: (v: string) => void; onConfirm?: () => void }) {
  const press = (key: string) => {
    if (key === 'C') { onChange(''); return }
    if (key === '⌫') { onChange(value.slice(0, -1)); return }
    if (key === ',' && value.includes(',')) return
    if (value === '0' && key !== ',') { onChange(key); return }
    onChange(value + key)
  }
  const keys = ['7','8','9','4','5','6','1','2','3',',','0','⌫']
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map(k => (
        <button key={k} onClick={() => press(k)}
          className="h-12 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-lg rounded-xl transition-all">
          {k}
        </button>
      ))}
      <button onClick={() => press('C')}
        className="col-span-2 h-12 bg-red-100 hover:bg-red-200 active:bg-red-300 text-red-700 font-bold rounded-xl transition-all">
        Effacer
      </button>
      {onConfirm && (
        <button onClick={onConfirm}
          className="col-span-3 h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
          <Check size={18} /> OK
        </button>
      )}
    </div>
  )
}

// ─── Modal code superviseur ──────────────────────────────────────────────────
// Accepte : code permanent (4 chiffres) OU code rotatif (6 chiffres)
function SuperviseurModal({
  onSuccess,
  onClose,
  titre = 'Code superviseur requis'
}: {
  onSuccess: () => void
  onClose: () => void
  titre?: string
}) {
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState('')
  const [loading, setLoading] = useState(false)

  const press = (k: string) => {
    if (k === '⌫') { setCode(v => v.slice(0, -1)); setErreur(''); return }
    if (k === 'C') { setCode(''); setErreur(''); return }
    if (code.length >= 6) return
    setCode(v => v + k)
  }

  const handleVerif = async () => {
    if (code.length < 4) { setErreur('Code trop court'); return }
    setLoading(true)
    try {
      // Essai code permanent (4 chiffres)
      if (code.length === 4) {
        const ok = await verifieCodeSuperviseur(code)
        if (ok) { onSuccess(); onClose(); return }
      }
      // Essai code rotatif (6 chiffres, ou 4 si le permanent a échoué)
      const res = await rotationVerifier(code)
      if (res.ok) {
        onSuccess()
        onClose()
      } else {
        setErreur(res.raison ?? 'Code incorrect. Accès refusé.')
        setCode('')
      }
    } catch {
      setErreur('Erreur de vérification')
    }
    setLoading(false)
  }

  useEffect(() => {
    // Auto-valider sur 4 chiffres (permanent) ou 6 chiffres (rotatif)
    if (code.length === 4 || code.length === 6) handleVerif()
  }, [code])

  const keys = ['1','2','3','4','5','6','7','8','9','C','0','⌫']

  return (
    <div className="modal-overlay">
      <div className="bg-white rounded-2xl shadow-modal p-5 w-80">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={22} className="text-orange-500" />
            <h3 className="font-bold text-gray-800">{titre}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4 text-center">
          Code permanent (4 chiffres) ou code rotatif gestionnaire (6 chiffres).
        </p>

        {/* Affichage du code masqué — 6 cases */}
        <div className="flex justify-center gap-2 mb-4">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all ${
              code.length > i ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50'
            }`}>
              {code.length > i ? '•' : ''}
            </div>
          ))}
        </div>

        {erreur && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-sm text-center mb-3 flex items-center justify-center gap-1">
            <AlertCircle size={14} /> {erreur}
          </div>
        )}

        {/* NumPad */}
        <div className="grid grid-cols-3 gap-2">
          {keys.map(k => (
            <button
              key={k}
              onClick={() => press(k)}
              disabled={loading}
              className={`h-12 font-bold text-lg rounded-xl transition-all ${
                k === 'C' ? 'bg-red-100 hover:bg-red-200 text-red-700' :
                k === '⌫' ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' :
                'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <button
          onClick={handleVerif}
          disabled={loading || code.length !== 4}
          className="w-full h-12 mt-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={18} />}
          Valider
        </button>
      </div>
    </div>
  )
}

// ─── Helpers promos ────────────────────────────────────────────────────────────
function getActivePromoForProduit(promo: any[], prod: Produit, qty = 1): any | null {
  const today = new Date().toISOString().slice(0, 10)
  const matches = promo.filter(p => {
    if (!p.actif) return false
    if (p.quantite_min > qty) return false
    if (p.date_debut && p.date_debut > today) return false
    if (p.date_fin && p.date_fin < today) return false
    if (p.produit_id) return p.produit_id === prod.id
    if (p.categorie_id) return p.categorie_id === prod.categorie_id
    return true // promo globale
  })
  // Priorité : promo spécifique au produit > catégorie > globale
  matches.sort((a, b) => (b.produit_id ? 1 : 0) - (a.produit_id ? 1 : 0))
  return matches[0] ?? null
}

function calcPrixPromo(prixVente: number, p: any): number {
  switch (p.type) {
    case 'pourcentage': return Math.round(prixVente * (1 - p.valeur / 100))
    case 'montant_fixe': return Math.max(0, Math.round(prixVente - p.valeur))
    case 'prix_special': return Math.round(p.valeur)
    default: return prixVente
  }
}

export default function Caisse() {
  const { user } = useAuthStore()
  const cart = useCartStore()
  const { session, setSession } = useSessionStore()
  const modesPaiementActifs = useProfilStore(s => s.current?.mode_paiements ?? null)
  const [produits, setProduits] = useState<Produit[]>([])
  const [categories, setCategories] = useState<Categorie[]>([])
  const [promotions, setPromotions] = useState<any[]>([])
  const [balanceProduit, setBalanceProduit] = useState<Produit | null>(null)
  const [peremptionAlerte, setPeremptionAlerte] = useState<Produit | null>(null)
  const [variantProduit, setVariantProduit] = useState<Produit | null>(null)
  const [attributionsParProduit, setAttributionsParProduit] = useState<Record<number, AttributionProduit[]>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [selectedCategorie, setSelectedCategorie] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [panierBarcode, setPanierBarcode] = useState('')
  const [monnaie, setMonnaie] = useState('FCFA')
  const [loading, setLoading] = useState(true)
  const [showPayModal, setShowPayModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [montantSaisi, setMontantSaisi] = useState('')
  const [lastTicket, setLastTicket] = useState('')
  const [lastTotal, setLastTotal] = useState(0)
  const [lastRemise, setLastRemise] = useState(0)
  const [lastMontantPaye, setLastMontantPaye] = useState(0)
  const [lastMonnaieRendue, setLastMonnaieRendue] = useState(0)
  const [lastModePaiement, setLastModePaiement] = useState('')
  const [lastPaiements, setLastPaiements] = useState<{ mode: string; montant: number }[] | undefined>(undefined)
  const [lastFullReceipt, setLastFullReceipt] = useState<any>(null)
  const [lastReceiptText, setLastReceiptText] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [qtyInput, setQtyInput] = useState('')
  const [showQtyModal, setShowQtyModal] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [remiseInput, setRemiseInput] = useState('')
  const [showRemiseModal, setShowRemiseModal] = useState(false)
  const [showClientModal, setShowClientModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [prixClientsMap, setPrixClientsMap] = useState<Record<number, number>>({})
  const [fideliteRegle, setFideliteRegle] = useState<any>(null)
  // Paiement mixte : contributions cagnotte + porte-monnaie
  const [cagnotteUsed, setCagnotteUsed] = useState(0)       // FCFA depuis points
  const [cagnottePointsUsed, setCagnottePointsUsed] = useState(0) // pts correspondants
  const [portefeuilleUsed, setPortefeuilleUsed] = useState(0) // FCFA depuis wallet
  // Mode bonus actif dans le modal paiement (cagnotte | portefeuille | null)
  const [bonusPayMode, setBonusPayMode] = useState<'cagnotte' | 'portefeuille' | null>(null)
  const [bonusSaisi, setBonusSaisi] = useState('')  // montant saisi pour cagnotte/wallet
  // Paiement fractionné : montant par mode (key = id du mode), et mode en cours de saisie
  const [paySplit, setPaySplit] = useState<Record<string, number>>({})
  const [payActiveMode, setPayActiveMode] = useState<ModePaiement | null>(null)
  const [paySplitInput, setPaySplitInput] = useState('')
  // Proposition d'ajouter la monnaie au porte-monnaie (AVANT l'impression)
  const [showMonnaieWallet, setShowMonnaieWallet] = useState(false)
  const [monnaieACrediter, setMonnaieACrediter] = useState(0)
  const [pendingReceiptData, setPendingReceiptData] = useState<any>(null)
  // Écran client
  const [customerWinOpen, setCustomerWinOpen] = useState(false)
  // Grille produits (nb colonnes)
  const [gridCols, setGridCols] = useState<3|4|5>(() => {
    const saved = localStorage.getItem('pos_grid_cols')
    return (saved === '3' || saved === '4' || saved === '5') ? Number(saved) as 3|4|5 : 4
  })
  // Modal retour article
  const [showRetourModal, setShowRetourModal] = useState(false)
  const [printError, setPrintError] = useState('')
  const [showSuperviseurModal, setShowSuperviseurModal] = useState(false)
  // Popup code rotatif gestionnaire
  const [showCodeRotatif, setShowCodeRotatif] = useState(false)
  const [codeRotatifInfo, setCodeRotatifInfo] = useState<{ expire_a: string; genere_le: string; genere_par_nom: string; reste_secondes: number; actif: boolean } | null>(null)
  const [codeRotatifVal, setCodeRotatifVal] = useState<string | null>(null)
  const [codeRotatifCountdown, setCodeRotatifCountdown] = useState(0)
  const [codeRotatifLoading, setCodeRotatifLoading] = useState(false)
  const [showTiroirConfirm, setShowTiroirConfirm] = useState(false)
  const [tiroirToast, setTiroirToast] = useState('')
  // Mouvements de caisse (versements / retraits)
  const [showMouvementModal, setShowMouvementModal] = useState(false)
  const [mouvementType, setMouvementType] = useState<'versement' | 'retrait'>('versement')
  const [mouvementMontant, setMouvementMontant] = useState('')
  const [mouvementMotif, setMouvementMotif] = useState('')
  const [mouvementsJour, setMouvementsJour] = useState<MouvementCaisse[]>([])
  const [showLibreModal, setShowLibreModal] = useState(false)
  const [libreNom, setLibreNom] = useState('')
  const [librePrix, setLibrePrix] = useState('')
  const [libreQte, setLibreQte] = useState('1')
  const [libreErreur, setLibreErreur] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const barcodeBuffer = useRef('')
  const barcodeTimer = useRef<any>(null)

  // ─── Retour douchette ────────────────────────────────────────────────────────
  const [scannerMsg, setScannerMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const scannerMsgTimer = useRef<any>(null)
  const showScannerMsg = (ok: boolean, text: string) => {
    setScannerMsg({ ok, text })
    clearTimeout(scannerMsgTimer.current)
    scannerMsgTimer.current = setTimeout(() => setScannerMsg(null), 1800)
  }

  // ─── Panier en attente ───────────────────────────────────────────────────────
  const [heldCarts, setHeldCarts] = useState<{ id: number; heldAt: string; items: CartItem[]; remise: number }[]>([])
  const [showHeldModal, setShowHeldModal] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('kbpos_held_carts')
      if (raw) setHeldCarts(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem('kbpos_held_carts', JSON.stringify(heldCarts)) } catch {}
  }, [heldCarts])

  const holdCart = () => {
    if (cart.items.length === 0 || cart.nbArticles() === 0) {
      showScannerMsg(false, 'Panier vide — rien à mettre en attente')
      return
    }
    const snapshot = {
      id: Date.now(),
      heldAt: new Date().toLocaleString('fr-FR'),
      items: cart.items.map(i => ({ ...i })),
      remise: cart.remise
    }
    setHeldCarts(h => [...h, snapshot])
    cart.clearCart()
    showScannerMsg(true, `Panier mis en attente (${snapshot.items.length} article(s))`)
  }

  const resumeHeld = (held: { id: number; items: CartItem[]; remise: number }) => {
    if (cart.items.length > 0 && !window.confirm('Le panier actuel n\'est pas vide. Le remplacer par la vente en attente ?')) return
    cart.clearCart()
    for (const i of held.items) {
      doAddToCart(i.produit, i.quantite, i.details, i.variante_id, i.stockMax)
      if (i.prix_unitaire !== i.produit.prix_vente) cart.updatePrix(cartKey(i.produit.id, i.variante_id, i.details), i.prix_unitaire)
    }
    cart.setRemise(held.remise)
    setHeldCarts(h => h.filter(x => x.id !== held.id))
    setShowHeldModal(false)
    showScannerMsg(true, 'Vente en attente reprise')
  }

  // Countdown code rotatif
  useEffect(() => {
    if (codeRotatifCountdown <= 0) return
    const t = setInterval(() => setCodeRotatifCountdown(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [codeRotatifCountdown])

  const handleOuvrirCodeRotatif = async () => {
    setShowCodeRotatif(true)
    setCodeRotatifVal(null)
    const info = await rotationGetInfo()
    setCodeRotatifInfo(info)
    if (info?.actif && info.reste_secondes > 0) {
      setCodeRotatifCountdown(info.reste_secondes)
    }
  }

  const handleGenererCode = async () => {
    if (!user) return
    setCodeRotatifLoading(true)
    try {
      const code = await rotationGenerer(user.id)
      setCodeRotatifVal(code)
      setCodeRotatifCountdown(30 * 60)
      const info = await rotationGetInfo()
      setCodeRotatifInfo(info)
    } catch {}
    setCodeRotatifLoading(false)
  }

  useEffect(() => {
    const load = async () => {
      try {
        const [cats, params, clientsList, promos, regle] = await Promise.all([
          getCategories(), getParametres(), getClients(), getPromotions(),
          commercialGetFideliteRegle()
        ])
        setCategories(cats)
        setClients(clientsList)
        setPromotions(promos)
        setFideliteRegle(regle)
        if (params?.monnaie) setMonnaie(params.monnaie)

        // Vérifier/charger la session ouverte
        if (user) {
          const sess = await getSessionOuverte(user.id)
          if (sess) setSession(sess)
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const prods = await getProduits(selectedCategorie ?? undefined, search || undefined)
        setProduits(prods)
      } catch {}
    }
    load()
  }, [selectedCategorie, search])

  useEffect(() => {
    getAttributionsTousProduits().then(rows => {
      const map: Record<number, AttributionProduit[]> = {}
      for (const r of rows) {
        ;(map[r.produit_id] = map[r.produit_id] || []).push({
          attribut_id: r.attribut_id, attribut_nom: r.attribut_nom, valeur_id: r.valeur_id, valeur_label: r.valeur_label
        })
      }
      setAttributionsParProduit(map)
    }).catch(() => {})
  }, [])

  // Barcode scanner support (keyboard wedge)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (e.key === 'Enter' && barcodeBuffer.current.length > 2) {
        const code = barcodeBuffer.current
        barcodeBuffer.current = ''
        handleBarcode(code)
        return
      }
      if (e.key.length === 1) {
        barcodeBuffer.current += e.key
        clearTimeout(barcodeTimer.current)
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = '' }, 200)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Push panier → écran client 2e fenêtre
  useEffect(() => {
    if (!customerWinOpen) return
    const vp = fideliteRegle?.valeur_point_fcfa ?? 1
    const payload = {
      statut: (cart.items.length > 0 ? 'shopping' : 'idle') as 'shopping' | 'idle',
      items: cart.items.map(i => ({
        nom: i.produit.nom,
        quantite: i.quantite,
        prix_unitaire: i.prix_unitaire,
        total_ligne: i.quantite * i.prix_unitaire,
        unite: i.produit.unite
      })),
      total: cart.total(),
      remise: cart.remise ?? 0,
      monnaie,
      nom_entreprise: 'KB POS',
      client: selectedClient?.nom,
      points_gagnes_estimes: fideliteRegle ? Math.floor(cart.total() * (fideliteRegle.points_par_fcfa ?? 0)) : 0,
      valeur_point_fcfa: vp
    }
    customerPush(payload).catch(() => {})
  }, [cart.items, selectedClient, customerWinOpen])

  const confirmVenteLibre = () => {
    setLibreErreur('')
    const nom = libreNom.trim()
    const prix = parseFloat(librePrix.replace(',', '.'))
    const qte = parseFloat(libreQte.replace(',', '.')) || 1
    if (!nom) { setLibreErreur('Saisissez la désignation de l\'article'); return }
    if (!prix || prix <= 0) { setLibreErreur('Saisissez un prix valide'); return }
    if (qte <= 0) { setLibreErreur('Quantité invalide'); return }
    cart.addVenteLibre(nom, prix, qte)
    setShowLibreModal(false)
    setLibreNom(''); setLibrePrix(''); setLibreQte('1')
    showScannerMsg(true, `${nom} ajouté au panier`)
  }

  const handleBarcode = async (code: string) => {
    const { getProduitByBarcode: getByBarcode } = await import('@/lib/ipc')
    const prod = await getByBarcode(code)
    if (prod) {
      scannerBeep('ok')
      showScannerMsg(true, `${prod.nom} ajouté`)
      handleAddToCart(prod as Produit)
    } else {
      scannerBeep('err')
      showScannerMsg(false, `Code inconnu : ${code}`)
      setSearch(code)
    }
  }

  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search) {
      let prod: Produit | null = null
      const { getProduitByBarcode: getByBarcode } = await import('@/lib/ipc')
      const byBar = await getByBarcode(search)
      if (byBar) {
        prod = byBar
      } else {
        const prods = await getProduits(undefined, search)
        prod = prods[0] ?? null
      }
      if (prod) {
        scannerBeep('ok')
        handleAddToCart(prod)
        setSearch('')
      } else if (/^[0-9]{4,}$/.test(search.trim())) {
        scannerBeep('err')
        showScannerMsg(false, `Code inconnu : ${search}`)
      }
    }
  }

  const handlePanierBarcode = async () => {
    const code = panierBarcode.trim()
    if (!code) return
    const { getProduitByBarcode: getByBarcode } = await import('@/lib/ipc')
    const prod = await getByBarcode(code)
    if (prod) {
      scannerBeep('ok')
      showScannerMsg(true, `${prod.nom} ajouté`)
      handleAddToCart(prod as Produit)
      setPanierBarcode('')
    } else {
      scannerBeep('err')
      showScannerMsg(false, `Code inconnu : ${code}`)
      setPanierBarcode('')
    }
  }

  const fmt = (amount: number) => formatCurrency(amount, monnaie)

  const montantPayeNum = parseFloat(montantSaisi.replace(',', '.')) || 0
  const totalCart = cart.total()
  const monnaieRendue = Math.max(0, montantPayeNum - totalCart)
  const modePaiement = cart.modePaiement
  const paiementsVisibles = modesPaiementActifs?.length
    ? MODE_PAIEMENT_CONFIG.filter(m => modesPaiementActifs.includes(m.id))
    : MODE_PAIEMENT_CONFIG

  const paySplitTotal = Object.values(paySplit).reduce((s, v) => s + (v || 0), 0)

  const doAddToCart = (prod: Produit, quantite = 1, details?: string, varianteId?: number, stockMax?: number) => {
    // Tarif spécifique client (grossiste/détaillant) : priorité maximale
    const prixClient = prixClientsMap[prod.id]
    if (prixClient && prixClient > 0) {
      cart.addItem(prod, quantite, details, varianteId, stockMax)
      cart.updatePrix(cartKey(prod.id, varianteId, details), prixClient)
      setSelectedItemId(prod.id)
      return
    }
    cart.addItem(prod, quantite, details, varianteId, stockMax)
    const promo = getActivePromoForProduit(promotions, prod, 1)
    if (promo) {
      const prixPromo = calcPrixPromo(prod.prix_vente, promo)
      if (prixPromo !== prod.prix_vente) cart.updatePrix(cartKey(prod.id, varianteId, details), prixPromo)
    } else if (selectedClient?.remise_pct && selectedClient.remise_pct > 0) {
      const prixRemise = prod.prix_vente * (1 - selectedClient.remise_pct / 100)
      if (prixRemise < prod.prix_vente) cart.updatePrix(cartKey(prod.id, varianteId, details), Math.round(prixRemise))
    }
    setSelectedItemId(prod.id)
  }

  const handleAddToCart = (prod: Produit) => {
    // Alerte pérremption : expiré = avertissement avant ajout
    const pStatus = getPeremptionStatus(prod.date_peremption)
    if (pStatus === 'expiré') {
      setPeremptionAlerte(prod)
      return
    }
    // Variantes (typologie du commerce) : demander taille/couleur avant l'ajout
    if ((attributionsParProduit[prod.id]?.length ?? 0) > 0) {
      setVariantProduit(prod)
      return
    }
    // Balance : si l'article se vend au poids ? modal saisie poids
    if (isUnitesPoids(prod.unite)) {
      setBalanceProduit(prod)
      return
    }
    doAddToCart(prod)
  }

  const openQtyModal = (itemKey: string) => {
    const item = cart.items.find(i => i.key === itemKey)
    if (item) {
      setEditingItemId(itemKey)
      setQtyInput(String(item.quantite))
      setShowQtyModal(true)
    }
  }

  const confirmQty = () => {
    if (editingItemId && qtyInput) {
      const qty = parseFloat(qtyInput.replace(',', '.'))
      if (qty > 0) cart.updateQuantite(editingItemId, qty)
    }
    setShowQtyModal(false)
    setEditingItemId(null)
    setQtyInput('')
  }

  const confirmRemise = () => {
    const r = parseFloat(remiseInput.replace(',', '.')) || 0
    cart.setRemise(r)
    setShowRemiseModal(false)
    setRemiseInput('')
  }

  // Ouvrir le tiroir (vente ou manuel)
  const handleOuvrirTiroir = async (type: 'vente' | 'ouverture_simple', venteId?: number) => {
    try {
      await ouvrirTiroir({
        type,
        vente_id: venteId,
        user_id: user!.id,
        session_id: session?.id,
        motif: type === 'ouverture_simple' ? 'Ouverture manuelle' : undefined
      })
      setTiroirToast('Tiroir ouvert')
      setTimeout(() => setTiroirToast(''), 2500)
    } catch {
      setTiroirToast('Tiroir ouvert (simulation)')
      setTimeout(() => setTiroirToast(''), 2500)
    }
  }

  // ─── Mouvements de caisse (versements / retraits) ───────────────────────────
  const chargerMouvementsJour = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const mvts = await getMouvementsCaisse(today, today)
      setMouvementsJour(mvts)
    } catch {}
  }

  const openMouvementModal = async () => {
    setMouvementType('versement')
    setMouvementMontant('')
    setMouvementMotif('')
    setShowMouvementModal(true)
    await chargerMouvementsJour()
  }

  const confirmMouvement = async () => {
    const montant = parseFloat(mouvementMontant.replace(',', '.')) || 0
    if (montant <= 0) { showScannerMsg(false, 'Saisissez un montant valide'); return }
    try {
      await createMouvementCaisse({
        session_id: session?.id,
        type: mouvementType,
        montant,
        motif: mouvementMotif.trim() || undefined,
        user_id: user!.id
      })
      showScannerMsg(true, mouvementType === 'versement' ? `Versement de ${fmt(montant)} enregistré` : `Retrait de ${fmt(montant)} enregistré`)
      setShowMouvementModal(false)
      await chargerMouvementsJour()
    } catch {
      showScannerMsg(false, 'Erreur lors de l\'enregistrement du mouvement')
    }
  }

  const finaliserPaiement = async (receiptData: any, creditWallet: number = 0) => {
    // Créditer la monnaie sur porte-monnaie si demandé
    if (creditWallet > 0 && selectedClient && receiptData._venteId) {
      try {
        await commercialCrediterPortefeuille({
          client_id: selectedClient.id,
          montant: creditWallet,
          note: `Monnaie créditée — Ticket ${receiptData.ticket}`,
          user_id: user?.id
        })
      } catch {}
    }
    // Imprimer le ticket avec la monnaie_creditee_wallet à jour
    const finalData = { ...receiptData, monnaie_creditee_wallet: creditWallet,
      solde_portefeuille: Math.max(0, Number(selectedClient?.solde_portefeuille ?? 0) - (receiptData.portefeuille_utilise ?? 0) + creditWallet)
    }
    try { const pr = await printReceipt(finalData); setPrintError(pr && pr.success ? '' : `Impression: ${pr?.error || 'échec'}`) } catch (e: any) { setPrintError(`Impression: ${e?.message || 'échec'}`) }
    try { const text = await getReceiptText(finalData); setLastReceiptText(text) } catch {}
    setLastTicket(finalData.ticket)
    setLastTotal(finalData.total)
    setLastRemise(finalData.remise ?? 0)
    setLastMontantPaye(finalData.especes_comptees ?? finalData.montant_paye)
    setLastMonnaieRendue(finalData.monnaie_rendue ?? 0)
    setLastModePaiement(finalData.mode_paiement)
    setLastPaiements(finalData.paiements)
    setLastFullReceipt(finalData)
    cart.clearCart()
    setShowPayModal(false)
    setShowMonnaieWallet(false)
    setPendingReceiptData(null)
    setShowSuccessModal(true)

    // Push "done" à l'écran client
    if (customerWinOpen) {
      customerPush({
        statut: 'done',
        items: [],
        total: finalData.total,
        remise: finalData.remise ?? 0,
        monnaie,
        nom_entreprise: 'KB POS',
        client: finalData.client,
        mode_paiement: finalData.mode_paiement,
        monnaie_rendue: finalData.monnaie_rendue,
        points_gagnes_estimes: finalData.points_gagnes ?? 0,
        solde_points: finalData.solde_points,
        valeur_point_fcfa: finalData.valeur_point_fcfa ?? 1,
        monnaie_creditee_wallet: creditWallet > 0 ? creditWallet : undefined
      }).catch(() => {})
      // Retour à idle après 8s
      setTimeout(() => {
        customerPush({ statut: 'idle', items: [], total: 0, remise: 0, monnaie, nom_entreprise: 'KB POS' })
          .catch(() => {})
      }, 8000)
    }

    // Envoi SMS si client avec téléphone
    if (finalData.client_telephone && finalData._smsConfig) {
      try {
        await smsSend({
          to: finalData.client_telephone,
          message: finalData._smsMessage ?? '',
          ...finalData._smsConfig
        })
      } catch {}
    }
  }

  const handlePay = async () => {
    if (cart.items.length === 0) return
    const isArdoise = modePaiement === 'ardoise'
    const totalReductions = cagnotteUsed + portefeuilleUsed
    const totalNet = Math.max(0, totalCart - totalReductions)

    // Modes répartis (montants saisis > 0)
    const paiements = Object.entries(paySplit)
      .filter(([, m]) => (m || 0) > 0)
      .map(([mode, montant]) => ({ mode, montant }))

    if (isArdoise && !selectedClient) return

    // Modèle retail : les espèces = total donné (peut dépasser le net),
    // la monnaie ne s'applique qu'aux espèces.
    const nonCashList = paiements.filter(p => p.mode !== 'especes')
    const nonCashSum = nonCashList.reduce((s, p) => s + (p.montant || 0), 0)
    const cashPay = paiements.find(p => p.mode === 'especes')
    const cashTendered = cashPay?.montant ?? 0
    const cashKept = isArdoise ? 0 : Math.max(0, Math.min(cashTendered, totalNet - nonCashSum))
    const monnaieRendueFinal = isArdoise ? 0 : Math.max(0, cashTendered - (totalNet - nonCashSum))
    const paiementsEnreg = isArdoise
      ? undefined
      : [...nonCashList.map(p => ({ ...p })), ...(cashKept > 0 ? [{ mode: 'especes', montant: cashKept }] : [])]

    if (!isArdoise && totalNet > 0 && !(nonCashSum <= totalNet && nonCashSum + cashTendered >= totalNet)) return

    try {
      const lignes = cart.items.map(i => ({
        produit_id: i.produit.id,
        quantite: i.quantite,
        prix_unitaire: i.prix_unitaire,
        total_ligne: i.total_ligne,
        details: i.details,
        variante_id: i.variante_id,
        nom_libre: i.nom_libre
      }))

      const montant = isArdoise ? (totalNet > 0 ? totalNet : 0) : (paiementsEnreg ?? []).reduce((s, p) => s + p.montant, 0)
      const remiseTotale = cart.remise + totalReductions
      // Mode principal : ardoise si tel, sinon le mode au plus gros montant
      const modePrincipal = isArdoise
        ? 'ardoise'
        : paiements.length > 0
          ? [...paiements].sort((a, b) => b.montant - a.montant)[0].mode
          : 'especes'

      const activeBoutiqueId = Number(localStorage.getItem('pos_boutique_id') ?? '1')
      const { venteId, ticket } = await createVente({
        total: totalNet,
        remise: remiseTotale,
        montant_paye: montant,
        monnaie_rendue: monnaieRendueFinal,
        mode_paiement: modePrincipal,
        paiements: paiementsEnreg,
        caissier_id: user!.id,
        client_id: selectedClient?.id ?? null,
        cagnotte_utilisee: cagnotteUsed,
        portefeuille_utilise: portefeuilleUsed,
        boutique_id: activeBoutiqueId,
        lignes
      })

      const peutOuvrirTiroir = !isArdoise && paiements.some(p => p.mode === 'especes')
      if (peutOuvrirTiroir) handleOuvrirTiroir('vente', venteId)

      if (isArdoise && selectedClient) {
        await commercialVendreACredit({
          client_id: selectedClient.id, vente_id: venteId,
          montant: totalNet, note: `Vente ${ticket}`, user_id: user!.id
        })
      }
      if (cagnottePointsUsed > 0 && selectedClient) {
        await commercialUtiliserPoints(selectedClient.id, cagnottePointsUsed, venteId)
      }
      if (portefeuilleUsed > 0 && selectedClient) {
        await commercialDebiterPortefeuille({
          client_id: selectedClient.id, vente_id: venteId,
          montant: portefeuilleUsed, note: `Vente ${ticket}`, user_id: user!.id
        })
      }

      let pointsGagnes = 0
      let newSoldePoints = Number(selectedClient?.points_fidelite ?? 0) - cagnottePointsUsed
      if (selectedClient) {
        const gain = await commercialAjouterPoints(selectedClient.id, totalNet, venteId, user!.id)
        pointsGagnes = gain?.pointsGagnes ?? 0
        newSoldePoints = newSoldePoints + pointsGagnes
      }

      const receiptData = {
        _venteId: venteId,
        ticket,
        date: new Date().toLocaleString('fr-FR'),
        caissier: user!.nom,
        client: selectedClient?.nom,
        client_telephone: selectedClient?.telephone,
        lignes: cart.items.map(i => ({
          nom: i.produit.nom, quantite: i.quantite,
          prix_unitaire: i.prix_unitaire, total_ligne: i.total_ligne, unite: i.produit.unite,
          details: i.details, nom_libre: i.nom_libre
        })),
        total: totalNet,
        remise: remiseTotale,
        montant_paye: montant,
        monnaie_rendue: monnaieRendueFinal,
        mode_paiement: modePrincipal,
        paiements: paiementsEnreg,
        especes_comptees: !isArdoise && cashKept > 0 && cashTendered > cashKept ? cashTendered : undefined,
        cagnotte_utilisee: cagnotteUsed,
        portefeuille_utilise: portefeuilleUsed,
        points_utilises: cagnottePointsUsed,
        points_gagnes: pointsGagnes,
        solde_points: newSoldePoints,
        valeur_point_fcfa: Number(fideliteRegle?.valeur_point_fcfa ?? 1),
        codeRetour: ticket,
      }

      // Si monnaie à rendre ET client enregistré → demander AVANT d'imprimer
      if (monnaieRendueFinal > 0 && selectedClient) {
        setPendingReceiptData(receiptData)
        setMonnaieACrediter(monnaieRendueFinal)
        setShowPayModal(false)
        setShowMonnaieWallet(true)
      } else {
        await finaliserPaiement(receiptData, 0)
      }
    } catch (err: any) {
      console.error(err)
    }
  }

  const resetClientState = () => {
    setSelectedClient(null)
    setPrixClientsMap({})
    setCagnotteUsed(0)
    setCagnottePointsUsed(0)
    setPortefeuilleUsed(0)
    setBonusPayMode(null)
    setBonusSaisi('')
    setMontantSaisi('')
  }

  const handleSelectClient = async (client: Client | null) => {
    setSelectedClient(client)
    setCagnotteUsed(0)
    setCagnottePointsUsed(0)
    setPortefeuilleUsed(0)
    if (!client) {
      setPrixClientsMap({})
      return
    }
    try {
      const rows = await getPrixClients(client.id)
      const map: Record<number, number> = {}
      for (const r of rows) map[r.produit_id] = r.prix
      setPrixClientsMap(map)
      // Recalcule les lignes déjà en panier avec le tarif client
      const items = cart.items.slice()
      for (const it of items) {
        if (it.nom_libre) continue
        const prixClient = map[it.produit.id]
        if (prixClient && prixClient > 0) {
          cart.updatePrix(it.key, prixClient)
        }
      }
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Barre CA temps réel */}
      <CaBarComponent />

      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT: Products ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search + Category filter */}
          <div className="bg-white border-b border-gray-200 p-3 space-y-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Rechercher un produit ou scanner un code-barre..."
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* Bouton article libre */}
              <button
                onClick={() => setShowLibreModal(true)}
                title="Vendre un article libre (sans code-barres)"
                className="h-12 px-4 bg-gray-100 hover:bg-emerald-100 hover:text-emerald-700 text-gray-600 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all flex-shrink-0 border border-gray-200"
              >
                <Package size={18} />
                <span className="hidden sm:inline">Article libre</span>
              </button>

              {/* Bouton retour article */}
              <button
                onClick={() => setShowRetourModal(true)}
                title="Retour / Remboursement article"
                className="h-12 px-4 bg-gray-100 hover:bg-red-100 hover:text-red-700 text-gray-600 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all flex-shrink-0 border border-gray-200"
              >
                <RotateCcw size={18} />
                <span className="hidden sm:inline">Retour</span>
              </button>

              {/* Bouton code rotatif superviseur — gestionnaire & admin */}
              {(user?.role === 'gestionnaire' || user?.role === 'admin') && (
                <button
                  onClick={handleOuvrirCodeRotatif}
                  title="Code superviseur rotatif (pour autoriser les retours)"
                  className="h-12 px-4 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all flex-shrink-0 border border-orange-200"
                >
                  <ShieldAlert size={18} />
                  <span className="hidden sm:inline">Code</span>
                </button>
              )}

              {/* Bouton écran client */}
              <button
                onClick={async () => {
                  if (customerWinOpen) {
                    await customerClose()
                    setCustomerWinOpen(false)
                  } else {
                    await customerOpen()
                    setCustomerWinOpen(true)
                  }
                }}
                title={customerWinOpen ? 'Fermer écran client' : 'Ouvrir écran client (2e écran)'}
                className={`h-12 px-4 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all flex-shrink-0 border ${customerWinOpen ? 'bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-emerald-50'}`}
              >
                <span className="text-lg">🖥️</span>
                <span className="hidden sm:inline">{customerWinOpen ? 'Écran ON' : 'Écran client'}</span>
              </button>

              {/* Toggle grille produits */}
              <div className="flex rounded-xl border border-gray-200 overflow-hidden flex-shrink-0">
                {([3,4,5] as const).map(n => (
                  <button key={n} onClick={() => { setGridCols(n); localStorage.setItem('pos_grid_cols', String(n)) }}
                    className={`h-12 w-10 text-sm font-bold transition-all ${gridCols === n ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {n}
                  </button>
                ))}
              </div>

              {/* Bouton mettre en pause */}
              <button
                onClick={holdCart}
                title="Mettre la vente en cours en attente"
                className="h-12 px-4 bg-gray-100 hover:bg-amber-100 hover:text-amber-700 text-gray-600 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all flex-shrink-0 border border-gray-200"
              >
                <Clock size={18} />
                <span className="hidden sm:inline">Pause</span>
              </button>

              {/* Bouton ventes en attente */}
              <button
                onClick={() => setShowHeldModal(true)}
                title="Ventes en attente"
                className="h-12 px-4 bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-600 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all flex-shrink-0 border border-gray-200 relative"
              >
                <RotateCcw size={18} />
                <span className="hidden sm:inline">En attente</span>
                {heldCarts.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {heldCarts.length}
                  </span>
                )}
              </button>

              {/* Bouton versements / retraits */}
              <button
                onClick={openMouvementModal}
                title="Versements / retraits d'espèces en cours de journée"
                className="h-12 px-4 bg-gray-100 hover:bg-emerald-100 hover:text-emerald-700 text-gray-600 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all flex-shrink-0 border border-gray-200"
              >
                <Wallet size={18} />
                <span className="hidden sm:inline">Fonds</span>
              </button>

              {/* Bouton ouverture tiroir */}
              <button
                onClick={() => setShowTiroirConfirm(true)}
                title="Ouverture tiroir"
                className="h-12 px-4 bg-gray-100 hover:bg-amber-100 hover:text-amber-700 text-gray-600 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all flex-shrink-0 border border-gray-200"
              >
                <UnlockKeyhole size={18} />
                <span className="hidden sm:inline">Tiroir</span>
              </button>
            </div>

            {/* Category tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategorie(null)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                  selectedCategorie === null
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Tous
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategorie(selectedCategorie === cat.id ? null : cat.id)}
                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                    selectedCategorie === cat.id
                      ? 'text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={selectedCategorie === cat.id ? { backgroundColor: cat.couleur } : {}}
                >
                  <span>{cat.icone}</span>
                  {cat.nom}
                </button>
              ))}
            </div>
          </div>

          {/* Session info */}
          {session && (
            <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-1.5 flex items-center gap-4 text-xs text-emerald-700 flex-shrink-0">
              <div className="flex items-center gap-1">
                <Clock size={12} />
                <span>Session ouverte depuis {session.heure_ouverture}</span>
              </div>
              <span>|</span>
              <span>Fond initial: {formatCurrency(session.fond_caisse)}</span>
            </div>
          )}

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {produits.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <Package size={48} className="mb-3 opacity-30" />
                <p>Aucun produit trouvé</p>
              </div>
            ) : (
              <div className={`grid gap-3 ${gridCols === 3 ? 'grid-cols-2 sm:grid-cols-3' : gridCols === 4 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
                {produits.map(prod => {
                  const cartItem = cart.items.find(i => i.produit.id === prod.id)
                  const inCart = cartItem !== undefined
                  const lowStock = prod.stock_actuel <= prod.stock_minimum
                  const activePromo = getActivePromoForProduit(promotions, prod, 1)
                  const prixPromo = activePromo ? calcPrixPromo(prod.prix_vente, activePromo) : null
                  const hasPromo = prixPromo !== null && prixPromo !== prod.prix_vente
                  const pStatus = getPeremptionStatus(prod.date_peremption)
                  const isExpired = pStatus === 'expiré'
                  return (
                    <button
                      key={prod.id}
                      onClick={() => handleAddToCart(prod)}
                      className={`relative bg-white rounded-2xl p-3 text-left shadow-card hover:shadow-card-hover transition-all duration-150 active:scale-95 border-2 ${
                        isExpired ? 'border-red-300 opacity-80' :
                        inCart ? 'border-blue-500' : hasPromo ? 'border-orange-300' : 'border-transparent'
                      } ${lowStock ? 'opacity-75' : ''}`}
                    >
                      {/* Visuel produit */}
                      <div className="relative w-full h-20 rounded-xl overflow-hidden mb-2">
                        <ProductVisual
                          imageUrl={prod.image_url}
                          categoryEmoji={prod.categorie_icone}
                          categoryColor={prod.categorie_couleur}
                          className="w-full h-full"
                          emojiSize="text-4xl"
                        />
                        {/* Bande couleur catégorie */}
                        <div className="absolute bottom-0 left-0 right-0 h-1"
                          style={{ backgroundColor: prod.categorie_couleur || '#3b82f6' }} />
                        {/* Badge promo */}
                        {hasPromo && !isExpired && (
                          <div className="absolute top-1 right-1 bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-lg">
                            PROMO
                          </div>
                        )}
                        {/* Badge péremption */}
                        {pStatus && pStatus !== 'ok' && (
                          <div className={`absolute top-1 ${hasPromo ? 'left-1' : 'right-1'} text-xs font-bold px-1.5 py-0.5 rounded-lg ${
                            isExpired ? 'bg-red-500 text-white' : pStatus === 'urgent' ? 'bg-red-400 text-white' : 'bg-orange-400 text-white'
                          }`}>
                            {isExpired ? 'EXP' : pStatus === 'urgent' ? 'TODAY' : 'DLC'}
                          </div>
                        )}
                        {/* Badge balance poids */}
                        {isUnitesPoids(prod.unite) && !isExpired && !hasPromo && pStatus === null && (
                          <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-lg font-bold">⚖</div>
                        )}
                      </div>
                      <div className="font-semibold text-gray-800 text-sm leading-tight mb-1 line-clamp-2">
                        {prod.nom}
                      </div>
                      {hasPromo ? (
                        <div>
                          <div className="text-orange-600 font-bold text-base">{fmt(prixPromo!)}</div>
                          <div className="text-gray-400 text-xs line-through">{fmt(prod.prix_vente)}</div>
                        </div>
                      ) : (
                        <div className="text-blue-600 font-bold text-base">{fmt(prod.prix_vente)}</div>
                      )}
                      <div className="text-gray-400 text-xs mt-0.5">/{prod.unite}</div>
                      {lowStock && (
                        <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
                      )}
                      {inCart && (
                        <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-lg">
                          ×{cartItem.quantite}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGHT: Cart ─────────────────────────────────────── */}
        <div className="w-80 xl:w-96 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
          {/* Cart header */}
          <div className="bg-gray-800 text-white p-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart size={20} />
              <span className="font-bold">Panier</span>
              {cart.items.length > 0 && (
                <span className="bg-blue-600 text-xs px-2 py-0.5 rounded-full">{cart.nbArticles()}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowClientModal(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  selectedClient
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <User size={15} />
                <div className="flex flex-col items-start leading-tight">
                  <span className="max-w-24 truncate">{selectedClient?.nom || 'Client'}</span>
                  {selectedClient && (
                    <span className="text-xs text-amber-300 font-semibold flex items-center gap-1">
                      {Number(selectedClient.points_fidelite) > 0 && `★ ${Number(selectedClient.points_fidelite)} pts`}
                      {Number(selectedClient.solde_portefeuille) > 0 && (
                        <span className="text-emerald-300">💳 {fmt(Number(selectedClient.solde_portefeuille))}</span>
                      )}
                    </span>
                  )}
                </div>
              </button>
              {cart.items.length > 0 && (
                <button
                  onClick={() => setShowSuperviseurModal(true)}
                  className="p-1.5 bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white rounded-lg transition-all"
                  title="Annuler la vente (superviseur requis)"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Saisie rapide code-barres dans le panier */}
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="relative">
              <input
                value={panierBarcode}
                autoFocus
                onChange={e => setPanierBarcode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePanierBarcode()}
                placeholder="Scanner / saisir le code de l'article..."
                className="w-full pl-8 pr-4 py-2.5 bg-gray-50 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"
              />
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto">
            {cart.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-300">
                <ShoppingCart size={48} className="mb-3 opacity-30" />
                <p className="text-sm">Panier vide</p>
                <p className="text-xs text-gray-400 mt-1">Cliquez sur un produit pour l'ajouter</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {cart.items.map(item => (
                  <div
                    key={item.key}
                    className={`p-3 transition-colors ${selectedItemId === item.produit.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    onClick={() => setSelectedItemId(item.produit.id)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 text-sm truncate">{item.produit.nom}</div>
                        {item.details && <div className="text-xs text-blue-600 font-semibold">{item.details}</div>}
                        <div className="text-gray-500 text-xs">{fmt(item.prix_unitaire)}/{item.produit.unite}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-gray-800 text-sm">{fmt(item.total_ligne)}</div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); cart.removeItem(item.key) }}
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={e => { e.stopPropagation(); cart.updateQuantite(item.key, Math.max(0, item.quantite - 1)) }}
                        className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); openQtyModal(item.key) }}
                        className="flex-1 h-8 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 rounded-lg text-sm font-bold text-center transition-colors"
                      >
                        {item.quantite} {item.produit.unite}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); cart.updateQuantite(item.key, item.quantite + 1) }}
                        className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg flex items-center justify-center transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart totals & payment */}
          <div className="border-t border-gray-200 p-4 space-y-3 flex-shrink-0">
            {cart.remise > 0 && (
              <div className="flex justify-between text-gray-500 text-sm">
                <span>Sous-total</span>
                <span>{fmt(cart.sousTotal())}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => { setRemiseInput(String(cart.remise || '')); setShowRemiseModal(true) }}
                className="text-sm text-blue-600 hover:underline"
              >
                {cart.remise > 0 ? `Remise: -${fmt(cart.remise)}` : '+ Ajouter remise'}
              </button>
              {cart.remise > 0 && (
                <button onClick={() => cart.setRemise(0)} className="text-red-400 hover:text-red-600">
                  <X size={16} />
                </button>
              )}
            </div>

            {cagnotteUsed > 0 && (
              <div className="flex justify-between items-center bg-amber-50 border border-amber-200 p-2 rounded-xl text-sm">
                <span className="text-amber-700 font-semibold flex items-center gap-1">
                  <Star size={13} /> Cagnotte ({cagnottePointsUsed} pts)
                </span>
                <span className="text-amber-700 font-bold">-{fmt(cagnotteUsed)}</span>
              </div>
            )}
            {portefeuilleUsed > 0 && (
              <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 p-2 rounded-xl text-sm">
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <Wallet size={13} /> Porte-monnaie
                </span>
                <span className="text-emerald-700 font-bold">-{fmt(portefeuilleUsed)}</span>
              </div>
            )}
            <div className="flex justify-between items-center bg-gray-800 text-white p-3 rounded-xl">
              <span className="font-bold text-lg">TOTAL</span>
              <span className="font-bold text-xl">{fmt(Math.max(0, totalCart - cagnotteUsed - portefeuilleUsed))}</span>
            </div>

            <button
              onClick={() => {
                setMontantSaisi(''); setShowPayModal(true)
                setPaySplit({}); setPayActiveMode(null); setPaySplitInput('')
                if (customerWinOpen) {
                  customerPush({
                    statut: 'payment',
                    items: cart.items.map(i => ({ nom: i.produit.nom, quantite: i.quantite, prix_unitaire: i.prix_unitaire, total_ligne: i.quantite * i.prix_unitaire, unite: i.produit.unite, details: i.details })),
                    total: cart.total(),
                    remise: cart.remise ?? 0,
                    monnaie,
                    nom_entreprise: 'KB POS',
                    client: selectedClient?.nom
                  }).catch(() => {})
                }
              }}
              disabled={cart.items.length === 0}
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all flex items-center justify-center gap-3"
            >
              <CreditCard size={22} />
              Encaisser
            </button>
          </div>
        </div>
      </div>

      {/* Toast douchette */}
      {scannerMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 text-white ${scannerMsg.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {scannerMsg.ok ? <Check size={16} /> : <X size={16} />}
          {scannerMsg.text}
        </div>
      )}

      {/* Toast tiroir */}
      {tiroirToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full shadow-lg text-sm font-semibold z-50 flex items-center gap-2">
          <UnlockKeyhole size={16} />
          {tiroirToast}
        </div>
      )}

      {/* ─── VENTES EN ATTENTE MODAL ─────────────────────────── */}
      {showHeldModal && (
        <div className="modal-overlay" onClick={() => setShowHeldModal(false)}>
          <div className="bg-white rounded-2xl shadow-modal p-6 w-[32rem] max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 text-lg">Ventes en attente</h3>
              <button onClick={() => setShowHeldModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                <X size={18} />
              </button>
            </div>

            <button
              onClick={() => { holdCart(); setShowHeldModal(false) }}
              disabled={cart.items.length === 0}
              className={`mb-4 h-12 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${cart.items.length === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
            >
              <Clock size={18} /> Mettre le panier actuel en attente
            </button>

            <div className="flex-1 overflow-y-auto space-y-3">
              {heldCarts.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  <p className="text-sm">Aucune vente en attente.</p>
                </div>
              ) : heldCarts.map(h => {
                const totalHeld = Math.max(0, h.items.reduce((s, i) => s + i.total_ligne, 0) - h.remise)
                return (
                  <div key={h.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs text-gray-400 mb-1">{h.heldAt}</div>
                        <div className="text-sm font-semibold text-gray-800">
                          {h.items.reduce((s, i) => s + i.quantite, 0)} article(s)
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {h.items.map(i => i.produit.nom).slice(0, 3).join(', ')}
                          {h.items.length > 3 && '…'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-gray-900">{formatCurrency(totalHeld, monnaie)}</div>
                        {h.remise > 0 && <div className="text-xs text-red-400">remise -{formatCurrency(h.remise, monnaie)}</div>}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => resumeHeld(h)}
                        className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw size={14} /> Reprendre
                      </button>
                      <button
                        onClick={() => setHeldCarts(prev => prev.filter(x => x.id !== h.id))}
                        className="w-10 h-10 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl flex items-center justify-center"
                        title="Supprimer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── MOUVEMENTS DE CAISSE MODAL (versements / retraits) ─────── */}
      {showMouvementModal && (
        <div className="modal-overlay" onClick={() => setShowMouvementModal(false)}>
          <div className="bg-white rounded-2xl shadow-modal p-5 w-[30rem] max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 text-lg">Mouvements de caisse</h3>
              <button onClick={() => setShowMouvementModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                <X size={18} />
              </button>
            </div>

            {/* Type */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => setMouvementType('versement')}
                className={`h-12 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all border ${
                  mouvementType === 'versement'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-emerald-50'
                }`}
              >
                <ArrowDownToLine size={18} /> Versement
              </button>
              <button
                onClick={() => setMouvementType('retrait')}
                className={`h-12 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all border ${
                  mouvementType === 'retrait'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-red-50'
                }`}
              >
                <ArrowUpFromLine size={18} /> Retrait
              </button>
            </div>

            <div className={`rounded-xl p-3 text-sm mb-3 ${mouvementType === 'versement' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {mouvementType === 'versement'
                ? 'Versement : espèces ajoutées à la caisse en cours de journée (maximise le fond espèces).'
                : 'Retrait : espèces retirées de la caisse en cours de journée (dépôt banque, remboursement, remise au propriétaire…).'}
            </div>

            {/* Montant */}
            <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 text-center mb-3">
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Montant</div>
              <div className="text-4xl font-bold text-gray-800">
                {parseFloat(mouvementMontant.replace(',', '.')) || 0} <span className="text-xl text-gray-500">{monnaie}</span>
              </div>
            </div>

            <NumPad value={mouvementMontant} onChange={setMouvementMontant} onConfirm={confirmMouvement} />

            {/* Motif */}
            <input
              type="text"
              value={mouvementMotif}
              onChange={e => setMouvementMotif(e.target.value)}
              placeholder="Motif (optionnel) — ex. Dépôt banque OM, remise au gérant…"
              className="mt-3 w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button
              onClick={confirmMouvement}
              className={`mt-3 h-12 rounded-xl font-bold flex items-center justify-center gap-2 text-white transition-all ${
                mouvementType === 'versement' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              <Check size={18} />
              Enregistrer le {mouvementType === 'versement' ? 'versement' : 'retrait'}
            </button>

            {/* Liste du jour */}
            <div className="mt-4 flex-1 overflow-y-auto">
              <div className="text-sm font-semibold text-gray-500 mb-2">Mouvements du jour</div>
              {mouvementsJour.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-6 border border-dashed border-gray-200 rounded-xl">
                  Aucun mouvement aujourd'hui
                </div>
              ) : (
                <div className="space-y-2">
                  {mouvementsJour.map(m => (
                    <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl text-sm">
                      <div>
                        <span className={`font-semibold ${m.type === 'versement' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {m.type === 'versement' ? 'Versement' : 'Retrait'}
                        </span>
                        <span className="text-gray-400 text-xs ml-2">
                          {new Date(m.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {m.motif ? ` — ${m.motif}` : ''}
                        </span>
                      </div>
                      <div className={`font-bold ${m.type === 'versement' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {m.type === 'versement' ? '+' : '-'}{fmt(m.montant)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── CONFIRMATION TIROIR MODAL ──────────────────────── */}
      {showTiroirConfirm && (
        <div className="modal-overlay">
          <div className="bg-white rounded-2xl shadow-modal p-6 w-80 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <UnlockKeyhole size={32} className="text-amber-600" />
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-2">Ouvrir le tiroir ?</h3>
            <p className="text-gray-500 text-sm mb-6">Ouvrir le tiroir sans vente associée ?<br />Cette action sera enregistrée dans le journal.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTiroirConfirm(false)}
                className="flex-1 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setShowTiroirConfirm(false)
                  handleOuvrirTiroir('ouverture_simple')
                }}
                className="flex-1 h-12 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <UnlockKeyhole size={18} />
                Ouvrir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── BALANCE MODAL (saisie poids) ────────────────────── */}
      {variantProduit && (
        <VariantModal
          produit={variantProduit}
          attributions={attributionsParProduit[variantProduit.id] ?? []}
          onConfirm={({ details, varianteId, stock, quantite }) => {
            doAddToCart(variantProduit, quantite, details, varianteId, stock)
            setVariantProduit(null)
          }}
          onClose={() => setVariantProduit(null)}
        />
      )}

      {balanceProduit && (
        <BalanceModal
          produitNom={balanceProduit.nom}
          unite={balanceProduit.unite}
          prixUnitaire={(() => {
            const promo = getActivePromoForProduit(promotions, balanceProduit, 1)
            return promo ? calcPrixPromo(balanceProduit.prix_vente, promo) : balanceProduit.prix_vente
          })()}
          monnaie={monnaie}
          onConfirm={poids => doAddToCart(balanceProduit, poids)}
          onClose={() => setBalanceProduit(null)}
        />
      )}

      {/* ─── ALERTE PÉREMPTION ───────────────────────────────── */}
      {peremptionAlerte && (
        <div className="modal-overlay" style={{ zIndex: 70 }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-500 text-white p-5 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                ⚠️
              </div>
              <div>
                <p className="font-bold text-lg">Produit expiré !</p>
                <p className="text-red-100 text-sm">{peremptionAlerte.nom}</p>
              </div>
            </div>
            <div className="p-5">
              <p className="text-gray-700 mb-1">
                Date de péremption : <span className="font-bold text-red-600">{peremptionAlerte.date_peremption}</span>
              </p>
              <p className="text-sm text-gray-500 mb-5">Ce produit est expiré. La vente est déconseillée.</p>
              <div className="flex gap-3">
                <button onClick={() => setPeremptionAlerte(null)} className="flex-1 btn btn-secondary">Annuler</button>
                <button
                  onClick={() => {
                    const prod = peremptionAlerte
                    setPeremptionAlerte(null)
                    if (isUnitesPoids(prod.unite)) { setBalanceProduit(prod) }
                    else doAddToCart(prod)
                  }}
                  className="flex-1 btn bg-red-500 hover:bg-red-600 text-white text-sm"
                >
                  Vendre quand même
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SUPERVISEUR MODAL (annulation vente) ────────────── */}
      {showSuperviseurModal && (
        <SuperviseurModal
          titre="Annuler la vente"
          onSuccess={() => {
            cart.clearCart()
            resetClientState()
          }}
          onClose={() => setShowSuperviseurModal(false)}
        />
      )}

      {/* ─── PAYMENT MODAL ───────────────────────────────────── */}
      {showPayModal && (() => {
        const valeurPoint = Number(fideliteRegle?.valeur_point_fcfa ?? 1)
        const seuilMin = Number(fideliteRegle?.seuil_utilisation ?? 100)
        const soldePts = Number(selectedClient?.points_fidelite ?? 0)
        const soldeWallet = Number(selectedClient?.solde_portefeuille ?? 0)
        const maxCagnotteFcfa = Math.min(Math.round(soldePts * valeurPoint), totalCart)
        const maxWalletFcfa = Math.min(soldeWallet, totalCart)
        const peutCagnotte = selectedClient && fideliteRegle && soldePts >= seuilMin && maxCagnotteFcfa > 0
        const peutWallet = selectedClient && soldeWallet > 0
        const totalNet = Math.max(0, totalCart - cagnotteUsed - portefeuilleUsed)
        const monnaieRendue = Math.max(0, montantPayeNum - totalNet)

        // Modèle retail : Espèces = total donné par le client (peut dépasser),
        // la monnaie ne se calcule QUE sur les espèces :
        //   monnaie = espèces données − reste à couvrir en espèces (net − autres paiements)
        const splitEspeces = Number(paySplit['especes'] || 0)
        const nonCashSum = paySplitTotal - splitEspeces
        const resteEspeces = Math.max(0, totalNet - nonCashSum)
        const monnaieARendre = splitEspeces > resteEspeces ? splitEspeces - resteEspeces : 0
        const estMonnaie = monnaieARendre > 0
        // Un paiement est valide quand les autres moyens ne dépassent pas le net
        // et que le total donné couvre au moins le net.
        const paieOK = nonCashSum <= totalNet && (nonCashSum + splitEspeces) >= totalNet

        // Appliquer la saisie bonus en cours
        const applyBonus = () => {
          const v = parseFloat(bonusSaisi.replace(',', '.')) || 0
          if (bonusPayMode === 'cagnotte') {
            const capped = Math.min(v, maxCagnotteFcfa, totalCart)
            setCagnotteUsed(capped)
            setCagnottePointsUsed(Math.ceil(capped / valeurPoint))
          } else if (bonusPayMode === 'portefeuille') {
            const capped = Math.min(v, maxWalletFcfa, totalCart)
            setPortefeuilleUsed(capped)
          }
          setBonusPayMode(null)
          setBonusSaisi('')
        }

        const selectBonusMode = (mode: 'cagnotte' | 'portefeuille') => {
          if (bonusPayMode === mode) {
            // Désélectionner
            setBonusPayMode(null)
            setBonusSaisi('')
            if (mode === 'cagnotte') { setCagnotteUsed(0); setCagnottePointsUsed(0) }
            else setPortefeuilleUsed(0)
          } else {
            setBonusPayMode(mode)
            setBonusSaisi('')
          }
        }

        const isPayDisabled = totalNet > 0 && (
          (modePaiement !== 'ardoise' && !paieOK) ||
          (modePaiement === 'ardoise' && !selectedClient)
        )

        return (
        <div className="modal-overlay">
          <div className="modal-content max-w-lg overflow-y-auto" style={{ maxHeight: '95vh' }}>

            {/* ── Header ── */}
            <div className="bg-emerald-600 text-white p-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-xl">Encaissement</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    {cagnotteUsed + portefeuilleUsed > 0 && (
                      <span className="text-emerald-300 text-sm line-through">{fmt(totalCart)}</span>
                    )}
                    <span className="text-white font-bold text-lg">{fmt(totalNet > 0 ? totalNet : totalCart)}</span>
                  </div>
                </div>
                <button onClick={() => setShowPayModal(false)} className="p-2 hover:bg-emerald-700 rounded-lg">
                  <X size={22} />
                </button>
              </div>

              {/* Client dans le header */}
              <div className="mt-3">
                {selectedClient ? (
                  <div className="flex items-center justify-between bg-emerald-700 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {selectedClient.nom.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{selectedClient.nom}</p>
                        <p className="text-emerald-300 text-xs">
                          ★ {soldePts} pts · 💳 {fmt(soldeWallet)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedClient(null); setPrixClientsMap({}); setCagnotteUsed(0); setCagnottePointsUsed(0); setPortefeuilleUsed(0); setBonusPayMode(null); setBonusSaisi('') }}
                      className="text-emerald-300 hover:text-white p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowClientModal(true)}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-emerald-100 hover:text-white rounded-xl px-3 py-2 text-sm font-semibold transition-all"
                  >
                    <User size={15} />
                    Identifier un client (fidélité / porte-monnaie)
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 space-y-4">

              {/* ── MODES BONUS : Cagnotte & Porte-monnaie ── */}
              {(peutCagnotte || peutWallet) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Payer avec soldes client
                  </p>
                  <div className="flex gap-2">
                    {peutCagnotte && (
                      <button
                        onClick={() => selectBonusMode('cagnotte')}
                        className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-semibold ${
                          bonusPayMode === 'cagnotte' || cagnotteUsed > 0
                            ? 'border-amber-500 bg-amber-50 text-amber-800 shadow-md'
                            : 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400'
                        }`}
                      >
                        <Star size={18} className="text-amber-500 flex-shrink-0" />
                        <div className="text-left">
                          <div>Cagnotte ★</div>
                          <div className="text-xs font-normal text-amber-600">
                            {cagnotteUsed > 0 ? `-${fmt(cagnotteUsed)}` : `${fmt(maxCagnotteFcfa)} dispo`}
                          </div>
                        </div>
                      </button>
                    )}
                    {peutWallet && (
                      <button
                        onClick={() => selectBonusMode('portefeuille')}
                        className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-semibold ${
                          bonusPayMode === 'portefeuille' || portefeuilleUsed > 0
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800 shadow-md'
                            : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400'
                        }`}
                      >
                        <Wallet size={18} className="text-indigo-500 flex-shrink-0" />
                        <div className="text-left">
                          <div>Porte-monnaie</div>
                          <div className="text-xs font-normal text-indigo-600">
                            {portefeuilleUsed > 0 ? `-${fmt(portefeuilleUsed)}` : `${fmt(maxWalletFcfa)} dispo`}
                          </div>
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Saisie du montant bonus */}
                  {bonusPayMode && (
                    <div className="mt-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
                      <p className="text-xs font-semibold text-gray-600 mb-2">
                        Montant à utiliser sur {bonusPayMode === 'cagnotte' ? 'la cagnotte' : 'le porte-monnaie'}{' '}
                        <span className="text-gray-400">(max {fmt(bonusPayMode === 'cagnotte' ? maxCagnotteFcfa : maxWalletFcfa)})</span>
                      </p>
                      <div className="text-2xl font-bold text-center text-gray-800 mb-2 bg-white rounded-xl py-2 border">
                        {bonusSaisi || '0'} {monnaie}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {[
                          Math.min(bonusPayMode === 'cagnotte' ? maxCagnotteFcfa : maxWalletFcfa, totalCart),
                          1000, 2000, 5000
                        ].filter((v, i, arr) => arr.indexOf(v) === i && v > 0).slice(0, 4).map(amt => (
                          <button key={amt}
                            onClick={() => setBonusSaisi(String(amt))}
                            className="py-1.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-lg text-xs hover:bg-gray-100">
                            {amt >= 1000 ? `${amt/1000}k` : amt}
                          </button>
                        ))}
                      </div>
                      <NumPad value={bonusSaisi} onChange={setBonusSaisi} onConfirm={applyBonus} />
                    </div>
                  )}
                </div>
              )}

              {/* Résumé si montants bonus appliqués */}
              {(cagnotteUsed + portefeuilleUsed > 0) && (
                <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1.5 border border-gray-100">
                  <div className="flex justify-between text-gray-500">
                    <span>Total panier</span>
                    <span>{fmt(totalCart)}</span>
                  </div>
                  {cagnotteUsed > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span className="flex items-center gap-1"><Star size={12} /> Cagnotte ({cagnottePointsUsed} pts)</span>
                      <span className="font-semibold">−{fmt(cagnotteUsed)}</span>
                    </div>
                  )}
                  {portefeuilleUsed > 0 && (
                    <div className="flex justify-between text-indigo-700">
                      <span className="flex items-center gap-1"><Wallet size={12} /> Porte-monnaie</span>
                      <span className="font-semibold">−{fmt(portefeuilleUsed)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                    <span>Reste à payer</span>
                    <span className="text-emerald-700 text-base">{fmt(totalNet)}</span>
                  </div>
                </div>
              )}

              {/* ── PAIEMENT (1 ou plusieurs modes) ── */}
              {totalNet > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {cagnotteUsed + portefeuilleUsed > 0
                      ? `Reste à payer (${fmt(totalNet)}) — répartissez les modes`
                      : 'Mode de paiement — touchez les modes à utiliser'}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {paiementsVisibles.map(mode => {
                      const used = Boolean(paySplit[mode.id])
                      const activeSplit = payActiveMode === mode.id
                      return (
                        <button
                          key={mode.id}
                          onClick={() => {
                            if (mode.id === 'ardoise') {
                              // Ardoise = mode exclusif sans répartition
                              setPaySplit({ [mode.id]: totalNet })
                              setPayActiveMode(null); setPaySplitInput('')
                              cart.setModePaiement('ardoise')
                              return
                            }
                            if (used) {
                              // Retirer ce mode
                              const next = { ...paySplit }; delete next[mode.id]
                              setPaySplit(next)
                              setPayActiveMode(null); setPaySplitInput('')
                            } else {
                              const next = { ...paySplit, [mode.id]: 0 }
                              // Sortir du mode ardoise exclusif si on choisit un autre mode
                              if (paySplit['ardoise']) delete next['ardoise']
                              setPaySplit(next)
                              setPayActiveMode(mode.id); setPaySplitInput('')
                            }
                            cart.setModePaiement(mode.id)
                          }}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all font-semibold text-sm ${
                            used
                              ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                              : `border ${mode.bgColor} ${mode.color}`
                          }`}
                        >
                          {mode.icon}
                          <span className="text-center leading-tight">{mode.label}</span>
                          {used && (
                            <span className="text-[10px] text-blue-600 font-bold">
                              {fmt(paySplit[mode.id])}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Saisie du montant du mode actif */}
                  {payActiveMode && payActiveMode !== 'ardoise' && (
                    <div className="mt-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
                      <p className="text-xs font-semibold text-gray-600 mb-2">
                        Montant en{' '}
                        <span className="font-bold">{MODE_PAIEMENT_CONFIG.find(m => m.id === payActiveMode)?.label}</span>
                        {' '}<span className="text-gray-400">(reste max {fmt(Math.max(0, totalNet - paySplitTotal + (paySplit[payActiveMode] || 0)))})</span>
                      </p>
                      <div className="text-3xl font-bold text-center text-gray-800 mb-2 bg-white rounded-xl py-2 border">
                        {paySplitInput || '0'} {monnaie}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {[1000, 2000, 5000, 10000, 20000]
                          .filter((v) => v <= totalNet)
                          .map(amt => (
                            <button key={amt}
                              onClick={() => setPaySplitInput(String(amt))}
                              className="py-1.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-lg text-xs hover:bg-gray-100">
                              {amt / 1000}k
                            </button>
                          ))}
                      </div>
                      <NumPad
                        value={paySplitInput}
                        onChange={setPaySplitInput}
                        onConfirm={() => {
                          const v = Math.max(0, parseFloat(paySplitInput.replace(',', '.')) || 0)
                          // Espèces : montant libre (le client a donné X → monnaie calculée à la validation)
                          // Autres modes : plafonné au reste du net (pas de monnaie hors espèces)
                          const isEsp = payActiveMode === 'especes'
                          const autresNonCash = Object.entries(paySplit)
                            .filter(([k, m]) => k !== 'especes' && k !== payActiveMode && (m || 0) > 0)
                            .reduce((s, [, m]) => s + (m || 0), 0)
                          const plafond = isEsp ? Infinity : Math.max(0, totalNet - autresNonCash)
                          const limite = isEsp ? v : Math.min(v, plafond)
                          if (v > 0) setPaySplit({ ...paySplit, [payActiveMode]: limite })
                          setPayActiveMode(null); setPaySplitInput('')
                        }}
                      />
                    </div>
                  )}

                  {/* Ardoise (crédit) */}
                  {modePaiement === 'ardoise' && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                      <p className="text-red-700 font-semibold text-sm">Vente à crédit (ardoise)</p>
                      <p className="text-red-500 text-xs mt-1">
                        {selectedClient ? `Porté au compte de ${selectedClient.nom}` : 'Sélectionnez un client pour continuer'}
                      </p>
                    </div>
                  )}

                  {/* Récap de la répartition */}
                  {paySplitTotal > 0 && modePaiement !== 'ardoise' && (
                    <div className="mt-3 bg-gray-50 rounded-xl p-3 text-sm space-y-1.5 border border-gray-100">
                      {paiementsVisibles.filter(m => paySplit[m.id] > 0).map(m => (
                        <div key={m.id} className="flex justify-between text-gray-600">
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${m.color.includes('text') ? '' : ''}`} />
                            {m.label}
                          </span>
                          <span className="font-semibold text-gray-800">{fmt(paySplit[m.id])}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                        <span>Total donné</span>
                        <span className="text-emerald-700">{fmt(paySplitTotal)}</span>
                      </div>
                      <div className={`flex justify-between text-sm ${paieOK ? 'text-emerald-600 font-bold' : 'text-red-500 font-semibold'}`}>
                        <span>{paieOK ? '✓ Couvert' : 'Reste à couvrir'}</span>
                        <span>{fmt(Math.max(0, totalNet - paySplitTotal))}</span>
                      </div>
                      {estMonnaie && (
                        <div className="flex justify-between text-emerald-700 font-bold">
                          <span>Monnaie à rendre</span>
                          <span>{fmt(monnaieARendre)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Couvert totalement */}
              {totalNet === 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <p className="text-emerald-700 font-semibold text-sm">✓ Achat entièrement couvert par les soldes client</p>
                </div>
              )}

              {/* ── ÉTAPE : MONNAIE À REMETTRE ── */}
              {estMonnaie && (
                <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-5 text-white text-center space-y-2 shadow-lg border-2 border-emerald-300">
                  <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest">Monnaie à remettre au client</p>
                  <p className="text-5xl font-black tracking-tight">{fmt(monnaieARendre)}</p>
                  <div className="flex items-center justify-center gap-4 text-sm text-emerald-100 pt-1">
                    <span>Espèces données : <b className="text-white">{fmt(splitEspeces)}</b></span>
                    <span>À payer en espèces : <b className="text-white">{fmt(resteEspeces)}</b></span>
                  </div>
                  {nonCashSum > 0 && (
                    <div className="text-emerald-100 text-xs space-y-0.5">
                      {paiementsVisibles.filter(m => m.id !== 'especes' && paySplit[m.id] > 0).map(m => (
                        <div key={m.id}>{m.label} : <b className="text-white">{fmt(paySplit[m.id])}</b></div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handlePay}
                disabled={isPayDisabled || !!bonusPayMode}
                className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all flex items-center justify-center gap-3"
              >
                <Check size={22} />
                {bonusPayMode
                  ? 'Validez d\'abord le montant bonus'
                  : totalNet === 0 ? 'Confirmer (couvert)'
                  : estMonnaie ? `Ouvrir le tiroir & valider — remettre ${fmt(monnaieARendre)}`
                  : `Valider — ${fmt(totalNet)}`}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* ─── MONNAIE → PORTE-MONNAIE MODAL (avant ticket) ───── */}
      {showMonnaieWallet && selectedClient && pendingReceiptData && (
        <div className="modal-overlay">
          <div className="bg-white rounded-2xl shadow-modal p-6 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wallet size={30} className="text-emerald-600" />
            </div>
            <h3 className="font-bold text-lg text-gray-800 mb-1">Monnaie sur porte-monnaie ?</h3>
            <p className="text-gray-500 text-sm mb-1">
              Monnaie à rendre : <span className="font-bold text-gray-800">{fmt(monnaieACrediter)}</span>
            </p>
            <p className="text-sm text-gray-600 mb-5">
              Voulez-vous créditer cette monnaie sur le porte-monnaie de{' '}
              <span className="font-semibold">{selectedClient.nom}</span>{' '}
              plutôt que de la rendre en espèces ?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => finaliserPaiement(pendingReceiptData, monnaieACrediter)}
                className="flex-1 btn-success text-sm"
              >
                Oui — créditer {fmt(monnaieACrediter)}
              </button>
              <button
                onClick={() => finaliserPaiement(pendingReceiptData, 0)}
                className="flex-1 btn-ghost text-sm"
              >
                Non — rendre en espèces
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SUCCESS MODAL ───────────────────────────────────── */}
      {showSuccessModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="p-6 text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={40} className="text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-1">Paiement réussi !</h2>
              <p className="text-gray-500 mb-2">Ticket: <span className="font-bold text-gray-800">{lastTicket}</span></p>
              <p className="text-3xl font-bold text-emerald-600 mb-6">{fmt(lastTotal)}</p>

              {/* Récap transaction : total / montant donné / monnaie / mode */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-sm divide-y divide-gray-200 text-left">
                <div className="flex justify-between py-1.5">
                  <span className="text-gray-500">Total transaction</span>
                  <span className="font-bold text-gray-800">{fmt(lastTotal)}</span>
                </div>
                {lastRemise > 0 && (
                  <div className="flex justify-between py-1.5 text-red-500">
                    <span>Remise</span>
                    <span className="font-semibold">−{fmt(lastRemise)}</span>
                  </div>
                )}
                {lastPaiements && lastPaiements.length > 1 ? (
                  <>
                    {lastPaiements.map(p => (
                      <div key={p.mode} className="flex justify-between py-1.5">
                        <span className="text-gray-500">{MODE_PAIEMENT_CONFIG.find(m => m.id === p.mode)?.label || p.mode}</span>
                        <span className="font-semibold text-gray-800">{fmt(p.montant)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="flex justify-between py-1.5">
                    <span className="text-gray-500">Moyen de paiement</span>
                    <span className="font-semibold text-gray-800">{MODE_PAIEMENT_CONFIG.find(m => m.id === lastModePaiement)?.label || lastModePaiement}</span>
                  </div>
                )}
                <div className="flex justify-between py-1.5">
                  <span className="text-gray-500">Montant donné</span>
                  <span className="font-semibold text-gray-800">{fmt(lastMontantPaye)}</span>
                </div>
                <div className={`flex justify-between py-1.5 ${lastMonnaieRendue > 0 ? 'text-emerald-700 font-bold' : 'text-gray-500'}`}>
                  <span>Monnaie rendue</span>
                  <span>{fmt(lastMonnaieRendue)}</span>
                </div>
              </div>

              {lastReceiptText && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-left overflow-auto max-h-48">
                  <pre className="text-xs text-gray-600 font-mono whitespace-pre">{lastReceiptText}</pre>
                </div>
              )}

              {printError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-4 flex items-center gap-2">
                  <AlertCircle size={16} />
                  Impression échouée: {printError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    try {
                      const pr = lastFullReceipt
                        ? await printReceipt({ ...lastFullReceipt, monnaie, codeRetour: lastTicket })
                        : await printReceipt({
                            ticket: lastTicket,
                            date: new Date().toLocaleString('fr-FR'),
                            caissier: user!.nom,
                            lignes: [],
                            total: lastTotal,
                            remise: lastRemise,
                            montant_paye: lastMontantPaye,
                            monnaie_rendue: lastMonnaieRendue,
                            mode_paiement: lastModePaiement,
                            paiements: lastPaiements,
                            monnaie,
                            codeRetour: lastTicket
                          })
                      setPrintError(pr && pr.success ? '' : `Reprint: ${pr?.error || 'échec'}`)
                    } catch (e: any) { setPrintError(`Reprint: ${e?.message || 'échec'}`) }
                  }}
                  className="flex-1 btn-ghost flex items-center justify-center gap-2"
                >
                  <Printer size={18} />
                  Réimprimer
                </button>
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="flex-1 btn-success flex items-center justify-center gap-2"
                >
                  <RotateCcw size={18} />
                  Nouvelle vente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── QTY MODAL ───────────────────────────────────────── */}
      {showQtyModal && (
        <div className="modal-overlay">
          <div className="bg-white rounded-2xl shadow-modal p-5 w-72">
            <h3 className="font-bold text-gray-800 mb-3 text-center">Modifier la quantité</h3>
            <div className="bg-gray-50 rounded-xl p-3 text-center text-2xl font-bold text-gray-800 mb-3">
              {qtyInput || '0'}
            </div>
            <NumPad value={qtyInput} onChange={setQtyInput} onConfirm={confirmQty} />
            <button onClick={() => setShowQtyModal(false)} className="w-full btn-ghost mt-2">Annuler</button>
          </div>
        </div>
      )}

      {/* ─── REMISE MODAL ────────────────────────────────────── */}
      {showRemiseModal && (
        <div className="modal-overlay">
          <div className="bg-white rounded-2xl shadow-modal p-5 w-72">
            <h3 className="font-bold text-gray-800 mb-3 text-center">Remise ({monnaie})</h3>
            <div className="bg-gray-50 rounded-xl p-3 text-center text-2xl font-bold text-gray-800 mb-3">
              {remiseInput || '0'}
            </div>
            <NumPad value={remiseInput} onChange={setRemiseInput} onConfirm={confirmRemise} />
            <button onClick={() => setShowRemiseModal(false)} className="w-full btn-ghost mt-2">Annuler</button>
          </div>
        </div>
      )}

      {/* ─── CLIENT MODAL (carte de fidélité) ────────────────── */}
      {showClientModal && (
        <ClientFideliteModal
          clients={clients}
          selectedClient={selectedClient}
          fideliteRegle={fideliteRegle}
          totalCart={totalCart}
          monnaie={monnaie}
          onClientsRefresh={async () => { const cl = await getClients(); setClients(cl) }}
          onSelect={(client) => {
            handleSelectClient(client)
            setShowClientModal(false)
          }}
          onClose={() => setShowClientModal(false)}
        />
      )}

      {/* ─── ARTICLE LIBRE MODAL ────────────────────────────── */}
      {showLibreModal && (
        <div className="modal-overlay" onClick={() => setShowLibreModal(false)}>
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="bg-emerald-600 text-white p-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Package size={20} />
                <h3 className="font-bold text-lg">Vente libre</h3>
              </div>
              <button onClick={() => setShowLibreModal(false)} className="p-1.5 hover:bg-emerald-700 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500">Saisissez la désignation et le prix pour un article vendu en dehors du catalogue (sans code-barres).</p>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Désignation</label>
                <input
                  autoFocus
                  value={libreNom}
                  onChange={e => setLibreNom(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmVenteLibre()}
                  placeholder="Ex: Service, réparation, accessoire…"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Prix ({monnaie})</label>
                  <input
                    type="number" min="0" step="any" inputMode="decimal"
                    value={librePrix}
                    onChange={e => setLibrePrix(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmVenteLibre()}
                    placeholder="0"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Quantité</label>
                  <input
                    type="number" min="0.0001" step="any" inputMode="decimal"
                    value={libreQte}
                    onChange={e => setLibreQte(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmVenteLibre()}
                    placeholder="1"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>

              {libreErreur && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} />{libreErreur}</p>}

              <button onClick={confirmVenteLibre}
                className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                <Plus size={16} /> Ajouter au panier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── RETOUR ARTICLE MODAL ────────────────────────────── */}
      {showRetourModal && (
        <RetourModal
          monnaie={monnaie}
          caissierId={user!.id}
          caissierNom={user?.nom || ''}
          attributionsParProduit={attributionsParProduit}
          onClose={() => setShowRetourModal(false)}
        />
      )}

      {/* ─── POPUP CODE ROTATIF GESTIONNAIRE ─────────────────── */}
      {showCodeRotatif && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="bg-orange-500 text-white p-5 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert size={20} />
                <h3 className="font-bold text-lg">Code superviseur rotatif</h3>
              </div>
              <button onClick={() => setShowCodeRotatif(false)} className="p-1.5 hover:bg-orange-600 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500 text-center">
                Générez un code à 6 chiffres valable <strong>30 minutes</strong> pour autoriser un retour en caisse.
              </p>

              {/* Code actif existant */}
              {codeRotatifInfo?.actif && !codeRotatifVal && codeRotatifCountdown === 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-orange-600 mb-1">Un code est déjà actif (généré par {codeRotatifInfo.genere_par_nom})</p>
                  <p className="text-xs text-gray-400">Temps restant : {Math.floor(codeRotatifInfo.reste_secondes / 60)}m {codeRotatifInfo.reste_secondes % 60}s</p>
                  <p className="text-xs text-gray-400 mt-1">Régénérez pour obtenir un nouveau code.</p>
                </div>
              )}

              {/* Code affiché */}
              {(codeRotatifVal || (codeRotatifInfo?.actif && codeRotatifCountdown > 0)) && (
                <div className="bg-gray-900 rounded-2xl p-5 text-center">
                  <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Code à communiquer au caissier</p>
                  <div className="text-5xl font-black text-orange-400 tracking-[0.3em] mb-3 font-mono">
                    {codeRotatifVal ?? '••••••'}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Clock size={14} className="text-gray-400" />
                    {codeRotatifCountdown > 0 ? (
                      <span className={codeRotatifCountdown < 120 ? 'text-red-400 font-bold' : 'text-gray-300'}>
                        Expire dans {Math.floor(codeRotatifCountdown / 60)}m {codeRotatifCountdown % 60}s
                      </span>
                    ) : (
                      <span className="text-red-400">Code expiré</span>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={handleGenererCode}
                disabled={codeRotatifLoading}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
              >
                {codeRotatifLoading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <RotateCcw size={16} />
                }
                {codeRotatifVal ? 'Regénérer un nouveau code' : 'Générer le code'}
              </button>

              <p className="text-xs text-gray-400 text-center">
                Le code est hashé en base — seul le gestionnaire qui génère voit la valeur en clair.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── COMPOSANT CARTE FIDÉLITÉ ─────────────────────────────────────────────────

function ClientFideliteModal({
  clients: clientsProp, selectedClient, fideliteRegle, totalCart, monnaie,
  onSelect, onClose, onClientsRefresh
}: {
  clients: Client[]
  selectedClient: Client | null
  fideliteRegle: any
  totalCart: number
  monnaie: string
  onSelect: (client: Client | null) => void
  onClose: () => void
  onClientsRefresh?: () => Promise<void>
}) {
  const [phone, setPhone] = useState('')
  const [found, setFound] = useState<Client | null>(selectedClient)
  const [notFound, setNotFound] = useState(false)
  const [showInscription, setShowInscription] = useState(false)
  const [inscrNom, setInscrNom] = useState('')
  const [inscrTel, setInscrTel] = useState(phone)
  const [inscrEmail, setInscrEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [inscrError, setInscrError] = useState('')

  const fmt = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} ${monnaie}`

  const solde = Number(found?.points_fidelite ?? 0)
  const valeurPoint = Number(fideliteRegle?.valeur_point_fcfa ?? 1)
  const seuilMin = Number(fideliteRegle?.seuil_utilisation ?? 100)
  const ptsParFcfa = Number(fideliteRegle?.points_par_fcfa ?? 1)
  const pointsGagnés = fideliteRegle ? Math.floor(totalCart * ptsParFcfa / 100) : 0

  const handleSearch = async () => {
    const q = phone.trim().replace(/\s/g, '')
    if (!q) return
    // Toujours chercher en base pour avoir la liste fraîche
    const freshClients = await getClients()
    const match = freshClients.find(c =>
      (c.telephone || '').replace(/\s/g, '').includes(q) ||
      c.nom.toLowerCase().includes(q.toLowerCase())
    )
    if (match) {
      setFound(match)
      setNotFound(false)
      setShowInscription(false)
    } else {
      setFound(null)
      setNotFound(true)
      setShowInscription(false)
      setInscrTel(phone.trim())
      setInscrNom('')
      setInscrEmail('')
    }
  }

  const handleInscrire = async () => {
    if (!inscrNom.trim()) { setInscrError('Le nom est requis'); return }
    if (!inscrTel.trim()) { setInscrError('Le téléphone est requis'); return }
    setSaving(true); setInscrError('')
    try {
      await createClient({ nom: inscrNom.trim(), telephone: inscrTel.trim(), email: inscrEmail.trim() || undefined } as any)
      // Recharger la liste (parent + local) et trouver le nouveau client
      await onClientsRefresh?.()
      const updated = await getClients()
      const newClient = updated.find(c =>
        c.telephone?.replace(/\s/g, '') === inscrTel.trim().replace(/\s/g, '')
      )
      if (newClient) {
        onSelect(newClient)
      } else {
        setInscrError('Client créé mais introuvable, réessayez')
      }
    } catch { setInscrError('Erreur lors de l\'inscription') }
    setSaving(false)
  }

  const handleConfirm = () => {
    onSelect(found)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-gray-800 text-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <User size={18} /> Carte de fidélité
            </h3>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded-lg"><X size={18} /></button>
          </div>
          <div className="flex gap-2">
            <input
              autoFocus
              value={phone}
              onChange={e => { setPhone(e.target.value); setNotFound(false) }}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="N° téléphone ou nom du client…"
              className="flex-1 bg-gray-700 text-white placeholder-gray-400 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={handleSearch}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold">
              Chercher
            </button>
          </div>
          {notFound && (
            <div className="flex items-center justify-between mt-2">
              <p className="text-red-400 text-sm">❌ Numéro non trouvé</p>
              <button
                onClick={() => { setShowInscription(true); setInscrTel(phone.trim()); setInscrNom(''); setInscrEmail('') }}
                className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold"
              >
                + Inscrire ce client
              </button>
            </div>
          )}
        </div>

        {found ? (
          <div className="p-5 space-y-4">
            {/* Infos client */}
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                {found.nom.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-800">{found.nom}</p>
                <p className="text-sm text-gray-500">{found.telephone}</p>
              </div>
              {Number(found.solde_credit) > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">
                  Ardoise: {fmt(Number(found.solde_credit))}
                </span>
              )}
            </div>

            {/* Solde fidélité */}
            {fideliteRegle ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Solde points</p>
                    <p className="text-3xl font-bold text-amber-600">★ {solde} pts</p>
                    <p className="text-xs text-gray-400">≈ {fmt(solde * valeurPoint)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Gagné ce soir</p>
                    <p className="text-2xl font-bold text-emerald-600">+{pointsGagnés} pts</p>
                    <p className="text-xs text-gray-400">≈ {fmt(pointsGagnés * valeurPoint)}</p>
                  </div>
                </div>

                <p className="text-xs text-gray-400 pt-1 border-t border-amber-200">
                  Points utilisables lors du paiement (voir modal de paiement)
                </p>
              </div>
            ) : (
              <p className="text-xs text-center text-gray-400">Programme de fidélité non configuré</p>
            )}

            <div className="flex gap-2">
              <button onClick={() => onSelect(null)}
                className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm hover:bg-gray-50">
                Vente anonyme
              </button>
              <button onClick={handleConfirm}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700">
                Confirmer
              </button>
            </div>
          </div>
        ) : showInscription ? (
          /* ── Formulaire d'inscription rapide ── */
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 bg-emerald-50 rounded-xl px-4 py-3">
              <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white flex-shrink-0">
                <User size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Nouvelle inscription</p>
                <p className="text-xs text-emerald-600">Le client recevra ses points dès cet achat !</p>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Nom complet *</label>
              <input
                autoFocus
                value={inscrNom}
                onChange={e => setInscrNom(e.target.value)}
                placeholder="Ex : Kouamé Jean-Baptiste"
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Téléphone *</label>
              <input
                value={inscrTel}
                onChange={e => setInscrTel(e.target.value)}
                placeholder="07 XX XX XX XX"
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Email (facultatif)</label>
              <input
                value={inscrEmail}
                onChange={e => setInscrEmail(e.target.value)}
                placeholder="email@exemple.com"
                className="w-full border rounded-xl px-4 py-2.5 text-sm"
              />
            </div>

            {fideliteRegle && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                ★ En s'inscrivant maintenant, le client gagne{' '}
                <strong>+{Math.floor(totalCart * Number(fideliteRegle.points_par_fcfa) / 100)} points</strong>{' '}
                sur cet achat (≈ {fmt(Math.floor(totalCart * Number(fideliteRegle.points_par_fcfa) / 100) * Number(fideliteRegle.valeur_point_fcfa))})
              </div>
            )}

            {inscrError && <p className="text-sm text-red-600">{inscrError}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowInscription(false); setNotFound(true) }}
                className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm hover:bg-gray-50"
              >
                Retour
              </button>
              <button
                onClick={handleInscrire}
                disabled={saving}
                className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Inscription…' : 'Inscrire & Continuer'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Numpad recherche par téléphone ── */
          <div className="p-5">
            <p className="text-sm text-gray-500 text-center mb-4">
              Tapez le numéro de téléphone pour retrouver la carte fidélité du client.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                <button key={i} onClick={() => {
                    if (k === '⌫') setPhone(p => p.slice(0, -1))
                    else if (k) setPhone(p => p + k)
                  }}
                  disabled={!k}
                  className={`h-12 rounded-xl font-bold text-lg transition-all ${
                    k === '⌫' ? 'bg-red-50 text-red-600 hover:bg-red-100' :
                    k ? 'bg-gray-100 text-gray-800 hover:bg-gray-200' : 'invisible'
                  }`}
                >{k}</button>
              ))}
            </div>
            <button onClick={handleSearch}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 mb-2">
              Rechercher
            </button>
            <button onClick={() => onSelect(null)}
              className="w-full text-gray-400 text-sm py-2 hover:underline">
              Continuer sans client (vente anonyme)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

