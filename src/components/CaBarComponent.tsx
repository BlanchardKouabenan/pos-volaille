import { useState, useEffect } from 'react'
import { TrendingUp, ShoppingBag, Wallet, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { getStatsDuJour, formatCurrency } from '@/lib/ipc'
import type { StatsDuJour } from '@/types'

const VISIBLE_KEY = 'ca_bar_visible'

export default function CaBarComponent() {
  const [stats, setStats] = useState<StatsDuJour | null>(null)
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(VISIBLE_KEY)
      return stored === null ? true : stored === 'true'
    } catch {
      return true
    }
  })
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const s = await getStatsDuJour()
      setStats(s)
      setLastUpdate(new Date())
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  const toggleVisible = () => {
    const next = !visible
    setVisible(next)
    try { localStorage.setItem(VISIBLE_KEY, String(next)) } catch {}
  }

  const fmt = (v: number) => formatCurrency(v)
  const mask = (v: string) => visible ? v : '••••••'

  return (
    <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-4 py-2 flex items-center gap-4 flex-shrink-0 border-b border-blue-900">
      {/* CA */}
      <div className="flex items-center gap-2">
        <TrendingUp size={16} className="text-blue-300 flex-shrink-0" />
        <div>
          <div className="text-xs text-blue-300 leading-none">CA du jour</div>
          <div className="font-bold text-sm leading-tight">{stats ? mask(fmt(stats.ca)) : '---'}</div>
        </div>
      </div>

      <div className="w-px h-8 bg-blue-600" />

      {/* Ventes */}
      <div className="flex items-center gap-2">
        <ShoppingBag size={16} className="text-blue-300 flex-shrink-0" />
        <div>
          <div className="text-xs text-blue-300 leading-none">Ventes</div>
          <div className="font-bold text-sm leading-tight">{stats ? mask(String(stats.nb_ventes)) : '---'}</div>
        </div>
      </div>

      <div className="w-px h-8 bg-blue-600" />

      {/* Fond caisse */}
      <div className="flex items-center gap-2">
        <Wallet size={16} className="text-blue-300 flex-shrink-0" />
        <div>
          <div className="text-xs text-blue-300 leading-none">Fond caisse</div>
          <div className="font-bold text-sm leading-tight">{stats ? mask(fmt(stats.fond_caisse)) : '---'}</div>
        </div>
      </div>

      {/* Par mode - compact */}
      {stats && stats.par_mode && stats.par_mode.length > 0 && visible && (
        <>
          <div className="w-px h-8 bg-blue-600" />
          <div className="flex items-center gap-3 overflow-x-auto">
            {stats.par_mode.map(m => (
              <div key={m.mode_paiement} className="flex items-center gap-1 text-xs bg-blue-600/50 rounded-lg px-2 py-1 flex-shrink-0">
                <span className="text-blue-200 capitalize">
                  {m.mode_paiement === 'especes' ? 'Espèces' :
                   m.mode_paiement === 'wave' ? 'Wave' :
                   m.mode_paiement === 'orange_money' ? 'OM' :
                   m.mode_paiement === 'mtn' ? 'MTN' : 'Carte'}
                </span>
                <span className="font-semibold">{fmt(m.total)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Dernière mise à jour */}
      {lastUpdate && (
        <div className="text-xs text-blue-300 hidden md:block">
          MàJ {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {/* Bouton refresh */}
      <button
        onClick={load}
        disabled={loading}
        className="p-1.5 hover:bg-blue-600 rounded-lg transition-colors"
        title="Actualiser"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      </button>

      {/* Bouton toggle visibilité */}
      <button
        onClick={toggleVisible}
        className="p-1.5 hover:bg-blue-600 rounded-lg transition-colors"
        title={visible ? 'Masquer les montants' : 'Afficher les montants'}
      >
        {visible ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
    </div>
  )
}
