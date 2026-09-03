import { useState, useCallback } from 'react'
import { getEtatComplet, exportPdf, dialogSaveFile, formatCurrency, formatDate, auditGetLog } from '@/lib/ipc'
import type { EtatComplet } from '@/types'
import * as XLSX from 'xlsx'
import {
  FileText, FileSpreadsheet, Download, RefreshCw, Calendar,
  TrendingUp, TrendingDown, ShoppingBag, Users, Lock, AlertTriangle,
  LogIn, Package, Tag, CreditCard, Banknote, Smartphone,
  ChevronDown, ChevronUp, Eye, Printer, ArrowRight, Minus, Plus,
  Activity
} from 'lucide-react'

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => new Date().toISOString().slice(0, 8) + '01'

const n = (v: any) => Number(v ?? 0)
const pct = (part: number, total: number) => total > 0 ? ((part / total) * 100).toFixed(1) : '0.0'
const fmtN = (v: any) => n(v).toLocaleString('fr-FR')
const fmtP = (v: any) => `${n(v).toFixed(1)}%`

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces', wave: 'Wave', orange_money: 'Orange Money',
  mtn: 'MTN Money', carte: 'Carte bancaire'
}
const MODE_COLORS: Record<string, string> = {
  especes: 'bg-emerald-100 text-emerald-800',
  wave: 'bg-cyan-100 text-cyan-800',
  orange_money: 'bg-orange-100 text-orange-800',
  mtn: 'bg-yellow-100 text-yellow-800',
  carte: 'bg-purple-100 text-purple-800'
}
const CONNEXION_LABELS: Record<string, string> = {
  connexion: 'Connexion', deconnexion: 'Déconnexion', cloture_session: 'Clôture session'
}
const CONNEXION_COLORS: Record<string, string> = {
  connexion: 'bg-green-100 text-green-700',
  deconnexion: 'bg-gray-100 text-gray-600',
  cloture_session: 'bg-blue-100 text-blue-700'
}

// Couleur taux de marge
const margeColor = (taux: number) => {
  if (taux >= 30) return 'text-emerald-700 bg-emerald-50'
  if (taux >= 15) return 'text-blue-700 bg-blue-50'
  if (taux >= 5) return 'text-orange-600 bg-orange-50'
  return 'text-red-600 bg-red-50'
}
const margeBadge = (taux: number) => {
  if (taux >= 30) return '🟢'
  if (taux >= 15) return '🔵'
  if (taux >= 5) return '🟠'
  return '🔴'
}

type Tab = 'resume' | 'pl' | 'ventes' | 'articles' | 'categories' | 'connexions' | 'sessions' | 'tiroir' | 'charges' | 'annulations' | 'audit'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'resume', label: 'Résumé', icon: <TrendingUp size={16} /> },
  { id: 'pl', label: 'P&L', icon: <Activity size={16} /> },
  { id: 'ventes', label: 'Ventes', icon: <ShoppingBag size={16} /> },
  { id: 'articles', label: 'Articles & Marges', icon: <Package size={16} /> },
  { id: 'categories', label: 'Catégories', icon: <Tag size={16} /> },
  { id: 'connexions', label: 'Connexions', icon: <LogIn size={16} /> },
  { id: 'sessions', label: 'Sessions', icon: <Lock size={16} /> },
  { id: 'tiroir', label: 'Tiroir', icon: <Eye size={16} /> },
  { id: 'charges', label: 'Charges', icon: <CreditCard size={16} /> },
  { id: 'annulations', label: 'Annulations', icon: <AlertTriangle size={16} /> },
  { id: 'audit', label: 'Journal Audit', icon: <Activity size={16} /> },
]

