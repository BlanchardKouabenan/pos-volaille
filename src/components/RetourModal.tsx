import { useState } from 'react'
import {
  Search, Check, AlertCircle, RotateCcw, X, Plus, Minus,
  ShieldAlert, Trash2
} from 'lucide-react'
import {
  rotationVerifier, verifieCodeSuperviseur, retourGetVenteByTicket, retourCreer,
  printReceipt, getReceiptText, getProduits
} from '@/lib/ipc'
import type { Produit, AttributionProduit } from '@/types'
import VariantModal from '@/components/VariantModal'

type RetourStep = 'search' | 'mode' | 'confirm' | 'echange' | 'echange_pay' | 'code' | 'done'

interface EchangeLigne {
  produit_id: number
  quantite: number
  prix_unitaire: number
  total_ligne: number
  variante_id?: number
  nom: string
  details?: string
  stockMax?: number
}

export default function RetourModal({ monnaie, caissierId, caissierNom, attributionsParProduit, onClose }: {
  monnaie: string
  caissierId: number
  caissierNom: string
  attributionsParProduit: Record<number, AttributionProduit[]>
  onClose: () => void
}) {
  const [step, setStep] = useState<RetourStep>('search')
  const [ticketInput, setTicketInput] = useState('')
  const [vente, setVente] = useState<any>(null)
  const [erreur, setErreur] = useState('')
  const [loading, setLoading] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeErreur, setCodeErreur] = useState('')
  const [modeRemboursement, setModeRemboursement] = useState<'especes' | 'wallet'>('especes')
  const [motif, setMotif] = useState('')
  const [retourNumero, setRetourNumero] = useState('')
  const [retourMontant, setRetourMontant] = useState(0)
  const [printMsg, setPrintMsg] = useState('')
  const [apercuRecu, setApercuRecu] = useState('')
  const [qtes, setQtes] = useState<{ [i: number]: number }>({})
  const [fullReturn, setFullReturn] = useState(true)
  const [modeRetour, setModeRetour] = useState<'remboursement' | 'echange'>('remboursement')
  // Échange
  const [echSearch, setEchSearch] = useState('')
  const [echProduits, setEchProduits] = useState<Produit[]>([])
  const [echPanier, setEchPanier] = useState<EchangeLigne[]>([])
  const [echProduitChoisi, setEchProduitChoisi] = useState<Produit | null>(null)
  const [echAttributions, setEchAttributions] = useState<AttributionProduit[]>([])
  // Paiement de la différence (échange > valeur retournée)
  const [modePaiement, setModePaiement] = useState('especes')
  const [montantRecu, setMontantRecu] = useState('')
  const [diffNettoyee, setDiffNettoyee] = useState(0)

  const fmt = (v: number) => `${Math.round(v || 0).toLocaleString('fr-FR')} ${monnaie}`

  const rechercherProduits = async () => {
    try {
      const prods = await getProduits() as Produit[]
      setEchProduits(prods)
    } catch { setEchProduits([]) }
  }

  const handleSearch = async () => {
    const t = ticketInput.trim().toUpperCase()
    if (!t) return
    setLoading(true); setErreur('')
    try {
      const res = await retourGetVenteByTicket(t)
      if (!res) { setErreur('Ticket introuvable'); setLoading(false); return }
      if (res.deja_retourne) { setErreur('Cette vente a déjà fait l\'objet d\'un retour'); setLoading(false); return }
      if (res.statut === 'annule') { setErreur('Vente annulée — retour impossible'); setLoading(false); return }
      if (res.statut === 'rembourse') { setErreur('Cette vente a déjà été remboursée'); setLoading(false); return }
      setVente(res)
      setQtes(Object.fromEntries(res.lignes.map((l: any, i: number) => [i, l.quantite])))
      setFullReturn(true)
      setModeRetour('remboursement')
      setEchPanier([])
      setEchSearch('')
      setStep('mode')
    } catch { setErreur('Erreur de recherche') }
    setLoading(false)
  }

  const updateQte = (i: number, l: any, delta: number) => {
    const max = l.quantite
    const next = Math.min(max, Math.max(0, (qtes[i] ?? 0) + delta))
    setQtes(prev => ({ ...prev, [i]: next }))
    const all = vente.lignes.map((l2: any, idx: number) => (idx === i ? next : (qtes[idx] ?? l2.quantite)))
    setFullReturn(all.every((q: number, idx: number) => q >= vente.lignes[idx].quantite))
  }

  const montantRetour = () => {
    const selected = vente.lignes.filter((_: any, i: number) => (qtes[i] ?? 0) > 0)
    if (!selected.length) return 0
    const sum = selected.reduce((s: number, l: any, idx: number) => {
      const orig = vente.lignes.findIndex((x: any) => x.id === l.id)
      const q = qtes[orig] ?? l.quantite
      return s + Number(l.prix_unitaire) * q
    }, 0)
    if (fullReturn) return Number(vente.total ?? 0)
    return Math.round(sum)
  }

  const attributionsDe = (pid: number): AttributionProduit[] =>
    attributionsParProduit[pid] ?? []

  const ajouterProduitEchange = (prod: Produit, attributions: AttributionProduit[]) => {
    // Avec variantes → VariantModal
    if ((attributions?.length ?? 0) > 0) {
      setEchProduitChoisi(prod)
      setEchAttributions(attributions)
      return
    }
    if (prod.stock_actuel <= 0) { setErreur('Article en rupture de stock'); return }
    setEchPanier(prev => {
      const existant = prev.find(p => p.produit_id === prod.id && p.variante_id == null && !p.details)
      if (existant) {
        if (existant.quantite + 1 > (prod.stock_actuel ?? 999999)) { setErreur('Stock insuffisant'); return prev }
        return prev.map(p => p === existant ? { ...p, quantite: p.quantite + 1, total_ligne: (p.quantite + 1) * p.prix_unitaire } : p)
      }
      return [...prev, {
        produit_id: prod.id, quantite: 1, prix_unitaire: prod.prix_vente,
        total_ligne: prod.prix_vente, nom: prod.nom, stockMax: prod.stock_actuel
      }]
    })
    setErreur('')
  }

  const totalEchange = () => echPanier.reduce((s, l) => s + Number(l.total_ligne), 0)
  const diffEchange = () => montantRetour() - totalEchange()

  const retirerEchange = (idx: number) => {
    setEchPanier(prev => prev.filter((_, i) => i !== idx))
  }

  const modifierQteEchange = (idx: number, delta: number) => {
    setEchPanier(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const next = l.quantite + delta
      if (next < 1) return l
      if (next > (l.stockMax ?? 999999)) { setErreur('Stock insuffisant'); return l }
      return { ...l, quantite: next, total_ligne: next * l.prix_unitaire }
    }))
  }

  const produitsFiltres = echProduits.filter(p =>
    p.actif && (!echSearch || p.nom.toLowerCase().includes(echSearch.toLowerCase()))
  )

  const preparerEchange = () => {
    if (!echPanier.length) { setErreur('Ajoutez au moins un article de remplacement'); return }
    const d = diffEchange()
    setDiffNettoyee(d)
    if (d < 0) {
      // Le remplacement dépasse la valeur retournée → le client doit payer la différence
      setModePaiement('especes')
      setMontantRecu('')
      setStep('echange_pay')
    } else if (d > 0) {
      // Reliquat à restituer en espèces ou porte-monnaie
      setModeRemboursement('especes')
      setStep('code')
    } else {
      // Échange neutre
      setStep('code')
    }
  }

  const handleCodeVerif = async () => {
    if (codeInput.length < 4) { setCodeErreur('Saisissez le code superviseur'); return }
    setLoading(true); setCodeErreur('')
    let res: any = { ok: false }
    try {
      const r = await rotationVerifier(codeInput)
      res = r
    } catch { res = { ok: false } }
    if (!res.ok) {
      try {
        const ok = await verifieCodeSuperviseur(codeInput)
        if (ok) res = { ok: true }
        else { setCodeErreur('Code incorrect — code rotatif ou code superviseur permanent invalide'); setLoading(false); return }
      } catch {
        setCodeErreur('Code incorrect — code rotatif ou code superviseur permanent invalide'); setLoading(false); return
      }
    }
    await executerRetour(res)
    setLoading(false)
  }

  const executerRetour = async (res: any) => {
    const lignesRetour = vente.lignes
      .map((l: any, i: number) => ({ l, qte: qtes[i] ?? 0 }))
      .filter((x: any) => x.qte > 0)
      .map((x: any) => ({
        produit_id: x.l.produit_id,
        quantite: x.qte,
        prix_unitaire: x.l.prix_unitaire,
        total_ligne: Number(x.l.prix_unitaire) * x.qte
      }))
    const montant = montantRetour()
    let reliquat = 0
    let montantEchange = 0

    if (modeRetour === 'echange') {
      montantEchange = totalEchange()
      const d = montant - montantEchange
      reliquat = d > 0 ? d : 0
      const paiements = d < 0 ? [{ mode: modePaiement, montant: Math.abs(d) }] : []
      const montantPaye = d < 0 ? Math.abs(d) : 0
      try {
        const result = await retourCreer({
          vente_id: vente.id,
          caissier_id: caissierId,
          code_rotation_id: res.codeId,
          montant_rembourse: montant,
          mode_remboursement: 'especes',
          motif: motif || 'Retour client',
          lignes: lignesRetour,
          type: 'echange',
          echange: {
            lignes: echPanier.map(l => ({
              produit_id: l.produit_id, quantite: l.quantite,
              prix_unitaire: l.prix_unitaire, total_ligne: l.total_ligne,
              variante_id: l.variante_id
            })),
            total: montantEchange,
            paiements,
            montant_rembourse: reliquat,
            mode_remboursement: reliquat > 0 ? modeRemboursement : 'especes',
            boutique_id: Number(localStorage.getItem('pos_boutique_id') ?? '1')
          }
        })
        setRetourNumero(result.numero)
        setRetourMontant(reliquat > 0 ? reliquat : montantPaye)
        setStep('done')
        await imprimerReçu(result, lignesRetour, montant, reliquat, montantPaye)
      } catch { setCodeErreur('Erreur lors du retour') }
      return
    }

    // Remboursement simple
    try {
      const result = await retourCreer({
        vente_id: vente.id,
        caissier_id: caissierId,
        code_rotation_id: res.codeId,
        montant_rembourse: montant,
        mode_remboursement: modeRemboursement,
        motif: motif || (fullReturn ? 'Retour client' : 'Retour partiel client'),
        lignes: lignesRetour
      })
      setRetourNumero(result.numero)
      setRetourMontant(montant)
      setStep('done')
      await imprimerReçu(result, lignesRetour, montant, 0, 0)
    } catch { setCodeErreur('Erreur lors du retour') }
  }

  const imprimerReçu = async (res: any, lignes: any[], montant: number, reliquat: number, montantPaye: number) => {
    let receiptData: any
    try {
      if (modeRetour === 'echange') {
        const montantEchange = totalEchange()
        const lignesRetour = lignes.map((l: any) => {
          const vl = (vente?.lignes || []).find((v: any) => v.produit_id === l.produit_id)
          return {
            nom: vl?.produit_nom || l.nom || 'Article retourné',
            quantite: l.quantite, prix_unitaire: l.prix_unitaire,
            total_ligne: Number(l.prix_unitaire) * l.quantite, unite: vl?.unite || '', type: 'retour' as const
          }
        })
        const lignesRemplacement = echPanier.map(l => ({
          nom: l.nom, quantite: l.quantite, prix_unitaire: l.prix_unitaire,
          total_ligne: l.total_ligne, unite: '', details: l.details, type: 'echange' as const
        }))
        receiptData = {
          ticket: res.numero,
          date: new Date().toLocaleString('fr-FR'),
          caissier: caissierNom,
          client: vente?.client_nom,
          lignes: [...lignesRetour, ...lignesRemplacement],
          total: montantEchange,
          remise: 0,
          montant_paye: montantPaye > 0 ? montantPaye : montantEchange,
          monnaie_rendue: 0,
          mode_paiement: montantPaye > 0 ? modePaiement : 'especes',
          type: 'echange',
          montant_echange: montantEchange,
          montant_reliquat: reliquat,
          codeRetour: vente?.numero_ticket,
          header: '=== ECHANGE ARTICLE ===',
          footer: reliquat > 0 ? `Reliquat ${reliquat.toLocaleString('fr-FR')} ${monnaie} à restituer. Stock recrédité.` : 'Articles échangés. Stock recrédité.'
        }
      } else {
        const lignesRecu = lignes.map((l: any) => {
          const vl = (vente?.lignes || []).find((v: any) => v.produit_id === l.produit_id)
          return {
            nom: vl?.produit_nom || l.nom || 'Article retourné',
            quantite: l.quantite, prix_unitaire: l.prix_unitaire,
            total_ligne: Number(l.prix_unitaire) * l.quantite, unite: vl?.unite || ''
          }
        })
        receiptData = {
          ticket: res.numero,
          date: new Date().toLocaleString('fr-FR'),
          caissier: caissierNom,
          client: vente?.client_nom,
          lignes: lignesRecu,
          total: montant,
          remise: 0,
          montant_paye: montant,
          monnaie_rendue: 0,
          mode_paiement: modeRemboursement,
          codeRetour: vente?.numero_ticket,
          header: '=== RETOUR / AVOIR ===',
          footer: 'Stock recrédité. Merci de votre confiance.'
        }
      }
      const [txt] = await Promise.all([
        getReceiptText(receiptData).catch(() => ''),
        printReceipt(receiptData).catch(() => null)
      ])
      if (txt) setApercuRecu(txt)
    } catch (e: any) {
      setPrintMsg(e?.message || 'Impression impossible')
    }
  }

  // ——— Échange pay : encaisser la différence ———
  const montantRecuNum = parseFloat((montantRecu || '0').replace(',', '.')) || 0
  const monnaieDiff = Math.max(0, montantRecuNum - Math.abs(diffNettoyee))
  const diffPayable = Math.abs(diffNettoyee)
  const paieDiffOK = modePaiement !== 'especes' && montantRecuNum >= diffPayable
  const paieDiffOKEsp = modePaiement === 'especes' && montantRecuNum >= diffPayable

  return (
    <div className="modal-overlay">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-red-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw size={20} />
            <h3 className="font-bold text-lg">Retour / Remboursement</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-red-700 rounded-lg"><X size={18} /></button>
        </div>

        <div className="p-5">

          {/* ── ÉTAPE 1 : Recherche ticket ── */}
          {step === 'search' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Scannez le code-barres du ticket ou saisissez le numéro de ticket.</p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={ticketInput}
                  onChange={e => setTicketInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="ex: TK-20260701-0012"
                  className="flex-1 border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <button onClick={handleSearch} disabled={loading}
                  className="bg-red-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                  {loading ? '…' : 'Chercher'}
                </button>
              </div>
              {erreur && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} />{erreur}</p>}
            </div>
          )}

          {/* ── ÉTAPE 2 : Choix du mode (remboursement / échange) ── */}
          {step === 'mode' && vente && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between font-semibold"><span>Ticket</span><span className="font-mono">{vente.numero_ticket}</span></div>
                <div className="flex justify-between"><span>Date</span><span>{new Date(vente.date).toLocaleDateString('fr-FR')}</span></div>
                {vente.client_nom && <div className="flex justify-between"><span>Client</span><span>{vente.client_nom}</span></div>}
                <div className="flex justify-between font-bold text-red-700 pt-1 border-t"><span>Total</span><span>{fmt(vente.total)}</span></div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Type de retour</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setModeRetour('remboursement')}
                    className={`py-3 rounded-xl text-sm font-bold border-2 transition-all ${modeRetour === 'remboursement' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'}`}>
                    💵 Remboursement
                  </button>
                  <button onClick={() => { setModeRetour('echange'); setEchPanier([]); setEchSearch(''); rechercherProduits(); setErreur('') }}
                    className={`py-3 rounded-xl text-sm font-bold border-2 transition-all ${modeRetour === 'echange' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                    🔄 Échange / Remplacement
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep('search')} className="flex-1 btn-ghost text-sm">Retour</button>
                <button onClick={() => {
                  if (modeRetour === 'echange') {
                    setEchSearch('')
                    rechercherProduits()
                    setStep('echange')
                  } else {
                    setStep('confirm')
                  }
                }}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-red-700">
                  {modeRetour === 'echange' ? 'Échanger →' : 'Continuer'}
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 3 : Confirmation des articles retournés ── */}
          {step === 'confirm' && vente && (
            <div className="space-y-4">
              {modeRetour === 'remboursement' && (
                <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
                  <div className="flex justify-between font-semibold"><span>Ticket</span><span className="font-mono">{vente.numero_ticket}</span></div>
                  <div className="flex justify-between font-bold text-red-700 pt-1 border-t"><span>Montant à rembourser</span><span>{fmt(montantRetour())}</span></div>
                </div>
              )}
              {modeRetour === 'echange' && (
                <div className="bg-blue-50 rounded-xl p-3 text-sm">
                  <p className="font-semibold text-blue-700">Échange — articles retournés</p>
                  <p className="text-blue-600 text-xs mt-1">Montant retourné : <b>{fmt(montantRetour())}</b></p>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase">Articles à retourner</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {vente.lignes.map((l: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-sm bg-red-50 rounded-lg px-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <span className="truncate block">{l.produit_nom}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => updateQte(i, l, -1)} disabled={!qtes[i]}
                          className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-500 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50">
                          <Minus size={12} />
                        </button>
                        <span className="w-8 text-center font-bold text-gray-800">{qtes[i] ?? 0}</span>
                        <button onClick={() => updateQte(i, l, 1)} disabled={(qtes[i] ?? 0) >= l.quantite}
                          className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-500 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50">
                          <Plus size={12} />
                        </button>
                      </div>
                      <span className="font-semibold w-20 text-right flex-shrink-0">
                        {fmt(Number(l.prix_unitaire) * (qtes[i] ?? 0))}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-gray-400">Retour partiel : cliquez − pour exclure</span>
                  <span className="font-bold text-red-700 text-sm flex-shrink-0 ml-2">{fmt(montantRetour())}</span>
                </div>
              </div>

              {modeRetour === 'echange' ? (
                <button onClick={() => setStep('echange')}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700">
                  Ajouter le(s) article(s) de remplacement {echPanier.length > 0 ? `(${echPanier.length})` : ''}
                </button>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Mode de remboursement</label>
                  <div className="flex gap-2">
                    <button onClick={() => setModeRemboursement('especes')}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 ${modeRemboursement === 'especes' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'}`}>
                      💵 Espèces
                    </button>
                    <button onClick={() => setModeRemboursement('wallet')}
                      disabled={!vente.client_id}
                      title={vente.client_id ? undefined : 'La vente doit avoir un client pour créditer son porte-monnaie'}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 ${modeRemboursement === 'wallet' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed'}`}>
                      💳 Porte-monnaie
                    </button>
                  </div>
                  {modeRemboursement === 'wallet' && vente.client_nom && (
                    <p className="text-xs text-indigo-600 mt-1">• {fmt(montantRetour())} crédités au porte-monnaie de {vente.client_nom}</p>
                  )}
                  {!vente.client_id && (
                    <p className="text-xs text-gray-400 mt-1">Porte-monnaie indisponible : aucune fiche client sur cette vente.</p>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Motif (optionnel)</label>
                <input value={motif} onChange={e => setMotif(e.target.value)}
                  placeholder="Produit défectueux, erreur commande…"
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep('mode')} className="flex-1 btn-ghost text-sm">Retour</button>
                <button onClick={() => setStep('code')} className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-red-700">
                  Continuer → Code superviseur
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 4 : Sélection des articles de remplacement ── */}
          {step === 'echange' && (
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-xl p-3 text-sm">
                <div className="flex justify-between font-semibold text-blue-700">
                  <span>Articles retournés</span><span>{fmt(montantRetour())}</span>
                </div>
                <div className="flex justify-between text-xs text-blue-600 mt-0.5">
                  <span>Remplacement</span><span>{fmt(totalEchange())}</span>
                </div>
                <div className={`flex justify-between font-bold text-sm mt-1 border-t border-blue-200 pt-1 ${diffEchange() > 0 ? 'text-emerald-700' : diffEchange() < 0 ? 'text-red-700' : 'text-gray-600'}`}>
                  <span>{diffEchange() > 0 ? 'Reliquat à restituer' : diffEchange() < 0 ? 'À payer (complément)' : 'Échange neutre'}</span>
                  <span>{fmt(Math.abs(diffEchange()))}</span>
                </div>
              </div>

              {/* Articles retournés (ticket) — ajustables */}
              {vente?.lignes?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Articles du ticket à retourner</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {vente.lignes.map((l: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
                        <div className="min-w-0 flex-1">
                          <span className="truncate block text-gray-600">{l.produit_nom}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => updateQte(i, l, -1)} disabled={!qtes[i]}
                            className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-500 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50">
                            <Minus size={12} />
                          </button>
                          <span className={`w-8 text-center font-bold ${(qtes[i] ?? 0) > 0 ? 'text-red-700 line-through' : 'text-gray-400 line-through'}`}>{qtes[i] ?? 0}</span>
                          <button onClick={() => updateQte(i, l, 1)} disabled={(qtes[i] ?? 0) >= l.quantite}
                            className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-500 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50">
                            <Plus size={12} />
                          </button>
                        </div>
                        <span className="font-semibold w-20 text-right flex-shrink-0 text-gray-500">
                          {fmt(Number(l.prix_unitaire) * (qtes[i] ?? 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">Articles à quantité 0 (barrés) : non retournés.</p>
                </div>
              )}

              {/* Panier échange */}
              {echPanier.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Articles de remplacement</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {echPanier.map((l, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-sm bg-blue-50 rounded-lg px-3 py-1.5">
                        <div className="min-w-0 flex-1">
                          <span className="truncate block">{l.nom}{l.details ? ` · ${l.details}` : ''}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => modifierQteEchange(i, -1)} className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-50"><Minus size={12} /></button>
                          <span className="w-8 text-center font-bold text-gray-800">{Math.round(l.quantite)}</span>
                          <button onClick={() => modifierQteEchange(i, 1)} className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-50"><Plus size={12} /></button>
                        </div>
                        <span className="font-semibold w-20 text-right flex-shrink-0">{fmt(l.total_ligne)}</span>
                        <button onClick={() => retirerEchange(i)} className="text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recherche produit de remplacement */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Ajouter un article</p>
                <input value={echSearch} onChange={e => setEchSearch(e.target.value)} autoFocus
                  placeholder="Rechercher un produit à remettre…"
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <div className="max-h-48 overflow-y-auto mt-2 space-y-1">
                  {produitsFiltres.slice(0, 20).map(p => (
                    <button key={p.id} onClick={() => {
                      ajouterProduitEchange(p, attributionsDe(p.id))
                    }}
                      className="w-full text-left bg-white border border-gray-100 hover:border-blue-300 hover:bg-blue-50 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-700 truncate">{p.nom}</span>
                      <span className="text-xs font-bold text-gray-500 flex-shrink-0">{fmt(p.prix_vente)}</span>
                    </button>
                  ))}
                  {!produitsFiltres.length && <p className="text-sm text-gray-400 text-center py-4">Aucun produit trouvé</p>}
                </div>
              </div>

              {erreur && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} />{erreur}</p>}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep('confirm')} className="flex-1 btn-ghost text-sm">Retour</button>
                <button onClick={preparerEchange} disabled={!echPanier.length}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                  Valider l'échange
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 5 : Payer la différence (échange > valeur) ── */}
          {step === 'echange_pay' && (
            <div className="space-y-4">
              <div className="bg-red-50 rounded-xl p-3 text-sm">
                <div className="flex justify-between font-bold text-red-700"><span>Complément à payer</span><span>{fmt(diffPayable)}</span></div>
                <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Retourné</span><span>{fmt(montantRetour())}</span></div>
                <div className="flex justify-between text-xs text-gray-500"><span>Remplacement</span><span>{fmt(totalEchange())}</span></div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Mode de paiement</p>
                <div className="flex gap-2">
                  {[['especes', '💵 Espèces'], ['wave', '📱 Wave'], ['orange_money', '📱 Orange'], ['mtn', '📱 MTN'], ['carte', '💳 Carte']].map(([id, label]) => (
                    <button key={id} onClick={() => setModePaiement(id)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 ${modePaiement === id ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {modePaiement === 'especes' && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Montant reçu du client</label>
                  <input value={montantRecu} onChange={e => setMontantRecu(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="ex: 5 000"
                    className="w-full border rounded-xl px-4 py-3 text-center text-xl font-mono focus:outline-none focus:ring-2 focus:ring-red-400" />
                  {monnaieDiff > 0 && (
                    <div className="mt-3 bg-emerald-600 text-white rounded-xl p-3 text-center">
                      <div className="text-xs text-emerald-100 uppercase font-bold">Monnaie à rendre</div>
                      <div className="text-3xl font-black">{fmt(monnaieDiff)}</div>
                    </div>
                  )}
                </div>
              )}

              {(modePaiement === 'especes' ? paieDiffOKEsp : paieDiffOK) && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 font-semibold text-center">
                  ✓ Complément de {fmt(diffPayable)} {modePaiement === 'especes' ? `et monnaie de ${fmt(monnaieDiff)} à rendre` : 'encaissé'}
                </div>
              )}
              {modePaiement === 'especes' && montantRecuNum > 0 && montantRecuNum < diffPayable && (
                <p className="text-sm text-red-600">Montant insuffisant — encore {fmt(diffPayable - montantRecuNum)}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep('echange')} className="flex-1 btn-ghost text-sm">Retour</button>
                <button onClick={() => setStep('code')}
                  disabled={modePaiement === 'especes' ? !paieDiffOKEsp : !paieDiffOK}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                  Continuer → Code superviseur
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 6 : Code superviseur rotatif ── */}
          {step === 'code' && (
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                <ShieldAlert size={24} className="text-orange-500 mx-auto mb-1" />
                <p className="text-sm font-semibold text-orange-800">Autorisation superviseur requise</p>
                <p className="text-xs text-orange-600 mt-1">
                  Code rotatif 6 chiffres (bouton "Code" → valide 30 min) <strong>ou</strong> code superviseur permanent 4 chiffres si le gestionnaire est absent.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-2">Code superviseur</label>
                <input
                  autoFocus
                  type="password"
                  value={codeInput}
                  onChange={e => setCodeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCodeVerif()}
                  placeholder="Code à 6 chiffres"
                  className="w-full border rounded-xl px-4 py-3 text-center text-xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-400"
                  maxLength={8}
                />
              </div>

              {codeErreur && (
                <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} />{codeErreur}</p>
              )}

              <div className="flex gap-2">
                <button onClick={() => {
                  if (modeRetour === 'echange') setStep(diffNettoyee < 0 ? 'echange_pay' : 'echange')
                  else setStep('confirm')
                }} className="flex-1 btn-ghost text-sm">Retour</button>
                <button onClick={handleCodeVerif} disabled={loading}
                  className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                  Valider le retour
                </button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 7 : Retour effectué ── */}
          {step === 'done' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <Check size={32} className="text-green-600" />
              </div>
              <h4 className="font-bold text-gray-800 text-lg">Retour effectué</h4>
              <p className="text-sm text-gray-500">
                Référence : <span className="font-mono font-bold text-gray-800">{retourNumero}</span>
              </p>
              <p className="text-sm text-gray-500">
                {modeRetour === 'echange'
                  ? (diffNettoyee > 0
                      ? <>Reliquat de <strong className="text-red-700">{fmt(retourMontant)}</strong> {modeRemboursement === 'wallet' ? 'crédité au porte-monnaie' : 'à remettre en espèces'}</>
                      : diffNettoyee < 0
                        ? <>Complément de <strong className="text-red-700">{fmt(retourMontant)}</strong> encaissé</>
                        : 'Échange neutre')
                  : <>Remboursement en <strong>{modeRemboursement === 'especes' ? 'espèces' : 'porte-monnaie'}</strong> — <strong className="text-red-700">{fmt(retourMontant)}</strong></>}
              </p>
              {modeRetour === 'echange' && <p className="text-xs text-gray-400">{echPanier.length} article(s) remis en échange.</p>}
              <p className="text-xs text-gray-400">Le stock a été recrédité automatiquement.</p>
              {printMsg && <p className="text-xs text-orange-600">Reçu de retour : impression impossible ({printMsg})</p>}
              {apercuRecu && (
                <div className="bg-white border border-gray-200 rounded-xl p-3 overflow-auto max-h-56 text-left">
                  <div className="font-mono text-[10px] leading-tight whitespace-pre-wrap">
                    {apercuRecu.split('\n').map((ln, i) =>
                      ln.includes('[X]') || ln.startsWith('  -----')
                        ? <div key={i} className="text-red-600 line-through decoration-2">{ln}</div>
                        : <div key={i} className="text-gray-700">{ln}</div>
                    )}
                  </div>
                </div>
              )}
              <button onClick={onClose} className="w-full btn-success">Fermer</button>
            </div>
          )}
        </div>
      </div>

      {/* VariantModal pour l'échange */}
      {echProduitChoisi && (
        <VariantModal
          produit={echProduitChoisi}
          attributions={echAttributions}
          onConfirm={({ details, varianteId, stock, quantite }) => {
            setEchPanier(prev => {
              const existant = prev.find(p => p.produit_id === echProduitChoisi.id && p.variante_id === varianteId && p.details === details)
              if (existant) {
                if (existant.quantite + quantite > (stock ?? 999999)) { setErreur('Stock insuffisant'); return prev }
                return prev.map(p => p === existant ? { ...p, quantite: p.quantite + quantite, total_ligne: (p.quantite + quantite) * p.prix_unitaire } : p)
              }
              return [...prev, {
                produit_id: echProduitChoisi.id, quantite: quantite,
                prix_unitaire: echProduitChoisi.prix_vente,
                total_ligne: quantite * echProduitChoisi.prix_vente,
                variante_id: varianteId, nom: echProduitChoisi.nom, details, stockMax: stock
              }]
            })
            setEchProduitChoisi(null)
            setEchAttributions([])
            setErreur('')
          }}
          onClose={() => { setEchProduitChoisi(null); setEchAttributions([]) }}
        />
      )}
    </div>
  )
}
