import { useState, useEffect } from 'react'
import {
  getVenteStats, getVentes, formatCurrency, getParametres,
  getChargesStats, getTiroirLog, dialogSaveFile, getCharges
} from '@/lib/ipc'
import type { VenteStats, Vente, TiroirLog, Charge } from '@/types'
import * as XLSX from 'xlsx'
import {
  BarChart3, TrendingUp, ShoppingBag, Banknote, Smartphone, CreditCard,
  Calendar, Printer, Download, TrendingDown, UnlockKeyhole, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  subWeeks, subMonths, startOfYear, endOfYear, subYears } from 'date-fns'
import { fr } from 'date-fns/locale'

const today = () => format(new Date(), 'yyyy-MM-dd')

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces', wave: 'Wave', orange_money: 'Orange Money', mtn: 'MTN Money', carte: 'Carte bancaire'
}
const MODE_ICONS: Record<string, JSX.Element> = {
  especes: <Banknote size={18} />, wave: <Smartphone size={18} />,
  orange_money: <Smartphone size={18} />, mtn: <Smartphone size={18} />, carte: <CreditCard size={18} />
}
const MODE_COLORS: Record<string, string> = {
  especes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  wave: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  orange_money: 'bg-orange-50 text-orange-700 border-orange-200',
  mtn: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  carte: 'bg-purple-50 text-purple-700 border-purple-200'
}

type PeriodeTab = 'jour' | 'semaine' | 'mois' | 'annee' | 'personnalise' | 'tiroir' | 'charges'

