import { useState, useEffect } from 'react'
import { analyticsDashboard, boutiqueGetAll, formatCurrency } from '@/lib/ipc'
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns'
import { BarChart3, TrendingUp, ShoppingBag, Users, Package, Repeat2 } from 'lucide-react'

const today = () => format(new Date(), 'yyyy-MM-dd')
const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
const fmtN = (v: any) => Math.round(Number(v ?? 0)).toLocaleString('fr-FR')

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces', wave: 'Wave', orange_money: 'Orange Money', mtn: 'MTN Money', carte: 'Carte', ardoise: 'Ardoise'
}
const MODE_COLORS: Record<string, string> = {
  especes: '#10b981', wave: '#06b6d4', orange_money: '#f97316', mtn: '#eab308', carte: '#a855f7', ardoise: '#ef4444'
}

type Periode = '7j' | '30j' | 'mois' | 'semaine' | 'custom'

function getPeriode(p: Periode): { debut: string; fin: string } {
  const now = new Date()
  switch (p) {
    case '7j': return { debut: fmt(subDays(now, 6)), fin: today() }
    case '30j': return { debut: fmt(subDays(now, 29)), fin: today() }
    case 'mois': return { debut: fmt(startOfMonth(now)), fin: fmt(endOfMonth(now)) }
    case 'semaine': return { debut: fmt(startOfWeek(now, { weekStartsOn: 1 })), fin: fmt(endOfWeek(now, { weekStartsOn: 1 })) }
    default: return { debut: today(), fin: today() }
  }
}

