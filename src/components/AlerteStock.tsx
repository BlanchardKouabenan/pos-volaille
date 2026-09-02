import { useEffect, useState } from 'react'
import { AlertTriangle, X, Package } from 'lucide-react'
import { getLowStockProduits } from '@/lib/ipc'
import type { Produit } from '@/types'

interface AlerteStockProps {
  onClose?: () => void
}

export default function AlerteStock({ onClose }: AlerteStockProps) {
  const [produits, setProduits] = useState<Produit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getLowStockProduits().then(p => {
      setProduits(p)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return null
  if (produits.length === 0) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="bg-red-600 text-white p-5 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={24} />
            <div>
              <h2 className="font-bold text-lg">Alertes Stock</h2>
              <p className="text-red-200 text-sm">{produits.length} produit(s) en stock insuffisant</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-red-700 rounded-lg transition-colors">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {produits.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Package size={20} className="text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800 truncate">{p.nom}</div>
                <div className="text-sm text-gray-500">{p.categorie_nom}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-red-600 font-bold">
                  {p.stock_actuel} {p.unite}
                </div>
                <div className="text-xs text-gray-500">
                  Min: {p.stock_minimum} {p.unite}
                </div>
              </div>
            </div>
          ))}
        </div>

        {onClose && (
          <div className="p-4 border-t border-gray-100">
            <button onClick={onClose} className="w-full btn-primary">
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
