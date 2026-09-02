import { useState, useRef } from 'react'
import { importerProduits, importerClients, exporterProduits, exporterVentes, exporterClients, importGetLog } from '@/lib/ipc'
import { useAuthStore } from '@/store/authStore'
import * as XLSX from 'xlsx'
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, Package, Users, ShoppingBag, History } from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => format(startOfMonth(new Date()), 'yyyy-MM-dd')
const lastOfMonth = () => format(endOfMonth(new Date()), 'yyyy-MM-dd')

type Tab = 'import' | 'export' | 'historique'

export default function ImportExport() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('import')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ importees: number; erreurs: string[] } | null>(null)
  const [exportDebut, setExportDebut] = useState(firstOfMonth())
  const [exportFin, setExportFin] = useState(lastOfMonth())
  const [log, setLog] = useState<any[]>([])
  const [logLoaded, setLogLoaded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const clientFileRef = useRef<HTMLInputElement>(null)

  const handleImportProduits = async (file: File) => {
    setImporting(true); setResult(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws)
      // Mapper les colonnes (flexible)
      const lignes = rows.map(r => ({
        nom: r['Nom'] || r['nom'] || r['PRODUIT'] || r['Produit'] || '',
        categorie_nom: r['Categorie'] || r['catégorie'] || r['Catégorie'] || r['categorie'] || undefined,
        prix_vente: Number(r['Prix vente'] || r['prix_vente'] || r['Prix'] || r['PrixVente'] || 0),
        prix_achat: r['Prix achat'] !== undefined ? Number(r['Prix achat'] || r['prix_achat'] || 0) : undefined,
        stock_actuel: r['Stock'] !== undefined ? Number(r['Stock'] || r['stock_actuel'] || 0) : undefined,
        stock_minimum: r['Stock min'] !== undefined ? Number(r['Stock min'] || r['stock_minimum'] || 0) : undefined,
        unite: r['Unité'] || r['Unite'] || r['unite'] || undefined,
        code_barre: r['Code barre'] || r['code_barre'] || r['Barcode'] || undefined,
      })).filter(l => l.nom)
      const res = await importerProduits(lignes, user?.id)
      setResult(res)
    } catch (e: any) {
      setResult({ importees: 0, erreurs: [e.message] })
    }
    setImporting(false)
  }

  const handleImportClients = async (file: File) => {
    setImporting(true); setResult(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws)
      const lignes = rows.map(r => ({
        nom: r['Nom'] || r['nom'] || r['CLIENT'] || '',
        telephone: r['Téléphone'] || r['Telephone'] || r['telephone'] || r['Tel'] || undefined,
        email: r['Email'] || r['email'] || undefined,
      })).filter(l => l.nom)
      const res = await importerClients(lignes, user?.id)
      setResult(res)
    } catch (e: any) {
      setResult({ importees: 0, erreurs: [e.message] })
    }
    setImporting(false)
  }

  const exportToXlsx = (data: any[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Export')
    XLSX.writeFile(wb, filename)
  }

  const handleExportProduits = async () => {
    const data = await exporterProduits()
    exportToXlsx(data, `produits_${today()}.xlsx`)
  }

  const handleExportVentes = async () => {
    const data = await exporterVentes(exportDebut, exportFin)
    exportToXlsx(data, `ventes_${exportDebut}_${exportFin}.xlsx`)
  }

  const handleExportClients = async () => {
    const data = await exporterClients()
    exportToXlsx(data, `clients_${today()}.xlsx`)
  }

  const loadLog = async () => {
    if (logLoaded) return
    const l = await importGetLog()
    setLog(l)
    setLogLoaded(true)
  }

  // Télécharger le template Excel
  const downloadTemplateProduits = () => {
    const data = [{ Nom: 'Poulet entier', Categorie: 'Volaille', 'Prix vente': 3500, 'Prix achat': 2500, Stock: 50, 'Stock min': 5, Unité: 'kg', 'Code barre': '' }]
    exportToXlsx(data, 'template_produits.xlsx')
  }
  const downloadTemplateClients = () => {
    const data = [{ Nom: 'Kouassi Jean', Téléphone: '0700000000', Email: 'jean@email.com' }]
    exportToXlsx(data, 'template_clients.xlsx')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center">
          <FileSpreadsheet size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">Import / Export</h1>
          <p className="text-gray-500 text-sm">Importez et exportez vos données (Excel / CSV)</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
        {(['import','export','historique'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'historique') loadLog() }}
            className={`px-5 py-2.5 text-sm font-semibold capitalize transition-all ${tab === t ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {t === 'import' ? '📥 Importer' : t === 'export' ? '📤 Exporter' : '🕓 Historique'}
          </button>
        ))}
      </div>

      {/* ─── IMPORT ─────────────────────────────────────────────────────────── */}
      {tab === 'import' && (
        <div className="space-y-4">
          {/* Résultat import */}
          {result && (
            <div className={`rounded-xl p-4 border ${result.erreurs.length === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                {result.erreurs.length === 0
                  ? <CheckCircle size={16} className="text-emerald-600" />
                  : <AlertCircle size={16} className="text-orange-600" />}
                <span className={`font-semibold text-sm ${result.erreurs.length === 0 ? 'text-emerald-700' : 'text-orange-700'}`}>
                  {result.importees} ligne(s) importée(s)
                  {result.erreurs.length > 0 ? ` · ${result.erreurs.length} erreur(s)` : ''}
                </span>
              </div>
              {result.erreurs.map((e, i) => (
                <p key={i} className="text-xs text-orange-600 ml-6">• {e}</p>
              ))}
            </div>
          )}

          {/* Import produits */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Package size={20} className="text-orange-500" />
                <div>
                  <h2 className="font-bold text-gray-800">Importer des produits</h2>
                  <p className="text-sm text-gray-500">Créer ou mettre à jour via Excel/CSV</p>
                </div>
              </div>
              <button onClick={downloadTemplateProduits}
                className="text-xs text-teal-600 hover:text-teal-700 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 flex items-center gap-1">
                <Download size={12} /> Template
              </button>
            </div>

            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-teal-400 hover:bg-teal-50 transition-all cursor-pointer"
              onClick={() => fileRef.current?.click()}>
              <Upload size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Cliquez pour sélectionner un fichier Excel (.xlsx) ou CSV</p>
              <p className="text-gray-400 text-xs mt-1">Colonnes : Nom, Categorie, Prix vente, Prix achat, Stock, Stock min, Unité, Code barre</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => e.target.files?.[0] && handleImportProduits(e.target.files[0])} />
            </div>

            {importing && (
              <div className="flex items-center gap-2 mt-3 text-teal-600 text-sm">
                <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                Import en cours...
              </div>
            )}
          </div>

          {/* Import clients */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Users size={20} className="text-blue-500" />
                <div>
                  <h2 className="font-bold text-gray-800">Importer des clients</h2>
                  <p className="text-sm text-gray-500">Créer de nouveaux clients depuis un fichier</p>
                </div>
              </div>
              <button onClick={downloadTemplateClients}
                className="text-xs text-teal-600 hover:text-teal-700 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 flex items-center gap-1">
                <Download size={12} /> Template
              </button>
            </div>

            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer"
              onClick={() => clientFileRef.current?.click()}>
              <Upload size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Cliquez pour sélectionner un fichier Excel (.xlsx) ou CSV</p>
              <p className="text-gray-400 text-xs mt-1">Colonnes : Nom, Téléphone, Email</p>
              <input ref={clientFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => e.target.files?.[0] && handleImportClients(e.target.files[0])} />
            </div>
          </div>
        </div>
      )}

      {/* ─── EXPORT ─────────────────────────────────────────────────────────── */}
      {tab === 'export' && (
        <div className="space-y-4">
          {/* Export Produits */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package size={20} className="text-orange-500" />
              <div>
                <h2 className="font-bold text-gray-800">Catalogue produits</h2>
                <p className="text-sm text-gray-500">Tous les produits actifs avec prix et stock</p>
              </div>
            </div>
            <button onClick={handleExportProduits}
              className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-teal-700 transition-all">
              <Download size={16} /> Télécharger .xlsx
            </button>
          </div>

          {/* Export Clients */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users size={20} className="text-blue-500" />
              <div>
                <h2 className="font-bold text-gray-800">Liste clients</h2>
                <p className="text-sm text-gray-500">Clients avec soldes, points fidélité et porte-monnaie</p>
              </div>
            </div>
            <button onClick={handleExportClients}
              className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-teal-700 transition-all">
              <Download size={16} /> Télécharger .xlsx
            </button>
          </div>

          {/* Export Ventes (avec filtre date) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <ShoppingBag size={20} className="text-emerald-500" />
              <div>
                <h2 className="font-bold text-gray-800">Historique des ventes</h2>
                <p className="text-sm text-gray-500">Toutes les ventes sur une période</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 font-medium">Du</label>
                <input type="date" value={exportDebut} onChange={e => setExportDebut(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 font-medium">au</label>
                <input type="date" value={exportFin} onChange={e => setExportFin(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
              </div>
              <button onClick={handleExportVentes}
                className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-teal-700 transition-all">
                <Download size={16} /> Télécharger .xlsx
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── HISTORIQUE ─────────────────────────────────────────────────────── */}
      {tab === 'historique' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center gap-2">
            <History size={16} className="text-gray-500" />
            <h2 className="font-bold text-gray-800">Historique des imports</h2>
          </div>
          {log.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Aucun import enregistré</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Date</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Type</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-600">Importées</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-600">Erreurs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {log.map((l: any) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-600">
                      {new Date(l.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-5 py-3">
                      <span className="capitalize font-medium text-gray-800">{l.type}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-emerald-700 font-semibold">{l.nb_lignes}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={l.nb_erreurs > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>{l.nb_erreurs}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
