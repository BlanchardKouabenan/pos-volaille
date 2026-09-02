import { useState, useEffect } from 'react'
import { financeCompteResultat, getParametres } from '@/lib/ipc'
import { TrendingUp, TrendingDown, Minus, Download, BarChart3 } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const MOIS_NOMS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

export default function CompteResultat() {
  const now = new Date()
  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois] = useState<number | undefined>(now.getMonth() + 1)
  const [data, setData] = useState<any>(null)
  const [params, setParams] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'mensuel' | 'annuel'>('mensuel')

  const load = async () => {
    setLoading(true)
    try {
      const [cr, p] = await Promise.all([
        financeCompteResultat(annee, view === 'mensuel' ? mois : undefined),
        getParametres()
      ])
      setData(cr)
      setParams(p)
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [annee, mois, view])

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

  const exportPDF = () => {
    if (!data) return
    const p = params as any
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.getWidth()
    const titre = view === 'mensuel' ? `${MOIS_NOMS[(mois ?? 1) - 1]} ${annee}` : `Année ${annee}`

    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, pageW, 35, 'F')
    doc.setTextColor(245, 158, 11)
    doc.setFontSize(16); doc.setFont('helvetica', 'bold')
    doc.text(p?.nom_entreprise ?? 'KB POS', 14, 14)
    doc.setFontSize(10); doc.setTextColor(200, 200, 200); doc.setFont('helvetica', 'normal')
    doc.text(`Compte de résultat — ${titre}`, 14, 22)
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 29)

    // Section Produits
    doc.setTextColor(15, 23, 42); doc.setFontSize(11); doc.setFont('helvetica', 'bold')
    doc.text('I. PRODUITS D\'EXPLOITATION', 14, 48)
    autoTable(doc, {
      startY: 52,
      body: [
        ['Chiffre d\'affaires TTC', `${fmt(data.chiffreAffaires.ttc)} FCFA`],
        [`  dont TVA collectée (${parseFloat(p?.tva_taux ?? '0')}%)`, `${fmt(data.chiffreAffaires.tva_collectee)} FCFA`],
        ['Chiffre d\'affaires HT', `${fmt(data.chiffreAffaires.ht)} FCFA`],
        ['Nombre de ventes', String(data.chiffreAffaires.nb_ventes)],
      ],
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      theme: 'grid',
    })

    const y2 = (doc as any).lastAutoTable.finalY + 8
    doc.setFontSize(11); doc.setFont('helvetica', 'bold')
    doc.text('II. CHARGES D\'EXPLOITATION', 14, y2)
    const chargeRows = [
      ['Achats de marchandises', `${fmt(data.charges.achats_marchandises)} FCFA`],
      ['Charges courantes', `${fmt(data.charges.charges_courantes)} FCFA`],
      ...(data.charges.detail ?? []).map((c: any) => [`  - ${c.categorie ?? 'Autres'}`, `${fmt(c.montant)} FCFA`]),
      ['Total charges', `${fmt(data.charges.total)} FCFA`],
    ]
    autoTable(doc, {
      startY: y2 + 4,
      body: chargeRows,
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      theme: 'grid',
    })

    const y3 = (doc as any).lastAutoTable.finalY + 8
    const couleurRes = data.resultatNet >= 0 ? [5, 150, 105] : [220, 38, 38]
    doc.setFillColor(...couleurRes as [number, number, number])
    doc.roundedRect(14, y3, pageW - 28, 16, 3, 3, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.text('RÉSULTAT NET', 22, y3 + 10)
    doc.text(`${fmt(data.resultatNet)} FCFA`, pageW - 22, y3 + 10, { align: 'right' })

    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120)
    doc.text(`Marge nette : ${data.margeNette.toFixed(1)}%`, 14, y3 + 25)

    doc.save(`compte-resultat-${titre.replace(/\s+/g, '-').toLowerCase()}.pdf`)
  }

  const isPositif = (data?.resultatNet ?? 0) >= 0

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-600 rounded-xl flex items-center justify-center">
            <BarChart3 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Compte de résultat</h1>
            <p className="text-gray-500 text-sm">Bilan financier automatique — Produits & Charges</p>
          </div>
        </div>
        <button onClick={exportPDF} disabled={!data}
          className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-cyan-700 disabled:opacity-40">
          <Download size={16} /> Export PDF
        </button>
      </div>

      {/* Sélecteur période */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['mensuel', 'annuel'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                {v === 'mensuel' ? 'Mensuel' : 'Annuel'}
              </button>
            ))}
          </div>
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm">
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {view === 'mensuel' && (
            <select value={mois} onChange={e => setMois(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm">
              {MOIS_NOMS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          )}
          <span className="text-sm text-gray-400">
            Période : {data?.periode?.debut} → {data?.periode?.fin}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : !data ? null : (
        <>
          {/* Résultat net (hero) */}
          <div className={`rounded-2xl p-6 text-white ${isPositif ? 'bg-emerald-600' : 'bg-red-600'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-emerald-100 text-sm font-medium mb-1">Résultat net</div>
                <div className="text-4xl font-black">{fmt(data.resultatNet)} FCFA</div>
                <div className="text-emerald-100 text-sm mt-1">Marge nette : {data.margeNette.toFixed(1)}%</div>
              </div>
              {isPositif ? <TrendingUp size={48} className="opacity-30" /> : <TrendingDown size={48} className="opacity-30" />}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Produits */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-emerald-500" />
                <h2 className="font-bold text-gray-800">Produits d'exploitation</h2>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  ['CA TTC', fmt(data.chiffreAffaires.ttc) + ' FCFA', false],
                  [`TVA collectée (${parseFloat((params as any)?.tva_taux ?? '0')}%)`, fmt(data.chiffreAffaires.tva_collectee) + ' FCFA', true],
                  ['CA HT', fmt(data.chiffreAffaires.ht) + ' FCFA', false],
                  ['Nb ventes', String(data.chiffreAffaires.nb_ventes), false],
                ].map(([k, v, sub]) => (
                  <div key={String(k)} className={`flex justify-between py-2 border-b border-gray-50 ${sub ? 'pl-4 text-gray-400' : ''}`}>
                    <span className={sub ? 'text-gray-400' : 'text-gray-700'}>{k}</span>
                    <span className={sub ? 'text-gray-400' : 'font-bold text-emerald-700'}>{v}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 font-black text-base text-emerald-700 border-t">
                  <span>Total produits</span>
                  <span>{fmt(data.chiffreAffaires.ht)} FCFA</span>
                </div>
              </div>
            </div>

            {/* Charges */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown size={16} className="text-red-400" />
                <h2 className="font-bold text-gray-800">Charges d'exploitation</h2>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-gray-700">Achats marchandises</span>
                  <span className="font-bold text-red-600">{fmt(data.charges.achats_marchandises)} FCFA</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-gray-700">Charges courantes</span>
                  <span className="font-bold text-red-600">{fmt(data.charges.charges_courantes)} FCFA</span>
                </div>
                {(data.charges.detail ?? []).map((c: any, i: number) => (
                  <div key={i} className="flex justify-between py-1 pl-4 border-b border-gray-50 text-xs">
                    <span className="text-gray-400">{c.categorie ?? 'Autres'}</span>
                    <span className="text-gray-500">{fmt(c.montant)} FCFA</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 font-black text-base text-red-700 border-t">
                  <span>Total charges</span>
                  <span>{fmt(data.charges.total)} FCFA</span>
                </div>
              </div>
            </div>
          </div>

          {/* Synthèse */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Minus size={16} className="text-gray-400" />
              <h2 className="font-bold text-gray-800">Synthèse</h2>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ['CA HT', fmt(data.chiffreAffaires.ht), 'text-emerald-700'],
                ['− Achats marchandises', fmt(data.charges.achats_marchandises), 'text-red-600'],
                ['= Marge brute', fmt(data.chiffreAffaires.ht - data.charges.achats_marchandises), (data.chiffreAffaires.ht - data.charges.achats_marchandises) >= 0 ? 'text-emerald-700' : 'text-red-600'],
                ['− Charges courantes', fmt(data.charges.charges_courantes), 'text-red-600'],
              ].map(([k, v, color]) => (
                <div key={String(k)} className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-gray-600">{k}</span>
                  <span className={`font-bold ${color}`}>{v} FCFA</span>
                </div>
              ))}
              <div className={`flex justify-between py-3 font-black text-lg rounded-xl px-3 ${isPositif ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                <span>= RÉSULTAT NET</span>
                <span>{fmt(data.resultatNet)} FCFA</span>
              </div>
            </div>
          </div>

          {/* Mini graphe ventes par jour */}
          {data.ventesParJour?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-bold text-gray-800 mb-4 text-sm">CA par jour sur la période</h3>
              <div className="flex items-end gap-0.5 h-24">
                {data.ventesParJour.map((d: any, i: number) => {
                  const max = Math.max(...data.ventesParJour.map((x: any) => Number(x.ca)), 1)
                  const pct = (Number(d.ca) / max) * 100
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center" title={`${d.jour}: ${fmt(Number(d.ca))} FCFA`}>
                      <div className="w-full bg-cyan-500 rounded-sm" style={{ height: `${pct}%`, minHeight: 2 }} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
