import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getVentes, getVenteById, verifieCodeSuperviseur, rotationVerifier } from '@/lib/ipc'
import {
  Receipt, Search, ChevronDown, ChevronUp, ShieldAlert, X, Check,
  Calendar, CreditCard, Banknote, Smartphone, Eye, Filter, RefreshCw, Printer
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Vente {
  id: number
  numero_ticket: string
  date: string
  total: number
  remise: number
  montant_paye: number
  monnaie_rendue: number
  mode_paiement: string
  caissier_nom: string
  client_nom?: string
  caissier_id: number
}

interface VenteDetail extends Vente {
  lignes: { produit_nom: string; quantite: number; prix_unitaire: number; total_ligne: number; unite: string; details?: string }[]
  paiements?: { mode: string; montant: number }[]
  cagnotte_utilisee?: number
  portefeuille_utilise?: number
  monnaie_creditee_wallet?: number
  points_utilises?: number
  points_gagnes?: number
}

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  especes:      { label: 'Espèces',      color: 'bg-emerald-100 text-emerald-700' },
  wave:         { label: 'Wave',         color: 'bg-cyan-100 text-cyan-700' },
  orange_money: { label: 'Orange Money', color: 'bg-orange-100 text-orange-700' },
  mtn:          { label: 'MTN Money',    color: 'bg-yellow-100 text-yellow-700' },
  carte:        { label: 'Carte',        color: 'bg-purple-100 text-purple-700' },
  ardoise:      { label: 'Ardoise',      color: 'bg-red-100 text-red-700' },
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
const fmtDate = (d: string) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// ─── Gate superviseur (caissier uniquement) ───────────────────────────────────
function SuperviseurGate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState('')
  const [loading, setLoading] = useState(false)

  const verify = useCallback(async (c: string) => {
    if (c.length < 4) return
    setLoading(true); setErreur('')
    const resRotation = await rotationVerifier(c)
    if (resRotation.ok) { onUnlock(); return }
    const resPerm = await verifieCodeSuperviseur(c)
    if (resPerm) { onUnlock(); return }
    setErreur('Code incorrect')
    setCode('')
    setLoading(false)
  }, [onUnlock])

  const press = (k: string) => {
    if (k === '⌫') { setCode(v => v.slice(0, -1)); setErreur(''); return }
    if (k === 'C')  { setCode(''); setErreur(''); return }
    if (code.length >= 6) return
    const next = code + k
    setCode(next)
    if (next.length === 4 || next.length === 6) verify(next)
  }

  return (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={28} className="text-orange-500" />
        </div>
        <h2 className="font-bold text-xl text-gray-800 mb-1">Accès superviseur requis</h2>
        <p className="text-sm text-gray-500 mb-6">
          Entrez le code rotatif (6 chiffres) ou le code permanent (4 chiffres) pour consulter les transactions.
        </p>

        {/* Affichage */}
        <div className="flex justify-center gap-2 mb-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center font-bold text-lg transition-all ${
              code.length > i ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-200 bg-gray-50'
            }`}>
              {code.length > i ? '•' : ''}
            </div>
          ))}
        </div>

        {erreur && (
          <p className="text-red-500 text-sm mb-3 flex items-center justify-center gap-1">
            <X size={14} /> {erreur}
          </p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(k => (
            <button key={k} onClick={() => press(k)} disabled={loading}
              className={`h-12 rounded-xl font-bold text-lg transition-all ${
                k === 'C' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : k === '⌫' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-gray-50 hover:bg-orange-50 hover:text-orange-600 border border-gray-100'
              }`}>
              {k}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Ligne de transaction ─────────────────────────────────────────────────────
function VenteRow({ vente, onExpand }: { vente: Vente; onExpand: (id: number) => void }) {
  const mode = MODE_LABELS[vente.mode_paiement] ?? { label: vente.mode_paiement, color: 'bg-gray-100 text-gray-600' }
  return (
    <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => onExpand(vente.id)}>
      <td className="px-4 py-3">
        <div className="font-mono text-xs text-blue-600 font-semibold">{vente.numero_ticket}</div>
        <div className="text-xs text-gray-400">{fmtDate(vente.date)}</div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{vente.caissier_nom}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{vente.client_nom ?? '—'}</td>
      <td className="px-4 py-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${mode.color}`}>{mode.label}</span>
      </td>
      <td className="px-4 py-3 text-right font-black text-gray-900">{fmt(vente.total)}</td>
      <td className="px-4 py-3 text-right">
        {vente.remise > 0 && <span className="text-xs text-red-400">-{fmt(vente.remise)}</span>}
      </td>
      <td className="px-4 py-3 text-center">
        <Eye size={14} className="text-gray-400 mx-auto" />
      </td>
    </tr>
  )
}

