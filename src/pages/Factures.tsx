import { useState, useEffect } from 'react'
import { factureGetAll, factureGetById, factureCreate, factureUpdateStatut, getClients, getParametres } from '@/lib/ipc'
import { FileText, Plus, X, Printer, Check, RotateCcw, ChevronRight } from 'lucide-react'
import type { Client } from '@/types'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface Facture {
  id: number; numero: string; vente_id?: number; client_id?: number
  client_nom?: string; client_nif?: string; client_rccm?: string; client_adresse?: string
  montant_ht: number; tva_taux: number; tva_montant: number; montant_ttc: number
  statut: string; date_emission: string; date_echeance?: string; notes?: string
}

interface LigneForm {
  designation: string; quantite: number; prix_unitaire_ht: number; tva_taux: number
}

const STATUT_COLORS: Record<string, string> = {
  emise: 'bg-blue-100 text-blue-700',
  payee: 'bg-emerald-100 text-emerald-700',
  annulee: 'bg-red-100 text-red-700',
}

export default function Factures() {
  const [factures, setFactures] = useState<Facture[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [params, setParams] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<any>(null)

  const [form, setForm] = useState({
    client_id: '' as string | number,
    client_nom: '', client_nif: '', client_rccm: '', client_adresse: '',
    tva_taux: 18, date_echeance: '', notes: '',
    lignes: [{ designation: '', quantite: 1, prix_unitaire_ht: 0, tva_taux: 18 }] as LigneForm[]
  })

  const load = async () => {
    setLoading(true)
    try {
      const [f, c, p] = await Promise.all([factureGetAll(), getClients(), getParametres()])
      setFactures(f as Facture[])
      setClients(c as Client[])
      setParams(p)
      const tvaDef = parseFloat((p as any)?.tva_taux ?? '18')
      setForm(prev => ({ ...prev, tva_taux: tvaDef, lignes: [{ designation: '', quantite: 1, prix_unitaire_ht: 0, tva_taux: tvaDef }] }))
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const selectClient = (cid: number) => {
    const c = clients.find(cl => cl.id === cid)
    if (c) setForm(prev => ({ ...prev, client_id: cid, client_nom: c.nom, client_adresse: '' }))
  }

  const addLigne = () => setForm(prev => ({
    ...prev, lignes: [...prev.lignes, { designation: '', quantite: 1, prix_unitaire_ht: 0, tva_taux: form.tva_taux }]
  }))

  const removeLigne = (i: number) => setForm(prev => ({
    ...prev, lignes: prev.lignes.filter((_, idx) => idx !== i)
  }))

  const updateLigne = (i: number, field: keyof LigneForm, value: any) => {
    setForm(prev => ({
      ...prev, lignes: prev.lignes.map((l, idx) => idx === i ? { ...l, [field]: value } : l)
    }))
  }

  const totaux = form.lignes.reduce((acc, l) => {
    const ht = l.quantite * l.prix_unitaire_ht
    const tva = ht * (l.tva_taux / 100)
    return { ht: acc.ht + ht, tva: acc.tva + tva }
  }, { ht: 0, tva: 0 })

  const handleCreate = async () => {
    if (!form.client_nom || !form.lignes.some(l => l.designation)) return
    await factureCreate({
      client_id: form.client_id || undefined,
      client_nom: form.client_nom, client_nif: form.client_nif, client_rccm: form.client_rccm,
      client_adresse: form.client_adresse, tva_taux: form.tva_taux,
      date_echeance: form.date_echeance || undefined, notes: form.notes,
      lignes: form.lignes.filter(l => l.designation && l.prix_unitaire_ht > 0)
    })
    setShowCreate(false)
    load()
  }

  const handleViewFacture = async (id: number) => {
    const f = await factureGetById(id)
    setSelected(f)
  }

  const exportPDF = (facture: any) => {
    const p = params as any
    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.getWidth()

    // En-tête vendeur
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, pageW, 42, 'F')
    doc.setTextColor(245, 158, 11)
    doc.setFontSize(18); doc.setFont('helvetica', 'bold')
    doc.text(p?.nom_entreprise ?? 'KB POS', 14, 16)
    doc.setTextColor(200, 200, 200)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    const lines = [
      p?.adresse ?? "Abidjan, Côte d'Ivoire",
      `Tél: ${p?.telephone ?? ''}`,
      p?.nif_entreprise ? `NIF: ${p.nif_entreprise}` : '',
      p?.rccm_entreprise ? `RCCM: ${p.rccm_entreprise}` : '',
      p?.compte_contribuable ? `CC: ${p.compte_contribuable}` : '',
    ].filter(Boolean)
    lines.forEach((l, i) => doc.text(l, 14, 24 + i * 4))

    // Titre facture
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(22); doc.setFont('helvetica', 'bold')
    doc.text('FACTURE', pageW - 14, 16, { align: 'right' })
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`N° ${facture.numero}`, pageW - 14, 24, { align: 'right' })
    doc.text(`Date: ${new Date(facture.date_emission).toLocaleDateString('fr-FR')}`, pageW - 14, 30, { align: 'right' })
    if (facture.date_echeance) doc.text(`Échéance: ${new Date(facture.date_echeance).toLocaleDateString('fr-FR')}`, pageW - 14, 36, { align: 'right' })

    // Bloc client
    doc.setFontSize(9); doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('FACTURÉ À', 14, 52)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    const cLines = [
      facture.client_nom ?? 'Client',
      facture.client_nif ? `NIF: ${facture.client_nif}` : '',
      facture.client_rccm ? `RCCM: ${facture.client_rccm}` : '',
      facture.client_adresse ?? '',
    ].filter(Boolean)
    cLines.forEach((l, i) => doc.text(l, 14, 58 + i * 5))

    // Tableau lignes
    const rows = (facture.lignes ?? []).map((l: any) => [
      l.designation,
      String(l.quantite),
      `${Math.round(l.prix_unitaire_ht).toLocaleString('fr-FR')} FCFA`,
      `${l.tva_taux}%`,
      `${Math.round(l.total_ht).toLocaleString('fr-FR')} FCFA`,
      `${Math.round(l.total_ttc).toLocaleString('fr-FR')} FCFA`,
    ])

    autoTable(doc, {
      startY: 78,
      head: [['Désignation', 'Qté', 'P.U. HT', 'TVA', 'Total HT', 'Total TTC']],
      body: rows,
      headStyles: { fillColor: [15, 23, 42], textColor: [245, 158, 11], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 70 } },
    })

    const finalY = (doc as any).lastAutoTable.finalY + 8
    const montantHT = facture.montant_ht
    const tvaMontant = facture.tva_montant
    const montantTTC = facture.montant_ttc

    const totLines = [
      ['Total HT', `${Math.round(montantHT).toLocaleString('fr-FR')} FCFA`],
      [`TVA (${facture.tva_taux}%)`, `${Math.round(tvaMontant).toLocaleString('fr-FR')} FCFA`],
      ['TOTAL TTC', `${Math.round(montantTTC).toLocaleString('fr-FR')} FCFA`],
    ]
    totLines.forEach(([k, v], i) => {
      const isLast = i === totLines.length - 1
      if (isLast) { doc.setFillColor(15, 23, 42); doc.rect(pageW - 90, finalY + i * 7, 76, 7, 'F') }
      doc.setFontSize(isLast ? 10 : 8); doc.setFont('helvetica', isLast ? 'bold' : 'normal')
      doc.setTextColor(isLast ? 245 : 80, isLast ? 158 : 80, isLast ? 11 : 80)
      doc.text(k, pageW - 90, finalY + i * 7 + 5)
      doc.text(v, pageW - 14, finalY + i * 7 + 5, { align: 'right' })
    })

    if (facture.notes) {
      doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120)
      doc.text(`Notes: ${facture.notes}`, 14, finalY + totLines.length * 7 + 8)
    }

    // Pied DGI
    const botY = doc.internal.pageSize.getHeight() - 18
    doc.setFillColor(243, 244, 246); doc.rect(0, botY - 4, pageW, 22, 'F')
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
    doc.text("Document conforme aux dispositions fiscales de la République de Côte d'Ivoire — Direction Générale des Impôts (DGI-CI)", pageW / 2, botY + 2, { align: 'center' })
    if (p?.nif_entreprise) doc.text(`NIF: ${p.nif_entreprise} | RCCM: ${p.rccm_entreprise ?? '—'} | CC: ${p.compte_contribuable ?? '—'}`, pageW / 2, botY + 8, { align: 'center' })

    doc.save(`${facture.numero}.pdf`)
  }

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Factures DGI</h1>
            <p className="text-gray-500 text-sm">Factures officielles conformes à la réglementation CI</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-indigo-700">
          <Plus size={16} /> Nouvelle facture
        </button>
      </div>

      {!(params as any)?.nif_entreprise && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          ⚠️ NIF, RCCM et Compte Contribuable non configurés. Allez dans <strong>Paramètres → Entreprise</strong>.
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['N° Facture', 'Client', 'Montant HT', 'TVA', 'Total TTC', 'Statut', 'Date', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {factures.map(f => (
                <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-sm font-bold text-indigo-600">{f.numero}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{f.client_nom ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">{fmt(f.montant_ht)} FCFA</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{fmt(f.tva_montant)} FCFA</td>
                  <td className="px-4 py-3 text-sm font-bold">{fmt(f.montant_ttc)} FCFA</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUT_COLORS[f.statut] ?? 'bg-gray-100 text-gray-600'}`}>
                      {f.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(f.date_emission).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleViewFacture(f.id)} title="Détails" className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg">
                        <ChevronRight size={14} />
                      </button>
                      {f.statut === 'emise' && (
                        <>
                          <button onClick={() => factureUpdateStatut(f.id, 'payee').then(load)} title="Marquer payée" className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg">
                            <Check size={14} />
                          </button>
                          <button onClick={() => factureUpdateStatut(f.id, 'annulee').then(load)} title="Annuler" className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg">
                            <RotateCcw size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!factures.length && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">Aucune facture</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Détail facture */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
              <div>
                <h2 className="font-bold text-lg">{selected.numero}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUT_COLORS[selected.statut] ?? 'bg-gray-100'}`}>{selected.statut}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => exportPDF(selected)}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-sm font-semibold hover:bg-indigo-700">
                  <Printer size={14} /> PDF
                </button>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Client</div>
                  <div className="font-semibold">{selected.client_nom ?? '—'}</div>
                  {selected.client_nif && <div className="text-xs text-gray-400">NIF: {selected.client_nif}</div>}
                  {selected.client_rccm && <div className="text-xs text-gray-400">RCCM: {selected.client_rccm}</div>}
                  {selected.client_adresse && <div className="text-xs text-gray-400">{selected.client_adresse}</div>}
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Émise le</div>
                  <div className="font-semibold">{new Date(selected.date_emission).toLocaleDateString('fr-FR')}</div>
                  {selected.date_echeance && <>
                    <div className="text-xs text-gray-400 mt-2">Échéance</div>
                    <div className="font-semibold">{new Date(selected.date_echeance).toLocaleDateString('fr-FR')}</div>
                  </>}
                </div>
              </div>

              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-gray-50">
                  {['Désignation', 'Qté', 'P.U. HT', 'TVA', 'Total TTC'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(selected.lignes ?? []).map((l: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-3 py-2">{l.designation}</td>
                      <td className="px-3 py-2">{l.quantite}</td>
                      <td className="px-3 py-2">{fmt(l.prix_unitaire_ht)} FCFA</td>
                      <td className="px-3 py-2">{l.tva_taux}%</td>
                      <td className="px-3 py-2 font-semibold">{fmt(l.total_ttc)} FCFA</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="text-right space-y-1 text-sm">
                <div className="flex justify-end gap-8"><span className="text-gray-500">Total HT</span><span>{fmt(selected.montant_ht)} FCFA</span></div>
                <div className="flex justify-end gap-8"><span className="text-gray-500">TVA ({selected.tva_taux}%)</span><span>{fmt(selected.tva_montant)} FCFA</span></div>
                <div className="flex justify-end gap-8 text-base font-black border-t pt-1"><span>Total TTC</span><span className="text-indigo-600">{fmt(selected.montant_ttc)} FCFA</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal création */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
              <h2 className="font-bold text-lg">Nouvelle facture</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Client */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Client existant (optionnel)</label>
                  <select value={form.client_id} onChange={e => e.target.value ? selectClient(Number(e.target.value)) : setForm(prev => ({ ...prev, client_id: '' }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm">
                    <option value="">— Saisir manuellement —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom} {c.telephone ? `(${c.telephone})` : ''}</option>)}
                  </select>
                </div>
                {[['client_nom', 'Nom / Raison sociale *'], ['client_nif', 'NIF client'], ['client_rccm', 'RCCM client'], ['client_adresse', 'Adresse']].map(([k, l]) => (
                  <div key={k}>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">{l}</label>
                    <input value={(form as any)[k]} onChange={e => setForm(prev => ({ ...prev, [k]: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                ))}
              </div>

              {/* Lignes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lignes de facture</label>
                  <button onClick={addLigne} className="flex items-center gap-1 text-indigo-600 text-xs hover:underline"><Plus size={12} /> Ajouter</button>
                </div>
                <div className="space-y-2">
                  {form.lignes.map((l, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <input placeholder="Désignation" value={l.designation} onChange={e => updateLigne(i, 'designation', e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      <input type="number" placeholder="Qté" value={l.quantite} onChange={e => updateLigne(i, 'quantite', Number(e.target.value))}
                        className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center" />
                      <input type="number" placeholder="P.U. HT" value={l.prix_unitaire_ht || ''} onChange={e => updateLigne(i, 'prix_unitaire_ht', Number(e.target.value))}
                        className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                      <input type="number" placeholder="TVA%" value={l.tva_taux} onChange={e => updateLigne(i, 'tva_taux', Number(e.target.value))}
                        className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center" />
                      {form.lignes.length > 1 && (
                        <button onClick={() => removeLigne(i)} className="p-1.5 text-red-400 hover:text-red-600"><X size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Totaux */}
              <div className="bg-gray-50 rounded-xl p-3 text-sm text-right space-y-1">
                <div className="flex justify-end gap-6 text-gray-500"><span>Total HT</span><span>{fmt(totaux.ht)} FCFA</span></div>
                <div className="flex justify-end gap-6 text-gray-500"><span>TVA</span><span>{fmt(totaux.tva)} FCFA</span></div>
                <div className="flex justify-end gap-6 font-black text-indigo-600 text-base"><span>Total TTC</span><span>{fmt(totaux.ht + totaux.tva)} FCFA</span></div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none" />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">Annuler</button>
                <button onClick={handleCreate} disabled={!form.client_nom}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40">
                  Créer la facture
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
