import { useState, useEffect } from 'react'
import { Scale, X, Check, Delete } from 'lucide-react'

interface Props {
  produitNom: string
  unite: string
  prixUnitaire: number
  monnaie?: string
  onConfirm: (poids: number) => void
  onClose: () => void
}

const UNITES_POIDS = ['kg', 'g', 'KG', 'Kg']

export function isUnitesPoids(unite: string): boolean {
  return UNITES_POIDS.includes(unite) || unite.toLowerCase().startsWith('kg') || unite.toLowerCase() === 'g'
}

export default function BalanceModal({ produitNom, unite, prixUnitaire, monnaie = 'FCFA', onConfirm, onClose }: Props) {
  const [valeur, setValeur] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const press = (k: string) => {
    if (k === '⌫') { setValeur(v => v.slice(0, -1)); return }
    if (k === 'C') { setValeur(''); return }
    if (k === '.' && valeur.includes('.')) return
    if (valeur === '0' && k !== '.') { setValeur(k); return }
    setValeur(v => v + k)
  }

  const num = parseFloat(valeur) || 0
  const total = Math.round(num * prixUnitaire)

  const handleConfirm = () => {
    if (num > 0) { onConfirm(num); onClose() }
  }

  const keys = ['7','8','9','4','5','6','1','2','3','.','0','⌫']

  return (
    <div className="modal-overlay" style={{ zIndex: 70 }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Scale size={22} />
              <span className="font-bold text-lg">Saisie du poids</span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-xl transition-colors">
              <X size={20} />
            </button>
          </div>
          <p className="text-blue-200 text-sm truncate">{produitNom}</p>
        </div>

        {/* Affichage poids */}
        <div className="bg-gray-900 px-6 py-4 text-center">
          <div className="flex items-end justify-center gap-2">
            <span className={`font-mono font-bold text-white transition-all ${valeur.length > 6 ? 'text-3xl' : 'text-5xl'}`}>
              {valeur || '0'}
            </span>
            <span className="text-blue-400 text-xl font-semibold pb-1">{unite}</span>
          </div>
          {num > 0 && (
            <p className="text-emerald-400 text-sm mt-1 font-medium">
              = {total.toLocaleString('fr-FR')} {monnaie}
              <span className="text-gray-500 ml-1">({prixUnitaire.toLocaleString('fr-FR')} F/{unite})</span>
            </p>
          )}
        </div>

        {/* Numpad */}
        <div className="p-4 grid grid-cols-3 gap-2.5">
          {keys.map(k => (
            <button
              key={k}
              onClick={() => press(k)}
              className={`h-14 rounded-2xl font-bold text-xl transition-all active:scale-95 ${
                k === '⌫'
                  ? 'bg-red-50 hover:bg-red-100 text-red-500'
                  : k === '.'
                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800'
              }`}
            >
              {k === '⌫' ? <Delete size={20} className="mx-auto" /> : k}
            </button>
          ))}
          <button
            onClick={() => setValeur('')}
            className="col-span-3 h-12 bg-orange-50 hover:bg-orange-100 text-orange-600 font-bold rounded-2xl transition-all active:scale-95"
          >
            Effacer
          </button>
          <button
            onClick={handleConfirm}
            disabled={num <= 0}
            className="col-span-3 h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-lg rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Check size={22} />
            Valider — {num > 0 ? `${total.toLocaleString('fr-FR')} ${monnaie}` : '0'}
          </button>
        </div>
      </div>
    </div>
  )
}
