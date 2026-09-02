import { useState, useEffect } from 'react'
import { getPromotions, createPromotion, updatePromotion, deletePromotion, getProduits, getCategories } from '@/lib/ipc'
import type { Produit, Categorie } from '@/types'
import { Plus, Edit2, Trash2, X, Tag, Percent, Minus, DollarSign, Package, ChevronDown, ToggleLeft, ToggleRight, Calendar } from 'lucide-react'

type PromoType = 'pourcentage' | 'montant_fixe' | 'prix_special' | 'quantite'

interface Promotion {
  id: number
  nom: string
  type: PromoType
  valeur: number
  quantite_min: number
  produit_id: number | null
  categorie_id: number | null
  produit_nom?: string
  categorie_nom?: string
  date_debut: string | null
  date_fin: string | null
  actif: number
  created_at: string
}

const TYPE_LABELS: Record<PromoType, string> = {
  pourcentage: '% Remise',
  montant_fixe: 'Montant fixe',
  prix_special: 'Prix spécial',
  quantite: 'Quantité min',
}

const TYPE_ICONS: Record<PromoType, JSX.Element> = {
  pourcentage: <Percent size={14} />,
  montant_fixe: <Minus size={14} />,
  prix_special: <Tag size={14} />,
  quantite: <Package size={14} />,
}

const TYPE_COLORS: Record<PromoType, string> = {
  pourcentage: 'bg-orange-100 text-orange-700',
  montant_fixe: 'bg-blue-100 text-blue-700',
  prix_special: 'bg-purple-100 text-purple-700',
  quantite: 'bg-emerald-100 text-emerald-700',
}

const emptyForm = (): Omit<Promotion, 'id' | 'produit_nom' | 'categorie_nom' | 'created_at'> => ({
  nom: '', type: 'pourcentage', valeur: 10, quantite_min: 1,
  produit_id: null, categorie_id: null, date_debut: null, date_fin: null, actif: 1
})