export default function Etats() {
  const [dateDebut, setDateDebut] = useState(firstOfMonth())
  const [dateFin, setDateFin] = useState(today())
  const [activeTab, setActiveTab] = useState<Tab>('resume')
  const [etat, setEtat] = useState<EtatComplet | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [sortArticle, setSortArticle] = useState<'ca' | 'qte' | 'nb' | 'marge' | 'taux'>('ca')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditEntite, setAuditEntite] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getEtatComplet(dateDebut, dateFin)
      setEtat(data)
      if (activeTab === 'audit') {
        const logs = await auditGetLog(dateDebut, dateFin, auditEntite || undefined)
        setAuditLogs(logs)
      }
    } finally {
      setLoading(false)
    }
  }, [dateDebut, dateFin, activeTab, auditEntite])

  const handleSort = (col: typeof sortArticle) => {
    if (sortArticle === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortArticle(col); setSortDir('desc') }
  }

  const sortedArticles = etat ? [...etat.parArticle].sort((a, b) => {
    const tauxA = n(a.ca) > 0 ? (n(a.marge_brute) / n(a.ca)) * 100 : 0
    const tauxB = n(b.ca) > 0 ? (n(b.marge_brute) / n(b.ca)) * 100 : 0
    const va = sortArticle === 'ca' ? n(a.ca) : sortArticle === 'qte' ? n(a.qte_vendue) : sortArticle === 'nb' ? n(a.nb_transactions) : sortArticle === 'marge' ? n(a.marge_brute) : tauxA
    const vb = sortArticle === 'ca' ? n(b.ca) : sortArticle === 'qte' ? n(b.qte_vendue) : sortArticle === 'nb' ? n(b.nb_transactions) : sortArticle === 'marge' ? n(b.marge_brute) : tauxB
    return sortDir === 'desc' ? vb - va : va - vb
  }) : []

  const SortTh = ({ col, label }: { col: typeof sortArticle; label: string }) => (
    <th className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-blue-600 select-none"
      onClick={() => handleSort(col)}>
      <span className="flex items-center gap-1">
        {label}
        {sortArticle === col && (sortDir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />)}
      </span>
    </th>
  )

  // ─── EXPORT EXCEL ─────────────────────────────────────────────────────────────
  const exportExcel = async () => {
    if (!etat) return
    setExporting(true)
    try {
      const wb = XLSX.utils.book_new()
      const m = etat.marges

      // Feuille 1 : Résumé P&L
      const resumeData = [
        ['COMPTE DE RÉSULTAT', `Du ${dateDebut} au ${dateFin}`],
        [],
        ['Indicateur', 'Montant (FCFA)', 'Taux'],
        ['CA brut', n(etat.resume?.ca_total), '100%'],
        ['Remises accordées', -n(etat.resume?.remises_total), `${pct(n(etat.resume?.remises_total), n(etat.resume?.ca_total))}%`],
        ['Coût des marchandises', -m.cout_achats_total, `${pct(m.cout_achats_total, n(etat.resume?.ca_total))}%`],
        ['MARGE BRUTE', m.marge_brute_total, `${m.taux_marge_global.toFixed(1)}%`],
        ['Total charges', -m.charges_total, `${pct(m.charges_total, n(etat.resume?.ca_total))}%`],
        ['RÉSULTAT NET', m.resultat_net, `${pct(m.resultat_net, n(etat.resume?.ca_total))}%`],
        [],
        ['Autres indicateurs', '', ''],
        ['Nb ventes', n(etat.resume?.nb_ventes), ''],
        ['Panier moyen', n(etat.resume?.panier_moyen), ''],
        ['Vente min', n(etat.resume?.vente_min), ''],
        ['Vente max', n(etat.resume?.vente_max), ''],
        [],
        ['MODE DE PAIEMENT', 'Nb', 'Total', '% CA'],
        ...etat.parModePaiement.map(m => [MODE_LABELS[m.mode_paiement] || m.mode_paiement, n(m.nb), n(m.total), `${pct(n(m.total), n(etat.resume?.ca_total))}%`])
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumeData), 'P&L Résumé')

      // Feuille 2 : Articles + marges
      const articlesData = [
        ['Article', 'Catégorie', 'Unité', 'Prix achat', 'Qté vendue', 'Nb transactions', 'CA total', 'Coût achats', 'Marge brute', 'Taux marge'],
        ...sortedArticles.map(a => {
          const taux = n(a.ca) > 0 ? ((n(a.marge_brute) / n(a.ca)) * 100).toFixed(1) : '0.0'
          return [a.produit_nom, a.categorie_nom || '', a.unite, n(a.prix_achat), n(a.qte_vendue).toFixed(2), n(a.nb_transactions), n(a.ca), n(a.cout_achat), n(a.marge_brute), `${taux}%`]
        })
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(articlesData), 'Articles & Marges')

      // Feuille 3 : Ventes
      const ventesData = [
        ['N° Ticket', 'Date', 'Caissier', 'Client', 'Mode paiement', 'Total', 'Remise'],
        ...etat.ventes.map(v => [v.numero_ticket, v.date, v.caissier_nom || '', v.client_nom || '', MODE_LABELS[v.mode_paiement] || v.mode_paiement, n(v.total), n(v.remise)])
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ventesData), 'Ventes')

      // Feuille 4 : Catégories
      const catData = [
        ['Catégorie', 'Nb transactions', 'Qté vendue', 'CA total', '% CA'],
        ...etat.parCategorie.map(c => [c.categorie_nom || 'Sans catégorie', n(c.nb_transactions), n(c.qte_vendue), n(c.ca), `${pct(n(c.ca), n(etat.resume?.ca_total))}%`])
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catData), 'Catégories')

      // Feuille 5 : Connexions
      const connData = [
        ['Date/Heure', 'Utilisateur', 'Rôle', 'Type', 'Fond caisse'],
        ...etat.connexions.map(c => [c.date_heure, c.user_nom || '', c.user_role || '', CONNEXION_LABELS[c.type] || c.type, c.fond_caisse ? n(c.fond_caisse) : ''])
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(connData), 'Connexions')

      // Feuille 6 : Sessions
      const sessData = [
        ['Date', 'Caissier', 'Ouverture', 'Clôture', 'Fond caisse', 'Espèces finales', 'Écart', 'Statut'],
        ...etat.sessions.map(s => {
          const ecart = s.montant_final_especes != null ? n(s.montant_final_especes) - n(s.fond_caisse) : ''
          return [s.date, s.user_nom || '', s.heure_ouverture, s.heure_cloture || '', n(s.fond_caisse), s.montant_final_especes != null ? n(s.montant_final_especes) : '', ecart, s.statut === 'cloture' ? 'Clôturé' : 'Ouvert']
        })
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sessData), 'Sessions')

      // Feuille 7 : Tiroir
      const tiroirData = [
        ['Date/Heure', 'Caissier', 'Type', 'N° Ticket', 'Motif'],
        ...etat.tiroir.map(t => [t.date_heure, t.user_nom || '', t.type === 'vente' ? 'Vente' : 'Ouverture manuelle', t.numero_ticket || '', t.motif || ''])
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tiroirData), 'Tiroir')

      // Feuille 8 : Charges
      const chargesData = [
        ['Date', 'Libellé', 'Catégorie', 'Montant', 'Mode paiement', 'Note', 'Saisi par'],
        ...etat.charges.map(c => [c.date, c.libelle, c.categorie, n(c.montant), MODE_LABELS[c.mode_paiement] || c.mode_paiement, c.note || '', (c as any).user_nom || ''])
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chargesData), 'Charges')

      // Feuille 9 : Annulations
      const annulData = [
        ['N° Ticket', 'Date', 'Caissier', 'Total', 'Statut'],
        ...etat.annulations.map(v => [v.numero_ticket, v.date, v.caissier_nom || '', n(v.total), v.statut === 'annule' ? 'Annulé' : 'Remboursé'])
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(annulData), 'Annulations')

      const filename = `Etat-${dateDebut}-${dateFin}.xlsx`
      const savePath = await dialogSaveFile(filename)
      if (savePath) {
        const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
        const api = (window as any).electronAPI
        await api.fs.writeFile(savePath, Array.from(wbArray))
        await api.shell.openPath(savePath)
      }
    } finally {
      setExporting(false)
    }
  }

  // ─── EXPORT PDF COMPLET ───────────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!etat) return
    setExporting(true)
    try {
      const html = generatePdfHtml(etat, dateDebut, dateFin)
      await exportPdf(html, `Etat-${dateDebut}-${dateFin}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  // ─── IMPRIMER L'ONGLET ACTIF ──────────────────────────────────────────────────
  const printTab = async () => {
    if (!etat) return
    setExporting(true)
    try {
      const html = generateTabHtml(etat, activeTab, dateDebut, dateFin, sortedArticles)
      await exportPdf(html, `${activeTab}-${dateDebut}-${dateFin}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">États & Rapports</h1>
            <p className="text-sm text-gray-500 mt-0.5">Analyse financière complète — marge, résultat, activité</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <Calendar size={16} className="text-gray-500" />
              <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                className="text-sm bg-transparent border-none outline-none text-gray-700" />
              <span className="text-gray-400">→</span>
              <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                className="text-sm bg-transparent border-none outline-none text-gray-700" />
            </div>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition-all">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Générer
            </button>
            {etat && (
              <>
                <button onClick={printTab} disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white rounded-xl font-medium transition-all">
                  <Printer size={16} />
                  Imprimer
                </button>
                <button onClick={exportExcel} disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-medium transition-all">
                  <FileSpreadsheet size={16} />
                  Excel
                </button>
                <button onClick={exportPDF} disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-medium transition-all">
                  <FileText size={16} />
                  PDF complet
                </button>
              </>
            )}
          </div>
        </div>

        {etat && (
          <div className="flex gap-1 mt-4 overflow-x-auto pb-1">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {tab.icon}
                {tab.label}
                {tab.id === 'ventes' && <span className="ml-1 bg-white/20 rounded-full px-1.5 text-xs">{etat.ventes.length}</span>}
                {tab.id === 'annulations' && etat.annulations.length > 0 && <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 text-xs">{etat.annulations.length}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {!etat && !loading && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Download size={48} className="mb-3 opacity-30" />
            <p className="text-lg font-medium">Sélectionnez une période et cliquez sur "Générer"</p>
            <p className="text-sm mt-1">Analyse financière complète avec marges et résultat net</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={32} className="animate-spin text-blue-500" />
          </div>
        )}

        {etat && !loading && (
          <>
            {/* ── RÉSUMÉ ──────────────────────────────────────────────────────── */}
            {activeTab === 'resume' && (
              <div className="space-y-6">
                {/* KPI 4 cartes principales */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Nb ventes', value: fmtN(etat.resume?.nb_ventes), icon: <ShoppingBag size={20} />, color: 'bg-blue-50 text-blue-600', sub: `Panier moy. ${fmtN(etat.resume?.panier_moyen)} FCFA` },
                    { label: "CA brut", value: `${fmtN(etat.resume?.ca_total)} FCFA`, icon: <TrendingUp size={20} />, color: 'bg-emerald-50 text-emerald-600', sub: `Remises : -${fmtN(etat.resume?.remises_total)} FCFA` },
                    { label: 'Marge brute', value: `${fmtN(etat.marges.marge_brute_total)} FCFA`, icon: <Activity size={20} />, color: etat.marges.taux_marge_global >= 15 ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600', sub: `Taux : ${etat.marges.taux_marge_global.toFixed(1)}%` },
                    { label: 'Résultat net', value: `${fmtN(etat.marges.resultat_net)} FCFA`, icon: etat.marges.resultat_net >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />, color: etat.marges.resultat_net >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600', sub: `Charges : -${fmtN(etat.marges.charges_total)} FCFA` },
                  ].map(k => (
                    <div key={k.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                      <div className={`inline-flex p-2 rounded-xl ${k.color} mb-3`}>{k.icon}</div>
                      <p className="text-sm text-gray-500">{k.label}</p>
                      <p className="text-xl font-bold text-gray-900 mt-0.5">{k.value}</p>
                      <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Modes de paiement */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900">Répartition par mode de paiement</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Mode', 'Nb transactions', 'Total', 'Panier moyen', '% du CA'].map(h => (
                            <th key={h} className="text-left px-5 py-3 font-medium text-gray-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {etat.parModePaiement.map(m => {
                          const p = pct(n(m.total), n(etat.resume?.ca_total))
                          return (
                            <tr key={m.mode_paiement} className="hover:bg-gray-50">
                              <td className="px-5 py-3">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${MODE_COLORS[m.mode_paiement] || 'bg-gray-100 text-gray-600'}`}>
                                  {MODE_LABELS[m.mode_paiement] || m.mode_paiement}
                                </span>
                              </td>
                              <td className="px-5 py-3 font-medium">{n(m.nb)}</td>
                              <td className="px-5 py-3 font-bold text-emerald-700">{fmtN(m.total)} FCFA</td>
                              <td className="px-5 py-3 text-gray-600">{fmtN(n(m.moyenne).toFixed(0))} FCFA</td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${p}%` }} />
                                  </div>
                                  <span className="text-xs font-medium text-gray-600 w-10">{p}%</span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── P&L ─────────────────────────────────────────────────────────── */}
            {activeTab === 'pl' && (() => {
              const m = etat.marges
              const ca = n(etat.resume?.ca_total)
              const rows = [
                { label: 'CA brut (ventes encaissées)', value: ca, indent: 0, bold: true, color: 'text-gray-900' },
                { label: 'Remises accordées', value: -n(etat.resume?.remises_total), indent: 1, bold: false, color: 'text-orange-600' },
                { label: 'Coût des marchandises vendues', value: -m.cout_achats_total, indent: 1, bold: false, color: 'text-red-600' },
                { label: 'MARGE BRUTE', value: m.marge_brute_total, indent: 0, bold: true, color: m.marge_brute_total >= 0 ? 'text-indigo-700' : 'text-red-700', separator: true },
                { label: 'Charges d\'exploitation', value: -m.charges_total, indent: 1, bold: false, color: 'text-red-600' },
                { label: 'RÉSULTAT NET', value: m.resultat_net, indent: 0, bold: true, color: m.resultat_net >= 0 ? 'text-emerald-700' : 'text-red-700', separator: true },
              ]
              return (
                <div className="space-y-6">
                  {/* Compte de résultat */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                      <h2 className="font-bold text-gray-900 text-lg">📊 Compte de résultat</h2>
                      <p className="text-sm text-gray-500">Période du {dateDebut} au {dateFin}</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {rows.map((row, i) => (
                        <div key={i} className={`flex items-center justify-between px-6 py-3 ${row.separator ? 'bg-gray-50' : ''} ${row.bold ? 'font-semibold' : ''}`}>
                          <div className={`flex items-center gap-2 ${row.indent ? 'pl-6 text-gray-600 text-sm' : 'text-gray-900'}`}>
                            {row.indent > 0 ? <Minus size={12} className="text-gray-400" /> : <ArrowRight size={14} className="text-blue-400" />}
                            {row.label}
                          </div>
                          <div className={`flex items-center gap-3 ${row.color}`}>
                            <span className={`font-${row.bold ? 'bold text-base' : 'medium text-sm'}`}>
                              {row.value >= 0 ? '+' : ''}{fmtN(row.value)} FCFA
                            </span>
                            <span className="text-xs text-gray-400 w-14 text-right">
                              {ca > 0 ? `${((Math.abs(row.value) / ca) * 100).toFixed(1)}%` : '—'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Indicateurs de performance */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      {
                        title: 'Taux de marge brute',
                        value: `${m.taux_marge_global.toFixed(1)}%`,
                        desc: 'Marge brute / CA',
                        color: m.taux_marge_global >= 25 ? 'border-emerald-200 bg-emerald-50' : m.taux_marge_global >= 10 ? 'border-blue-200 bg-blue-50' : 'border-red-200 bg-red-50',
                        textColor: m.taux_marge_global >= 25 ? 'text-emerald-700' : m.taux_marge_global >= 10 ? 'text-blue-700' : 'text-red-700',
                        badge: m.taux_marge_global >= 25 ? '✅ Bon' : m.taux_marge_global >= 10 ? '⚠️ Moyen' : '🔴 Faible'
                      },
                      {
                        title: 'Taux de rentabilité nette',
                        value: ca > 0 ? `${((m.resultat_net / ca) * 100).toFixed(1)}%` : '—',
                        desc: 'Résultat net / CA',
                        color: m.resultat_net >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50',
                        textColor: m.resultat_net >= 0 ? 'text-emerald-700' : 'text-red-700',
                        badge: m.resultat_net >= 0 ? '✅ Bénéfice' : '🔴 Déficit'
                      },
                      {
                        title: 'Point mort (charges à couvrir)',
                        value: `${fmtN(m.charges_total)} FCFA`,
                        desc: 'Charges d\'exploitation à couvrir par la marge',
                        color: m.marge_brute_total >= m.charges_total ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50',
                        textColor: m.marge_brute_total >= m.charges_total ? 'text-emerald-700' : 'text-red-700',
                        badge: m.marge_brute_total >= m.charges_total ? '✅ Couvert' : '🔴 Non couvert'
                      }
                    ].map(card => (
                      <div key={card.title} className={`rounded-2xl border p-5 ${card.color}`}>
                        <p className="text-sm text-gray-600 font-medium">{card.title}</p>
                        <p className={`text-3xl font-bold mt-2 ${card.textColor}`}>{card.value}</p>
                        <p className="text-xs text-gray-500 mt-1">{card.desc}</p>
                        <span className="inline-block mt-2 text-xs font-semibold">{card.badge}</span>
                      </div>
                    ))}
                  </div>

                  {/* Top 5 articles par marge */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h2 className="font-semibold text-gray-900">🏆 Top 5 articles les plus rentables</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Classés par marge brute absolue</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {[...etat.parArticle].sort((a, b) => n(b.marge_brute) - n(a.marge_brute)).slice(0, 5).map((a, i) => {
                        const taux = n(a.ca) > 0 ? (n(a.marge_brute) / n(a.ca)) * 100 : 0
                        return (
                          <div key={a.produit_nom} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50">
                            <span className="text-lg font-bold text-gray-300 w-6">{i + 1}</span>
                            <div className="flex-1">
                              <p className="font-medium text-gray-900 text-sm">{a.produit_nom}</p>
                              <p className="text-xs text-gray-400">{a.categorie_nom}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-indigo-700 text-sm">{fmtN(a.marge_brute)} FCFA</p>
                              <p className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block ${margeColor(taux)}`}>{taux.toFixed(1)}%</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Alertes */}
                  {etat.parArticle.filter(a => n(a.ca) > 0 && (n(a.marge_brute) / n(a.ca)) * 100 < 10).length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
                      <h3 className="font-semibold text-orange-800 flex items-center gap-2 mb-3">
                        <AlertTriangle size={18} /> Articles à marge critique ({'<'}10%)
                      </h3>
                      <div className="space-y-2">
                        {etat.parArticle.filter(a => n(a.ca) > 0 && (n(a.marge_brute) / n(a.ca)) * 100 < 10).map(a => {
                          const taux = n(a.ca) > 0 ? (n(a.marge_brute) / n(a.ca)) * 100 : 0
                          return (
                            <div key={a.produit_nom} className="flex items-center justify-between text-sm">
                              <span className="text-orange-700 font-medium">{a.produit_nom}</span>
                              <span className="text-red-600 font-bold">{taux.toFixed(1)}% — revoir le prix d'achat ou de vente</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── VENTES ──────────────────────────────────────────────────────── */}
            {activeTab === 'ventes' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                  <h2 className="font-semibold text-gray-900">Détail des ventes ({etat.ventes.length})</h2>
                  <span className="text-sm text-gray-500">CA total : <strong>{fmtN(etat.resume?.ca_total)} FCFA</strong></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['N° Ticket', 'Date & Heure', 'Caissier', 'Client', 'Paiement', 'Remise', 'Total'].map(h => (
                          <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {etat.ventes.map(v => (
                        <tr key={v.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-blue-600 font-semibold">{v.numero_ticket}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(v.date)}</td>
                          <td className="px-4 py-3">{v.caissier_nom}</td>
                          <td className="px-4 py-3 text-gray-500">{v.client_nom || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${MODE_COLORS[v.mode_paiement] || 'bg-gray-100 text-gray-600'}`}>
                              {MODE_LABELS[v.mode_paiement] || v.mode_paiement}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-orange-600">{n(v.remise) > 0 ? `-${fmtN(v.remise)}` : '—'}</td>
                          <td className="px-4 py-3 font-bold text-emerald-700">{fmtN(v.total)} FCFA</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-gray-700">TOTAL ({etat.ventes.length} ventes)</td>
                        <td className="px-4 py-3 text-orange-600">-{fmtN(etat.resume?.remises_total)} FCFA</td>
                        <td className="px-4 py-3 text-emerald-700">{fmtN(etat.resume?.ca_total)} FCFA</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── ARTICLES & MARGES ────────────────────────────────────────────── */}
            {activeTab === 'articles' && (
              <div className="space-y-4">
                {/* Légende */}
                <div className="flex gap-3 flex-wrap">
                  {[['🟢 ≥ 30%', 'Excellente'], ['🔵 15–30%', 'Bonne'], ['🟠 5–15%', 'Faible'], ['🔴 < 5%', 'Critique']].map(([badge, label]) => (
                    <span key={badge} className="text-xs text-gray-500 flex items-center gap-1">{badge} {label}</span>
                  ))}
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900">Ventes par article — Analyse des marges ({sortedArticles.length} produits)</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Cliquez sur un en-tête pour trier</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Article</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Cat.</th>
                          <SortTh col="nb" label="Nb trans." />
                          <SortTh col="qte" label="Qté vendue" />
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Px achat</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Px moyen vente</th>
                          <SortTh col="ca" label="CA" />
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Coût achats</th>
                          <SortTh col="marge" label="Marge brute" />
                          <SortTh col="taux" label="Taux marge" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sortedArticles.map((a, i) => {
                          const taux = n(a.ca) > 0 ? (n(a.marge_brute) / n(a.ca)) * 100 : 0
                          return (
                            <tr key={a.produit_nom} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium">
                                <span className="flex items-center gap-2">
                                  {i < 3 && <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : 'bg-orange-100 text-orange-600'}`}>#{i + 1}</span>}
                                  {a.produit_nom}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {a.categorie_nom && <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{a.categorie_nom}</span>}
                              </td>
                              <td className="px-4 py-3 text-center">{n(a.nb_transactions)}</td>
                              <td className="px-4 py-3 text-center font-medium">{n(a.qte_vendue).toFixed(2)} {a.unite}</td>
                              <td className="px-4 py-3 text-gray-500">{fmtN(a.prix_achat)} FCFA</td>
                              <td className="px-4 py-3 text-gray-600">{fmtN(n(a.prix_moyen).toFixed(0))} FCFA</td>
                              <td className="px-4 py-3 font-bold text-emerald-700">{fmtN(a.ca)} FCFA</td>
                              <td className="px-4 py-3 text-red-500">{fmtN(a.cout_achat)} FCFA</td>
                              <td className={`px-4 py-3 font-bold ${n(a.marge_brute) >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>{fmtN(a.marge_brute)} FCFA</td>
                              <td className="px-4 py-3">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${margeColor(taux)}`}>
                                  {margeBadge(taux)} {taux.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50 font-semibold text-sm">
                        <tr>
                          <td colSpan={6} className="px-4 py-3 text-gray-700">TOTAL</td>
                          <td className="px-4 py-3 text-emerald-700">{fmtN(etat.resume?.ca_total)} FCFA</td>
                          <td className="px-4 py-3 text-red-500">{fmtN(etat.marges.cout_achats_total)} FCFA</td>
                          <td className="px-4 py-3 text-indigo-700">{fmtN(etat.marges.marge_brute_total)} FCFA</td>
                          <td className={`px-4 py-3 font-bold ${margeColor(etat.marges.taux_marge_global)}`}>{etat.marges.taux_marge_global.toFixed(1)}%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── CATÉGORIES ───────────────────────────────────────────────────── */}
            {activeTab === 'categories' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Ventes par catégorie</h2>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {etat.parCategorie.map(c => {
                    const p = pct(n(c.ca), n(etat.resume?.ca_total))
                    return (
                      <div key={c.categorie_nom} className="border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-2xl">{c.icone || '📦'}</span>
                          <div>
                            <p className="font-semibold text-gray-900">{c.categorie_nom || 'Sans catégorie'}</p>
                            <p className="text-xs text-gray-500">{n(c.nb_transactions)} transactions</p>
                          </div>
                          <span className="ml-auto text-sm font-bold text-blue-600">{p}%</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Qté vendue</span>
                            <span className="font-medium">{n(c.qte_vendue).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">CA</span>
                            <span className="font-bold text-emerald-700">{fmtN(c.ca)} FCFA</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                            <div className="h-2 rounded-full" style={{ width: `${p}%`, backgroundColor: c.couleur || '#3b82f6' }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── CONNEXIONS ───────────────────────────────────────────────────── */}
            {activeTab === 'connexions' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                  <h2 className="font-semibold text-gray-900">Journal des connexions ({etat.connexions.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Date & Heure', 'Utilisateur', 'Rôle', 'Type', 'Fond de caisse'].map(h => (
                          <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {etat.connexions.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-xs text-gray-600 font-mono">{c.date_heure}</td>
                          <td className="px-4 py-3 font-medium">{c.user_nom || `User #${c.user_id}`}</td>
                          <td className="px-4 py-3"><span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 capitalize">{c.user_role}</span></td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${CONNEXION_COLORS[c.type] || 'bg-gray-100 text-gray-600'}`}>
                              {CONNEXION_LABELS[c.type] || c.type}
                            </span>
                          </td>
                          <td className="px-4 py-3">{c.fond_caisse ? `${fmtN(c.fond_caisse)} FCFA` : '—'}</td>
                        </tr>
                      ))}
                      {etat.connexions.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Aucune connexion sur cette période</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── SESSIONS CAISSE ──────────────────────────────────────────────── */}
            {activeTab === 'sessions' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Sessions de caisse ({etat.sessions.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Date', 'Caissier', 'Ouverture', 'Clôture', 'Fond initial', 'Espèces finales', 'Écart', 'Statut'].map(h => (
                          <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {etat.sessions.map(s => {
                        const ecart = s.montant_final_especes != null ? n(s.montant_final_especes) - n(s.fond_caisse) : null
                        return (
                          <tr key={s.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-600">{s.date}</td>
                            <td className="px-4 py-3 font-medium">{s.user_nom}</td>
                            <td className="px-4 py-3 font-mono text-xs">{s.heure_ouverture}</td>
                            <td className="px-4 py-3 font-mono text-xs">{s.heure_cloture || '—'}</td>
                            <td className="px-4 py-3">{fmtN(s.fond_caisse)} FCFA</td>
                            <td className="px-4 py-3">{s.montant_final_especes != null ? `${fmtN(s.montant_final_especes)} FCFA` : '—'}</td>
                            <td className={`px-4 py-3 font-medium ${ecart == null ? 'text-gray-400' : ecart >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {ecart != null ? `${ecart >= 0 ? '+' : ''}${fmtN(ecart)} FCFA` : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.statut === 'cloture' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                {s.statut === 'cloture' ? 'Clôturé' : 'Ouvert'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TIROIR ───────────────────────────────────────────────────────── */}
            {activeTab === 'tiroir' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                  <h2 className="font-semibold text-gray-900">Historique tiroir ({etat.tiroir.length} ouvertures)</h2>
                  <div className="text-xs text-gray-500 space-x-4">
                    <span>✅ Ventes : {etat.tiroir.filter(t => t.type === 'vente').length}</span>
                    <span>⚠️ Manuelles : {etat.tiroir.filter(t => t.type === 'ouverture_simple').length}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Date & Heure', 'Caissier', 'Type', 'N° Ticket', 'Motif'].map(h => (
                          <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {etat.tiroir.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-xs font-mono text-gray-600">{t.date_heure}</td>
                          <td className="px-4 py-3 font-medium">{t.user_nom || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${t.type === 'vente' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                              {t.type === 'vente' ? '🔓 Vente' : '⚠️ Manuelle'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-blue-600">{t.numero_ticket || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 italic">{t.motif || (t.type === 'ouverture_simple' ? 'Motif non renseigné' : '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── CHARGES ──────────────────────────────────────────────────────── */}
            {activeTab === 'charges' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-sm text-gray-500">Total charges</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">{fmtN(etat.charges.reduce((s, c) => s + n(c.montant), 0))} FCFA</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-sm text-gray-500">Marge brute</p>
                    <p className={`text-2xl font-bold mt-1 ${etat.marges.marge_brute_total >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{fmtN(etat.marges.marge_brute_total)} FCFA</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-sm text-gray-500">Résultat net (Marge - Charges)</p>
                    <p className={`text-2xl font-bold mt-1 ${etat.marges.resultat_net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtN(etat.marges.resultat_net)} FCFA</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Date', 'Libellé', 'Catégorie', 'Mode', 'Montant', 'Note', 'Saisi par'].map(h => (
                          <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {etat.charges.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600">{c.date}</td>
                          <td className="px-4 py-3 font-medium">{c.libelle}</td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{c.categorie}</span></td>
                          <td className="px-4 py-3 text-xs">{MODE_LABELS[c.mode_paiement] || c.mode_paiement}</td>
                          <td className="px-4 py-3 font-bold text-red-600">{fmtN(c.montant)} FCFA</td>
                          <td className="px-4 py-3 text-gray-400 italic text-xs">{c.note || '—'}</td>
                          <td className="px-4 py-3 text-gray-500">{(c as any).user_nom || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── ANNULATIONS ──────────────────────────────────────────────────── */}
            {activeTab === 'annulations' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                  <AlertTriangle size={18} className="text-red-500" />
                  <h2 className="font-semibold text-gray-900">Ventes annulées / remboursées ({etat.annulations.length})</h2>
                </div>
                {etat.annulations.length === 0 ? (
                  <div className="py-12 text-center text-gray-400"><p>Aucune annulation sur cette période ✅</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {['N° Ticket', 'Date', 'Caissier', 'Total', 'Statut'].map(h => (
                            <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {etat.annulations.map(v => (
                          <tr key={v.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs text-red-600 font-semibold">{v.numero_ticket}</td>
                            <td className="px-4 py-3 text-xs text-gray-600">{formatDate(v.date)}</td>
                            <td className="px-4 py-3">{v.caissier_nom}</td>
                            <td className="px-4 py-3 font-bold line-through text-gray-400">{fmtN(v.total)} FCFA</td>
                            <td className="px-4 py-3">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${v.statut === 'annule' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                {v.statut === 'annule' ? 'Annulé' : 'Remboursé'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Activity size={18} className="text-indigo-500" />
                    <h2 className="font-semibold text-gray-900">Journal d'audit ({auditLogs.length})</h2>
                  </div>
                  <select value={auditEntite} onChange={e => setAuditEntite(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="">Toutes les entités</option>
                    <option value="produit">Produits</option>
                    <option value="categorie">Catégories</option>
                    <option value="utilisateur">Utilisateurs</option>
                  </select>
                </div>
                {auditLogs.length === 0 ? (
                  <div className="py-12 text-center text-gray-400"><p>Aucune action enregistrée sur cette période</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Date / Heure</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Utilisateur</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Entité</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-600">Détails</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {auditLogs.map((log: any) => (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatDate(log.date_heure)}</td>
                            <td className="px-4 py-2.5 text-xs font-medium text-gray-700">{log.user_nom ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                                log.action === 'creation' ? 'bg-green-100 text-green-700' :
                                log.action === 'modification' ? 'bg-blue-100 text-blue-700' :
                                'bg-red-100 text-red-700'
                              }`}>{log.action}</span>
                            </td>
                            <td className="px-4 py-2.5 text-xs font-medium text-gray-700">{log.entite}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">{log.entite_id ?? '—'}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs truncate">
                              {log.details ? (
                                <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                                  {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── CSS COMMUN PDF ───────────────────────────────────────────────────────────
const PDF_CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #1f2937; padding: 20px; }
h1 { font-size: 20px; font-weight: bold; color: #1e40af; margin-bottom: 4px; }
h2 { font-size: 13px; font-weight: bold; color: #374151; margin: 18px 0 7px; padding: 5px 10px; background: #f3f4f6; border-radius: 4px; }
.subtitle { color: #6b7280; font-size: 11px; margin-bottom: 14px; }
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
.kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
.kpi-label { font-size: 10px; color: #6b7280; margin-bottom: 3px; }
.kpi-value { font-size: 15px; font-weight: bold; color: #1e40af; }
.kpi-sub { font-size: 9px; color: #9ca3af; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10px; }
th { background: #1e40af; color: white; padding: 5px 8px; text-align: left; }
td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; }
tr:nth-child(even) td { background: #f8fafc; }
.pl-row { display: flex; justify-content: space-between; padding: 6px 12px; }
.pl-row-sub { background: #f9fafb; padding-left: 28px; }
.pl-separator { font-weight: bold; border-top: 2px solid #e5e7eb; margin-top: 4px; }
.green { color: #065f46; } .red { color: #991b1b; } .indigo { color: #3730a3; }
.badge-green { background: #d1fae5; color: #065f46; padding: 1px 6px; border-radius: 10px; font-size: 9px; }
.badge-red { background: #fee2e2; color: #991b1b; padding: 1px 6px; border-radius: 10px; font-size: 9px; }
footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 9px; }
@media print { body { padding: 0; } }
`

// ─── PDF : ONGLET ACTIF UNIQUEMENT ───────────────────────────────────────────
function generateTabHtml(etat: EtatComplet, tab: Tab, dateDebut: string, dateFin: string, sortedArticles: any[]): string {
  const fmt = (v: any) => n(v).toLocaleString('fr-FR')
  const m = etat.marges
  const ca = n(etat.resume?.ca_total)
  const genDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  let body = ''

  if (tab === 'resume' || tab === 'pl') {
    body = `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">CA brut</div><div class="kpi-value">${fmt(ca)} FCFA</div></div>
      <div class="kpi"><div class="kpi-label">Marge brute</div><div class="kpi-value">${fmt(m.marge_brute_total)} FCFA</div><div class="kpi-sub">${m.taux_marge_global.toFixed(1)}%</div></div>
      <div class="kpi"><div class="kpi-label">Charges</div><div class="kpi-value">${fmt(m.charges_total)} FCFA</div></div>
      <div class="kpi"><div class="kpi-label">Résultat net</div><div class="kpi-value ${m.resultat_net >= 0 ? 'green' : 'red'}">${fmt(m.resultat_net)} FCFA</div></div>
    </div>
    <h2>Compte de résultat</h2>
    <div style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; margin-bottom:14px;">
      ${[
        { label: 'CA brut', value: ca, sub: false },
        { label: '— Remises', value: -n(etat.resume?.remises_total), sub: true },
        { label: '— Coût des marchandises', value: -m.cout_achats_total, sub: true },
        { label: 'MARGE BRUTE', value: m.marge_brute_total, sub: false, sep: true },
        { label: '— Charges d\'exploitation', value: -m.charges_total, sub: true },
        { label: 'RÉSULTAT NET', value: m.resultat_net, sub: false, sep: true },
      ].map(r => `
        <div class="pl-row ${r.sub ? 'pl-row-sub' : ''} ${r.sep ? 'pl-separator' : ''}">
          <span>${r.label}</span>
          <span class="${r.value >= 0 ? 'green' : 'red'}">${r.value >= 0 ? '+' : ''}${fmt(r.value)} FCFA &nbsp; <small style="color:#9ca3af">${ca > 0 ? ((Math.abs(r.value)/ca)*100).toFixed(1) : '0.0'}%</small></span>
        </div>`).join('')}
    </div>
    <h2>Modes de paiement</h2>
    <table><thead><tr><th>Mode</th><th>Nb</th><th>Total</th><th>% CA</th></tr></thead><tbody>
    ${etat.parModePaiement.map(mp => `<tr><td>${MODE_LABELS[mp.mode_paiement]||mp.mode_paiement}</td><td>${n(mp.nb)}</td><td>${fmt(mp.total)} FCFA</td><td>${ca > 0 ? ((n(mp.total)/ca)*100).toFixed(1) : '0'}%</td></tr>`).join('')}
    </tbody></table>`
  } else if (tab === 'articles') {
    body = `<h2>Articles & Marges (${sortedArticles.length} produits)</h2>
    <table><thead><tr><th>#</th><th>Article</th><th>Catégorie</th><th>Qté</th><th>CA</th><th>Coût achats</th><th>Marge brute</th><th>Taux</th></tr></thead><tbody>
    ${sortedArticles.map((a, i) => {
      const taux = n(a.ca) > 0 ? ((n(a.marge_brute)/n(a.ca))*100).toFixed(1) : '0.0'
      return `<tr><td>${i+1}</td><td>${a.produit_nom}</td><td>${a.categorie_nom||'—'}</td><td>${n(a.qte_vendue).toFixed(2)} ${a.unite}</td><td>${fmt(a.ca)} FCFA</td><td>${fmt(a.cout_achat)} FCFA</td><td class="${n(a.marge_brute)>=0?'indigo':'red'}">${fmt(a.marge_brute)} FCFA</td><td><span class="${Number(taux)>=15?'badge-green':'badge-red'}">${taux}%</span></td></tr>`
    }).join('')}
    </tbody></table>`
  } else if (tab === 'ventes') {
    body = `<h2>Détail des ventes (${etat.ventes.length})</h2>
    <table><thead><tr><th>Ticket</th><th>Date</th><th>Caissier</th><th>Mode</th><th>Total</th></tr></thead><tbody>
    ${etat.ventes.map(v => `<tr><td>${v.numero_ticket}</td><td>${v.date}</td><td>${v.caissier_nom||''}</td><td>${MODE_LABELS[v.mode_paiement]||v.mode_paiement}</td><td>${fmt(v.total)} FCFA</td></tr>`).join('')}
    </tbody></table>`
  } else if (tab === 'charges') {
    body = `<h2>Charges (total : ${fmt(m.charges_total)} FCFA)</h2>
    <table><thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Mode</th><th>Montant</th></tr></thead><tbody>
    ${etat.charges.map(c => `<tr><td>${c.date}</td><td>${c.libelle}</td><td>${c.categorie}</td><td>${MODE_LABELS[c.mode_paiement]||c.mode_paiement}</td><td class="red">${fmt(c.montant)} FCFA</td></tr>`).join('')}
    </tbody></table>`
  } else if (tab === 'sessions') {
    body = `<h2>Sessions de caisse</h2>
    <table><thead><tr><th>Date</th><th>Caissier</th><th>Ouverture</th><th>Clôture</th><th>Fond</th><th>Espèces finales</th><th>Écart</th><th>Statut</th></tr></thead><tbody>
    ${etat.sessions.map(s => {
      const ecart = s.montant_final_especes != null ? n(s.montant_final_especes) - n(s.fond_caisse) : null
      return `<tr><td>${s.date}</td><td>${s.user_nom||''}</td><td>${s.heure_ouverture}</td><td>${s.heure_cloture||'—'}</td><td>${fmt(s.fond_caisse)}</td><td>${s.montant_final_especes!=null?fmt(s.montant_final_especes):'—'}</td><td class="${ecart==null?'':ecart>=0?'green':'red'}">${ecart!=null?`${ecart>=0?'+':''}${fmt(ecart)}`:'—'}</td><td>${s.statut==='cloture'?'Clôturé':'Ouvert'}</td></tr>`
    }).join('')}
    </tbody></table>`
  } else if (tab === 'connexions') {
    body = `<h2>Journal connexions</h2>
    <table><thead><tr><th>Date/Heure</th><th>Utilisateur</th><th>Rôle</th><th>Type</th></tr></thead><tbody>
    ${etat.connexions.map(c => `<tr><td>${c.date_heure}</td><td>${c.user_nom||''}</td><td>${c.user_role||''}</td><td>${CONNEXION_LABELS[c.type]||c.type}</td></tr>`).join('')}
    </tbody></table>`
  } else if (tab === 'tiroir') {
    body = `<h2>Historique tiroir (${etat.tiroir.length} ouvertures)</h2>
    <table><thead><tr><th>Date/Heure</th><th>Caissier</th><th>Type</th><th>Ticket</th><th>Motif</th></tr></thead><tbody>
    ${etat.tiroir.map(t => `<tr><td>${t.date_heure}</td><td>${t.user_nom||''}</td><td>${t.type==='vente'?'Vente':'Manuelle'}</td><td>${t.numero_ticket||'—'}</td><td>${t.motif||'—'}</td></tr>`).join('')}
    </tbody></table>`
  } else if (tab === 'annulations') {
    body = `<h2>Annulations (${etat.annulations.length})</h2>
    <table><thead><tr><th>Ticket</th><th>Date</th><th>Caissier</th><th>Total</th><th>Statut</th></tr></thead><tbody>
    ${etat.annulations.map(v => `<tr><td>${v.numero_ticket}</td><td>${v.date}</td><td>${v.caissier_nom||''}</td><td>${fmt(v.total)} FCFA</td><td><span class="badge-red">${v.statut==='annule'?'Annulé':'Remboursé'}</span></td></tr>`).join('')}
    </tbody></table>`
  } else if (tab === 'categories') {
    body = `<h2>Ventes par catégorie</h2>
    <table><thead><tr><th>Catégorie</th><th>Nb transactions</th><th>Qté</th><th>CA</th><th>% CA</th></tr></thead><tbody>
    ${etat.parCategorie.map(c => `<tr><td>${c.icone||''} ${c.categorie_nom||'Sans catégorie'}</td><td>${n(c.nb_transactions)}</td><td>${n(c.qte_vendue).toFixed(2)}</td><td>${fmt(c.ca)} FCFA</td><td>${ca>0?((n(c.ca)/ca)*100).toFixed(1):0}%</td></tr>`).join('')}
    </tbody></table>`
  }

  const tabLabel = TABS.find(t => t.id === tab)?.label || tab

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>${PDF_CSS}</style></head><body>
<h1>${tabLabel} — État de l'activité</h1>
<p class="subtitle">Période : ${dateDebut} → ${dateFin} — Généré le ${genDate}</p>
${body}
<footer>KB POS — ${genDate}</footer>
</body></html>`
}

// ─── PDF COMPLET ──────────────────────────────────────────────────────────────
function generatePdfHtml(etat: EtatComplet, dateDebut: string, dateFin: string): string {
  const fmt = (v: any) => n(v).toLocaleString('fr-FR')
  const m = etat.marges
  const ca = n(etat.resume?.ca_total)
  const genDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const modeRows = etat.parModePaiement.map(mp =>
    `<tr><td>${MODE_LABELS[mp.mode_paiement]||mp.mode_paiement}</td><td>${n(mp.nb)}</td><td>${fmt(mp.total)} FCFA</td><td>${ca>0?((n(mp.total)/ca)*100).toFixed(1):0}%</td></tr>`
  ).join('')

  const articleRows = [...etat.parArticle].sort((a,b)=>n(b.ca)-n(a.ca)).slice(0,20).map((a,i)=>{
    const taux = n(a.ca)>0?((n(a.marge_brute)/n(a.ca))*100).toFixed(1):'0.0'
    return `<tr><td>${i+1}</td><td>${a.produit_nom}</td><td>${a.categorie_nom||'—'}</td><td>${n(a.qte_vendue).toFixed(2)} ${a.unite}</td><td>${fmt(a.ca)} FCFA</td><td>${fmt(a.cout_achat)} FCFA</td><td class="${n(a.marge_brute)>=0?'indigo':'red'}">${fmt(a.marge_brute)} FCFA</td><td><span class="${Number(taux)>=15?'badge-green':'badge-red'}">${taux}%</span></td></tr>`
  }).join('')

  const sessionRows = etat.sessions.map(s=>{
    const ecart = s.montant_final_especes!=null?n(s.montant_final_especes)-n(s.fond_caisse):null
    return `<tr><td>${s.date}</td><td>${s.user_nom}</td><td>${s.heure_ouverture}</td><td>${s.heure_cloture||'—'}</td><td>${fmt(s.fond_caisse)} FCFA</td><td class="${ecart==null?'':ecart>=0?'green':'red'}">${ecart!=null?`${ecart>=0?'+':''}${fmt(ecart)} FCFA`:'—'}</td><td>${s.statut==='cloture'?'Clôturé':'Ouvert'}</td></tr>`
  }).join('')

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>${PDF_CSS}</style></head><body>
<h1>État complet de l'activité</h1>
<p class="subtitle">Période : ${dateDebut} → ${dateFin} — Généré le ${genDate}</p>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-label">Nb ventes</div><div class="kpi-value">${fmt(etat.resume?.nb_ventes)}</div></div>
  <div class="kpi"><div class="kpi-label">CA brut</div><div class="kpi-value">${fmt(ca)} FCFA</div></div>
  <div class="kpi"><div class="kpi-label">Marge brute</div><div class="kpi-value">${fmt(m.marge_brute_total)} FCFA</div><div class="kpi-sub">${m.taux_marge_global.toFixed(1)}%</div></div>
  <div class="kpi"><div class="kpi-label">Résultat net</div><div class="kpi-value ${m.resultat_net>=0?'green':'red'}">${fmt(m.resultat_net)} FCFA</div></div>
</div>

<h2>Compte de résultat</h2>
<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:14px;">
${[
  {label:'CA brut',value:ca,sub:false},
  {label:'— Remises accordées',value:-n(etat.resume?.remises_total),sub:true},
  {label:"— Coût des marchandises",value:-m.cout_achats_total,sub:true},
  {label:'MARGE BRUTE',value:m.marge_brute_total,sub:false,sep:true},
  {label:"— Charges d'exploitation",value:-m.charges_total,sub:true},
  {label:'RÉSULTAT NET',value:m.resultat_net,sub:false,sep:true},
].map(r=>`<div class="pl-row ${r.sub?'pl-row-sub':''} ${(r as any).sep?'pl-separator':''}">
  <span>${r.label}</span>
  <span class="${r.value>=0?'green':'red'}">${r.value>=0?'+':''}${fmt(r.value)} FCFA &nbsp;<small style="color:#9ca3af">${ca>0?((Math.abs(r.value)/ca)*100).toFixed(1):0}%</small></span>
</div>`).join('')}
</div>

<h2>Modes de paiement</h2>
<table><thead><tr><th>Mode</th><th>Nb</th><th>Total</th><th>% CA</th></tr></thead><tbody>${modeRows}</tbody></table>

<h2>Top 20 articles (CA + marge)</h2>
<table><thead><tr><th>#</th><th>Article</th><th>Catégorie</th><th>Qté</th><th>CA</th><th>Coût achats</th><th>Marge brute</th><th>Taux</th></tr></thead><tbody>${articleRows}</tbody></table>

<h2>Sessions de caisse</h2>
<table><thead><tr><th>Date</th><th>Caissier</th><th>Ouverture</th><th>Clôture</th><th>Fond</th><th>Écart espèces</th><th>Statut</th></tr></thead><tbody>${sessionRows}</tbody></table>

${etat.annulations.length>0?`<h2>⚠️ Annulations (${etat.annulations.length})</h2>
<table><thead><tr><th>Ticket</th><th>Date</th><th>Caissier</th><th>Total</th></tr></thead><tbody>
${etat.annulations.map(v=>`<tr><td>${v.numero_ticket}</td><td>${v.date}</td><td>${v.caissier_nom||''}</td><td>${fmt(v.total)} FCFA</td></tr>`).join('')}
</tbody></table>`:''}

<footer>KB POS — État généré le ${genDate}</footer>
</body></html>`
}
