import { useState, useEffect } from 'react'
import { alertesGetRegles, alertesUpdateRegle, alertesRunAuto, getAlertes, marquerAlerteLue } from '@/lib/ipc'
import { Bell, Settings, Play, Check, AlertTriangle, Package, CreditCard, Star, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

const TYPE_CONFIG: Record<string, { label: string; icon: JSX.Element; color: string; desc: string }> = {
  stock_faible: {
    label: 'Stock faible',
    icon: <Package size={18} />,
    color: 'orange',
    desc: 'Génère une alerte quand un produit est en dessous de son stock minimum'
  },
  ardoise_ancienne: {
    label: 'Ardoise ancienne',
    icon: <CreditCard size={18} />,
    color: 'red',
    desc: 'Signale les clients ayant une ardoise non remboursée depuis X jours'
  },
  fidelite_palier: {
    label: 'Palier fidélité',
    icon: <Star size={18} />,
    color: 'amber',
    desc: 'Alerte quand un client atteint un palier de points de fidélité'
  }
}

export default function Automatisations() {
  const [regles, setRegles] = useState<any[]>([])
  const [alertes, setAlertes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState<{ nouvelles: number; details: string[] } | null>(null)
  const [showAlertes, setShowAlertes] = useState(true)

  const load = async () => {
    try {
      const [r, a] = await Promise.all([alertesGetRegles(), getAlertes(false)])
      setRegles(r)
      setAlertes(a as any[])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleRegle = async (id: number, actif: boolean) => {
    await alertesUpdateRegle(id, { actif: actif ? 1 : 0 })
    setRegles(prev => prev.map(r => r.id === id ? { ...r, actif: actif ? 1 : 0 } : r))
  }

  const updateParam = async (id: number, params: Record<string, any>) => {
    await alertesUpdateRegle(id, { params: JSON.stringify(params) })
    setRegles(prev => prev.map(r => r.id === id ? { ...r, params: JSON.stringify(params) } : r))
  }

  const runAuto = async () => {
    setRunning(true)
    try {
      const res = await alertesRunAuto()
      setLastRun(res)
      await load()
    } catch {}
    setRunning(false)
  }

  const markLue = async (id: number) => {
    await marquerAlerteLue(id)
    setAlertes(prev => prev.filter(a => a.id !== id))
  }

  const nonLues = alertes.filter(a => !a.lu)

  const ALERTE_ICONS: Record<string, string> = {
    stock_faible: '📦', ardoise: '💳', fidelite: '⭐', info: 'ℹ️'
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center">
            <Bell size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Alertes & Automatisations</h1>
            <p className="text-gray-500 text-sm">Règles automatiques et notifications</p>
          </div>
        </div>
        <button onClick={runAuto} disabled={running}
          className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-rose-700 disabled:opacity-50 transition-all">
          {running ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Play size={16} />}
          Lancer la vérification
        </button>
      </div>

      {/* Résultat dernière vérif */}
      {lastRun && (
        <div className={`rounded-xl p-4 border ${lastRun.nouvelles > 0 ? 'bg-orange-50 border-orange-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <div className="flex items-center gap-2">
            {lastRun.nouvelles > 0
              ? <AlertTriangle size={16} className="text-orange-600" />
              : <Check size={16} className="text-emerald-600" />}
            <span className={`font-semibold text-sm ${lastRun.nouvelles > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
              {lastRun.nouvelles > 0
                ? `${lastRun.nouvelles} nouvelle(s) alerte(s) générée(s)`
                : 'Aucune nouvelle alerte — tout va bien !'}
            </span>
          </div>
          {lastRun.details.length > 0 && (
            <ul className="mt-2 space-y-1">
              {lastRun.details.map((d, i) => (
                <li key={i} className="text-xs text-orange-600 ml-6">• {d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Règles d'automatisation */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center gap-2">
          <Settings size={16} className="text-gray-500" />
          <h2 className="font-bold text-gray-800">Règles automatiques</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {regles.map(regle => {
              const config = TYPE_CONFIG[regle.type]
              if (!config) return null
              const params = JSON.parse(regle.params || '{}')
              const isActive = Boolean(regle.actif)

              return (
                <div key={regle.id} className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                      bg-${config.color}-50 text-${config.color}-600`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-bold text-gray-800">{config.label}</h3>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={isActive}
                            onChange={e => toggleRegle(regle.id, e.target.checked)}
                            className="sr-only peer" />
                          <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:bg-rose-500 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                        </label>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mb-3">{config.desc}</p>

                      {/* Paramètres spécifiques */}
                      {regle.type === 'ardoise_ancienne' && (
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600">Délai :</label>
                          <input type="number" min={1} max={365}
                            value={params.jours ?? 30}
                            onChange={e => updateParam(regle.id, { ...params, jours: Number(e.target.value) })}
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-rose-300" />
                          <span className="text-sm text-gray-500">jours sans remboursement</span>
                        </div>
                      )}
                      {regle.type === 'fidelite_palier' && (
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600">Palier :</label>
                          <input type="number" min={1}
                            value={params.points ?? 100}
                            onChange={e => updateParam(regle.id, { ...params, points: Number(e.target.value) })}
                            className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-rose-300" />
                          <span className="text-sm text-gray-500">points fidélité</span>
                        </div>
                      )}

                      {regle.derniere_execution && (
                        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                          <RefreshCw size={10} />
                          Dernière vérif : {new Date(regle.derniere_execution).toLocaleString('fr-FR')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Alertes en cours */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button onClick={() => setShowAlertes(a => !a)}
          className="w-full p-5 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-all">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-gray-500" />
            <h2 className="font-bold text-gray-800">Alertes en cours</h2>
            {nonLues.length > 0 && (
              <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">{nonLues.length}</span>
            )}
          </div>
          {showAlertes ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {showAlertes && (
          <div className="divide-y divide-gray-50">
            {nonLues.length === 0 ? (
              <div className="py-10 text-center">
                <Check size={32} className="text-emerald-400 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Aucune alerte non lue</p>
              </div>
            ) : (
              nonLues.map((a: any) => (
                <div key={a.id} className="flex items-start gap-3 p-4 hover:bg-gray-50">
                  <span className="text-xl mt-0.5">{ALERTE_ICONS[a.type] || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{a.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(a.created_at || a.date || '').toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                  <button onClick={() => markLue(a.id)}
                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg flex-shrink-0 transition-all"
                    title="Marquer comme lue">
                    <Check size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
