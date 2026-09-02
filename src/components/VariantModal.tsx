import { useEffect, useMemo, useState } from 'react'
import { X, PackageX } from 'lucide-react'
import { listAttributs, variantesList } from '@/lib/ipc'
import type { Produit, AttributionProduit, AttributComplet, VarianteProduit } from '@/types'

interface Props {
  produit: Produit
  attributions: AttributionProduit[]
  onConfirm: (data: { details: string; varianteId?: number; stock?: number; quantite: number }) => void
  onClose: () => void
}

export default function VariantModal({ produit, attributions, onConfirm, onClose }: Props) {
  const [attrs, setAttrs] = useState<AttributComplet[]>([])
  const [combos, setCombos] = useState<VarianteProduit[]>([])
  const [selections, setSelections] = useState<Record<number, number>>({})
  const [quantite, setQuantite] = useState(1)
  const [loading, setLoading] = useState(true)
  const prix = produit.prix_vente

  useEffect(() => {
    let vivant = true
    setLoading(true)
    Promise.all([listAttributs(true), variantesList(produit.id)])
      .then(([liste, va]) => {
        if (!vivant) return
        const ids = new Set(attributions.map(a => a.attribut_id))
        setAttrs(liste.filter(a => ids.has(a.id)))
        setCombos(va)
      })
      .catch(() => {})
      .finally(() => vivant && setLoading(false))
    return () => { vivant = false }
  }, [produit.id])

  // Options d'un attribut : valeurs réellement en stock, compatibles avec les autres choix
  const optionsFor = (attrId: number, sel: Record<number, number>): number[] => {
    const autres = attrs.filter(a => a.id !== attrId)
    const values: number[] = []
    for (const c of combos) {
      if (c.stock <= 0) continue
      if (autres.some(o => sel[o.id] != null && c.combinaison[o.id] !== sel[o.id])) continue
      const v = c.combinaison[attrId]
      if (v != null && !values.includes(v)) values.push(v)
    }
    return values
  }

  // Mode « stock par combinaison » (taille × couleur) OU repli « variantes légères »
  // (sélection simple sans stock) quand aucune combinaison n'est déclarée pour l'article.
  const modeStock = combos.length > 0

  // Purger les sélections devenues impossibles (ex. taille retirée du stock)
  useEffect(() => {
    let changed = false
    const next = { ...selections }
    for (const a of attrs) {
      if (next[a.id] == null) continue
      if (modeStock && !optionsFor(a.id, next).includes(next[a.id])) { delete next[a.id]; changed = true }
    }
    if (changed) setSelections(next)
  }, [selections, attrs, combos])

  const attrsVisibles = useMemo(
    () => (modeStock ? attrs.filter(a => optionsFor(a.id, selections).length > 0) : attrs),
    [attrs, selections, combos]
  )

  const comboChoisi = useMemo(() => {
    if (!modeStock) return null
    const selOk = (c: VarianteProduit) =>
      attrsVisibles.every(a => selections[a.id] != null && c.combinaison[a.id] === selections[a.id])
    return combos.find(c => c.stock > 0 && selOk(c))
  }, [combos, selections, attrsVisibles])

  const rupture = modeStock && combos.every(c => c.stock <= 0)
  const aucuneVariante = combos.length === 0 && attrs.length === 0

  const handleSelect = (attrId: number, raw: string) => {
    if (raw === '') {
      setSelections(s => { const n = { ...s }; delete n[attrId]; return n })
      return
    }
    setSelections(s => ({ ...s, [attrId]: Number(raw) }))
    setQuantite(1)
  }

  const stockMax = comboChoisi?.stock ?? 0
  // En mode léger, pas de stock plafonné (l'ancien comportement « variantes légères »)
  const borneMax = modeStock

  const confirm = () => {
    if (modeStock) {
      if (!comboChoisi) return
      const labels = attrsVisibles.map(a => comboChoisi.combinaison_labels[a.nom]).filter(Boolean)
      onConfirm({
        details: labels.join(' · ') || 'Variante',
        varianteId: comboChoisi.id,
        stock: stockMax,
        quantite: Math.max(1, Math.min(quantite, stockMax))
      })
      return
    }
    const labels = attrsVisibles
      .filter(a => selections[a.id] != null)
      .map(a => a.valeurs.find(v => v.id === selections[a.id])?.label)
      .filter(Boolean)
    onConfirm({
      details: labels.join(' · ') || 'Variante',
      quantite: Math.max(1, quantite)
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{produit.nom}</h3>
            <p className="text-sm text-gray-500">{prix.toLocaleString('fr-FR')} FCFA</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && <div className="text-sm text-gray-400 text-center py-6">Chargement…</div>}

          {!loading && (aucuneVariante || rupture) && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <PackageX size={40} className="text-gray-300" />
              <p className="text-sm font-semibold text-gray-600">
                {aucuneVariante ? 'Aucune variante définie pour cet article' : 'Rupture de stock'}
              </p>
              <p className="text-xs text-gray-400">
                {aucuneVariante
                  ? 'Déclarez des combinaisons (taille / couleur) dans Produits → Variantes.'
                  : 'Aucune combinaison disponible : les tailles et couleurs en stock apparaîtront ici.'}
              </p>
            </div>
          )}

          {!loading && attrsVisibles.map(a => (
            <div key={a.id}>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{a.nom}</label>
              <select
                className="input-field"
                value={selections[a.id] ?? ''}
                onChange={e => handleSelect(a.id, e.target.value)}
              >
                <option value="">— Choisir —</option>
                {a.valeurs
                  .filter(v => !modeStock || optionsFor(a.id, selections).includes(v.id))
                  .map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
              </select>
            </div>
          ))}

          {!loading && comboChoisi && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-700">En stock : {stockMax}</span>
                <span className="text-xs text-emerald-600 font-semibold">
                  {attrsVisibles.map(a => comboChoisi.combinaison_labels[a.nom]).join(' · ')}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <label className="text-sm font-semibold text-gray-700">Quantité</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantite(q => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-xl border border-emerald-300 text-emerald-700 font-bold hover:bg-emerald-100"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={stockMax}
                    value={quantite}
                    onChange={e => setQuantite(Math.max(1, Math.min(stockMax, Number(e.target.value) || 1)))}
                    className="w-16 text-center input-field py-2"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantite(q => Math.min(stockMax, q + 1))}
                    className="w-9 h-9 rounded-xl border border-emerald-300 text-emerald-700 font-bold hover:bg-emerald-100"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          {!loading && !modeStock && attrs.length > 0 && (
            <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-2">
                Sélection sans stock détaillé : la quantité ne sera pas plafonnée.
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-gray-700">Quantité</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantite(q => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-100"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={quantite}
                    onChange={e => setQuantite(Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 text-center input-field py-2"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantite(q => q + 1)}
                    className="w-9 h-9 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-100"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button
            className="btn-primary"
            disabled={modeStock ? !comboChoisi : Object.keys(selections).length === 0}
            onClick={confirm}
          >
            Ajouter {comboChoisi && quantite > 1 ? `(${quantite})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}