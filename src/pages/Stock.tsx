import { useState, useEffect } from 'react'
import { getProduits, addMouvement, getMouvements, getLowStockProduits, formatCurrency, getParametres } from '@/lib/ipc'
import { useAuthStore } from '@/store/authStore'
import type { Produit, MouvementStock } from '@/types'
import {
  Package, AlertTriangle, TrendingUp, TrendingDown, RotateCcw,
  Search, X, Plus, Minus, History, Check
} from 'lucide-react'

type MvtType = 'entree' | 'sortie' | 'ajustement'

export default function Stock() {
  const { user } = useAuthStore()
  const [produits, setProduits] = useState<Produit[]>([])
  const [mouvements, setMouvements] = useState<MouvementStock[]>([])
  const [lowStock, setLowStock] = useState<Produit[]>([])
  const [search, setSearch] = useState('')
  const [monnaie, setMonnaie] = useState('FCFA')
  const [loading, setLoading] = useState(true)
  const [showMvtModal, setShowMvtModal] = useState(false)
  const [showHistModal, setShowHistModal] = useState(false)
  const [selectedProd, setSelectedProd] = useState<Produit | null>(null)
  const [mvtType, setMvtType] = useState<MvtType>('entree')
  const [mvtQty, setMvtQty] = useState('')
  const [mvtRaison, setMvtRaison] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const [prods, low, params] = await Promise.all([getProduits(), getLowStockProduits(), getParametres()])
      setProduits(prods)
      setLowStock(low)
      if (params?.monnaie) setMonnaie(params.monnaie)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = produits.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    (p.categorie_nom || '').toLowerCase().includes(search.toLowerCase())
  )

  const getStockStatus = (p: Produit) => {
    if (p.stock_actuel <= 0) return { label: 'Épuisé', color: 'bg-red-100 text-red-700', ring: 'border-red-300' }
    if (p.stock_actuel <= p.stock_minimum) return { label: 'Stock bas', color: 'bg-orange-100 text-orange-700', ring: 'border-orange-300' }
    if (p.stock_actuel <= p.stock_minimum * 1.5) return { label: 'Faible', color: 'bg-yellow-100 text-yellow-700', ring: 'border-yellow-300' }
    return { label: 'OK', color: 'bg-emerald-100 text-emerald-700', ring: 'border-transparent' }
  }

  const openMvtModal = (prod: Produit, type: MvtType) => {
    setSelectedProd(prod)
    setMvtType(type)
    setMvtQty('')
    setMvtRaison('')
    setShowMvtModal(true)
  }

  const openHistModal = async (prod: Produit) => {
    setSelectedProd(prod)
    setShowHistModal(true)
    const mvts = await getMouvements(prod.id, 50)
    setMouvements(mvts)
  }

  const handleSaveMvt = async () => {
    if (!selectedProd || !mvtQty) return
    const qty = parseFloat(mvtQty.replace(',', '.'))
    if (isNaN(qty) || qty <= 0) return
    setSaving(true)
    try {
      await addMouvement({
        produit_id: selectedProd.id,
        type: mvtType,
        quantite: qty,
        raison: mvtRaison || undefined,
        user_id: user?.id
      })
      await load()
      setShowMvtModal(false)
    } catch {}
    setSaving(false)
  }

  const fmt = (v: number) => formatCurrency(v, monnaie)

  const MVT_CONFIG = {
    entree: { label: 'Entrée stock', icon: <TrendingUp size={18} />, color: 'bg-emerald-600', textColor: 'text-emerald-700' },
    sortie: { label: 'Sortie stock', icon: <TrendingDown size={18} />, color: 'bg-red-600', textColor: 'text-red-700' },
    ajustement: { label: 'Ajustement', icon: <RotateCcw size={18} />, color: 'bg-blue-600', textColor: 'text-blue-700' }
  }

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
          <h1 className="text-xl font-bold text-gray-800">Gestion des Stocks</h1>
          <div className="flex items-center gap-3">
            {lowStock.length > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                <AlertTriangle size={16} />
                <span className="font-semibold">{lowStock.length} alerte(s)</span>
              </div>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Low stock alerts */}
      {lowStock.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 p-3 flex-shrink-0">
          <div className="flex items-center gap-2 text-red-700 text-sm font-semibold mb-2">
            <AlertTriangle size={16} />
            Produits en stock insuffisant :
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(p => (
              <span key={p.id} className="bg-red-100 border border-red-300 text-red-700 text-xs px-2 py-1 rounded-lg font-medium">
                {p.nom} ({p.stock_actuel} {p.unite})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Produit</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Catégorie</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock actuel</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock min.</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Prix vente</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(prod => {
              const status = getStockStatus(prod)
              return (
                <tr key={prod.id} className={`hover:bg-gray-50 border-l-4 ${status.ring}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{prod.categorie_icone}</span>
                      <span className="font-semibold text-gray-800 text-sm">{prod.nom}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{prod.categorie_nom}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold text-sm ${
                      prod.stock_actuel <= 0 ? 'text-red-600' :
                      prod.stock_actuel <= prod.stock_minimum ? 'text-orange-600' : 'text-gray-800'
                    }`}>
                      {prod.stock_actuel} {prod.unite}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">
                    {prod.stock_minimum} {prod.unite}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                    {fmt(prod.prix_vente)}/{prod.unite}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openMvtModal(prod, 'entree')}
                        className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors"
                        title="Entrée stock"
                      >
                        <Plus size={16} />
                      </button>
                      <button
                        onClick={() => openMvtModal(prod, 'sortie')}
                        className="p-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors"
                        title="Sortie stock"
                      >
                        <Minus size={16} />
                      </button>
                      <button
                        onClick={() => openMvtModal(prod, 'ajustement')}
                        className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
                        title="Ajustement"
                      >
                        <RotateCcw size={16} />
                      </button>
                      <button
                        onClick={() => openHistModal(prod)}
                        className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
                        title="Historique"
                      >
                        <History size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Package size={48} className="mb-3 opacity-30" />
            <p>Aucun produit trouvé</p>
          </div>
        )}
      </div>

      {/* Movement modal */}
      {showMvtModal && selectedProd && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className={`p-5 rounded-t-2xl text-white flex items-center justify-between ${MVT_CONFIG[mvtType].color}`}>
              <div className="flex items-center gap-3">
                {MVT_CONFIG[mvtType].icon}
                <div>
                  <h2 className="font-bold text-lg">{MVT_CONFIG[mvtType].label}</h2>
                  <p className="text-sm opacity-90">{selectedProd.nom}</p>
                </div>
              </div>
              <button onClick={() => setShowMvtModal(false)} className="p-2 hover:bg-black/20 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-gray-50 p-3 rounded-xl text-sm text-gray-600">
                Stock actuel : <span className="font-bold text-gray-800">{selectedProd.stock_actuel} {selectedProd.unite}</span>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {mvtType === 'ajustement' ? 'Nouveau stock' : 'Quantité'} ({selectedProd.unite})
                </label>
                <input
                  type="number"
                  value={mvtQty}
                  onChange={e => setMvtQty(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.1"
                  className="input-field text-xl font-bold text-center"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Raison (optionnel)</label>
                <input
                  type="text"
                  value={mvtRaison}
                  onChange={e => setMvtRaison(e.target.value)}
                  placeholder="Ex: Livraison fournisseur, Perte, Inventaire..."
                  className="input-field"
                />
              </div>

              {mvtQty && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
                  {mvtType === 'entree' && <>Nouveau stock : <strong>{selectedProd.stock_actuel + parseFloat(mvtQty || '0')} {selectedProd.unite}</strong></>}
                  {mvtType === 'sortie' && <>Nouveau stock : <strong>{Math.max(0, selectedProd.stock_actuel - parseFloat(mvtQty || '0'))} {selectedProd.unite}</strong></>}
                  {mvtType === 'ajustement' && <>Stock ajusté à : <strong>{mvtQty} {selectedProd.unite}</strong></>}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setShowMvtModal(false)} className="flex-1 btn-ghost">Annuler</button>
                <button
                  onClick={handleSaveMvt}
                  disabled={saving || !mvtQty}
                  className="flex-1 btn-primary flex items-center justify-center gap-2"
                >
                  {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={18} />}
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {showHistModal && selectedProd && (
        <div className="modal-overlay">
          <div className="modal-content max-w-lg">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800 text-lg">Historique — {selectedProd.nom}</h2>
                <p className="text-gray-500 text-sm">50 derniers mouvements</p>
              </div>
              <button onClick={() => setShowHistModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {mouvements.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Aucun mouvement enregistré</div>
              ) : (
                mouvements.map(mvt => (
                  <div key={mvt.id} className="p-4 flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      mvt.type === 'entree' ? 'bg-emerald-100 text-emerald-700' :
                      mvt.type === 'sortie' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {mvt.type === 'entree' ? <TrendingUp size={16} /> : mvt.type === 'sortie' ? <TrendingDown size={16} /> : <RotateCcw size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800 text-sm">
                          {mvt.type === 'entree' ? '+' : mvt.type === 'sortie' ? '-' : '='}{mvt.quantite} {selectedProd.unite}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          mvt.type === 'entree' ? 'bg-emerald-100 text-emerald-700' :
                          mvt.type === 'sortie' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {mvt.type === 'entree' ? 'Entrée' : mvt.type === 'sortie' ? 'Sortie' : 'Ajust.'}
                        </span>
                      </div>
                      {mvt.raison && <div className="text-gray-600 text-xs mt-0.5">{mvt.raison}</div>}
                      <div className="text-gray-400 text-xs mt-1">
                        {new Date(mvt.date).toLocaleString('fr-FR')}
                        {mvt.user_nom && ` — ${mvt.user_nom}`}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
