import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import {
  getFournisseurs, createFournisseur, updateFournisseur, deleteFournisseur,
  getCommandes, getCommandeById, createCommande, updateCommandeStatut, recevoirCommande, deleteCommande,
  getProduits
} from '@/lib/ipc'
import type { Produit } from '@/types'
import {
  Plus, Edit2, Trash2, X, Phone, Mail, MapPin, User,
  ShoppingBag, Package, Check, ChevronRight, Truck, Clock,
  AlertCircle, RotateCcw, Eye
} from 'lucide-react'

type View = 'fournisseurs' | 'commandes' | 'detail_commande' | 'reception'
type CommandeStatut = 'brouillon' | 'commandé' | 'reçu_partiel' | 'reçu' | 'annulé'

const STATUT_STYLE: Record<CommandeStatut, string> = {
  brouillon: 'bg-gray-100 text-gray-600',
  commandé: 'bg-blue-100 text-blue-700',
  reçu_partiel: 'bg-orange-100 text-orange-700',
  reçu: 'bg-emerald-100 text-emerald-700',
  annulé: 'bg-red-100 text-red-600',
}
const STATUT_ICON: Record<CommandeStatut, JSX.Element> = {
  brouillon: <Clock size={12} />,
  commandé: <Truck size={12} />,
  reçu_partiel: <Package size={12} />,
  reçu: <Check size={12} />,
  annulé: <X size={12} />,
}

const emptyFournisseur = () => ({ nom: '', telephone: '', email: '', adresse: '', contact_nom: '', notes: '' })

