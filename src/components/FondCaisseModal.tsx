import { useState } from 'react'
import { Banknote, Check, X } from 'lucide-react'
import { ouvrirSession } from '@/lib/ipc'
import { useSessionStore } from '@/store/sessionStore'
import type { User, SessionCaisse } from '@/types'

function NumPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = (key: string) => {
    if (key === 'C') { onChange(''); return }
    if (key === '⌫') { onChange(value.slice(0, -1)); return }
    if (value === '0' && key !== '.') { onChange(key); return }
    onChange(value + key)
  }
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '000', '0', '⌫']
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map(k => (
        <button
          key={k}
          onClick={() => press(k)}
          className="h-14 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-lg rounded-xl transition-all"
        >
          {k}
        </button>
      ))}
      <button
        onClick={() => press('C')}
        className="col-span-3 h-12 bg-red-100 hover:bg-red-200 active:bg-red-300 text-red-700 font-bold rounded-xl transition-all"
      >
        Effacer tout
      </button>
    </div>
  )
}

interface Props {
  user: User
  onClose?: () => void
}

export default function FondCaisseModal({ user, onClose }: Props) {
  const { setSession } = useSessionStore()
  const [fond, setFond] = useState('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const montant = parseInt(fond) || 0

  const handleDemarrer = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await ouvrirSession(user.id, montant)
      // Construire l'objet session complet
      const session: SessionCaisse = {
        id: result.lastInsertRowid ?? result.id,
        user_id: user.id,
        date: new Date().toISOString().slice(0, 10),
        heure_ouverture: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        fond_caisse: montant,
        total_ventes: 0,
        nb_ventes: 0,
        statut: 'ouvert'
      }
      setSession(session)
      onClose?.()
    } catch (err: any) {
      setError('Erreur lors de l\'ouverture de la session. Veuillez réessayer.')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Banknote size={26} />
            </div>
            <div>
              <h2 className="font-bold text-xl">Ouverture de caisse</h2>
              <p className="text-blue-200 text-sm">Bonjour, {user.nom} !</p>
            </div>
          </div>
          <p className="text-blue-100 text-sm mt-3">
            Entrez votre fond de caisse initial pour démarrer votre session.
          </p>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Affichage montant */}
          <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 text-center">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Fond de caisse</div>
            <div className="text-4xl font-bold text-gray-800">
              {montant.toLocaleString('fr-FR')} <span className="text-2xl text-gray-500">FCFA</span>
            </div>
          </div>

          {/* Montants rapides */}
          <div className="grid grid-cols-4 gap-2">
            {[0, 5000, 10000, 25000, 50000, 100000, 200000, 500000].map(amt => (
              <button
                key={amt}
                onClick={() => setFond(String(amt))}
                className={`py-2 rounded-lg font-semibold text-xs transition-all ${
                  montant === amt
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {amt === 0 ? '0' : `${(amt / 1000).toFixed(0)}K`}
              </button>
            ))}
          </div>

          {/* NumPad */}
          <NumPad value={fond} onChange={setFond} />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl text-sm flex items-center gap-2">
              <X size={16} />
              {error}
            </div>
          )}

          {/* Bouton démarrer */}
          <button
            onClick={handleDemarrer}
            disabled={loading}
            className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-all flex items-center justify-center gap-3"
          >
            {loading ? (
              <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Check size={22} />
                Démarrer la session
              </>
            )}
          </button>

          <p className="text-center text-xs text-gray-400">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  )
}
