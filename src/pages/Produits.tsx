import { useState, useEffect, useRef } from 'react'
import {
  getProduits, getCategories, createProduit, updateProduit, deleteProduit,
  createCategorie, updateCategorie,
  formatCurrency, getParametres, selectImageProduit, deleteImageProduit,
  listAttributs, getAttributsProduit, setAttributsProduit, variantesList, variantesSet
} from '@/lib/ipc'
import { useProfilStore } from '@/store/profilStore'
import type { Produit, Categorie, AttributComplet, AttributionProduit, VarianteProduit, VarianteComboInput } from '@/types'
import { Plus, Search, X, Edit2, Trash2, Package, Check, Barcode, ImagePlus, Image, Trash, Tag, Pencil, BookImage } from 'lucide-react'
import ProductVisual from '@/components/ProductVisual'
import ImageLibraryPicker from '@/components/ImageLibraryPicker'
import PeremptionBadge from '@/components/PeremptionBadge'
import { isLibImage } from '@/lib/imageLibrary'

const UNITES = ['kg', 'g', 'pièce', 'litre', 'botte', 'sac', 'carton', 'boîte']

const COULEURS_PRESET = [
  '#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6',
  '#ec4899','#06b6d4','#84cc16','#f97316','#6366f1',
  '#14b8a6','#a855f7','#e11d48','#0ea5e9','#65a30d',
]

const ICONES_PRESET = [
  '🐔','🦆','🦃','🐷','🐟','🥩','🥚',
  '🍎','🍌','🍊','🥭','🍍','🍋','🍇','🫐','🍓','🥝','🍉',
  '🥦','🥕','🍅','🧅','🌽','🥒','🍆','🌶️','🥬','🧄',
  '📦','🛒','🏪','⚡','🌿','🍃',
]

const emptyCatForm = () => ({ nom: '', couleur: '#3b82f6', icone: '📦' })

const emptyForm = () => ({
  nom: '', categorie_id: 0, prix_vente: '', prix_achat: '',
  unite: 'kg', stock_actuel: '', stock_minimum: '', code_barre: '', image_url: '',
  date_peremption: '', lot: ''
})


