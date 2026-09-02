import { useState, useEffect } from 'react'
import { dashboardGetData, syncStartServer, syncStopServer, syncIsRunning, syncGetLocalIp, getParametres } from '@/lib/ipc'
import { TrendingUp, ShoppingCart, Package, AlertTriangle, Wifi, WifiOff, RefreshCw, Monitor } from 'lucide-react'

function KpiCard({ label, value, sub, color = 'text-amber-400' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-3xl font-black ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

export default function DashboardProprietaire() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [serverOn, setServerOn] = useState(false)
  const [localIp, setLocalIp] = useState('')
  const [port, setPort] = useState(7890)
  const [toggling, setToggling] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [d, isOn, ip, params] = await Promise.all([
        dashboardGetData(),
        syncIsRunning(),
        syncGetLocalIp(),
        getParametres()
      ])
      setData(d)
      setServerOn(isOn)
      setLocalIp(ip)
      if ((params as any)?.sync_server_port) setPort(Number((params as any).sync_server_port))
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const toggleServer = async () => {
    setToggling(true)
    try {
      if (serverOn) {
        await syncStopServer()
        setServerOn(false)
      } else {
        const r = await syncStartServer(port)
        if (r?.ok) setServerOn(true)
      }
    } catch {}
    setToggling(false)
  }

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const sd = data?.statsDuJour ?? {}
  const sm = data?.statsMois ?? {}
  const cm = data?.chargesMois ?? {}
  const marge = Number(sm?.ca_mois ?? 0) - Number(cm?.charges_mois ?? 0)

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
            <Monitor size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Dashboard Propriétaire</h1>
            <p className="text-slate-400 text-sm">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm transition-all">
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {/* Serveur mobile */}
      <div className={`mb-6 rounded-2xl p-4 border flex items-center gap-4 ${serverOn ? 'bg-emerald-900/30 border-emerald-700' : 'bg-slate-800 border-slate-700'}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${serverOn ? 'bg-emerald-600' : 'bg-slate-600'}`}>
          {serverOn ? <Wifi size={18} className="text-white" /> : <WifiOff size={18} className="text-white" />}
        </div>
        <div className="flex-1">
          <div className="font-bold text-sm">{serverOn ? 'Serveur mobile actif' : 'Serveur mobile inactif'}</div>
          {serverOn && localIp && (
            <div className="text-xs text-emerald-400 mt-0.5">
              Accès mobile : <span className="font-mono font-bold">http://{localIp}:{port}</span>
              <span className="text-slate-400 ml-2">— Ouvrez ce lien sur votre téléphone (même réseau WiFi)</span>
            </div>
          )}
          {!serverOn && <div className="text-xs text-slate-400">Démarrez le serveur pour accéder au dashboard depuis votre téléphone</div>}
        </div>
        <div className="flex items-center gap-3">
          {!serverOn && (
            <input type="number" value={port} onChange={e => setPort(Number(e.target.value))}
              className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded-lg text-xs text-center"
              placeholder="Port" />
          )}
          <button onClick={toggleServer} disabled={toggling}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${serverOn ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'} disabled:opacity-50`}>
            {toggling ? '...' : serverOn ? 'Arrêter' : 'Démarrer'}
          </button>
        </div>
      </div>

      {/* KPIs du jour */}
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Aujourd'hui</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="CA du jour" value={`${fmt(sd.ca ?? 0)}`} sub="FCFA" />
        <KpiCard label="Ventes" value={String(sd.nb_ventes ?? 0)} sub="transactions" color="text-blue-400" />
        <KpiCard label="Panier moyen" value={`${fmt(sd.panier_moyen ?? 0)}`} sub="FCFA" color="text-violet-400" />
        <KpiCard label="Produits en rupture" value={String(data?.stockBas?.length ?? 0)} sub="alertes stock" color={data?.stockBas?.length > 0 ? 'text-red-400' : 'text-emerald-400'} />
      </div>

      {/* KPIs du mois */}
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Ce mois</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="CA du mois" value={`${fmt(sm.ca_mois ?? 0)}`} sub="FCFA" />
        <KpiCard label="Nb ventes mois" value={String(sm.nb_ventes_mois ?? 0)} sub="transactions" color="text-blue-400" />
        <KpiCard label="Charges mois" value={`${fmt(cm.charges_mois ?? 0)}`} sub="FCFA" color="text-red-400" />
        <KpiCard label="Marge brute" value={`${fmt(marge)}`} sub="FCFA" color={marge >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* CA 7 jours */}
        <div className="lg:col-span-2 bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <h3 className="text-sm font-bold text-slate-300 mb-4">Évolution CA — 7 derniers jours</h3>
          <div className="flex items-end gap-1.5 h-32">
            {(data?.ca7j ?? []).map((d: any, i: number) => {
              const max = Math.max(...(data?.ca7j ?? []).map((x: any) => Number(x.ca)), 1)
              const pct = (Number(d.ca) / max) * 100
              const jour = new Date(d.jour + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs text-slate-400">{fmt(Number(d.ca))}</div>
                  <div className="w-full bg-amber-400 rounded-t-sm transition-all" style={{ height: `${pct}%`, minHeight: 2 }} />
                  <div className="text-xs text-slate-500 truncate w-full text-center">{jour}</div>
                </div>
              )
            })}
            {!(data?.ca7j?.length) && <p className="text-slate-500 text-sm self-center mx-auto">Pas de données</p>}
          </div>
        </div>

        {/* Modes de paiement */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <h3 className="text-sm font-bold text-slate-300 mb-4">Paiements du jour</h3>
          <div className="space-y-2">
            {(data?.modePaiement ?? []).map((mp: any, i: number) => {
              const total = (data?.modePaiement ?? []).reduce((s: number, x: any) => s + Number(x.montant), 0) || 1
              const pct = Math.round((Number(mp.montant) / total) * 100)
              const colors = ['bg-amber-400', 'bg-blue-400', 'bg-emerald-400', 'bg-violet-400', 'bg-red-400']
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 capitalize">{mp.mode_paiement.replace('_', ' ')}</span>
                    <span className="text-slate-400">{pct}% • {mp.nb} vente{mp.nb > 1 ? 's' : ''}</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full">
                    <div className={`h-1.5 ${colors[i % colors.length]} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {!(data?.modePaiement?.length) && <p className="text-slate-500 text-sm">Aucune vente aujourd'hui</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top produits */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold text-slate-300">Top produits du jour</h3>
          </div>
          <div className="space-y-2">
            {(data?.topProduits ?? []).map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-700/50">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-slate-700 rounded-full text-xs flex items-center justify-center text-slate-400 font-bold">{i + 1}</span>
                  <span className="text-sm text-slate-200">{p.nom}</span>
                </div>
                <span className="text-sm font-bold text-amber-400">{fmt(Number(p.ca))} FCFA</span>
              </div>
            ))}
            {!(data?.topProduits?.length) && <p className="text-slate-500 text-sm">Aucune vente aujourd'hui</p>}
          </div>
        </div>

        {/* Stock faible */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-red-400" />
            <h3 className="text-sm font-bold text-slate-300">Stock faible</h3>
          </div>
          <div className="space-y-2">
            {(data?.stockBas ?? []).map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-700/50">
                <span className="text-sm text-slate-200">{p.nom}</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-red-400">{p.stock_actuel} {p.unite}</span>
                  <span className="text-xs text-slate-500 ml-1">(min {p.stock_minimum})</span>
                </div>
              </div>
            ))}
            {!(data?.stockBas?.length) && (
              <div className="flex items-center gap-2 text-emerald-400">
                <Package size={16} />
                <p className="text-sm">Tout est en stock ✓</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Par boutique */}
      {(data?.boutiques?.length ?? 0) > 1 && (
        <div className="mt-5 bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold text-slate-300">Performance par boutique — aujourd'hui</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(data?.boutiques ?? []).map((b: any, i: number) => (
              <div key={i} className="bg-slate-700/50 rounded-xl p-3">
                <div className="text-xs text-slate-400 truncate">{b.nom}</div>
                <div className="text-lg font-black text-amber-400">{fmt(b.ca)} FCFA</div>
                <div className="text-xs text-slate-500">{b.nb} vente{b.nb > 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