// ─── Panneau détail ───────────────────────────────────────────────────────────
function DetailPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const [vente, setVente] = useState<VenteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [reprintMsg, setReprintMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    getVenteById(id).then(v => { setVente(v as VenteDetail); setLoading(false) })
  }, [id])

  const reprint = async () => {
    if (!vente) return
    const { printReceipt: doPrint } = await import('@/lib/ipc')
    const r = await doPrint({
      ticket: vente.numero_ticket,
      date: vente.date ? new Date(vente.date).toLocaleString('fr-FR') : '',
      caissier: vente.caissier_nom ?? '',
      client: vente.client_nom,
      lignes: (vente.lignes ?? []).map(l => ({
        nom: l.produit_nom,
        quantite: l.quantite,
        prix_unitaire: l.prix_unitaire,
        total_ligne: l.total_ligne,
        unite: l.unite || '',
        details: l.details
      })),
      total: vente.total,
      remise: vente.remise,
      montant_paye: vente.montant_paye,
      monnaie_rendue: vente.monnaie_rendue,
      mode_paiement: vente.mode_paiement,
      paiements: vente.paiements,
      cagnotte_utilisee: Number(vente.cagnotte_utilisee ?? 0),
      portefeuille_utilise: Number(vente.portefeuille_utilise ?? 0),
      monnaie_creditee_wallet: Number(vente.monnaie_creditee_wallet ?? 0),
      points_utilises: Number(vente.points_utilises ?? 0),
      points_gagnes: Number(vente.points_gagnes ?? 0)
    })
    setReprintMsg(r && r.success ? { ok: true, text: 'Ticket réimprimé' } : { ok: false, text: r?.error || 'Échec de la réimpression' })
    setTimeout(() => setReprintMsg(null), 3500)
  }

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-gray-400">
      <RefreshCw size={16} className="animate-spin" /> Chargement…
    </div>
  )
  if (!vente) return <div className="p-6 text-gray-400">Introuvable</div>

  const mode = MODE_LABELS[vente.mode_paiement] ?? { label: vente.mode_paiement, color: 'bg-gray-100 text-gray-600' }

  return (
    <div className="h-full flex flex-col">
<div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="font-mono text-sm text-blue-600 font-bold">{vente.numero_ticket}</div>
            <div className="text-xs text-gray-400">{fmtDate(vente.date)}</div>
            {reprintMsg && (
              <div className={`text-xs font-semibold mt-1 ${reprintMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                {reprintMsg.ok ? '✓ ' : '✗ '}{reprintMsg.text}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={reprint} title="Réimprimer le ticket"
              className="p-2 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-lg transition-colors">
              <Printer size={16} />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={18} /></button>
          </div>
        </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Infos */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Caissier', val: vente.caissier_nom },
            { label: 'Client', val: vente.client_nom ?? 'Sans client' },
            { label: 'Paiement', val: <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${mode.color}`}>{mode.label}</span> },
            { label: 'Montant reçu', val: `${fmt(vente.montant_paye)} FCFA` },
          ].map(r => (
            <div key={r.label} className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">{r.label}</div>
              <div className="font-semibold text-gray-800 text-sm">{r.val}</div>
            </div>
          ))}
        </div>

        {/* Détail des paiements multiples */}
        {(vente.paiements && vente.paiements.length > 0) && (
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">Détail des paiements</div>
            <div className="space-y-1.5">
              {vente.paiements.map((p, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${MODE_LABELS[p.mode]?.color || 'bg-gray-100 text-gray-700'}`}>
                    {MODE_LABELS[p.mode]?.label || p.mode}
                  </span>
                  <span className="font-bold text-gray-800">{fmt(p.montant)} FCFA</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lignes */}
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Articles</div>
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Article','Qté','P.U','Total'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(vente.lignes ?? []).map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5 font-medium text-gray-800">{l.produit_nom}</td>
                    <td className="px-3 py-2.5 text-gray-500">{l.quantite} {l.unite}</td>
                    <td className="px-3 py-2.5 text-gray-500">{fmt(l.prix_unitaire)}</td>
                    <td className="px-3 py-2.5 font-bold text-gray-800">{fmt(l.total_ligne)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totaux */}
        <div className="bg-gray-900 text-white rounded-xl p-4 space-y-2">
          {vente.remise > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Remise</span>
              <span className="text-red-400">-{fmt(vente.remise)} FCFA</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Monnaie rendue</span>
            <span>{fmt(vente.monnaie_rendue)} FCFA</span>
          </div>
          <div className="flex justify-between font-black text-lg pt-1 border-t border-gray-700">
            <span>TOTAL</span>
            <span className="text-amber-400">{fmt(vente.total)} FCFA</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Transactions() {
  const { user } = useAuthStore()
  const isCaissier = user?.role === 'caissier'

  const [unlocked, setUnlocked] = useState(!isCaissier)
  const [ventes, setVentes] = useState<Vente[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState('')
  const [dateDebut, setDateDebut] = useState(() => new Date().toISOString().slice(0, 10))
  const [dateFin, setDateFin] = useState(() => new Date().toISOString().slice(0, 10))
  const [showFilters, setShowFilters] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getVentes(dateDebut, dateFin, 500) as Vente[]
      setVentes(data)
    } catch {}
    setLoading(false)
  }, [dateDebut, dateFin])

  useEffect(() => { if (unlocked) load() }, [unlocked, load])

  if (!unlocked) return <SuperviseurGate onUnlock={() => setUnlocked(true)} />

  const filtered = ventes.filter(v => {
    if (filterMode && v.mode_paiement !== filterMode) return false
    if (search) {
      const q = search.toLowerCase()
      if (!v.numero_ticket.toLowerCase().includes(q) &&
          !v.caissier_nom.toLowerCase().includes(q) &&
          !(v.client_nom ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const totalFiltre = filtered.reduce((s, v) => s + v.total, 0)
  const nbFiltre = filtered.length

  return (
    <div className="flex h-full overflow-hidden">
      {/* ─── Liste ─── */}
      <div className={`flex flex-col flex-1 overflow-hidden ${selectedId ? 'hidden md:flex' : ''}`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 bg-white flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <Receipt size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-gray-900">Transactions</h1>
                <p className="text-xs text-gray-400">{nbFiltre} vente{nbFiltre > 1 ? 's' : ''} · {fmt(totalFiltre)} FCFA</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowFilters(f => !f)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${showFilters ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                <Filter size={14} /> Filtres
              </button>
              <button onClick={load} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Recherche */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Ticket, caissier, client…"
              className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>

          {/* Filtres */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-400" />
                <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                  className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <span className="text-gray-400 text-sm">→</span>
                <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                  className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <select value={filterMode} onChange={e => setFilterMode(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">Tous les modes</option>
                {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button onClick={load}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
                Appliquer
              </button>
            </div>
          )}
        </div>

        {/* Tableau */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
              <RefreshCw size={20} className="animate-spin" /> Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Receipt size={40} className="mb-3 opacity-30" />
              <p className="text-sm">Aucune transaction trouvée</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {['Ticket / Date', 'Caissier', 'Client', 'Mode', 'Total FCFA', 'Remise', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(v => (
                  <VenteRow key={v.id} vente={v} onExpand={id => setSelectedId(id)} />
                ))}
              </tbody>
              <tfoot className="bg-gray-50 sticky bottom-0 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">
                    {nbFiltre} transaction{nbFiltre > 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-gray-900">{fmt(totalFiltre)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* ─── Panneau détail ─── */}
      {selectedId && (
        <div className="w-full md:w-96 border-l border-gray-100 bg-white flex-shrink-0 flex flex-col overflow-hidden">
          <DetailPanel id={selectedId} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  )
}