export default function Fournisseurs() {
  const { user } = useAuthStore()
  const [view, setView] = useState<View>('fournisseurs')
  const [fournisseurs, setFournisseurs] = useState<any[]>([])
  const [commandes, setCommandes] = useState<any[]>([])
  const [commandeDetail, setCommandeDetail] = useState<any | null>(null)
  const [produits, setProduits] = useState<Produit[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFId, setSelectedFId] = useState<number | null>(null)

  // Modal fournisseur
  const [showFModal, setShowFModal] = useState(false)
  const [editingF, setEditingF] = useState<any | null>(null)
  const [fForm, setFForm] = useState(emptyFournisseur())
  const [savingF, setSavingF] = useState(false)

  // Modal commande
  const [showCModal, setShowCModal] = useState(false)
  const [cForm, setCForm] = useState({ fournisseur_id: '', reference: '', date: new Date().toISOString().slice(0, 10), notes: '' })
  const [cLignes, setCLignes] = useState<{ produit_id: number; produit_nom: string; quantite_commandee: number; prix_achat: number }[]>([])
  const [savingC, setSavingC] = useState(false)
  const [searchProd, setSearchProd] = useState('')

  // Modal réception
  const [showRModal, setShowRModal] = useState(false)
  const [receptions, setReceptions] = useState<{ produit_id: number; produit_nom: string; quantite_commandee: number; quantite_recue: number; prix_achat: number }[]>([])
  const [savingR, setSavingR] = useState(false)
  const [receptionCommandeId, setReceptionCommandeId] = useState<number | null>(null)

  const load = async () => {
    try {
      const [f, c, p] = await Promise.all([getFournisseurs(), getCommandes(), getProduits()])
      setFournisseurs(f.filter((f: any) => f.actif))
      setCommandes(c)
      setProduits(p)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ─── Fournisseur CRUD ────────────────────────────────────────────────────────

  const openCreateF = () => { setEditingF(null); setFForm(emptyFournisseur()); setShowFModal(true) }

  const openEditF = (f: any) => {
    setEditingF(f)
    setFForm({ nom: f.nom, telephone: f.telephone ?? '', email: f.email ?? '', adresse: f.adresse ?? '', contact_nom: f.contact_nom ?? '', notes: f.notes ?? '' })
    setShowFModal(true)
  }

  const handleSaveF = async () => {
    if (!fForm.nom.trim()) return
    setSavingF(true)
    try {
      if (editingF) await updateFournisseur(editingF.id, fForm)
      else await createFournisseur(fForm)
      setShowFModal(false)
      await load()
    } catch {}
    setSavingF(false)
  }

  const handleDeleteF = async (id: number) => {
    if (!confirm('Archiver ce fournisseur ?')) return
    await deleteFournisseur(id)
    await load()
  }

  // ─── Commande ────────────────────────────────────────────────────────────────

  const openCreateC = () => {
    setCForm({ fournisseur_id: fournisseurs[0]?.id?.toString() ?? '', reference: '', date: new Date().toISOString().slice(0, 10), notes: '' })
    setCLignes([])
    setShowCModal(true)
  }

  const addLigne = (prod: Produit) => {
    if (cLignes.find(l => l.produit_id === prod.id)) return
    setCLignes(ls => [...ls, { produit_id: prod.id, produit_nom: prod.nom, quantite_commandee: 1, prix_achat: prod.prix_achat }])
    setSearchProd('')
  }

  const handleSaveC = async () => {
    if (!cForm.fournisseur_id || cLignes.length === 0) return
    setSavingC(true)
    try {
      await createCommande({
        fournisseur_id: parseInt(cForm.fournisseur_id),
        reference: cForm.reference || undefined,
        date: cForm.date,
        notes: cForm.notes || undefined,
        user_id: user?.id,
        lignes: cLignes.map(l => ({ produit_id: l.produit_id, quantite_commandee: l.quantite_commandee, prix_achat: l.prix_achat }))
      })
      setShowCModal(false)
      await load()
    } catch {}
    setSavingC(false)
  }

  const openReception = async (commande: any) => {
    const detail = await getCommandeById(commande.id)
    if (!detail) return
    setReceptionCommandeId(commande.id)
    setReceptions(detail.lignes.map((l: any) => ({
      produit_id: l.produit_id,
      produit_nom: l.produit_nom,
      quantite_commandee: Number(l.quantite_commandee),
      quantite_recue: Number(l.quantite_commandee) - Number(l.quantite_recue),
      prix_achat: Number(l.prix_achat)
    })))
    setShowRModal(true)
  }

  const handleSaveR = async () => {
    if (!receptionCommandeId) return
    setSavingR(true)
    try {
      await recevoirCommande(receptionCommandeId, receptions, user?.id)
      setShowRModal(false)
      await load()
    } catch {}
    setSavingR(false)
  }

  const openDetail = async (commande: any) => {
    const d = await getCommandeById(commande.id)
    setCommandeDetail(d)
    setView('detail_commande')
  }

  const filteredCommandes = selectedFId ? commandes.filter(c => c.fournisseur_id === selectedFId) : commandes
  const filteredProduits = searchProd.trim()
    ? produits.filter(p => p.nom.toLowerCase().includes(searchProd.toLowerCase()))
    : produits.slice(0, 10)

  const totalCommande = cLignes.reduce((s, l) => s + l.quantite_commandee * l.prix_achat, 0)

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
    </div>
  )

  // ─── VUE DÉTAIL COMMANDE ─────────────────────────────────────────────────────
  if (view === 'detail_commande' && commandeDetail) {
    return (
      <div className="p-4 md:p-6 h-full overflow-y-auto">
        <button onClick={() => setView('commandes')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4">
          ← Retour aux commandes
        </button>
        <div className="bg-white rounded-2xl shadow-card p-6 max-w-3xl">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Commande #{commandeDetail.id}</h2>
              {commandeDetail.reference && <p className="text-sm text-gray-500">Réf : {commandeDetail.reference}</p>}
              <p className="text-sm text-gray-500">Fournisseur : <span className="font-medium text-gray-800">{commandeDetail.fournisseur_nom}</span></p>
              <p className="text-sm text-gray-500">Date : {commandeDetail.date}</p>
            </div>
            <span className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold ${STATUT_STYLE[commandeDetail.statut as CommandeStatut]}`}>
              {STATUT_ICON[commandeDetail.statut as CommandeStatut]}
              {commandeDetail.statut.replace('_', ' ')}
            </span>
          </div>

          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-2 font-semibold text-gray-600">Article</th>
                <th className="text-right pb-2 font-semibold text-gray-600">Commandé</th>
                <th className="text-right pb-2 font-semibold text-gray-600">Reçu</th>
                <th className="text-right pb-2 font-semibold text-gray-600">Prix achat</th>
                <th className="text-right pb-2 font-semibold text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {commandeDetail.lignes.map((l: any) => (
                <tr key={l.id}>
                  <td className="py-2 font-medium text-gray-800">{l.produit_nom}</td>
                  <td className="py-2 text-right text-gray-600">{l.quantite_commandee} {l.unite}</td>
                  <td className={`py-2 text-right font-medium ${Number(l.quantite_recue) >= Number(l.quantite_commandee) ? 'text-emerald-600' : Number(l.quantite_recue) > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                    {l.quantite_recue} {l.unite}
                  </td>
                  <td className="py-2 text-right text-gray-600">{Number(l.prix_achat).toLocaleString('fr-FR')} F</td>
                  <td className="py-2 text-right font-semibold">{Number(l.total_ligne).toLocaleString('fr-FR')} F</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300">
                <td colSpan={4} className="pt-3 font-bold text-gray-800 text-right">Total</td>
                <td className="pt-3 font-bold text-blue-700 text-right text-base">{Number(commandeDetail.total).toLocaleString('fr-FR')} F</td>
              </tr>
            </tfoot>
          </table>

          {commandeDetail.notes && (
            <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
              <p className="font-medium mb-1">Notes :</p>
              <p>{commandeDetail.notes}</p>
            </div>
          )}

          {['brouillon', 'commandé', 'reçu_partiel'].includes(commandeDetail.statut) && (
            <div className="flex gap-3 mt-6">
              {commandeDetail.statut === 'brouillon' && (
                <button
                  onClick={async () => { await updateCommandeStatut(commandeDetail.id, 'commandé'); await load(); setView('commandes') }}
                  className="btn btn-primary flex items-center gap-2"
                >
                  <Truck size={16} /> Marquer Commandé
                </button>
              )}
              <button
                onClick={() => { openReception(commandeDetail); setView('commandes') }}
                className="btn bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
              >
                <Package size={16} /> Réceptionner
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── VUE PRINCIPALE ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header + onglets */}
      <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900">Fournisseurs & Commandes</h1>
          <div className="flex gap-2">
            {view === 'fournisseurs' && (
              <button onClick={openCreateF} className="btn btn-primary flex items-center gap-2 text-sm">
                <Plus size={16} /> Fournisseur
              </button>
            )}
            {view === 'commandes' && (
              <button onClick={openCreateC} className="btn btn-primary flex items-center gap-2 text-sm">
                <Plus size={16} /> Commande
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {(['fournisseurs', 'commandes'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${view === v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {v === 'fournisseurs' ? `Fournisseurs (${fournisseurs.length})` : `Commandes (${commandes.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* ─── ONGLET FOURNISSEURS ──────────────────────────────────────────── */}
        {view === 'fournisseurs' && (
          fournisseurs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <Truck size={48} className="mb-3 opacity-30" />
              <p className="text-lg font-medium">Aucun fournisseur</p>
              <p className="text-sm mt-1">Ajoutez votre premier fournisseur</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fournisseurs.map(f => {
                const nbCommandes = commandes.filter(c => c.fournisseur_id === f.id).length
                return (
                  <div key={f.id} className="bg-white rounded-2xl shadow-card p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">{f.nom}</h3>
                        {f.contact_nom && <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5"><User size={12} />{f.contact_nom}</p>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditF(f)} className="p-1.5 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-lg"><Edit2 size={15} /></button>
                        <button onClick={() => handleDeleteF(f.id)} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg"><Trash2 size={15} /></button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-gray-500 mb-4">
                      {f.telephone && <p className="flex items-center gap-1.5"><Phone size={13} />{f.telephone}</p>}
                      {f.email && <p className="flex items-center gap-1.5"><Mail size={13} />{f.email}</p>}
                      {f.adresse && <p className="flex items-center gap-1.5"><MapPin size={13} />{f.adresse}</p>}
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                      <span className="text-xs text-gray-400">{nbCommandes} commande(s)</span>
                      <button
                        onClick={() => { setSelectedFId(f.id); setView('commandes') }}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Voir commandes <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ─── ONGLET COMMANDES ─────────────────────────────────────────────── */}
        {view === 'commandes' && (
          <div>
            {/* Filtre fournisseur */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                onClick={() => setSelectedFId(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${!selectedFId ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Tous
              </button>
              {fournisseurs.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFId(f.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedFId === f.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {f.nom}
                </button>
              ))}
            </div>

            {filteredCommandes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <ShoppingBag size={48} className="mb-3 opacity-30" />
                <p>Aucune commande</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Fournisseur</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Total</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCommandes.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-gray-500">#{c.id}{c.reference ? ` · ${c.reference}` : ''}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{c.fournisseur_nom}</td>
                        <td className="px-4 py-3 text-gray-500">{c.date}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUT_STYLE[c.statut as CommandeStatut]}`}>
                            {STATUT_ICON[c.statut as CommandeStatut]}
                            {c.statut.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{Number(c.total).toLocaleString('fr-FR')} F</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openDetail(c)} className="p-1.5 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-lg" title="Détail"><Eye size={15} /></button>
                            {['brouillon', 'commandé', 'reçu_partiel'].includes(c.statut) && (
                              <button onClick={() => openReception(c)} className="p-1.5 hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 rounded-lg" title="Réceptionner"><Package size={15} /></button>
                            )}
                            {c.statut === 'brouillon' && (
                              <button onClick={() => deleteCommande(c.id).then(load)} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg"><Trash2 size={15} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── MODAL FOURNISSEUR ──────────────────────────────────────────────────── */}
      {showFModal && (
        <div className="modal-overlay">
          <div className="modal-content w-full max-w-lg">
            <div className="bg-blue-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-bold text-lg">{editingF ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h2>
              <button onClick={() => setShowFModal(false)} className="p-1.5 hover:bg-blue-700 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                <input type="text" value={fForm.nom} onChange={e => setFForm(f => ({ ...f, nom: e.target.value }))} className="input w-full" placeholder="Nom du fournisseur" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                  <input type="tel" value={fForm.telephone} onChange={e => setFForm(f => ({ ...f, telephone: e.target.value }))} className="input w-full" placeholder="+225 xx xx xx xx" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={fForm.email} onChange={e => setFForm(f => ({ ...f, email: e.target.value }))} className="input w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact (nom)</label>
                <input type="text" value={fForm.contact_nom} onChange={e => setFForm(f => ({ ...f, contact_nom: e.target.value }))} className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                <input type="text" value={fForm.adresse} onChange={e => setFForm(f => ({ ...f, adresse: e.target.value }))} className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={fForm.notes} onChange={e => setFForm(f => ({ ...f, notes: e.target.value }))} className="input w-full h-20 resize-none" />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowFModal(false)} className="flex-1 btn btn-secondary">Annuler</button>
              <button onClick={handleSaveF} disabled={savingF || !fForm.nom.trim()} className="flex-1 btn btn-primary">
                {savingF ? 'Enregistrement...' : editingF ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL COMMANDE ─────────────────────────────────────────────────────── */}
      {showCModal && (
        <div className="modal-overlay">
          <div className="modal-content w-full max-w-2xl">
            <div className="bg-indigo-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-bold text-lg">Nouvelle commande fournisseur</h2>
              <button onClick={() => setShowCModal(false)} className="p-1.5 hover:bg-indigo-700 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur *</label>
                  <select value={cForm.fournisseur_id} onChange={e => setCForm(f => ({ ...f, fournisseur_id: e.target.value }))} className="input w-full">
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input type="date" value={cForm.date} onChange={e => setCForm(f => ({ ...f, date: e.target.value }))} className="input w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Référence (optionnel)</label>
                <input type="text" value={cForm.reference} onChange={e => setCForm(f => ({ ...f, reference: e.target.value }))} className="input w-full" placeholder="N° bon de commande..." />
              </div>

              {/* Ajout articles */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Articles</label>
                <input
                  type="text"
                  value={searchProd}
                  onChange={e => setSearchProd(e.target.value)}
                  className="input w-full mb-2"
                  placeholder="Rechercher un article à commander..."
                />
                {searchProd && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden mb-3 max-h-40 overflow-y-auto">
                    {filteredProduits.map(p => (
                      <button key={p.id} onClick={() => addLigne(p)} className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm flex items-center justify-between">
                        <span>{p.nom}</span>
                        <span className="text-xs text-gray-400">{p.prix_achat.toLocaleString('fr-FR')} F/{p.unite}</span>
                      </button>
                    ))}
                  </div>
                )}

                {cLignes.length > 0 && (
                  <div className="space-y-2">
                    {cLignes.map((l, i) => (
                      <div key={l.produit_id} className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl">
                        <span className="flex-1 text-sm font-medium text-gray-800 truncate">{l.produit_nom}</span>
                        <div className="flex items-center gap-1">
                          <label className="text-xs text-gray-500">Qté</label>
                          <input type="number" min="0.1" step="0.1" value={l.quantite_commandee}
                            onChange={e => setCLignes(ls => ls.map((x, j) => j === i ? { ...x, quantite_commandee: Number(e.target.value) } : x))}
                            className="input w-20 text-center text-sm py-1" />
                        </div>
                        <div className="flex items-center gap-1">
                          <label className="text-xs text-gray-500">P.achat</label>
                          <input type="number" min="0" value={l.prix_achat}
                            onChange={e => setCLignes(ls => ls.map((x, j) => j === i ? { ...x, prix_achat: Number(e.target.value) } : x))}
                            className="input w-24 text-center text-sm py-1" />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 w-20 text-right">
                          {(l.quantite_commandee * l.prix_achat).toLocaleString('fr-FR')} F
                        </span>
                        <button onClick={() => setCLignes(ls => ls.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-500">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="text-right font-bold text-gray-900 text-sm pt-1">
                      Total : {totalCommande.toLocaleString('fr-FR')} FCFA
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={cForm.notes} onChange={e => setCForm(f => ({ ...f, notes: e.target.value }))} className="input w-full h-16 resize-none" />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowCModal(false)} className="flex-1 btn btn-secondary">Annuler</button>
              <button onClick={handleSaveC} disabled={savingC || !cForm.fournisseur_id || cLignes.length === 0} className="flex-1 btn btn-primary">
                {savingC ? 'Création...' : 'Créer la commande'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL RÉCEPTION ────────────────────────────────────────────────────── */}
      {showRModal && (
        <div className="modal-overlay">
          <div className="modal-content w-full max-w-lg">
            <div className="bg-emerald-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-bold text-lg">Réception de commande</h2>
              <button onClick={() => setShowRModal(false)} className="p-1.5 hover:bg-emerald-700 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
              <p className="text-sm text-gray-500 flex items-center gap-1"><AlertCircle size={14} />Entrez les quantités réellement reçues. Le stock sera mis à jour automatiquement.</p>
              {receptions.map((r, i) => (
                <div key={r.produit_id} className="bg-gray-50 rounded-xl p-3">
                  <p className="font-medium text-gray-800 mb-2">{r.produit_nom}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Commandé</label>
                      <div className="text-sm font-semibold text-gray-700 py-2 px-3 bg-white rounded-lg border border-gray-200">{r.quantite_commandee}</div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Reçu *</label>
                      <input type="number" min="0" step="0.1" value={r.quantite_recue}
                        onChange={e => setReceptions(rs => rs.map((x, j) => j === i ? { ...x, quantite_recue: Number(e.target.value) } : x))}
                        className="input w-full py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Prix achat</label>
                      <input type="number" min="0" value={r.prix_achat}
                        onChange={e => setReceptions(rs => rs.map((x, j) => j === i ? { ...x, prix_achat: Number(e.target.value) } : x))}
                        className="input w-full py-1.5 text-sm" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowRModal(false)} className="flex-1 btn btn-secondary">Annuler</button>
              <button onClick={handleSaveR} disabled={savingR} className="flex-1 btn bg-emerald-600 hover:bg-emerald-700 text-white">
                {savingR ? 'Traitement...' : 'Valider la réception'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
