import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getInventaires, getInventaireById, createInventaire, updateInventaireLigne, updateInventaireJustification, cloturerInventaire, getCategories, exportPdf, dialogSaveFile } from '@/lib/ipc'
import type { Categorie } from '@/types'
import * as XLSX from 'xlsx'
import { Plus, ClipboardList, Check, X, AlertTriangle, ChevronRight, Search, Lock, FileSpreadsheet, FileText, Download } from 'lucide-react'

type View = 'liste' | 'detail'

interface InvLigne {
  id: number
  produit_id: number
  produit_nom: string
  unite: string
  categorie_nom: string
  categorie_couleur: string
  stock_theorique: number
  stock_compte: number | null
  ecart: number | null
  justification?: string | null
  prix_vente?: number
}

export default function Inventaire() {
  const { user } = useAuthStore()
  const [view, setView] = useState<View>('liste')
  const [inventaires, setInventaires] = useState<any[]>([])
  const [current, setCurrent] = useState<any | null>(null)
  const [lignes, setLignes] = useState<InvLigne[]>([])
  const [categories, setCategories] = useState<Categorie[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<number | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ notes: '', categorieId: '' })
  const [showCloture, setShowCloture] = useState(false)
  const [clotureResult, setClotureResult] = useState<{ nbEcarts: number } | null>(null)
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [justifDrafts, setJustifDrafts] = useState<Record<number, string>>({})
  const [justifSaving, setJustifSaving] = useState<Record<number, boolean>>({})
  const [showExportMenu, setShowExportMenu] = useState(false)

  const loadListe = async () => {
    try {
      const [inv, cats] = await Promise.all([getInventaires(), getCategories()])
      setInventaires(inv)
      setCategories(cats)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadListe() }, [])

  const openInventaire = async (inv: any) => {
    const d = await getInventaireById(inv.id)
    if (!d) return
    setCurrent(d)
    setLignes(d.lignes)
    setView('detail')
  }

  const handleCreateInventaire = async () => {
    setSaving(true)
    try {
      const result = await createInventaire({
        notes: createForm.notes || undefined,
        user_id: user?.id,
        categorieId: createForm.categorieId ? parseInt(createForm.categorieId) : undefined
      })
      setShowCreateModal(false)
      const inv = await getInventaires()
      setInventaires(inv)
      const detail = await getInventaireById(result.inventaireId)
      if (detail) { setCurrent(detail); setLignes(detail.lignes); setView('detail') }
    } catch {}
    setSaving(false)
  }

  const handleCount = async (ligne: InvLigne, val: number) => {
    // Mise à jour locale immédiate
    setLignes(ls => ls.map(l => l.produit_id === ligne.produit_id
      ? { ...l, stock_compte: val, ecart: val - l.stock_theorique }
      : l
    ))
    // Persistance asynchrone
    try { await updateInventaireLigne(current.id, ligne.produit_id, val) } catch {}
  }

  const handleCloture = async () => {
    setSaving(true)
    try {
      const result = await cloturerInventaire(current.id, user?.id)
      if (result.success) {
        setClotureResult({ nbEcarts: result.nbEcarts })
        const d = await getInventaireById(current.id)
        if (d) { setCurrent(d); setLignes(d.lignes) }
        await loadListe()
      }
    } catch {}
    setSaving(false)
  }

  const handlePrint = async () => {
    if (!current) return
    const html = generateHtml(current, lignes)
    await exportPdf(html, `etat-inventaire-${current.reference}.pdf`)
  }

  const handleExportExcel = async () => {
    if (!current) return
    const wb = XLSX.utils.book_new()
    const ecarts = lignes.filter(l => l.ecart !== null && l.ecart !== 0)
    const n = (x: any) => Number(x ?? 0)

    const resumeData = [
      ['ÉTAT DE L\'INVENTAIRE', `${current.reference} — ${current.date}`],
      ['Statut', current.statut === 'cloture' ? 'Clôturé' : 'En cours'],
      [],
      ['Indicateur', 'Valeur'],
      ['Articles', lignes.length],
      ['Articles comptés', lignes.filter(l => l.stock_compte !== null).length],
      ['Écarts', ecarts.length],
      ['Reste en manque (valeur FCFA)', valeurManque],
      ['Excédent (valeur FCFA)', valeurSurplus],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumeData), 'Résumé')

    const lignesData = [
      ['Article', 'Catégorie', 'Unité', 'Prix unit.', 'Théorique', 'Compté', 'Écart', 'Valeur écart (FCFA)', 'Justification'],
      ...lignes.map(l => [
        l.produit_nom, l.categorie_nom, l.unite, n(l.prix_vente),
        n(l.stock_theorique), l.stock_compte !== null ? n(l.stock_compte) : '',
        l.ecart !== null ? n(l.ecart) : '',
        l.ecart !== null ? n(l.ecart) * n(l.prix_vente) : '',
        l.justification ?? ''
      ])
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lignesData), 'Détail')

    if (ecarts.length > 0) {
      const ecartsData = [
        ['Article', 'Théorique', 'Compté', 'Écart', 'Valeur écart (FCFA)', 'Justification'],
        ...ecarts.map(l => [
          l.produit_nom, n(l.stock_theorique), l.stock_compte !== null ? n(l.stock_compte) : '',
          n(l.ecart), n(l.ecart) * n(l.prix_vente), l.justification ?? ''
        ])
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ecartsData), 'Écarts')
    }

    const filename = `etat-inventaire-${current.reference}.xlsx`
    const savePath = await dialogSaveFile(filename)
    if (savePath) {
      const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const api = (window as any).electronAPI
      await api.fs.writeFile(savePath, Array.from(wbArray))
      await api.shell.openPath(savePath)
    }
  }

  const handleExportCsv = async () => {
    if (!current) return
    const enc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['Référence', current.reference],
      ['Date', current.date],
      ['Statut', current.statut === 'cloture' ? 'Clôturé' : 'En cours'],
      ['Notes', current.notes ?? ''],
      [],
      ['Article', 'Catégorie', 'Unité', 'Prix unit.', 'Théorique', 'Compté', 'Écart', 'Valeur écart (FCFA)', 'Justification'],
      ...lignes.map(l => [
        l.produit_nom, l.categorie_nom, l.unite, Number(l.prix_vente ?? 0),
        Number(l.stock_theorique), l.stock_compte !== null ? Number(l.stock_compte) : '',
        l.ecart !== null ? Number(l.ecart) : '',
        l.ecart !== null ? Number(l.ecart) * Number(l.prix_vente ?? 0) : 0,
        l.justification ?? ''
      ])
    ]
    const csv = '\uFEFF' + rows.map(r => r.map(enc).join(';')).join('\r\n')
    const api = (window as any).electronAPI
    const savePath = await dialogSaveFile(`etat-inventaire-${current.reference}.csv`)
    if (savePath) {
      const bytes = Array.from(new TextEncoder().encode(csv))
      await api.fs.writeFile(savePath, bytes)
      await api.shell.openPath(savePath)
    }
  }

  const saveJustification = async (l: InvLigne, val: string) => {
    if (!current) return
    setJustifSaving(s => ({ ...s, [l.produit_id]: true }))
    try { await updateInventaireJustification(current.id, l.produit_id, val) } catch {}
    setJustifSaving(s => ({ ...s, [l.produit_id]: false }))
  }

  const filteredLignes = lignes.filter(l => {
    const matchSearch = !search || l.produit_nom.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  const nbComptes = lignes.filter(l => l.stock_compte !== null).length
  const nbEcarts = lignes.filter(l => l.ecart !== null && l.ecart !== 0).length
  const nbManquants = lignes.filter(l => l.stock_compte === null).length
  const progress = lignes.length > 0 ? Math.round((nbComptes / lignes.length) * 100) : 0
  const valeurManque = lignes.reduce((s, l) => s + (l.ecart !== null && l.ecart < 0 ? Math.abs(l.ecart) * (l.prix_vente ?? 0) : 0), 0)
  const valeurSurplus = lignes.reduce((s, l) => s + (l.ecart !== null && l.ecart > 0 ? l.ecart * (l.prix_vente ?? 0) : 0), 0)
  const o = new Intl.NumberFormat('fr-FR').format

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
    </div>
  )

  // ─── VUE DÉTAIL INVENTAIRE ───────────────────────────────────────────────────
  if (view === 'detail' && current) {
    const isCloture = current.statut === 'cloture'
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
          <div className="flex items-start justify-between mb-2">
            <div>
              <button onClick={() => setView('liste')} className="text-sm text-gray-500 hover:text-gray-800 mb-1 flex items-center gap-1">
                ← Liste des inventaires
              </button>
              <h2 className="text-xl font-bold text-gray-900">{current.reference}</h2>
              <p className="text-sm text-gray-500">{current.date} · {lignes.length} articles</p>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <button onClick={() => setShowExportMenu(s => !s)} className="btn btn-secondary flex items-center gap-2 text-sm">
                  <Download size={16} /> Exporter
                </button>
                {showExportMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-card border border-gray-100 py-1.5 w-52">
                      <button onClick={() => { setShowExportMenu(false); handlePrint() }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                        <FileText size={15} className="text-red-500" /> PDF (.pdf)
                      </button>
                      <button onClick={() => { setShowExportMenu(false); handleExportExcel() }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                        <FileSpreadsheet size={15} className="text-emerald-600" /> Excel (.xlsx)
                      </button>
                      <button onClick={() => { setShowExportMenu(false); handleExportCsv() }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                        <Download size={15} className="text-blue-600" /> CSV
                      </button>
                    </div>
                  </>
                )}
              </div>
              {!isCloture && (
                <button
                  onClick={() => setShowCloture(true)}
                  disabled={nbManquants > 0}
                  className="btn btn-primary flex items-center gap-2 text-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
                  title={nbManquants > 0 ? `${nbManquants} article(s) non comptés` : ''}
                >
                  <Lock size={16} /> Clôturer
                </button>
              )}
              {isCloture && (
                <span className="flex items-center gap-1.5 px-3 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-semibold">
                  <Check size={15} /> Clôturé
                </span>
              )}
            </div>
          </div>

          {/* Barre de progression */}
          {!isCloture && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>{nbComptes}/{lignes.length} comptés · {nbEcarts} écart(s)</span>
                <span className="font-semibold">{progress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Stats si clôturé */}
          {isCloture && (
            <div className="flex gap-4 mt-2 text-sm">
              <span className="text-gray-500">{lignes.length} articles comptés</span>
              <span className={`font-semibold ${nbEcarts > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                {nbEcarts > 0 ? `${nbEcarts} écart(s) appliqué(s)` : '✓ Aucun écart'}
              </span>
              {nbEcarts > 0 && (
                <>
                  <span className="text-red-500 font-semibold">Manque : {o(valeurManque)} FCFA</span>
                  <span className="text-emerald-600 font-semibold">Excédent : {o(valeurSurplus)} FCFA</span>
                </>
              )}
            </div>
          )}

          {/* Recherche */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filtrer par article..."
              className="input w-full pl-9 py-2 text-sm"
            />
          </div>
        </div>

        {/* Table de comptage */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Article</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Théorique</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Compté</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Écart</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-64">Justification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLignes.map((l, i) => {
                const hasEcart = l.ecart !== null && l.ecart !== 0
                const isOk = l.ecart !== null && l.ecart === 0
                return (
                  <tr key={l.produit_id} className={`hover:bg-gray-50 ${hasEcart ? 'bg-orange-50/40' : isOk ? 'bg-emerald-50/30' : ''}`}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{l.produit_nom}</p>
                      <p className="text-xs text-gray-400">{l.categorie_nom} · {l.unite}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600">{Number(l.stock_theorique).toLocaleString('fr-FR')}</td>
                    <td className="px-4 py-2.5 text-right">
                      {isCloture ? (
                        <span className="font-mono font-semibold">{l.stock_compte !== null ? Number(l.stock_compte).toLocaleString('fr-FR') : '—'}</span>
                      ) : (
                        <input
                          ref={el => { inputRefs.current[l.produit_id] = el }}
                          type="number"
                          min="0"
                          step="0.1"
                          defaultValue={l.stock_compte !== null ? l.stock_compte : ''}
                          placeholder="—"
                          onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) handleCount(l, v) }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const next = filteredLignes[i + 1]
                              if (next) inputRefs.current[next.produit_id]?.focus()
                            }
                          }}
                          className="input w-24 text-right text-sm py-1 ml-auto block"
                        />
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {l.ecart !== null ? (
                        <span className={`inline-flex items-center gap-0.5 font-semibold text-sm ${
                          l.ecart > 0 ? 'text-emerald-600' : l.ecart < 0 ? 'text-red-500' : 'text-gray-400'
                        }`}>
                          {l.ecart > 0 ? '+' : ''}{Number(l.ecart).toLocaleString('fr-FR')}
                          {l.ecart !== 0 && <AlertTriangle size={12} className="ml-0.5" />}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">non compté</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {(l.ecart !== null && l.ecart !== 0) || isCloture || justifDrafts[l.produit_id] !== undefined ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={justifDrafts[l.produit_id] ?? l.justification ?? ''}
                            placeholder={l.ecart !== null && l.ecart !== 0 ? 'Motif de l\'écart...' : '—'}
                            onChange={e => setJustifDrafts(d => ({ ...d, [l.produit_id]: e.target.value }))}
                            onBlur={e => {
                              const v = e.target.value.trim()
                              if (v !== (l.justification ?? '')) saveJustification(l, v)
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400 bg-white disabled:bg-gray-50"
                          />
                          {justifSaving[l.produit_id] && <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Modal de confirmation clôture */}
        {showCloture && (
          <div className="modal-overlay">
            <div className="modal-content w-full max-w-sm">
              <div className="p-6 text-center">
                <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="text-orange-500" size={24} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">Clôturer l'inventaire ?</h3>
                <p className="text-gray-500 text-sm mb-2">
                  Les écarts seront appliqués au stock. Cette action est irréversible.
                </p>
                {nbEcarts > 0 ? (
                  <p className="text-orange-600 text-sm font-medium mb-5">{nbEcarts} écart(s) détecté(s) → le stock sera ajusté.</p>
                ) : (
                  <p className="text-emerald-600 text-sm font-medium mb-5">Aucun écart détecté. ✓</p>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setShowCloture(false)} className="flex-1 btn btn-secondary">Annuler</button>
                  <button onClick={() => { setShowCloture(false); handleCloture() }} disabled={saving} className="flex-1 btn btn-primary">
                    {saving ? 'Traitement...' : 'Confirmer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast résultat clôture */}
        {clotureResult && (
          <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 z-50">
            <Check size={20} />
            <div>
              <p className="font-bold">Inventaire clôturé !</p>
              <p className="text-sm text-emerald-100">{clotureResult.nbEcarts} écart(s) appliqué(s) au stock</p>
            </div>
            <button onClick={() => setClotureResult(null)} className="ml-2"><X size={16} /></button>
          </div>
        )}
      </div>
    )
  }

  // ─── VUE LISTE ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventaire physique</h1>
          <p className="text-sm text-gray-500 mt-0.5">{inventaires.length} inventaire(s) enregistré(s)</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary flex items-center gap-2">
          <Plus size={18} /> Nouvel inventaire
        </button>
      </div>

      {inventaires.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <ClipboardList size={48} className="mb-3 opacity-30" />
          <p className="text-lg font-medium">Aucun inventaire</p>
          <p className="text-sm mt-1">Lancez votre premier inventaire physique</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Référence</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Articles</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Écarts</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inventaires.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openInventaire(inv)}>
                  <td className="px-4 py-3 font-medium text-gray-800 font-mono">{inv.reference}</td>
                  <td className="px-4 py-3 text-gray-500">{inv.date}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{inv.nb_articles}</td>
                  <td className="px-4 py-3 text-right">
                    {inv.statut === 'cloture' ? (
                      <span className={`font-semibold ${inv.nb_ecarts > 0 ? 'text-orange-500' : 'text-emerald-600'}`}>
                        {inv.nb_ecarts > 0 ? `${inv.nb_ecarts} écart(s)` : '✓'}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      inv.statut === 'cloture' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {inv.statut === 'cloture' ? <><Check size={11} /> Clôturé</> : <><ClipboardList size={11} /> En cours</>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={16} className="text-gray-400 ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal création */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content w-full max-w-md">
            <div className="bg-indigo-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-bold text-lg">Nouvel inventaire physique</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 hover:bg-indigo-700 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie (optionnel)</label>
                <select
                  value={createForm.categorieId}
                  onChange={e => setCreateForm(f => ({ ...f, categorieId: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">— Tous les articles —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icone} {c.nom}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Laissez vide pour inventorier tous les produits.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optionnel)</label>
                <textarea
                  value={createForm.notes}
                  onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                  className="input w-full h-20 resize-none"
                  placeholder="Inventaire de fin de mois, zone A..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 btn btn-secondary">Annuler</button>
              <button onClick={handleCreateInventaire} disabled={saving} className="flex-1 btn btn-primary">
                {saving ? 'Création...' : 'Lancer l\'inventaire'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Génération PDF ────────────────────────────────────────────────────────────
function generateHtml(inventaire: any, lignes: InvLigne[]): string {
  const ecarts = lignes.filter(l => l.ecart !== null && l.ecart !== 0)
  const n = (x: any) => Number(x ?? 0)
  const valeurManque = lignes.reduce((s, l) => s + (l.ecart !== null && l.ecart < 0 ? Math.abs(l.ecart) * (l.prix_vente ?? 0) : 0), 0)
  const valeurSurplus = lignes.reduce((s, l) => s + (l.ecart !== null && l.ecart > 0 ? l.ecart * (l.prix_vente ?? 0) : 0), 0)
  const nbComptes = lignes.filter(l => l.stock_compte !== null).length
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}
    h1{font-size:18px;margin-bottom:4px} .sub{color:#666;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th{background:#f3f4f6;text-align:left;padding:8px;font-size:11px;color:#444}
    td{padding:7px 8px;border-bottom:1px solid #eee;font-size:11px;vertical-align:top}
    .right{text-align:right} .plus{color:#16a34a;font-weight:bold} .minus{color:#dc2626;font-weight:bold}
    .ecart-title{margin-top:20px;font-weight:bold;color:#ea580c}
    .kpi{display:inline-block;margin:4px 24px 12px 0}
    .kpi-val{font-size:20px;font-weight:bold} .kpi-lab{font-size:10px;color:#666}
    .just{color:#444;font-style:italic}
  </style></head><body>
  <h1>État de l&rsquo;inventaire — ${inventaire.reference}</h1>
  <p class="sub">Date : ${inventaire.date} · Statut : ${inventaire.statut === 'cloture' ? 'Clôturé' : 'En cours'} · ${lignes.length} articles · ${nbComptes} comptés${inventaire.notes ? ' · Notes : ' + inventaire.notes : ''}</p>
  <div>
    <div class="kpi"><div class="kpi-val">${lignes.length}</div><div class="kpi-lab">Articles</div></div>
    <div class="kpi"><div class="kpi-val">${nbComptes}</div><div class="kpi-lab">Comptés</div></div>
    <div class="kpi"><div class="kpi-val">${ecarts.length}</div><div class="kpi-lab">Écarts</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#dc2626">${valeurManque.toLocaleString('fr-FR')}</div><div class="kpi-lab">Manque (FCFA)</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#16a34a">${valeurSurplus.toLocaleString('fr-FR')}</div><div class="kpi-lab">Excédent (FCFA)</div></div>
  </div>
  <table>
    <tr><th>Article</th><th>Catégorie</th><th class="right">Prix unit.</th><th class="right">Théorique</th><th class="right">Compté</th><th class="right">Écart</th><th class="right">Valeur écart (FCFA)</th><th>Justification</th></tr>
    ${lignes.map(l => `
      <tr>
        <td>${l.produit_nom}</td>
        <td>${l.categorie_nom}</td>
        <td class="right">${n(l.prix_vente).toLocaleString('fr-FR')}</td>
        <td class="right">${Number(l.stock_theorique).toLocaleString('fr-FR')} ${l.unite}</td>
        <td class="right">${l.stock_compte !== null ? Number(l.stock_compte).toLocaleString('fr-FR') + ' ' + l.unite : '—'}</td>
        <td class="right ${l.ecart && l.ecart > 0 ? 'plus' : l.ecart && l.ecart < 0 ? 'minus' : ''}">
          ${l.ecart !== null && l.ecart !== 0 ? (l.ecart > 0 ? '+' : '') + Number(l.ecart).toLocaleString('fr-FR') : l.ecart === 0 ? '✓' : '—'}
        </td>
        <td class="right">${l.ecart !== null && l.ecart !== 0 ? (n(l.ecart) * n(l.prix_vente)).toLocaleString('fr-FR') : '—'}</td>
        <td class="just">${l.justification ?? ''}</td>
      </tr>
    `).join('')}
  </table>
  ${ecarts.length > 0 ? `
    <p class="ecart-title">⚠ Récapitulatif des écarts (${ecarts.length}) — manque ${valeurManque.toLocaleString('fr-FR')} FCFA / excédent ${valeurSurplus.toLocaleString('fr-FR')} FCFA</p>
    <table>
      <tr><th>Article</th><th class="right">Prix unit.</th><th class="right">Théorique</th><th class="right">Compté</th><th class="right">Écart</th><th class="right">Valeur écart (FCFA)</th><th>Justification</th></tr>
      ${ecarts.map(l => `
        <tr>
          <td><b>${l.produit_nom}</b></td>
          <td class="right">${n(l.prix_vente).toLocaleString('fr-FR')}</td>
          <td class="right">${Number(l.stock_theorique).toLocaleString('fr-FR')} ${l.unite}</td>
          <td class="right">${l.stock_compte !== null ? Number(l.stock_compte).toLocaleString('fr-FR') + ' ' + l.unite : '—'}</td>
          <td class="right ${l.ecart! > 0 ? 'plus' : 'minus'}">${l.ecart! > 0 ? '+' : ''}${Number(l.ecart).toLocaleString('fr-FR')}</td>
          <td class="right">${(n(l.ecart) * n(l.prix_vente)).toLocaleString('fr-FR')}</td>
          <td class="just">${l.justification ?? '—'}</td>
        </tr>
      `).join('')}
    </table>
  ` : ''}
  </body></html>`
}
