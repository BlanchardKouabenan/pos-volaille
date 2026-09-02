import { useState, useEffect } from 'react'
import { entrepotGetAll, entrepotCreate, entrepotUpdate, entrepotDelete,
  entrepotGetStock, transfertGetAll, transfertCreate, transfertValider, transfertAnnuler,
  getProduits } from '@/lib/ipc'
import { useAuthStore } from '@/store/authStore'
import { Warehouse, ArrowRight, Plus, Check, X, Edit2, Trash2, Package, RefreshCw, AlertTriangle } from 'lucide-react'
import type { Produit } from '@/types'

const fmtN = (v: any) => Math.round(Number(v ?? 0)).toLocaleString('fr-FR')

type View = 'entrepots' | 'stock' | 'transferts' | 'nouveau_transfert'
const STATUT_STYLE: Record<string, string> = {
  en_attente: 'bg-yellow-100 text-yellow-700',
  validé: 'bg-emerald-100 text-emerald-700',
  annulé: 'bg-red-100 text-red-600',
}

export default function Entrepots() {
  const { user } = useAuthStore()
  const [view, setView] = useState<View>('entrepots')
  const [entrepots, setEntrepots] = useState<any[]>([])
  const [transferts, setTransferts] = useState<any[]>([])
  const [stock, setStock] = useState<any[]>([])
  const [selectedEntrepot, setSelectedEntrepot] = useState<number | undefined>()
  const [produits, setProduits] = useState<Produit[]>([])
  const [loading, setLoading] = useState(true)

  // Modal entrepôt
  const [showEntModal, setShowEntModal] = useState(false)
  const [editingEnt, setEditingEnt] = useState<any>(null)
  const [entForm, setEntForm] = useState({ nom: '', adresse: '', responsable: '' })
  const [entError, setEntError] = useState('')
  const [saving, setSaving] = useState(false)

  // Nouveau transfert
  const [tSource, setTSource] = useState('')
  const [tDest, setTDest] = useState('')
  const [tNotes, setTNotes] = useState('')
  const [tLignes, setTLignes] = useState<{ produit_id: number; nom: string; unite: string; quantite: number; stock_dispo: number }[]>([])
  const [tError, setTError] = useState('')
  const [tSaving, setTSaving] = useState(false)

  const load = async () => {
    try {
      const [e, t] = await Promise.all([entrepotGetAll(), transfertGetAll()])
      setEntrepots(e); setTransferts(t)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (view === 'stock') {
      entrepotGetStock(selectedEntrepot).then(setStock).catch(() => {})
    }
    if (view === 'nouveau_transfert') {
      getProduits().then(p => setProduits(p as Produit[])).catch(() => {})
    }
  }, [view, selectedEntrepot])

  // Quand source change dans nouveau transfert, charger le stock dispo
  useEffect(() => {
    if (!tSource || view !== 'nouveau_transfert') return
    entrepotGetStock(Number(tSource)).then(s => {
      setTLignes(prev => prev.map(l => ({
        ...l,
        stock_dispo: Number(s.find((x: any) => x.produit_id === l.produit_id)?.quantite ?? 0)
      })))
    }).catch(() => {})
  }, [tSource])

  const addLigne = (p: Produit) => {
    if (tLignes.find(l => l.produit_id === p.id)) return
    setTLignes(prev => [...prev, { produit_id: p.id, nom: p.nom, unite: p.unite, quantite: 1, stock_dispo: 0 }])
    if (tSource) {
      entrepotGetStock(Number(tSource)).then(s => {
        const st = Number(s.find((x: any) => x.produit_id === p.id)?.quantite ?? 0)
        setTLignes(prev => prev.map(l => l.produit_id === p.id ? { ...l, stock_dispo: st } : l))
      }).catch(() => {})
    }
  }

  const handleSaveEnt = async () => {
    if (!entForm.nom.trim()) { setEntError('Nom requis'); return }
    setSaving(true); setEntError('')
    try {
      if (editingEnt) await entrepotUpdate(editingEnt.id, entForm)
      else await entrepotCreate(entForm)
      setShowEntModal(false); await load()
    } catch (e: any) { setEntError(e.message) }
    setSaving(false)
  }

  const handleDeleteEnt = async (e: any) => {
    if (!confirm(`Désactiver "${e.nom}" ?`)) return
    const r = await entrepotDelete(e.id)
    if ((r as any)?.error) { alert((r as any).error); return }
    await load()
  }

  const handleValider = async (id: number) => {
    if (!confirm('Valider ce transfert de stock ?')) return
    const r = await transfertValider(id)
    if ((r as any)?.error) { alert((r as any).error); return }
    await load()
  }

  const handleAnnuler = async (id: number) => {
    if (!confirm('Annuler ce transfert ?')) return
    await transfertAnnuler(id); await load()
  }

  const handleCreateTransfert = async () => {
    if (!tSource || !tDest) { setTError('Sélectionnez source et destination'); return }
    if (Number(tSource) === Number(tDest)) { setTError('Source et destination identiques'); return }
    if (!tLignes.length) { setTError('Ajoutez au moins un produit'); return }
    const invalid = tLignes.find(l => l.quantite <= 0 || l.quantite > l.stock_dispo)
    if (invalid) { setTError(`Quantité invalide pour "${invalid.nom}" (dispo: ${fmtN(invalid.stock_dispo)})`); return }
    setTSaving(true); setTError('')
    const r = await transfertCreate({
      entrepot_source_id: Number(tSource),
      entrepot_dest_id: Number(tDest),
      notes: tNotes,
      user_id: user?.id,
      lignes: tLignes.map(l => ({ produit_id: l.produit_id, quantite: l.quantite }))
    })
    if ((r as any)?.error) { setTError((r as any).error); setTSaving(false); return }
    setTSource(''); setTDest(''); setTLignes([]); setTNotes('')
    setView('transferts'); await load()
    setTSaving(false)
  }

  const [prodSearch, setProdSearch] = useState('')
  const filteredProds = produits.filter(p => p.nom.toLowerCase().includes(prodSearch.toLowerCase())).slice(0, 20)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center">
            <Warehouse size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Entrepôts & Transferts</h1>
            <p className="text-gray-500 text-sm">Gestion multi-entrepôts et mouvements inter-sites</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(['entrepots','stock','transferts'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all capitalize ${view === v ? 'bg-sky-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {v === 'entrepots' ? '🏭 Entrepôts' : v === 'stock' ? '📦 Stock' : '↔️ Transferts'}
            </button>
          ))}
        </div>
      </div>

      {/* ── VUE ENTREPÔTS ───────────────────────────────────────────────────── */}
      {view === 'entrepots' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingEnt(null); setEntForm({ nom: '', adresse: '', responsable: '' }); setEntError(''); setShowEntModal(true) }}
              className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-sky-700">
              <Plus size={16} /> Nouvel entrepôt
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading ? (
              <div className="col-span-3 flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : entrepots.map(e => (
              <div key={e.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Warehouse size={18} className="text-sky-600" />
                    <span className="font-bold text-gray-800">{e.nom}</span>
                    {e.id === 1 && <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">Principal</span>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingEnt(e); setEntForm({ nom: e.nom, adresse: e.adresse ?? '', responsable: e.responsable ?? '' }); setShowEntModal(true) }}
                      className="p-1.5 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-lg"><Edit2 size={14} /></button>
                    {e.id !== 1 && <button onClick={() => handleDeleteEnt(e)}
                      className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>}
                  </div>
                </div>
                {e.adresse && <p className="text-sm text-gray-500 mb-1">📍 {e.adresse}</p>}
                {e.responsable && <p className="text-sm text-gray-500 mb-3">👤 {e.responsable}</p>}
                <button onClick={() => { setSelectedEntrepot(e.id); setView('stock') }}
                  className="w-full text-sm text-sky-600 border border-sky-200 rounded-xl py-2 hover:bg-sky-50 flex items-center justify-center gap-1.5 font-medium">
                  <Package size={14} /> Voir le stock
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── VUE STOCK ───────────────────────────────────────────────────────── */}
      {view === 'stock' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select value={selectedEntrepot ?? ''} onChange={e => setSelectedEntrepot(e.target.value ? Number(e.target.value) : undefined)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300">
              <option value="">Tous les entrepôts (consolidé)</option>
              {entrepots.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
            <button onClick={() => entrepotGetStock(selectedEntrepot).then(setStock).catch(() => {})}
              className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50">
              <RefreshCw size={14} /> Actualiser
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Produit</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Catégorie</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Stock</th>
                  {!selectedEntrepot && <th className="px-4 py-3 text-left font-semibold text-gray-600 hidden lg:table-cell">Répartition</th>}
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stock.map((s: any, i) => {
                  const qte = Number(s.quantite ?? s.stock_total ?? 0)
                  const min = Number(s.stock_minimum ?? 0)
                  const isLow = min > 0 && qte <= min
                  return (
                    <tr key={i} className={`hover:bg-gray-50 ${isLow ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{s.nom}</td>
                      <td className="px-4 py-3 text-gray-500">{s.categorie || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800">
                        {fmtN(qte)} <span className="text-gray-400 font-normal">{s.unite}</span>
                      </td>
                      {!selectedEntrepot && (
                        <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell">
                          {s.detail_entrepots || '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        {isLow
                          ? <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                              <AlertTriangle size={10} /> Bas
                            </span>
                          : <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">OK</span>}
                      </td>
                    </tr>
                  )
                })}
                {!stock.length && (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400">Aucun stock</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── VUE TRANSFERTS ──────────────────────────────────────────────────── */}
      {view === 'transferts' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setView('nouveau_transfert')}
              className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-sky-700">
              <ArrowRight size={16} /> Nouveau transfert
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Référence</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Source → Destination</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Articles</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Statut</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transferts.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{t.reference}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{t.source_nom}</span>
                      <ArrowRight size={12} className="inline mx-1 text-gray-400" />
                      <span className="font-medium text-gray-800">{t.dest_nom}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{t.nb_lignes} art.</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUT_STYLE[t.statut] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(t.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.statut === 'en_attente' && (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleValider(t.id)}
                            className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1.5 rounded-lg hover:bg-emerald-200 font-medium">
                            <Check size={12} /> Valider
                          </button>
                          <button onClick={() => handleAnnuler(t.id)}
                            className="flex items-center gap-1 text-xs bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-200 font-medium">
                            <X size={12} /> Annuler
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!transferts.length && (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucun transfert</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── NOUVEAU TRANSFERT ────────────────────────────────────────────────── */}
      {view === 'nouveau_transfert' && (
        <div className="space-y-4 max-w-2xl">
          <button onClick={() => setView('transferts')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            ← Retour
          </button>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="font-bold text-gray-800 text-lg">Nouveau transfert de stock</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Source *</label>
                <select value={tSource} onChange={e => setTSource(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300">
                  <option value="">— Choisir —</option>
                  {entrepots.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Destination *</label>
                <select value={tDest} onChange={e => setTDest(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300">
                  <option value="">— Choisir —</option>
                  {entrepots.filter(e => String(e.id) !== tSource).map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>
            </div>

            {/* Recherche produits */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Ajouter un produit</label>
              <input value={prodSearch} onChange={e => setProdSearch(e.target.value)}
                placeholder="Rechercher un produit..."
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 mb-2" />
              {prodSearch && (
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                  {filteredProds.map(p => (
                    <button key={p.id} onClick={() => { addLigne(p); setProdSearch('') }}
                      disabled={!!tLignes.find(l => l.produit_id === p.id)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-sky-50 flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed">
                      <span>{p.nom}</span>
                      <span className="text-gray-400 text-xs">{p.unite}</span>
                    </button>
                  ))}
                  {!filteredProds.length && <p className="text-center py-3 text-gray-400 text-sm">Aucun résultat</p>}
                </div>
              )}
            </div>

            {/* Lignes */}
            {tLignes.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Produits à transférer</label>
                {tLignes.map((l, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                    <span className="flex-1 text-sm font-medium text-gray-800">{l.nom}</span>
                    <span className="text-xs text-gray-400">Dispo: {fmtN(l.stock_dispo)} {l.unite}</span>
                    <input type="number" min={0.01} max={l.stock_dispo} step={0.01}
                      value={l.quantite}
                      onChange={e => setTLignes(prev => prev.map((x, j) => j === i ? { ...x, quantite: Number(e.target.value) } : x))}
                      className="w-20 border rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sky-300" />
                    <span className="text-xs text-gray-400">{l.unite}</span>
                    <button onClick={() => setTLignes(prev => prev.filter((_, j) => j !== i))}
                      className="p-1 text-gray-400 hover:text-red-500 rounded"><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Notes</label>
              <input value={tNotes} onChange={e => setTNotes(e.target.value)} placeholder="Motif du transfert..."
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
            </div>

            {tError && <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} />{tError}</p>}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setView('transferts')}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleCreateTransfert} disabled={tSaving}
                className="flex-1 py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {tSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                Créer le transfert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal entrepôt */}
      {showEntModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg">{editingEnt ? 'Modifier' : 'Nouvel entrepôt'}</h3>
              <button onClick={() => setShowEntModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {[
                { key: 'nom', label: 'Nom *', placeholder: 'Ex: Entrepôt Abobo' },
                { key: 'adresse', label: 'Adresse', placeholder: 'Quartier, ville...' },
                { key: 'responsable', label: 'Responsable', placeholder: 'Nom du responsable' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-sm font-medium text-gray-700 block mb-1">{f.label}</label>
                  <input value={(entForm as any)[f.key]} onChange={e => setEntForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
              ))}
              {entError && <p className="text-sm text-red-600">{entError}</p>}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowEntModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Annuler</button>
              <button onClick={handleSaveEnt} disabled={saving}
                className="flex-1 py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                {editingEnt ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