export default function Promotions() {
  const [promos, setPromos] = useState<Promotion[]>([])
  const [produits, setProduits] = useState<Produit[]>([])
  const [categories, setCategories] = useState<Categorie[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [filterActif, setFilterActif] = useState<'tous' | '1' | '0'>('tous')

  const load = async () => {
    try {
      const [p, prod, cats] = await Promise.all([getPromotions(), getProduits(), getCategories()])
      setPromos(p as Promotion[])
      setProduits(prod)
      setCategories(cats)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setShowModal(true)
  }

  const openEdit = (p: Promotion) => {
    setEditing(p)
    setForm({
      nom: p.nom, type: p.type, valeur: p.valeur, quantite_min: p.quantite_min,
      produit_id: p.produit_id, categorie_id: p.categorie_id,
      date_debut: p.date_debut, date_fin: p.date_fin, actif: p.actif
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.nom.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await updatePromotion(editing.id, form)
      } else {
        await createPromotion(form)
      }
      setShowModal(false)
      await load()
    } catch {}
    setSaving(false)
  }

  const handleToggle = async (p: Promotion) => {
    await updatePromotion(p.id, { actif: p.actif ? 0 : 1 })
    await load()
  }

  const handleDelete = async (id: number) => {
    await deletePromotion(id)
    setDeleteId(null)
    await load()
  }

  const filtered = promos.filter(p => filterActif === 'tous' ? true : String(p.actif) === filterActif)

  const today = new Date().toISOString().slice(0, 10)
  const isExpired = (p: Promotion) => p.date_fin && p.date_fin < today
  const isNotStarted = (p: Promotion) => p.date_debut && p.date_debut > today

  const formatValeur = (p: Promotion) => {
    switch (p.type) {
      case 'pourcentage': return `-${p.valeur}%`
      case 'montant_fixe': return `-${p.valeur.toLocaleString('fr-FR')} F`
      case 'prix_special': return `${p.valeur.toLocaleString('fr-FR')} F`
      case 'quantite': return `min ${p.quantite_min} pcs`
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
    </div>
  )

  return (
    <div className="p-4 md:p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Promotions</h1>
          <p className="text-sm text-gray-500 mt-0.5">{promos.length} promotion(s) configurée(s)</p>
        </div>
        <button onClick={openCreate} className="btn btn-primary flex items-center gap-2">
          <Plus size={18} /> Nouvelle promo
        </button>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 mb-5">
        {(['tous', '1', '0'] as const).map(v => (
          <button
            key={v}
            onClick={() => setFilterActif(v)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              filterActif === v
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {v === 'tous' ? 'Toutes' : v === '1' ? '✅ Actives' : '⏸ Inactives'}
          </button>
        ))}
      </div>

      {/* Liste promos */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Tag size={48} className="mb-3 opacity-30" />
          <p className="text-lg font-medium">Aucune promotion</p>
          <p className="text-sm mt-1">Créez votre première promotion avec le bouton ci-dessus</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const expired = isExpired(p)
            const notStarted = isNotStarted(p)
            const status = !p.actif ? 'inactive' : expired ? 'expired' : notStarted ? 'pending' : 'active'
            const statusStyle = {
              active: 'border-emerald-200 bg-emerald-50/50',
              inactive: 'border-gray-200 bg-gray-50/50',
              expired: 'border-red-100 bg-red-50/30',
              pending: 'border-blue-200 bg-blue-50/30',
            }[status]

            return (
              <div key={p.id} className={`rounded-2xl border-2 p-4 transition-all ${statusStyle}`}>
                {/* Top row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{p.nom}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${TYPE_COLORS[p.type]}`}>
                      {TYPE_ICONS[p.type]} {TYPE_LABELS[p.type]}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl font-bold text-orange-600">{formatValeur(p)}</p>
                    {p.type === 'quantite' && p.quantite_min > 1 && (
                      <p className="text-xs text-gray-500">à partir de {p.quantite_min}</p>
                    )}
                  </div>
                </div>

                {/* Portée */}
                <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                  <Package size={12} />
                  {p.produit_nom
                    ? <span className="font-medium text-gray-700">{p.produit_nom}</span>
                    : p.categorie_nom
                      ? <span>Catégorie : <span className="font-medium text-gray-700">{p.categorie_nom}</span></span>
                      : <span className="text-emerald-600 font-medium">Tous les articles</span>
                  }
                </div>

                {/* Dates */}
                {(p.date_debut || p.date_fin) && (
                  <div className="text-xs text-gray-400 mb-3 flex items-center gap-1">
                    <Calendar size={11} />
                    {p.date_debut && <span>Du {p.date_debut}</span>}
                    {p.date_fin && <span>{p.date_debut ? ' au' : 'Jusqu\'au'} {p.date_fin}</span>}
                  </div>
                )}

                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                    status === 'expired' ? 'bg-red-100 text-red-600' :
                    status === 'pending' ? 'bg-blue-100 text-blue-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {status === 'active' ? '● Actif' : status === 'expired' ? '✕ Expiré' : status === 'pending' ? '⏰ À venir' : '⏸ Inactif'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button onClick={() => handleToggle(p)} className="p-1.5 rounded-lg hover:bg-white/80 text-gray-500 hover:text-orange-600 transition-colors" title={p.actif ? 'Désactiver' : 'Activer'}>
                      {p.actif ? <ToggleRight size={18} className="text-emerald-600" /> : <ToggleLeft size={18} />}
                    </button>
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-white/80 text-gray-500 hover:text-blue-600 transition-colors">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => setDeleteId(p.id)} className="p-1.5 rounded-lg hover:bg-white/80 text-gray-500 hover:text-red-600 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── MODAL CRÉATION / ÉDITION ─────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content w-full max-w-lg">
            <div className="bg-orange-500 text-white p-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-bold text-lg">{editing ? 'Modifier la promotion' : 'Nouvelle promotion'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-orange-600 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              {/* Nom */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la promotion *</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Ex: Soldes été, -20% poulet..."
                  className="input w-full"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type de remise *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(TYPE_LABELS) as PromoType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                        form.type === t
                          ? 'border-orange-400 bg-orange-50 text-orange-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {TYPE_ICONS[t]} {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Valeur */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {form.type === 'pourcentage' ? 'Remise (%)' :
                     form.type === 'montant_fixe' ? 'Montant (FCFA)' :
                     form.type === 'prix_special' ? 'Prix promo (FCFA)' : 'Valeur'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.valeur}
                    onChange={e => setForm(f => ({ ...f, valeur: Number(e.target.value) }))}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantité minimum</label>
                  <input
                    type="number"
                    min="1"
                    value={form.quantite_min}
                    onChange={e => setForm(f => ({ ...f, quantite_min: Number(e.target.value) }))}
                    className="input w-full"
                  />
                </div>
              </div>

              {/* Portée */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Portée</label>
                <div className="space-y-2">
                  <div>
                    <select
                      value={form.produit_id ?? ''}
                      onChange={e => setForm(f => ({ ...f, produit_id: e.target.value ? Number(e.target.value) : null, categorie_id: null }))}
                      className="input w-full"
                    >
                      <option value="">— Tous les produits (ou choisir) —</option>
                      {produits.map(p => (
                        <option key={p.id} value={p.id}>{p.nom}</option>
                      ))}
                    </select>
                  </div>
                  {!form.produit_id && (
                    <div>
                      <select
                        value={form.categorie_id ?? ''}
                        onChange={e => setForm(f => ({ ...f, categorie_id: e.target.value ? Number(e.target.value) : null }))}
                        className="input w-full"
                      >
                        <option value="">— Toutes les catégories —</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.icone} {c.nom}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date début (optionnel)</label>
                  <input
                    type="date"
                    value={form.date_debut ?? ''}
                    onChange={e => setForm(f => ({ ...f, date_debut: e.target.value || null }))}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date fin (optionnel)</label>
                  <input
                    type="date"
                    value={form.date_fin ?? ''}
                    onChange={e => setForm(f => ({ ...f, date_fin: e.target.value || null }))}
                    className="input w-full"
                  />
                </div>
              </div>

              {/* Actif toggle */}
              <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
                <span className="text-sm font-medium text-gray-700">Promotion active</span>
                <button
                  onClick={() => setForm(f => ({ ...f, actif: f.actif ? 0 : 1 }))}
                  className={`w-12 h-6 rounded-full transition-colors ${form.actif ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.actif ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 btn btn-secondary">Annuler</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.nom.trim()}
                className="flex-1 btn btn-primary"
              >
                {saving ? 'Enregistrement...' : editing ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL CONFIRMATION SUPPRESSION ──────────────────────────────────── */}
      {deleteId && (
        <div className="modal-overlay">
          <div className="modal-content w-full max-w-sm">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="text-red-500" size={24} />
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">Supprimer la promotion ?</h3>
              <p className="text-gray-500 text-sm mb-5">Cette action est irréversible.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="flex-1 btn btn-secondary">Annuler</button>
                <button onClick={() => handleDelete(deleteId)} className="flex-1 btn bg-red-500 hover:bg-red-600 text-white">Supprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