// ─── Mini bar chart CSS ──────────────────────────────────────────────────────
function BarChart({ data, color = '#10b981', labelKey = 'label', valueKey = 'value' }:
  { data: { [k: string]: any }[]; color?: string; labelKey?: string; valueKey?: string }) {
  if (!data.length) return <p className="text-gray-400 text-sm text-center py-8">Aucune donnée</p>
  const max = Math.max(...data.map(d => Number(d[valueKey] ?? 0)), 1)
  return (
    <div className="flex items-end gap-1 h-40 w-full">
      {data.map((d, i) => {
        const pct = (Number(d[valueKey] ?? 0) / max) * 100
        return (
          <div key={i} className="flex flex-col items-center flex-1 min-w-0 group">
            <div className="relative flex-1 flex items-end w-full">
              <div title={`${d[labelKey]}: ${fmtN(d[valueKey])}`}
                className="w-full rounded-t-sm transition-all hover:opacity-80 cursor-default"
                style={{ height: `${Math.max(pct, 2)}%`, backgroundColor: color }} />
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                {fmtN(d[valueKey])}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1 truncate w-full text-center" title={String(d[labelKey])}>
              {String(d[labelKey]).slice(-5)}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ─── Donut chart SVG ─────────────────────────────────────────────────────────
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <p className="text-gray-400 text-sm text-center py-8">Aucune donnée</p>
  let offset = 0
  const r = 60
  const circ = 2 * Math.PI * r
  const cx = 80
  const cy = 80
  const segments = data.map(d => {
    const pct = d.value / total
    const dash = pct * circ
    const seg = { ...d, pct, dash, offset }
    offset += dash
    return seg
  })
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 160 160" className="w-36 h-36 flex-shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth="20" />
        {segments.map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth="20"
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={-s.offset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '80px 80px' }} />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="text-xs" fontSize="11" fill="#6b7280">Total</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#111827" fontWeight="bold">
          {fmtN(total)}
        </text>
      </svg>
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-gray-600 truncate flex-1">{d.label}</span>
            <span className="font-semibold text-gray-800 flex-shrink-0">{((d.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Heatmap heures ──────────────────────────────────────────────────────────
function HeatmapHeure({ data }: { data: { heure: number; nb: number; ca: number }[] }) {
  const map: Record<number, { nb: number; ca: number }> = {}
  for (const d of data) map[d.heure] = d
  const maxCa = Math.max(...Object.values(map).map(d => d.ca), 1)
  const heures = Array.from({ length: 24 }, (_, i) => i)
  return (
    <div className="flex flex-wrap gap-1.5">
      {heures.map(h => {
        const d = map[h]
        const intensity = d ? Math.max(0.1, d.ca / maxCa) : 0
        return (
          <div key={h} title={d ? `${h}h: ${d.nb} ventes — ${fmtN(d.ca)} FCFA` : `${h}h: aucune vente`}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-medium cursor-default transition-all hover:scale-110"
            style={{
              backgroundColor: d ? `rgba(16, 185, 129, ${intensity})` : '#f3f4f6',
              color: intensity > 0.5 ? 'white' : '#6b7280'
            }}>
            {h}h
          </div>
        )
      })}
    </div>
  )
}

export default function Analytics() {
  const [periode, setPeriode] = useState<Periode>('7j')
  const [customDebut, setCustomDebut] = useState(fmt(subDays(new Date(), 29)))
  const [customFin, setCustomFin] = useState(today())
  const [boutiqueId, setBoutiqueId] = useState<number | undefined>(undefined)
  const [boutiques, setBoutiques] = useState<any[]>([])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    boutiqueGetAll().then(b => setBoutiques(b)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [periode, customDebut, customFin, boutiqueId])

  const load = async () => {
    setLoading(true)
    try {
      const { debut, fin } = periode === 'custom' ? { debut: customDebut, fin: customFin } : getPeriode(periode)
      const d = await analyticsDashboard(debut, fin, boutiqueId)
      setData(d)
    } catch {}
    setLoading(false)
  }

  const totaux = data?.totaux ?? {}
  const ca = Number(totaux.ca_total ?? 0)
  const nb = Number(totaux.nb_ventes ?? 0)
  const panier = Number(totaux.panier_moyen ?? 0)

  // Données pour donut mode paiement
  const donutData = (data?.parMode ?? []).map((m: any) => ({
    label: MODE_LABELS[m.mode_paiement] || m.mode_paiement,
    value: Number(m.ca ?? 0),
    color: MODE_COLORS[m.mode_paiement] || '#6b7280'
  }))

  // Top produits
  const topProduits = data?.topProduits ?? []
  const maxProdCa = Math.max(...topProduits.map((p: any) => Number(p.ca ?? 0)), 1)

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header + filtres */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <BarChart3 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Analytics</h1>
            <p className="text-gray-500 text-sm">Tableaux de bord avancés</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtre boutique */}
          {boutiques.length > 1 && (
            <select value={boutiqueId ?? ''} onChange={e => setBoutiqueId(e.target.value ? Number(e.target.value) : undefined)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="">Toutes les boutiques</option>
              {boutiques.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </select>
          )}

          {/* Filtre période */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {(['7j','semaine','mois','30j','custom'] as Periode[]).map(p => (
              <button key={p} onClick={() => setPeriode(p)}
                className={`px-3 py-2 text-sm font-medium transition-all ${periode === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {p === '7j' ? '7 jours' : p === '30j' ? '30 jours' : p === 'mois' ? 'Ce mois' : p === 'semaine' ? 'Semaine' : 'Perso'}
              </button>
            ))}
          </div>

          {periode === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customDebut} onChange={e => setCustomDebut(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <span className="text-gray-400">→</span>
              <input type="date" value={customFin} onChange={e => setCustomFin(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Chiffre d\'affaires', value: `${fmtN(ca)} FCFA`, icon: <TrendingUp size={20} />, color: 'emerald' },
              { label: 'Nombre de ventes', value: fmtN(nb), icon: <ShoppingBag size={20} />, color: 'blue' },
              { label: 'Panier moyen', value: `${fmtN(panier)} FCFA`, icon: <BarChart3 size={20} />, color: 'purple' },
              { label: 'Retours', value: `${fmtN(data?.retours?.nb ?? 0)} (${fmtN(data?.retours?.montant ?? 0)} FCFA)`, icon: <Repeat2 size={20} />, color: 'red' },
            ].map((k, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 bg-${k.color}-50 text-${k.color}-600`}>
                  {k.icon}
                </div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{k.label}</p>
                <p className="text-xl font-black text-gray-900">{k.value}</p>
              </div>
            ))}
          </div>

          {/* CA par jour */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-emerald-600" /> Évolution du CA</h2>
            <BarChart
              data={(data?.caParJour ?? []).map((d: any) => ({ label: d.jour, value: Number(d.ca ?? 0) }))}
              color="#10b981"
              labelKey="label"
              valueKey="value"
            />
          </div>

          {/* Mode paiement + Heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Package size={18} className="text-blue-600" /> Modes de paiement</h2>
              <DonutChart data={donutData} />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Users size={18} className="text-purple-600" /> Heures d'affluence</h2>
              <HeatmapHeure data={data?.parHeure ?? []} />
              <p className="text-xs text-gray-400 mt-3">Plus la case est verte, plus le CA est élevé</p>
            </div>
          </div>

          {/* Top produits */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><BarChart3 size={18} className="text-orange-500" /> Top 10 produits (CA)</h2>
            {topProduits.length === 0 ? (
              <p className="text-gray-400 text-sm">Aucune donnée</p>
            ) : (
              <div className="space-y-3">
                {topProduits.map((p: any, i: number) => {
                  const pct = (Number(p.ca ?? 0) / maxProdCa) * 100
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800 truncate">{p.nom}</span>
                          <span className="text-sm font-bold text-emerald-700 ml-2 flex-shrink-0">{fmtN(p.ca)} FCFA</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all"
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{fmtN(p.qte)} vendus</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top catégories */}
          {(data?.topCategories ?? []).length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-bold text-gray-800 mb-4">Top catégories</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(data?.topCategories ?? []).map((c: any, i: number) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4">
                    <p className="font-semibold text-gray-800 text-sm truncate">{c.nom}</p>
                    <p className="text-emerald-700 font-black text-lg">{fmtN(c.ca)}</p>
                    <p className="text-gray-400 text-xs">FCFA — {fmtN(c.qte)} vendus</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
