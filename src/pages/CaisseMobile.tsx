import { useState, useEffect, useRef } from 'react'
import { useCartStore } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import {
  getProduits, getCategories, createVente, getParametres,
  getClients, commercialGetFideliteRegle, commercialAjouterPoints,
  printReceipt, ouvrirTiroir, getProduitByBarcode
} from '@/lib/ipc'
import type { Produit, Categorie, Client, ModePaiement } from '@/types'
import {
  ShoppingCart, X, Plus, Minus,
  Check, ChevronUp, LogOut, Search, Star
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const MODES: { id: ModePaiement; label: string; color: string }[] = [
  { id: 'especes', label: 'Espèces', color: 'bg-emerald-500' },
  { id: 'wave', label: 'Wave', color: 'bg-cyan-500' },
  { id: 'orange_money', label: 'Orange Money', color: 'bg-orange-500' },
  { id: 'mtn', label: 'MTN Money', color: 'bg-yellow-500' },
  { id: 'carte', label: 'Carte', color: 'bg-purple-500' },
]

export default function CaisseMobile() {
  const { user, logout } = useAuthStore()
  const cart = useCartStore()
  const navigate = useNavigate()

  const [produits, setProduits] = useState<Produit[]>([])
  const [categories, setCategories] = useState<Categorie[]>([])
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [monnaie, setMonnaie] = useState('FCFA')
  const [loading, setLoading] = useState(true)
  const [cartOpen, setCartOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payMode, setPayMode] = useState<ModePaiement | null>(null)
  const [payInput, setPayInput] = useState('')
  const [paySplit, setPaySplit] = useState<Record<string, number>>({})
  const [success, setSuccess] = useState(false)
  const [lastTicket, setLastTicket] = useState('')
  const [fideliteRegle, setFideliteRegle] = useState<any>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showClientSearch, setShowClientSearch] = useState(false)
  const [clientQ, setClientQ] = useState('')

  const barcodeBuffer = useRef('')
  const barcodeTimer = useRef<any>(null)
  const [scannerMsg, setScannerMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const scannerMsgTimer = useRef<any>(null)
  const showScannerMsg = (ok: boolean, text: string) => {
    setScannerMsg({ ok, text })
    clearTimeout(scannerMsgTimer.current)
    scannerMsgTimer.current = setTimeout(() => setScannerMsg(null), 1800)
  }

  useEffect(() => {
    Promise.all([getProduits(), getCategories(), getParametres(), commercialGetFideliteRegle(), getClients()])
      .then(([p, c, params, regle, cls]) => {
        setProduits(p as Produit[])
        setCategories(c as Categorie[])
        if ((params as any)?.monnaie) setMonnaie((params as any).monnaie)
        setFideliteRegle(regle)
        setClients(cls as Client[])
      }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Support scanner de code-barres (clavier / wedge) : hors champ de saisie
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

  const handleBarcode = async (code: string) => {
    const prod = await getProduitByBarcode(code)
    if (prod) {
      cart.addItem(prod)
      showScannerMsg(true, `${prod.nom} ajouté`)
    } else {
      showScannerMsg(false, `Code inconnu : ${code}`)
      setSearch(code)
    }
  }

  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      const byBar = await getProduitByBarcode(search.trim())
      const prod: Produit | null = byBar ?? filtered.find(p => p.nom.toLowerCase() === search.trim().toLowerCase()) ?? null
      if (prod) {
        cart.addItem(prod)
        setSearch('')
        showScannerMsg(true, `${prod.nom} ajouté`)
      }
    }
  }

  const filtered = produits.filter(p => {
    if (!p.actif) return false
    if (selectedCat && p.categorie_id !== selectedCat) return false
    if (search && !p.nom.toLowerCase().includes(search.toLowerCase()) && !(p.code_barre || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
  const total = cart.total()
  // Modèle retail : espèces = montant réellement donné (libre), monnaie = espèces − reste à couvrir
  const usedModes = Object.entries(paySplit).filter(([, v]) => (v || 0) > 0) as [ModePaiement, number][]
  const splitEspeces = paySplit['especes'] || 0
  const nonCashSum = usedModes.filter(([k]) => k !== 'especes').reduce((s, [, v]) => s + v, 0)
  const resteEspeces = Math.max(0, total - nonCashSum)
  const monnaieRendue = splitEspeces > resteEspeces ? splitEspeces - resteEspeces : 0
  const payTotal = usedModes.reduce((s, [, v]) => s + v, 0)
  const estMonnaie = monnaieRendue > 0
  const paieOK = nonCashSum <= total && payTotal >= total

  const handlePay = async () => {
    if (!user) return
    const paiements = usedModes.map(([mode, montant]) => ({ mode, montant: montant }))
    const nonCashPay = paiements.filter(p => p.mode !== 'especes')
    const nonCashRaw = nonCashPay.reduce((s, p) => s + p.montant, 0)
    const cashPay = paiements.find(p => p.mode === 'especes')
    const cashTendered = cashPay?.montant ?? 0
    const cashKept = Math.max(0, Math.min(cashTendered, Math.max(0, total - nonCashRaw)))
    const monnaieRendueFinal = cashTendered > Math.max(0, total - nonCashRaw) ? cashTendered - Math.max(0, total - nonCashRaw) : 0
    const paiementsEnreg = [...nonCashPay.map(p => ({ ...p })), ...(cashKept > 0 ? [{ mode: 'especes', montant: cashKept }] : [])]
    if (!(nonCashRaw <= total && nonCashRaw + cashTendered >= total)) return
    try {
      const boutiqueId = Number(localStorage.getItem('pos_boutique_id') ?? '1')
      const modePrincipal = paiementsEnreg.length ? [...paiementsEnreg].sort((a, b) => b.montant - a.montant)[0].mode : 'especes'
      const { venteId, ticket } = await createVente({
        total, remise: cart.remise,
        montant_paye: paiementsEnreg.reduce((s, p) => s + p.montant, 0),
        monnaie_rendue: monnaieRendueFinal, mode_paiement: modePrincipal,
        paiements: paiementsEnreg,
        caissier_id: user.id, client_id: selectedClient?.id ?? undefined,
        boutique_id: boutiqueId, lignes: cart.items.map(i => ({
          produit_id: i.produit.id, quantite: i.quantite,
          prix_unitaire: i.prix_unitaire, total_ligne: i.total_ligne
        }))
      })
      if (fideliteRegle && selectedClient) {
        const pts = Math.floor(total * (fideliteRegle.points_par_fcfa ?? 0))
        if (pts > 0) await commercialAjouterPoints(selectedClient.id, total, venteId)
      }
      try {
        const params = await getParametres() as any
        const receiptData = {
          ticket,
          date: new Date().toISOString(),
          caissier: user.nom,
          client: selectedClient?.nom,
          lignes: cart.items.map(i => ({ nom: i.produit.nom, quantite: i.quantite, prix_unitaire: i.prix_unitaire, total_ligne: i.total_ligne, unite: i.produit.unite })),
          total, remise: cart.remise,
          montant_paye: paiementsEnreg.reduce((s, p) => s + p.montant, 0),
          monnaie_rendue: monnaieRendueFinal, mode_paiement: modePrincipal,
          paiements: paiementsEnreg,
          especes_comptees: cashKept > 0 && cashTendered > cashKept ? cashTendered : undefined,
        }
        await printReceipt(receiptData)
        await ouvrirTiroir({ type: 'vente', vente_id: venteId, user_id: user.id })
      } catch {}
      setLastTicket(ticket)
      cart.clearCart()
      setSelectedClient(null)
      setPayInput('')
      setPaySplit({})
      setPayMode(null)
      setPayOpen(false)
      setCartOpen(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {}
  }

  const handleLogout = () => { logout(); navigate('/login') }

  const filteredClients = clients.filter(c =>
    c.nom.toLowerCase().includes(clientQ.toLowerCase()) ||
    (c.telephone ?? '').includes(clientQ)
  ).slice(0, 8)

  if (loading) return (
    <div className="h-screen bg-gray-900 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden select-none">
      {/* Header fixe */}
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="flex-1">
          <div className="text-sm font-bold text-amber-400">CAISSE MOBILE</div>
          <div className="text-xs text-gray-400">{user?.nom}</div>
        </div>
        {selectedClient && (
          <div className="flex items-center gap-1 bg-amber-500/20 text-amber-300 text-xs px-2 py-1 rounded-full">
            <Star size={10} /> {selectedClient.nom}
            <button onClick={() => setSelectedClient(null)} className="ml-1"><X size={10} /></button>
          </div>
        )}
        <button onClick={() => setShowClientSearch(true)} className="p-2 hover:bg-gray-700 rounded-lg">
          <Star size={18} className="text-gray-300" />
        </button>
        <button onClick={handleLogout} className="p-2 hover:bg-gray-700 rounded-lg">
          <LogOut size={18} className="text-gray-300" />
        </button>
      </header>

      {/* Recherche */}
      <div className="px-3 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={handleSearchKeyDown}
            placeholder="Rechercher ou scanner le code-barre..."
            className="w-full pl-8 pr-3 py-2.5 bg-gray-50 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
        </div>
      </div>

      {/* Catégories */}
      <div className="flex gap-2 px-3 py-2 overflow-x-auto flex-shrink-0 bg-white border-b border-gray-100">
        <button onClick={() => setSelectedCat(null)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${!selectedCat ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Tout
        </button>
        {categories.map(c => (
          <button key={c.id} onClick={() => setSelectedCat(c.id === selectedCat ? null : c.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${selectedCat === c.id ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {c.icone} {c.nom}
          </button>
        ))}
      </div>

      {/* Grille produits — scrollable */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(p => (
            <button key={p.id} onClick={() => cart.addItem(p)}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-left active:scale-95 transition-transform">
              <div className="w-full h-20 mb-2 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center text-4xl">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.nom} className="w-full h-full object-cover" />
                ) : (
                  <span>{categories.find(c => c.id === p.categorie_id)?.icone ?? '📦'}</span>
                )}
              </div>
              <div className="font-semibold text-gray-800 text-sm leading-tight line-clamp-2 mb-1">{p.nom}</div>
              <div className="text-amber-600 font-black text-base">{fmt(p.prix_vente)}</div>
              <div className="text-xs text-gray-400">{monnaie} / {p.unite}</div>
              {p.stock_actuel <= p.stock_minimum && (
                <div className="mt-1 text-xs text-red-400 font-medium">Stock faible</div>
              )}
            </button>
          ))}
          {!filtered.length && (
            <div className="col-span-2 py-16 text-center text-gray-400 text-sm">
              <Search size={32} className="mx-auto mb-2 opacity-40" />
              Aucun produit trouvé
            </div>
          )}
        </div>
        {/* Espace pour la barre du bas */}
        <div className="h-24" />
      </div>

      {/* Barre du bas */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setCartOpen(true)} className="relative flex-1 flex items-center justify-between bg-gray-900 text-white rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} />
            <span className="font-bold">{cart.nbArticles()} article{cart.nbArticles() > 1 ? 's' : ''}</span>
          </div>
          <span className="font-black text-amber-400">{fmt(total)} {monnaie}</span>
          {cart.nbArticles() > 0 && (
            <span className="absolute -top-2 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {cart.nbArticles()}
            </span>
          )}
        </button>
        <button onClick={() => { setCartOpen(false); setPayOpen(true) }} disabled={!cart.nbArticles()}
          className="bg-amber-500 text-white rounded-2xl px-5 py-3 font-black text-lg disabled:opacity-40 active:scale-95 transition-transform">
          Payer
        </button>
      </div>

      {/* Toast succès */}
      {success && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 z-50 text-sm font-semibold">
          <Check size={16} /> Vente #{lastTicket} enregistrée !
        </div>
      )}

      {/* Toast scanner */}
      {scannerMsg && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 z-50 text-sm font-semibold text-white ${scannerMsg.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {scannerMsg.ok ? <Check size={16} /> : <X size={16} />} {scannerMsg.text}
        </div>
      )}

      {/* Drawer panier */}
      {cartOpen && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <ChevronUp size={20} className="text-gray-400" />
                <span className="font-bold text-lg">Panier</span>
              </div>
              <button onClick={() => setCartOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {cart.items.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <ShoppingCart size={36} className="mx-auto mb-2 opacity-40" />
                  <p>Panier vide</p>
                </div>
              ) : cart.items.map(item => (
                <div key={item.key} className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-800 text-sm truncate">{item.produit.nom}</div>
                    {item.details && <div className="text-xs text-amber-600 font-semibold">{item.details}</div>}
                    <div className="text-xs text-gray-400">{fmt(item.prix_unitaire)} {monnaie}/{item.produit.unite}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => cart.updateQuantite(item.key, item.quantite - 1)}
                      className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center active:bg-gray-300">
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center font-bold text-sm">{item.quantite}</span>
                    <button onClick={() => cart.updateQuantite(item.key, item.quantite + 1)}
                      className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center active:bg-amber-200">
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-black text-amber-600 text-sm">{fmt(item.total_ligne)}</div>
                    <button onClick={() => cart.removeItem(item.key)} className="text-red-400 hover:text-red-600">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {cart.items.length > 0 && (
              <div className="px-4 pb-5 pt-3 border-t">
                <div className="flex justify-between font-black text-lg mb-3">
                  <span>Total</span>
                  <span className="text-amber-600">{fmt(total)} {monnaie}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { cart.clearCart(); setCartOpen(false) }}
                    className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-sm">
                    Vider
                  </button>
                  <button onClick={() => { setCartOpen(false); setPayOpen(true) }}
                    className="flex-[2] py-3 rounded-2xl bg-amber-500 text-white font-black text-base">
                    Payer {fmt(total)} {monnaie}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal paiement */}
      {payOpen && (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-700">
            <button onClick={() => setPayOpen(false)} className="p-2 hover:bg-gray-700 rounded-xl text-white"><X size={22} /></button>
            <span className="font-bold text-white text-lg">Paiement</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
            {/* Total */}
            <div className="text-center py-4">
              <div className="text-gray-400 text-sm">À payer</div>
              <div className="text-5xl font-black text-amber-400 my-1">{fmt(total)}</div>
              <div className="text-gray-400">{monnaie}</div>
            </div>

            {/* Récapitulatif des moyens utilisés */}
            {usedModes.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Récapitulatif</div>
                <div className="bg-gray-800 rounded-2xl p-3 space-y-1.5">
                  {usedModes.map(([id, val]) => (
                    <div key={id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${MODES.find(m => m.id === id)?.color}`} />
                        <span className="text-gray-300 text-sm">{MODES.find(m => m.id === id)?.label}</span>
                      </div>
                      <span className="text-white font-bold text-sm">{fmt(val)} {monnaie}</span>
                    </div>
                  ))}
                  {nonCashSum > 0 && (
                    <div className="border-t border-gray-700 pt-1.5 text-gray-400 text-sm flex justify-between">
                      <span>Espèces à payer</span>
                      <span className="text-gray-200 font-semibold">{fmt(resteEspeces)} {monnaie}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-700 pt-1.5 text-gray-300 text-sm flex justify-between">
                    <span>Total donné</span>
                    <span className="text-white font-bold">{fmt(payTotal)} {monnaie}</span>
                  </div>
                  {estMonnaie && (
                    <div className="flex justify-between text-emerald-400 font-bold text-sm">
                      <span>Monnaie à rendre</span>
                      <span>{fmt(monnaieRendue)} {monnaie}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Saisie d'un moyen */}
            {payMode ? (
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {MODES.find(m => m.id === payMode)?.label}
                </div>
                <div className="bg-gray-800 rounded-2xl p-4 text-center text-3xl font-black text-white mb-3 min-h-[64px]">
                  {payInput || '0'}
                </div>
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {[500, 1000, 2000, 5000, 10000, 20000, Math.ceil(total / 100) * 100]
                    .filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 7).map(v => (
                      <button key={v} onClick={() => setPayInput(String(v))}
                        className="py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-xs font-semibold">
                        {fmt(v)}
                      </button>
                    ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['7','8','9','4','5','6','1','2','3','000','0','⌫'].map(k => (
                    <button key={k} onClick={() => {
                      if (k === '⌫') setPayInput(v => v.slice(0, -1))
                      else if (k === '000') setPayInput(v => v + '000')
                      else setPayInput(v => v === '0' ? k : v + k)
                    }}
                      className="h-14 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white font-bold text-xl rounded-2xl transition-all">
                      {k}
                    </button>
                  ))}
                </div>
                <button onClick={() => {
                  const raw = parseFloat((payInput || '0').replace(',', '.')) || 0
                  let v = raw
                  if (payMode !== 'especes') {
                    const autres = usedModes.filter(([k]) => k !== 'especes' && k !== payMode).reduce((s, [, x]) => s + x, 0)
                    v = Math.min(raw, Math.max(0, total - autres))
                  }
                  if (v > 0) setPaySplit(prev => ({ ...prev, [payMode]: v }))
                  setPayMode(null); setPayInput('')
                }}
                  className="w-full mt-3 py-4 bg-emerald-600 active:bg-emerald-500 text-white font-black text-lg rounded-2xl">
                  ✓ Confirmer {payMode === 'especes' ? 'le montant donné' : 'le montant'}
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {usedModes.length ? 'Modifier / compléter' : 'Mode de paiement'}
                  </div>
                  {usedModes.length > 0 && (
                    <button onClick={() => { setPaySplit({}); setPayInput('') }}
                      className="text-xs text-red-400 font-semibold">
                      Tout effacer
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {MODES.map(m => {
                    const used = usedModes.find(([id]) => id === m.id)
                    return (
                      <button key={m.id}
                        onClick={() => { setPayMode(m.id); setPayInput(used ? String(used[1]) : '') }}
                        className={`py-3 rounded-2xl text-sm font-bold transition-all border-2 ${used ? `${m.color} text-white border-transparent` : 'bg-gray-800 text-gray-300 border-gray-700'}`}>
                        {m.label}
                        {used && <div className="text-xs font-bold mt-0.5">{fmt(used[1])}</div>}
                      </button>
                    )
                  })}
                </div>
                {!usedModes.length && !paieOK && nonCashSum === 0 && (
                  <div className="text-xs text-gray-500 mt-2">Sélectionnez Espèces pour saisir le montant remis par le client.</div>
                )}
              </div>
            )}

            {/* Monnaie à remettre */}
            {estMonnaie && (
              <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-5 text-white text-center shadow-lg">
                <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest">Monnaie à remettre au client</p>
                <p className="text-5xl font-black my-1">{fmt(monnaieRendue)} {monnaie}</p>
                <div className="text-sm text-emerald-100">
                  Espèces données : <b className="text-white">{fmt(splitEspeces)}</b> · à payer en espèces : <b className="text-white">{fmt(resteEspeces)}</b>
                </div>
                {usedModes.filter(([k]) => k !== 'especes').length > 0 && (
                  <div className="text-emerald-100 text-xs mt-1.5 space-y-0.5">
                    {usedModes.filter(([k]) => k !== 'especes').map(([id, val]) => (
                      <div key={id}>{MODES.find(m => m.id === id)?.label} : <b className="text-white">{fmt(val)}</b></div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bouton valider */}
          <div className="px-4 pb-6">
            <button onClick={handlePay}
              disabled={!paieOK}
              className={`w-full py-5 text-white text-xl font-black rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${paieOK ? 'bg-amber-500' : 'bg-gray-700 text-gray-500'}`}>
              <Check size={24} /> {estMonnaie ? `Valider — remettre ${fmt(monnaieRendue)}` : 'Valider la vente'}
            </button>
          </div>
        </div>
      )}

      {/* Recherche client */}
      {showClientSearch && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
          <div className="bg-white rounded-t-3xl w-full max-h-[70vh] flex flex-col">
            <div className="flex items-center gap-3 px-4 py-4 border-b">
              <span className="font-bold">Client fidélité</span>
              <button onClick={() => setShowClientSearch(false)} className="ml-auto p-2 hover:bg-gray-100 rounded-xl"><X size={20} /></button>
            </div>
            <div className="px-4 py-3">
              <input value={clientQ} onChange={e => setClientQ(e.target.value)} autoFocus
                placeholder="Nom ou téléphone..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
              <button onClick={() => { setSelectedClient(null); setShowClientSearch(false) }}
                className="w-full text-left py-2.5 px-3 text-sm text-gray-400 hover:bg-gray-50 rounded-xl">
                — Sans client —
              </button>
              {filteredClients.map(c => (
                <button key={c.id} onClick={() => { setSelectedClient(c); setShowClientSearch(false); setClientQ('') }}
                  className="w-full text-left py-3 px-3 hover:bg-amber-50 rounded-xl border border-transparent hover:border-amber-200 transition-all">
                  <div className="font-semibold text-gray-800 text-sm">{c.nom}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                    {c.telephone && <span>{c.telephone}</span>}
                    <span className="flex items-center gap-1 text-amber-600"><Star size={10} /> {c.points_fidelite ?? 0} pts</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