function getPeriode(tab: PeriodeTab) {
  const now = new Date()
  const fmt2 = (d: Date) => format(d, 'yyyy-MM-dd')
  switch (tab) {
    case 'jour': return { debut: today(), fin: today(), prevDebut: fmt2(subDays(now, 1)), prevFin: fmt2(subDays(now, 1)) }
    case 'semaine': return {
      debut: fmt2(startOfWeek(now, { weekStartsOn: 1 })),
      fin: fmt2(endOfWeek(now, { weekStartsOn: 1 })),
      prevDebut: fmt2(startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })),
      prevFin: fmt2(endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }))
    }
    case 'mois': return {
      debut: fmt2(startOfMonth(now)),
      fin: fmt2(endOfMonth(now)),
      prevDebut: fmt2(startOfMonth(subMonths(now, 1))),
      prevFin: fmt2(endOfMonth(subMonths(now, 1)))
    }
    case 'annee': return {
      debut: fmt2(startOfYear(now)),
      fin: fmt2(endOfYear(now)),
      prevDebut: fmt2(startOfYear(subYears(now, 1))),
      prevFin: fmt2(endOfYear(subYears(now, 1)))
    }
    default: return { debut: today(), fin: today(), prevDebut: fmt2(subDays(now, 1)), prevFin: fmt2(subDays(now, 1)) }
  }
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  const abs = current - previous
  const positive = abs >= 0
  return (
    <div className={`flex items-center gap-1 text-xs font-semibold ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
      {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      <span>{positive ? '+' : ''}{pct.toFixed(1)}%</span>
      <span className="text-gray-400 font-normal">vs période préc.</span>
    </div>
  )
}

export default function Rapports() {
  const [activeTab, setActiveTab] = useState<PeriodeTab>('jour')
  const [stats, setStats] = useState<VenteStats | null>(null)
  const [prevStats, setPrevStats] = useState<VenteStats | null>(null)
  const [ventes, setVentes] = useState<Vente[]>([])
  const [tiroirLogs, setTiroirLogs] = useState<TiroirLog[]>([])
  const [charges, setCharges] = useState<Charge[]>([])
  const [chargesStats, setChargesStats] = useState<any>(null)
  const [dateDebut, setDateDebut] = useState(today())
  const [dateFin, setDateFin] = useState(today())
  const [monnaie, setMonnaie] = useState('FCFA')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    getParametres().then(p => { if (p?.monnaie) setMonnaie(p.monnaie) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeTab !== 'personnalise' && activeTab !== 'tiroir' && activeTab !== 'charges') {
      const p = getPeriode(activeTab)
      setDateDebut(p.debut)
      setDateFin(p.fin)
      loadAll(p.debut, p.fin, p.prevDebut, p.prevFin)
    } else if (activeTab === 'tiroir') {
      loadTiroir(dateDebut, dateFin)
    } else if (activeTab === 'charges') {
      loadCharges(dateDebut, dateFin)
    }
  }, [activeTab])

  const loadAll = async (debut: string, fin: string, prevDebut?: string, prevFin?: string) => {
    setLoading(true)
    try {
      const promises: Promise<any>[] = [
        getVenteStats(debut, fin),
        getVentes(debut, fin, 500)
      ]
      if (prevDebut && prevFin) promises.push(getVenteStats(prevDebut, prevFin))
      const results = await Promise.all(promises)
      setStats(results[0])
      setVentes(results[1])
      if (results[2]) setPrevStats(results[2])
    } catch {}
    setLoading(false)
  }

  const loadTiroir = async (debut = dateDebut, fin = dateFin) => {
    setLoading(true)
    try {
      const logs = await getTiroirLog(debut, fin)
      setTiroirLogs(logs)
    } catch {}
    setLoading(false)
  }

  const loadCharges = async (debut = dateDebut, fin = dateFin) => {
    setLoading(true)
    try {
      const [c, cs] = await Promise.all([getCharges(debut, fin), getChargesStats(debut, fin)])
      setCharges(c)
      setChargesStats(cs)
    } catch {}
    setLoading(false)
  }

  const handleSearch = () => {
    if (activeTab === 'tiroir') loadTiroir()
    else if (activeTab === 'charges') loadCharges()
    else {
      const p = getPeriode(activeTab)
      loadAll(dateDebut, dateFin, p.prevDebut, p.prevFin)
    }
  }

  const fmt = (v: number) => formatCurrency(v, monnaie)

  const totalCA = stats?.totalVentes?.ca ?? 0
  const totalNb = stats?.totalVentes?.nb ?? 0
  const totalRemises = stats?.totalVentes?.remises ?? 0
  const panierMoyen = totalNb > 0 ? totalCA / totalNb : 0
  const prevCA = prevStats?.totalVentes?.ca ?? 0
  const prevNb = prevStats?.totalVentes?.nb ?? 0

  const totalChargesPeriode = chargesStats?.total?.total ?? 0
  const resultatNet = totalCA - totalChargesPeriode

  const handleExportExcel = async () => {
    setExporting(true)
    try {
      const wb = XLSX.utils.book_new()

      // Feuille 1: Résumé
      const resumeData = [
        ['Rapport KB POS'],
        ['Période', `${dateDebut} au ${dateFin}`],
        [],
        ['CA Total', totalCA],
        ['Nombre de ventes', totalNb],
        ['Panier moyen', panierMoyen],
        ['Total remises', totalRemises],
        [],
        ['Par mode de paiement'],
        ['Mode', 'Nb ventes', 'Total'],
        ...(stats?.parModePaiement ?? []).map((m: any) => [MODE_LABELS[m.mode_paiement] || m.mode_paiement, m.nb, m.total])
      ]
      const wsResume = XLSX.utils.aoa_to_sheet(resumeData)
      XLSX.utils.book_append_sheet(wb, wsResume, 'Résumé')

      // Feuille 2: Détail ventes
      if (ventes.length > 0) {
        const ventesData = [
          ['N° Ticket', 'Date', 'Caissier', 'Client', 'Mode paiement', 'Total', 'Remise', 'Montant payé', 'Monnaie rendue'],
          ...ventes.map(v => [
            v.numero_ticket,
            new Date(v.date).toLocaleString('fr-FR'),
            v.caissier_nom ?? '',
            v.client_nom ?? '',
            MODE_LABELS[v.mode_paiement] || v.mode_paiement,
            v.total,
            v.remise,
            v.montant_paye,
            v.monnaie_rendue
          ])
        ]
        const wsVentes = XLSX.utils.aoa_to_sheet(ventesData)
        XLSX.utils.book_append_sheet(wb, wsVentes, 'Ventes')
      }

      // Feuille 3: Top produits
      if (stats?.topProduits && stats.topProduits.length > 0) {
        const prodsData = [
          ['Rang', 'Produit', 'Quantité vendue', 'CA'],
          ...stats.topProduits.map((p: any, i: number) => [i + 1, p.nom, p.qte_vendue, p.ca])
        ]
        const wsProds = XLSX.utils.aoa_to_sheet(prodsData)
        XLSX.utils.book_append_sheet(wb, wsProds, 'Top Produits')
      }

      // Feuille 4: Charges
      if (charges.length > 0) {
        const chargesData = [
          ['Date', 'Libellé', 'Catégorie', 'Mode paiement', 'Montant', 'Note'],
          ...charges.map(c => [c.date, c.libelle, c.categorie, c.mode_paiement, c.montant, c.note ?? ''])
        ]
        const wsCharges = XLSX.utils.aoa_to_sheet(chargesData)
        XLSX.utils.book_append_sheet(wb, wsCharges, 'Charges')
      }

      // Feuille 5: Tiroir log
      if (tiroirLogs.length > 0) {
        const tiroirData = [
          ['Date/Heure', 'Type', 'Caissier', 'N° Ticket', 'Motif'],
          ...tiroirLogs.map(t => [
            new Date(t.date_heure).toLocaleString('fr-FR'),
            t.type === 'vente' ? 'Vente' : 'Ouverture manuelle',
            t.user_nom ?? '',
            t.numero_ticket ?? '',
            t.motif ?? ''
          ])
        ]
        const wsTiroir = XLSX.utils.aoa_to_sheet(tiroirData)
        XLSX.utils.book_append_sheet(wb, wsTiroir, 'Tiroir')
      }

      const filename = `rapport_${dateDebut}_${dateFin}.xlsx`
      const filePath = await dialogSaveFile(filename)
      if (filePath) {
        // Écriture via IPC (main process a accès à fs)
        const buffer: Uint8Array = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
        const api = (window as any).electronAPI
        await api.fs.writeFile(filePath, Array.from(buffer))
      }
    } catch (err) {
      console.error('Erreur export Excel:', err)
    }
    setExporting(false)
  }

  const TABS: { id: PeriodeTab; label: string }[] = [
    { id: 'jour', label: 'Jour' },
    { id: 'semaine', label: 'Semaine' },
    { id: 'mois', label: 'Mois' },
    { id: 'annee', label: 'Année' },
    { id: 'personnalise', label: 'Personnalisé' },
    { id: 'tiroir', label: 'Tiroir' },
    { id: 'charges', label: 'Charges' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-800">Rapports & Statistiques</h1>
          <div className="flex items-center gap-2">
            <button onClick={handleExportExcel} disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl font-semibold text-sm transition-colors">
              <Download size={16} />
              {exporting ? 'Export...' : 'Excel'}
            </button>
            <button onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-colors">
              <Printer size={16} />
              Imprimer
            </button>
          </div>
        </div>

        {/* Onglets de période */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-3 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filtre date pour onglets personnalisé/tiroir/charges */}
        {(activeTab === 'personnalise' || activeTab === 'tiroir' || activeTab === 'charges') && (
          <div className="flex gap-2 items-center">
            <Calendar size={18} className="text-gray-400 flex-shrink-0" />
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-gray-400 text-sm">au</span>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleSearch} className="btn-primary py-2 px-4 text-sm">
              {loading ? '...' : 'Actualiser'}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ─── ONGLET TIROIR ────────────────────────────────────────── */}
        {activeTab === 'tiroir' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center">
                  <ShoppingBag size={18} />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Ouvertures vente</div>
                  <div className="font-bold text-gray-800 text-lg">{tiroirLogs.filter(l => l.type === 'vente').length}</div>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-500 text-white rounded-xl flex items-center justify-center">
                  <UnlockKeyhole size={18} />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Ouvertures manuelles</div>
                  <div className="font-bold text-gray-800 text-lg">{tiroirLogs.filter(l => l.type === 'ouverture_simple').length}</div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-800">Journal du tiroir</h2>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : tiroirLogs.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Aucune ouverture sur la période</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold">Date/Heure</th>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold">Type</th>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold">Caissier</th>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold">Ticket</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tiroirLogs.map(log => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-xs text-gray-600">
                            {new Date(log.date_heure).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${log.type === 'vente' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                              {log.type === 'vente' ? 'Vente' : 'Manuel'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-700">{log.user_nom || '—'}</td>
                          <td className="px-4 py-2 font-mono text-xs text-blue-600">{log.numero_ticket || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── ONGLET CHARGES ───────────────────────────────────────── */}
        {activeTab === 'charges' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-red-600 text-white rounded-xl flex items-center justify-center">
                  <TrendingDown size={18} />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Total charges</div>
                  <div className="font-bold text-red-600 text-lg">{fmt(totalChargesPeriode)}</div>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <div className="text-xs text-gray-500">CA période</div>
                  <div className="font-bold text-blue-700 text-lg">{fmt(totalCA)}</div>
                </div>
              </div>
              <div className={`bg-white rounded-2xl shadow-card p-4 flex items-center gap-3`}>
                <div className={`w-10 h-10 ${resultatNet >= 0 ? 'bg-emerald-600' : 'bg-orange-500'} text-white rounded-xl flex items-center justify-center`}>
                  <BarChart3 size={18} />
                </div>
                <div>
                  <div className="text-xs text-gray-500">Résultat net</div>
                  <div className={`font-bold text-lg ${resultatNet >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>{fmt(resultatNet)}</div>
                </div>
              </div>
            </div>

            {chargesStats?.parCategorie && chargesStats.parCategorie.length > 0 && (
              <div className="bg-white rounded-2xl shadow-card p-5">
                <h2 className="font-bold text-gray-800 mb-4">Charges par catégorie</h2>
                <div className="space-y-2">
                  {chargesStats.parCategorie.map((c: any) => {
                    const pct = totalChargesPeriode > 0 ? (c.total / totalChargesPeriode) * 100 : 0
                    return (
                      <div key={c.categorie} className="flex items-center gap-3">
                        <div className="w-28 text-sm font-medium text-gray-700 flex-shrink-0">{c.categorie}</div>
                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-3 bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-sm font-bold text-red-600 w-28 text-right flex-shrink-0">{fmt(c.total)}</div>
                        <div className="text-xs text-gray-400 w-10 flex-shrink-0">{pct.toFixed(0)}%</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-800">Détail des charges</h2>
              </div>
              {charges.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Aucune charge sur la période</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold">Date</th>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold">Libellé</th>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-semibold">Catégorie</th>
                        <th className="text-right px-4 py-2 text-xs text-gray-500 font-semibold">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {charges.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-600 text-xs">
                            {new Date(c.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                          </td>
                          <td className="px-4 py-2 font-medium text-gray-800">{c.libelle}</td>
                          <td className="px-4 py-2"><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.categorie}</span></td>
                          <td className="px-4 py-2 text-right font-bold text-red-600">{fmt(c.montant)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                      <tr>
                        <td colSpan={3} className="px-4 py-2 font-bold text-gray-700">TOTAL</td>
                        <td className="px-4 py-2 text-right font-bold text-red-700">{fmt(totalChargesPeriode)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── ONGLETS VENTES ───────────────────────────────────────── */}
        {activeTab !== 'tiroir' && activeTab !== 'charges' && (
          <>
            {/* KPIs avec comparaison */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  label: 'Chiffre d\'affaires', value: fmt(totalCA),
                  icon: <TrendingUp size={22} />, color: 'bg-blue-600',
                  prev: prevCA, current: totalCA
                },
                {
                  label: 'Panier moyen', value: fmt(panierMoyen),
                  icon: <ShoppingBag size={22} />, color: 'bg-emerald-600',
                  prev: prevNb > 0 ? (prevStats?.totalVentes?.ca ?? 0) / prevNb : 0, current: panierMoyen
                },
                {
                  label: 'Total remises', value: fmt(totalRemises),
                  icon: <BarChart3 size={22} />, color: 'bg-orange-500',
                  prev: prevStats?.totalVentes?.remises ?? 0, current: totalRemises
                },
                {
                  label: 'Ventes', value: String(totalNb),
                  icon: <ShoppingBag size={22} />, color: 'bg-purple-600',
                  prev: prevNb, current: totalNb
                }
              ].map(kpi => (
                <div key={kpi.label} className="bg-white rounded-2xl shadow-card p-4 flex items-start gap-4">
                  <div className={`w-12 h-12 ${kpi.color} text-white rounded-xl flex items-center justify-center flex-shrink-0`}>
                    {kpi.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500 font-medium">{kpi.label}</div>
                    <div className="text-xl font-bold text-gray-800">{kpi.value}</div>
                    <Delta current={kpi.current} previous={kpi.prev} />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Par mode paiement */}
              <div className="bg-white rounded-2xl shadow-card p-4">
                <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <CreditCard size={18} className="text-blue-600" />
                  Par mode de paiement
                </h2>
                {(!stats?.parModePaiement || stats.parModePaiement.length === 0) ? (
                  <p className="text-gray-400 text-sm text-center py-4">Aucune vente sur la période</p>
                ) : (
                  <div className="space-y-3">
                    {stats.parModePaiement.map((item: any) => {
                      const pct = totalCA > 0 ? (item.total / totalCA) * 100 : 0
                      return (
                        <div key={item.mode_paiement} className={`flex items-center gap-3 p-3 rounded-xl border ${MODE_COLORS[item.mode_paiement] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                          {MODE_ICONS[item.mode_paiement] || <Banknote size={18} />}
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-semibold text-sm">{MODE_LABELS[item.mode_paiement]}</span>
                              <span className="font-bold text-sm">{fmt(item.total)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-black/10 rounded-full">
                                <div className="h-1.5 bg-current rounded-full opacity-60" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs opacity-70">{item.nb} vente(s)</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Top produits */}
              <div className="bg-white rounded-2xl shadow-card p-4">
                <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <TrendingUp size={18} className="text-emerald-600" />
                  Top produits vendus
                </h2>
                {(!stats?.topProduits || stats.topProduits.length === 0) ? (
                  <p className="text-gray-400 text-sm text-center py-4">Aucune vente sur la période</p>
                ) : (
                  <div className="space-y-2">
                    {stats.topProduits.slice(0, 8).map((prod: any, i: number) => (
                      <div key={prod.nom} className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          i === 0 ? 'bg-yellow-400 text-yellow-900' :
                          i === 1 ? 'bg-gray-300 text-gray-700' :
                          i === 2 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800 text-sm truncate">{prod.nom}</div>
                          <div className="text-gray-400 text-xs">Qté: {prod.qte_vendue}</div>
                        </div>
                        <div className="font-bold text-sm text-gray-800 flex-shrink-0">{fmt(prod.ca)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Détail par jour */}
            {stats?.parJour && stats.parJour.length > 1 && (
              <div className="bg-white rounded-2xl shadow-card p-4">
                <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Calendar size={18} className="text-purple-600" />
                  Détail par jour
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-gray-100">
                        <th className="pb-2 text-gray-500 font-semibold">Date</th>
                        <th className="pb-2 text-gray-500 font-semibold text-right">Nb ventes</th>
                        <th className="pb-2 text-gray-500 font-semibold text-right">CA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {stats.parJour.map((jour: any) => (
                        <tr key={jour.jour} className="hover:bg-gray-50">
                          <td className="py-2 text-gray-800 font-medium">
                            {new Date(jour.jour).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                          </td>
                          <td className="py-2 text-right text-gray-600">{jour.nb}</td>
                          <td className="py-2 text-right font-semibold text-blue-700">{fmt(jour.ca)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td className="py-2 font-bold text-gray-800">Total</td>
                        <td className="py-2 text-right font-bold text-gray-800">{totalNb}</td>
                        <td className="py-2 text-right font-bold text-blue-700">{fmt(totalCA)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Transactions récentes */}
            <div className="bg-white rounded-2xl shadow-card p-4">
              <h2 className="font-bold text-gray-800 mb-4">Transactions récentes</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-gray-100">
                      <th className="pb-2 text-gray-500 font-semibold">Ticket</th>
                      <th className="pb-2 text-gray-500 font-semibold">Date</th>
                      <th className="pb-2 text-gray-500 font-semibold">Caissier</th>
                      <th className="pb-2 text-gray-500 font-semibold">Paiement</th>
                      <th className="pb-2 text-gray-500 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ventes.slice(0, 20).map(vente => (
                      <tr key={vente.id} className="hover:bg-gray-50">
                        <td className="py-2 font-mono text-xs text-gray-700">{vente.numero_ticket}</td>
                        <td className="py-2 text-gray-600">{new Date(vente.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="py-2 text-gray-600">{vente.caissier_nom || '—'}</td>
                        <td className="py-2">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${MODE_COLORS[vente.mode_paiement] || ''}`}>
                            {MODE_LABELS[vente.mode_paiement]}
                          </span>
                        </td>
                        <td className="py-2 text-right font-bold text-gray-800">{fmt(vente.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ventes.length === 0 && <p className="text-center text-gray-400 py-6">Aucune vente sur la période</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