export default function Produits() {
  const hasVariantes = useProfilStore(s => s.aModule('variantes'))
  const [produits, setProduits] = useState<Produit[]>([])
  const [categories, setCategories] = useState<Categorie[]>([])
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [monnaie, setMonnaie] = useState('FCFA')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingProd, setEditingProd] = useState<Produit | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [imageLoading, setImageLoading] = useState(false)
  const [showLibPicker, setShowLibPicker] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [editingCat, setEditingCat] = useState<Categorie | null>(null)
  const [catForm, setCatForm] = useState(emptyCatForm())
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError] = useState('')
  const [attributsList, setAttributsList] = useState<AttributComplet[]>([])
  const [attribsActifs, setAttribsActifs] = useState<Record<number, boolean>>({})
  const [combos, setCombos] = useState<VarianteProduit[]>([])
  const [comboFormSel, setComboFormSel] = useState<Record<number, number>>({})
  const [comboFormStock, setComboFormStock] = useState('1')
  const barcodeRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      const [prods, cats, params] = await Promise.all([getProduits(), getCategories(), getParametres()])
      setProduits(prods)
      setCategories(cats)
      if (params?.monnaie) setMonnaie(params.monnaie)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    load()
    listAttributs(true).then(setAttributsList).catch(() => {})
  }, [])

  const filtered = produits.filter(p => {
    const matchSearch = p.nom.toLowerCase().includes(search.toLowerCase()) || (p.code_barre || '').includes(search)
    const matchCat = !selectedCat || p.categorie_id === selectedCat
    return matchSearch && matchCat
  })

  const openCreate = () => {
    setEditingProd(null)
    setForm({ ...emptyForm(), categorie_id: categories[0]?.id || 0 } as any)
    setAttribsActifs({})
    setCombos([])
    setComboFormSel({})
    setComboFormStock('1')
    setError('')
    setShowModal(true)
  }

  const openEdit = (prod: Produit) => {
    setEditingProd(prod)
    setForm({
      nom: prod.nom,
      categorie_id: prod.categorie_id,
      prix_vente: String(prod.prix_vente),
      prix_achat: String(prod.prix_achat),
      unite: prod.unite,
      stock_actuel: String(prod.stock_actuel),
      stock_minimum: String(prod.stock_minimum),
      code_barre: prod.code_barre || '',
      image_url: prod.image_url || '',
      date_peremption: prod.date_peremption || '',
      lot: prod.lot || ''
    })
    setError('')
    if (hasVariantes) {
      getAttributsProduit(prod.id).then((attribs: AttributionProduit[]) => {
        const actifs: Record<number, boolean> = {}
        const sel: Record<number, number> = {}
        for (const a of attribs) {
          actifs[a.attribut_id] = true
          if (a.valeur_id != null) sel[a.attribut_id] = a.valeur_id
        }
        setAttribsActifs(actifs)
        setComboFormSel(sel)
      }).catch(() => {})
      variantesList(prod.id).then(setCombos).catch(() => setCombos([]))
    }
    setShowModal(true)
  }

  const openCreateCat = () => {
    setEditingCat(null)
    setCatForm(emptyCatForm())
    setCatError('')
    setShowCatModal(true)
  }

  const openEditCat = (cat: Categorie) => {
    setEditingCat(cat)
    setCatForm({ nom: cat.nom, couleur: cat.couleur, icone: cat.icone })
    setCatError('')
    setShowCatModal(true)
  }

  const handleSaveCat = async () => {
    if (!catForm.nom.trim()) { setCatError('Le nom est requis'); return }
    setCatSaving(true)
    try {
      if (editingCat) {
        await updateCategorie(editingCat.id, catForm)
      } else {
        await createCategorie(catForm)
      }
      await load()
      setShowCatModal(false)
    } catch {
      setCatError('Erreur lors de la sauvegarde')
    }
    setCatSaving(false)
  }

  const handleSelectImage = async () => {
    setImageLoading(true)
    try {
      const url = await selectImageProduit()
      if (url) setForm(f => ({ ...f, image_url: url }))
    } finally {
      setImageLoading(false)
    }
  }

  const handleRemoveImage = async () => {
    if (form.image_url && !isLibImage(form.image_url)) {
      await deleteImageProduit(form.image_url)
    }
    setForm(f => ({ ...f, image_url: '' }))
  }

  const ajouterCombo = () => {
    const actifs = attributsList.filter(a => attribsActifs[a.id])
    if (!actifs.length) return
    const combinaison: Record<number, number> = {}
    const labels: Record<string, string> = {}
    for (const a of actifs) {
      const v = comboFormSel[a.id]
      if (v == null) return
      combinaison[a.id] = v
      labels[a.nom] = a.valeurs.find(x => x.id === v)?.label ?? ''
    }
    const stock = Math.max(0, Math.round(parseFloat(comboFormStock) || 0))
    const serial = JSON.stringify(combinaison)
    const ex = combos.find(c => JSON.stringify(c.combinaison) === serial)
    if (ex) {
      setCombos(cs => cs.map(c => c.id === ex.id ? { ...c, stock: c.stock + stock } : c))
    } else {
      setCombos(cs => [...cs, {
        id: -Date.now(), produit_id: 0, combinaison, combinaison_labels: labels,
        stock, prix_vente: null, prix_achat: null, sku: null
      }])
    }
    setComboFormStock('1')
  }

  const handleSave = async () => {
    if (!form.nom.trim()) { setError('Le nom est requis'); return }
    if (!form.categorie_id) { setError('La catégorie est requise'); return }
    if (!form.prix_vente) { setError('Le prix de vente est requis'); return }
    setSaving(true)
    try {
      const data = {
        nom: form.nom.trim(),
        categorie_id: Number(form.categorie_id),
        prix_vente: parseFloat(form.prix_vente) || 0,
        prix_achat: parseFloat(form.prix_achat) || 0,
        unite: form.unite,
        stock_actuel: parseFloat(form.stock_actuel) || 0,
        stock_minimum: parseFloat(form.stock_minimum) || 0,
        code_barre: form.code_barre || undefined,
        image_url: form.image_url || undefined,
        date_peremption: form.date_peremption || null,
        lot: form.lot || null,
        actif: 1
      }
      const saveVariantes = (produitId: number) => {
        const attributions = attributsList
          .filter(a => attribsActifs[a.id])
          .map(a => ({ attribut_id: a.id, valeur_id: null }))
        return setAttributsProduit(produitId, attributions)
          .then(() => variantesSet(
            produitId,
            combos.map(c => ({
              combinaison: c.combinaison,
              stock: c.stock,
              prix_vente: c.prix_vente,
              prix_achat: c.prix_achat,
              sku: c.sku
            }))
          ))
      }
      if (editingProd) {
        // Si l'image a changé, supprimer l'ancienne
        if (editingProd.image_url && editingProd.image_url !== form.image_url) {
          await deleteImageProduit(editingProd.image_url)
        }
        await updateProduit(editingProd.id, data)
        if (hasVariantes) await saveVariantes(editingProd.id)
      } else {
        const res = await createProduit(data as any)
        if (hasVariantes && res?.lastInsertRowid) {
          await saveVariantes(Number(res.lastInsertRowid))
        }
      }
      await load()
      setShowModal(false)
    } catch {
      setError('Erreur lors de la sauvegarde')
    }
    setSaving(false)
  }

  const handleDelete = async (prod: Produit) => {
    if (!confirm(`Désactiver le produit "${prod.nom}" ?`)) return
    if (prod.image_url) await deleteImageProduit(prod.image_url)
    await deleteProduit(prod.id)
    await load()
  }

  const fmt = (v: number) => formatCurrency(v, monnaie)

  if (loading) return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-800">Produits ({produits.length})</h1>
          <div className="flex gap-2">
            <button onClick={openCreateCat}
              className="flex items-center gap-2 py-2 px-4 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl font-semibold text-sm transition-all">
              <Tag size={16} /> Catégories
            </button>
            <button onClick={openCreate} className="btn-primary flex items-center gap-2 py-2 px-4">
              <Plus size={18} /> Nouveau produit
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (nom ou code-barre)..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={16} /></button>}
          </div>
          <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="px-3 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-600 text-sm font-medium">
            {viewMode === 'grid' ? '☰ Liste' : '⊞ Grille'}
          </button>
        </div>
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
          <button onClick={() => setSelectedCat(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold ${!selectedCat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Tous
          </button>
          {categories.map(cat => (
            <div key={cat.id} className="flex-shrink-0 flex items-center gap-0.5">
              <button onClick={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg text-sm font-semibold transition-all ${selectedCat === cat.id ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                style={selectedCat === cat.id ? { backgroundColor: cat.couleur } : {}}>
                {cat.icone} {cat.nom}
              </button>
              <button onClick={() => openEditCat(cat)}
                title="Modifier cette catégorie"
                className={`px-1.5 py-1.5 rounded-r-lg text-xs transition-all ${selectedCat === cat.id ? 'text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`}
                style={selectedCat === cat.id ? { backgroundColor: cat.couleur } : {}}>
                <Pencil size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Products */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Package size={48} className="mb-3 opacity-30" />
            <p>Aucun produit trouvé</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map(prod => (
              <div key={prod.id} className="bg-white rounded-xl shadow-card overflow-hidden hover:shadow-card-hover transition-shadow group">
                <div className="relative h-28 bg-gray-50 overflow-hidden">
                  <ProductVisual
                    imageUrl={prod.image_url}
                    categoryEmoji={prod.categorie_icone}
                    categoryColor={prod.categorie_couleur}
                    className="w-full h-full group-hover:scale-105 transition-transform duration-200"
                    emojiSize="text-5xl"
                  />
                  <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: prod.categorie_couleur || '#3b82f6' }} />
                </div>
                <div className="p-3">
                  <div className="font-semibold text-gray-800 text-sm leading-tight mb-1 line-clamp-2">{prod.nom}</div>
                  <div className="text-blue-600 font-bold text-sm">{fmt(prod.prix_vente)}/{prod.unite}</div>
                  <div className={`text-xs mt-1 font-medium ${prod.stock_actuel <= prod.stock_minimum ? 'text-red-600' : 'text-gray-500'}`}>
                    Stock: {prod.stock_actuel} {prod.unite}
                  </div>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => openEdit(prod)} className="flex-1 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-colors">
                      Modifier
                    </button>
                    <button onClick={() => handleDelete(prod)} className="p-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-12">Img</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Produit</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Catégorie</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Prix vente</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Prix achat</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Stock</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Code-barre</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(prod => (
                  <tr key={prod.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                        <ProductVisual
                          imageUrl={prod.image_url}
                          categoryEmoji={prod.categorie_icone}
                          categoryColor={prod.categorie_couleur}
                          className="w-full h-full"
                          emojiSize="text-xl"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-800 text-sm">{prod.nom}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{prod.categorie_nom}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-blue-600">{fmt(prod.prix_vente)}/{prod.unite}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">{fmt(prod.prix_achat)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-semibold ${prod.stock_actuel <= prod.stock_minimum ? 'text-red-600' : 'text-gray-800'}`}>
                        {prod.stock_actuel} {prod.unite}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                      <div>{prod.code_barre || '—'}</div>
                      {prod.date_peremption && <PeremptionBadge datePeremption={prod.date_peremption} compact />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(prod)} className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => handleDelete(prod)} className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL CRÉATION / ÉDITION ─────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-xl w-full">
            <div className="bg-blue-600 text-white p-5 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-bold text-lg">{editingProd ? 'Modifier le produit' : 'Nouveau produit'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-blue-700 rounded-lg"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}

              {/* ── ZONE IMAGE ── */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <span className="flex items-center gap-2"><Image size={15} /> Visuel du produit</span>
                </label>
                <div className="flex items-start gap-4">
                  {/* Aperçu */}
                  <div className="w-28 h-28 rounded-xl overflow-hidden border-2 border-dashed border-gray-300 bg-gray-50 flex-shrink-0 relative group">
                    {form.image_url ? (
                      <>
                        <ProductVisual
                          imageUrl={form.image_url}
                          categoryEmoji={categories.find(c => c.id === Number(form.categorie_id))?.icone}
                          categoryColor={categories.find(c => c.id === Number(form.categorie_id))?.couleur}
                          className="w-full h-full"
                          emojiSize="text-5xl"
                        />
                        <button
                          onClick={handleRemoveImage}
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white rounded-xl"
                          title="Supprimer">
                          <Trash size={20} />
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-2">
                        <ImagePlus size={28} className="mb-1 opacity-50" />
                        <span className="text-xs text-center">Aucun visuel</span>
                      </div>
                    )}
                  </div>

                  {/* Boutons */}
                  <div className="flex flex-col gap-2 flex-1">
                    <button
                      onClick={() => setShowLibPicker(true)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition-all">
                      <BookImage size={16} />
                      Choisir dans la bibliothèque
                    </button>
                    <button
                      onClick={handleSelectImage}
                      disabled={imageLoading}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl font-medium text-sm transition-all disabled:opacity-50">
                      {imageLoading
                        ? <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                        : <ImagePlus size={16} />}
                      Importer une photo
                    </button>
                    {form.image_url && (
                      <button onClick={handleRemoveImage}
                        className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-medium text-sm transition-all">
                        <Trash size={14} /> Supprimer le visuel
                      </button>
                    )}
                    <p className="text-xs text-gray-400">
                      250+ visuels prêts dans la bibliothèque,<br />ou importez votre propre photo.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nom du produit *</label>
                  <input type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    placeholder="Ex: Cuisses de poulet" className="input-field" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Catégorie *</label>
                  <select value={form.categorie_id} onChange={e => setForm(f => ({ ...f, categorie_id: Number(e.target.value) }))}
                    className="input-field">
                    <option value="">Sélectionner...</option>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.icone} {cat.nom}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Prix de vente * ({monnaie})</label>
                  <input type="number" value={form.prix_vente} onChange={e => setForm(f => ({ ...f, prix_vente: e.target.value }))}
                    placeholder="0" min="0" step="1" className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Prix d'achat ({monnaie})</label>
                  <input type="number" value={form.prix_achat} onChange={e => setForm(f => ({ ...f, prix_achat: e.target.value }))}
                    placeholder="0" min="0" step="1" className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Unité</label>
                  <select value={form.unite} onChange={e => setForm(f => ({ ...f, unite: e.target.value }))} className="input-field">
                    {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Stock actuel</label>
                  <input type="number" value={form.stock_actuel} onChange={e => setForm(f => ({ ...f, stock_actuel: e.target.value }))}
                    placeholder="0" min="0" step="0.1" className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Stock minimum</label>
                  <input type="number" value={form.stock_minimum} onChange={e => setForm(f => ({ ...f, stock_minimum: e.target.value }))}
                    placeholder="0" min="0" step="0.1" className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Code-barre</label>
                  <div className="relative">
                    <input ref={barcodeRef} type="text" value={form.code_barre}
                      onChange={e => setForm(f => ({ ...f, code_barre: e.target.value }))}
                      placeholder="Scanner ou saisir..." className="input-field pr-10" />
                    <Barcode className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Date de péremption (DLC)</label>
                  <input type="date" value={form.date_peremption}
                    onChange={e => setForm(f => ({ ...f, date_peremption: e.target.value }))}
                    className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">N° de lot</label>
                  <input type="text" value={form.lot}
                    onChange={e => setForm(f => ({ ...f, lot: e.target.value }))}
                    placeholder="LOT-2024-001..." className="input-field" />
                </div>
              </div>

              {hasVariantes && attributsList.length > 0 && (
                <div className="pt-4 border-t border-gray-100 space-y-4">
                  <div>
                    <div className="text-sm font-bold text-gray-800 mb-1">Critères de variantes</div>
                    <div className="text-xs text-gray-500 mb-2">
                      Cochez les critères (taille, couleur…) : ils seront déclinés en combinaisons de stock.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {attributsList.map(att => {
                        const actif = !!attribsActifs[att.id]
                        return (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() => setAttribsActifs(s => ({ ...s, [att.id]: !actif }))}
                            className={`px-3 py-1.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                              actif ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-400'
                            }`}
                          >
                            {actif ? '✓ ' : ''}{att.nom}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-bold text-gray-800 mb-1">Stock par combinaison</div>
                    <div className="text-xs text-gray-500 mb-2">
                      Seules les combinaisons en stock (quantité supérieure à 0) seront proposées à la caisse.
                    </div>
                    {combos.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-1">Aucune combinaison définie.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {combos.map(c => (
                          <div key={c.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-gray-700 truncate">
                                {Object.values(c.combinaison_labels).join(' · ') || '—'}
                              </div>
                            </div>
                            <label className="text-xs text-gray-500">Stock</label>
                            <input
                              type="number"
                              min={0}
                              value={c.stock}
                              onChange={e => setCombos(cs => cs.map(x => x.id === c.id ? { ...x, stock: Math.max(0, Math.round(Number(e.target.value) || 0)) } : x))}
                              className="w-16 input-field py-1 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => setCombos(cs => cs.filter(x => x.id !== c.id))}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                              title="Supprimer la combinaison"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 rounded-xl border border-dashed border-gray-300 p-3">
                      <div className="text-xs font-bold text-gray-600 mb-2">Ajouter une combinaison</div>
                      <div className="flex flex-wrap items-end gap-2">
                        {attributsList.filter(a => attribsActifs[a.id]).map(a => (
                          <div key={a.id}>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">{a.nom}</label>
                            <select
                              className="input-field py-1.5 min-w-28"
                              value={comboFormSel[a.id] ?? ''}
                              onChange={e => setComboFormSel(s => ({ ...s, [a.id]: Number(e.target.value) }))}
                            >
                              <option value="">— Choisir —</option>
                              {a.valeurs.map(v => (
                                <option key={v.id} value={v.id}>{v.label}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Stock</label>
                          <input
                            type="number"
                            min={0}
                            value={comboFormStock}
                            onChange={e => setComboFormStock(e.target.value)}
                            className="w-16 input-field py-1.5 text-center"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={ajouterCombo}
                          disabled={!attributsList.some(a => attribsActifs[a.id]) || Object.keys(comboFormSel).length === 0 || !(parseFloat(comboFormStock) >= 0)}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Plus size={14} className="inline mr-1" />Ajouter
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 btn-ghost">Annuler</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary flex items-center justify-center gap-2">
                  {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={18} />}
                  {editingProd ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BIBLIOTHÈQUE D'IMAGES ────────────────────────────────────────────── */}
      {showLibPicker && (
        <ImageLibraryPicker
          currentUrl={form.image_url}
          onSelect={url => setForm(f => ({ ...f, image_url: url }))}
          onClose={() => setShowLibPicker(false)}
        />
      )}

      {/* ── MODAL CATÉGORIE ──────────────────────────────────────────────────── */}
      {showCatModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md w-full">
            <div className="bg-amber-500 text-white p-5 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Tag size={20} />
                {editingCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
              </h2>
              <button onClick={() => setShowCatModal(false)} className="p-2 hover:bg-amber-600 rounded-lg"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-5">
              {catError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{catError}</div>}

              {/* Nom */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nom de la catégorie *</label>
                <input
                  type="text"
                  value={catForm.nom}
                  onChange={e => setCatForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Ex: Volailles, Légumes, Fruits..."
                  className="input-field"
                  autoFocus
                />
              </div>

              {/* Couleur */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Couleur</label>
                <div className="grid grid-cols-8 gap-1.5">
                  {COULEURS_PRESET.map(c => (
                    <button
                      key={c}
                      onClick={() => setCatForm(f => ({ ...f, couleur: c }))}
                      className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: catForm.couleur === c ? '#1e293b' : 'transparent',
                        boxShadow: catForm.couleur === c ? '0 0 0 2px white inset' : 'none'
                      }}
                    />
                  ))}
                  {/* Saisie libre */}
                  <div className="relative w-8 h-8">
                    <input
                      type="color"
                      value={catForm.couleur}
                      onChange={e => setCatForm(f => ({ ...f, couleur: e.target.value }))}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      title="Couleur personnalisée"
                    />
                    <div className="w-8 h-8 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">+</div>
                  </div>
                </div>
                {/* Aperçu badge */}
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: catForm.couleur }}>
                    {catForm.icone} {catForm.nom || 'Aperçu'}
                  </span>
                </div>
              </div>

              {/* Icône */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Icône</label>
                <div className="grid grid-cols-9 gap-1 max-h-36 overflow-y-auto p-1 border border-gray-200 rounded-xl bg-gray-50">
                  {ICONES_PRESET.map(ic => (
                    <button
                      key={ic}
                      onClick={() => setCatForm(f => ({ ...f, icone: ic }))}
                      className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all hover:scale-110 ${catForm.icone === ic ? 'bg-amber-100 ring-2 ring-amber-400' : 'hover:bg-gray-200'}`}
                      title={ic}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowCatModal(false)} className="flex-1 btn-ghost">Annuler</button>
                <button
                  onClick={handleSaveCat}
                  disabled={catSaving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-all disabled:opacity-50"
                >
                  {catSaving
                    ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Check size={18} />}
                  {editingCat ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
