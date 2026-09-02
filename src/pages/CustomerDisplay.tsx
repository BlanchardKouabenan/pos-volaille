import { useState, useEffect } from 'react'

interface CartLine { nom: string; quantite: number; prix_unitaire: number; total_ligne: number; unite: string }
interface CustomerData {
  items: CartLine[]
  total: number
  remise: number
  monnaie: string
  nom_entreprise: string
  logo?: string
  client?: string
  solde_points?: number
  points_gagnes_estimes?: number
  valeur_point_fcfa?: number
  statut: 'idle' | 'shopping' | 'payment' | 'done'
  mode_paiement?: string
  monnaie_rendue?: number
}

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces', wave: 'Wave', orange_money: 'Orange Money',
  mtn: 'MTN Money', carte: 'Carte', ardoise: 'Ardoise'
}

export default function CustomerDisplay() {
  const [data, setData] = useState<CustomerData>({
    items: [], total: 0, remise: 0, monnaie: 'FCFA',
    nom_entreprise: 'KB POS', statut: 'idle'
  })
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.customer) return
    api.customer.onUpdate((d: CustomerData) => setData(d))
    return () => api.customer.removeListeners()
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const fmt = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} ${data.monnaie}`
  const vp = data.valeur_point_fcfa ?? 1

  // ── ÉCRAN IDLE : Logo + Heure ──────────────────────────────────────────────
  if (data.statut === 'idle') {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-emerald-800 to-emerald-600 flex flex-col items-center justify-center text-white select-none">
        <div className="text-8xl mb-8">🐓</div>
        <h1 className="text-5xl font-black tracking-tight mb-3">{data.nom_entreprise}</h1>
        <p className="text-emerald-200 text-xl">Bienvenue !</p>
        <div className="mt-16 text-4xl font-light text-emerald-300">
          {time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <p className="text-emerald-400 text-sm mt-2">
          {time.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
    )
  }

  // ── ÉCRAN DONE : Merci + Résumé ─────────────────────────────────────────────
  if (data.statut === 'done') {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-blue-700 to-emerald-600 flex flex-col items-center justify-center text-white select-none p-8">
        <div className="text-8xl mb-6 animate-bounce">🎉</div>
        <h1 className="text-5xl font-black mb-2">Merci !</h1>
        {data.client && <p className="text-2xl text-blue-200 mb-6">Au revoir, {data.client} 👋</p>}
        <div className="bg-white/10 backdrop-blur rounded-3xl p-8 text-center max-w-lg w-full space-y-3">
          <div className="text-2xl font-bold">
            Total payé : <span className="text-yellow-300">{fmt(data.total)}</span>
          </div>
          {data.mode_paiement && (
            <p className="text-blue-200 text-lg">
              via {MODE_LABELS[data.mode_paiement] || data.mode_paiement}
            </p>
          )}
          {data.monnaie_rendue && data.monnaie_rendue > 0 && (
            <p className="text-yellow-200 text-xl font-semibold">
              Monnaie : {fmt(data.monnaie_rendue)}
            </p>
          )}
          {data.points_gagnes_estimes && data.points_gagnes_estimes > 0 && (
            <div className="bg-amber-400/20 rounded-2xl p-4 mt-4">
              <p className="text-amber-200 text-xl font-bold">
                ★ +{data.points_gagnes_estimes} points gagnés
              </p>
              <p className="text-amber-300 text-base">
                soit {fmt(Math.round(data.points_gagnes_estimes * vp))}
              </p>
              {data.solde_points !== undefined && (
                <p className="text-amber-400 text-sm mt-1">
                  Solde total : {data.solde_points} pts = {fmt(Math.round(data.solde_points * vp))}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── ÉCRAN SHOPPING / PAIEMENT : Panier ─────────────────────────────────────
  return (
    <div className="h-screen w-screen bg-gray-50 flex flex-col select-none overflow-hidden">
      {/* Header */}
      <div className="bg-emerald-700 text-white px-8 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🐓</span>
          <div>
            <h1 className="text-2xl font-black">{data.nom_entreprise}</h1>
            {data.client && <p className="text-emerald-200 text-sm">Bonjour, {data.client} !</p>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg text-emerald-200">
            {time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          {data.statut === 'payment' && (
            <div className="bg-yellow-400 text-yellow-900 text-sm font-bold px-3 py-1 rounded-full mt-1 animate-pulse">
              En cours de paiement...
            </div>
          )}
        </div>
      </div>

      {/* Corps : liste articles + total */}
      <div className="flex flex-1 overflow-hidden">
        {/* Articles */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300">
              <span className="text-8xl mb-4">🛒</span>
              <p className="text-2xl font-light">En attente d'articles...</p>
            </div>
          ) : (
            data.items.map((item, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-bold text-gray-800 text-xl">{item.nom}</p>
                  <p className="text-gray-400 text-base">
                    {item.quantite} {item.unite} × {Math.round(item.prix_unitaire).toLocaleString('fr-FR')} {data.monnaie}
                  </p>
                </div>
                <div className="text-2xl font-black text-emerald-700">
                  {Math.round(item.total_ligne).toLocaleString('fr-FR')} {data.monnaie}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Panel total */}
        <div className="w-72 bg-white border-l border-gray-200 flex flex-col p-6 justify-between flex-shrink-0">
          <div>
            {data.remise > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-gray-500 text-lg">
                  <span>Sous-total</span>
                  <span>{fmt(data.total + data.remise)}</span>
                </div>
                <div className="flex justify-between text-orange-600 font-semibold text-lg">
                  <span>Remise</span>
                  <span>-{fmt(data.remise)}</span>
                </div>
              </div>
            )}

            <div className="bg-emerald-50 rounded-2xl p-5 text-center">
              <p className="text-gray-500 text-sm uppercase tracking-wide mb-1">Total</p>
              <div className="text-5xl font-black text-emerald-700">
                {Math.round(data.total).toLocaleString('fr-FR')}
              </div>
              <div className="text-2xl text-emerald-500 font-semibold">{data.monnaie}</div>
            </div>

            {/* Points estimés */}
            {data.points_gagnes_estimes !== undefined && data.points_gagnes_estimes > 0 && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                <p className="text-amber-600 font-bold text-base">
                  ★ Vous allez gagner
                </p>
                <p className="text-amber-800 text-2xl font-black">
                  +{data.points_gagnes_estimes} pts
                </p>
                <p className="text-amber-500 text-sm">
                  = {fmt(Math.round(data.points_gagnes_estimes * vp))}
                </p>
                {data.solde_points !== undefined && (
                  <p className="text-amber-400 text-xs mt-1">
                    Nouveau solde : {data.solde_points + data.points_gagnes_estimes} pts
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="text-center text-gray-300 text-sm pt-4 border-t border-gray-100">
            {data.items.length} article{data.items.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
