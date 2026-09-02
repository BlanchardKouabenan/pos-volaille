import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useSessionStore } from '@/store/sessionStore'
import { getStatsDuJour, getVenteStats, getLowStockProduits, formatCurrency } from '@/lib/ipc'
import {
  LayoutDashboard, TrendingUp, ShoppingBag, Receipt, Wallet, Package,
  AlertTriangle, ArrowRight, ChevronRight
} from 'lucide-react'

const today = () => new Date().toISOString().slice(0, 10)
const sub = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
const fmtN = (v: any) => Math.round(Number(v ?? 0)).toLocaleString('fr-FR')

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces', wave: 'Wave', orange_money: 'Orange Money', mtn: 'MTN Money', carte: 'Carte', ardoise: 'Ardoise'
}
const MODE_COLORS: Record<string, string> = {
  especes: '#10b981', wave: '#06b6d4', orange_money: '#f97316', mtn: '#eab308', carte: '#a855f7', ardoise: '#ef4444'
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const session = useSessionStore(s => s.session)
  const [jour, setJour] = useState<any>(null)
  const [week, setWeek] = useState<any>(null)
  const [lowStock, setLowStock] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getStatsDuJour(),
      getVenteStats(sub(6), today()),
      getLowStockProduits().catch(() => [])
    ]).then(([j, w, ls]) => {
      setJour(j)
      setWeek(w)
      setLowStock(ls)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const ca = Number(jour?.ca ?? 0)
  const nb = Number(jour?.nb_ventes ?? 0)
  const panier = nb > 0 ? ca / nb : 0

  // Variation CA vs hier
  const parJourMap = new Map((week?.parJour ?? []).map((d: any) => [d.jour, Number(d.ca ?? 0)]))
  const caHier = Number(parJourMap.get(sub(1)) ?? 0)
  const variation = caHier > 0 ? ((ca - caHier) / caHier) * 100 : (ca > 0 ? null : 0)

  const parMode = (jour?.par_mode ?? []).sort((a: any, b: any) => Number(b.total) - Number(a.total))
  const totMode = parMode.reduce((s: number, m: any) => s + Number(m.total ?? 0), 0)
  const topProduits = (week?.topProduits ?? []).slice(0, 5)
  const maxProdCa = Math.max(...topProduits.map((p: any) => Number(p.ca ?? 0)), 1)

  const kpis = [
    { label: "Chiffre d'affaires du jour", value: formatCurrency(ca, 'FCFA'), icon: <TrendingUp size={22} />, color: 'from-emerald-400 to-emerald-600' },
    { label: 'Ventes du jour', value: fmtN(nb), icon: <ShoppingBag size={22} />, color: 'from-blue-400 to-blue-600' },
    { label: 'Panier moyen', value: formatCurrency(panier, 'FCFA'), icon: <Receipt size={22} />, color: 'from-purple-400 to-purple-600' },
    { label: 'Fond de caisse (session)', value: formatCurrency(Number(jour?.fond_caisse ?? 0), 'FCFA'), icon: <Wallet size={22} />, color: 'from-amber-400 to-amber-600' },
  ]

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-full">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Tableau de bord</h1>
          <p className="text-gray-500 text-sm">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} — Bonjour {user?.nom}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/caisse" className="h-12 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center gap-2 font-semibold text-sm transition-all">
            <LayoutDashboard size={18} /> Ouvrir la caisse
          </Link>
          <Link to="/transactions" className="h-12 px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all border border-gray-200">
            <Receipt size={18} /> Transactions
          </Link>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${k.color} flex items-center justify-center text-white mb-3`}>
              {k.icon}
            </div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{k.label}</p>
            <p className="text-xl font-black text-gray-900 truncate">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Variation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Évolution CA 7 jours */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2"><TrendingUp size={18} className="text-emerald-600" /> Évolution du CA — 7 jours</h2>
            {variation !== null && (
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${variation >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {variation >= 0 ? '▲' : '▼'} {Math.abs(variation).toFixed(1)}% vs hier
              </span>
            )}
          </div>
          {(week?.parJour ?? []).length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-10">Aucune donnée sur la période</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {(week?.parJour ?? []).map((d: any) => {
                const v = Number(d.ca ?? 0)
                const max = Math.max(...(week?.parJour ?? []).map((x: any) => Number(x.ca ?? 0)), 1)
                return (
                  <div key={d.jour} className="flex flex-col items-center flex-1 min-w-0 group">
                    <div className="w-full flex items-end flex-1">
                      <div
                        className={`w-full rounded-t-md transition-all group-hover:opacity-80 ${d.jour === today() ? 'bg-blue-500' : 'bg-emerald-500'}`}
                        style={{ height: `${Math.max((v / max) * 78, 3)}%` }}
                        title={`${d.jour.slice(8, 10)}/${d.jour.slice(5, 7)} : ${fmtN(v)} FCFA (${d.nb} ventes)`}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{d.jour.slice(5, 10).replace('-', '/')}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Encaissements du jour par mode */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Wallet size={18} className="text-blue-600" /> Encaissements du jour</h2>
          {parMode.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Aucun encaissement</p>
          ) : (
            <div className="space-y-3">
              {parMode.map((m: any) => (
                <div key={m.mode_paiement} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: MODE_COLORS[m.mode_paiement] || '#6b7280' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium text-gray-700 truncate">{MODE_LABELS[m.mode_paiement] || m.mode_paiement}</span>
                      <span className="text-sm font-bold text-gray-800 ml-2 flex-shrink-0">{formatCurrency(Number(m.total ?? 0), 'FCFA')}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${totMode > 0 ? (Number(m.total) / totMode) * 100 : 0}%`, backgroundColor: MODE_COLORS[m.mode_paiement] || '#6b7280' }} />
                    </div>
                    <span className="text-xs text-gray-400">{m.nb} vente(s)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top produits 7 jours */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2"><Package size={18} className="text-orange-500" /> Top 5 produits (7 jours)</h2>
            <Link to="/analytics" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">Analytics <ChevronRight size={14} /></Link>
          </div>
          {topProduits.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Aucune vente sur la période</p>
          ) : (
            <div className="space-y-3">
              {topProduits.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800 truncate">{p.nom}</span>
                      <span className="text-sm font-bold text-gray-800 ml-2 flex-shrink-0">{formatCurrency(Number(p.ca ?? 0), 'FCFA')}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style={{ width: `${(Number(p.ca ?? 0) / maxProdCa) * 100}%` }} />
                    </div>
                    <span className="text-xs text-gray-400">{fmtN(p.qte_vendue)} vendus</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock bas */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2"><AlertTriangle size={18} className="text-red-500" /> Stock bas</h2>
            {lowStock.length > 0 && (
              <Link to="/stock" className="text-sm text-red-500 hover:text-red-600 font-medium flex items-center gap-1">Gérer <ChevronRight size={14} /></Link>
            )}
          </div>
          {lowStock.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Aucun produit en stock bas</p>
          ) : (
            <div className="space-y-2">
              {lowStock.slice(0, 6).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  <span className="text-sm text-gray-700 truncate">{p.nom}</span>
                  <span className="text-sm font-bold text-red-600 flex-shrink-0">{fmtN(p.stock_actuel)} / {fmtN(p.stock_minimum)}</span>
                </div>
              ))}
              {lowStock.length > 6 && (
                <Link to="/stock" className="text-xs text-gray-400 flex items-center gap-1 pt-1">
                  {lowStock.length - 6} autre(s) <ArrowRight size={12} />
                </Link>
              )}
            </div>
          )}
          {session && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400">
              Session caisse : <span className="font-semibold text-gray-600">ouverte</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}