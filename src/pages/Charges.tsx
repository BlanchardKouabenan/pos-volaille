import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getCharges, createCharge, updateCharge, deleteCharge, getChargesStats, formatCurrency } from '@/lib/ipc'
import type { Charge } from '@/types'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import {
  Plus, Edit2, Trash2, X, Check, Calendar, Banknote,
  Tag, FileText, Printer, TrendingDown
} from 'lucide-react'

const today = () => format(new Date(), 'yyyy-MM-dd')

const CATEGORIES = ['Loyer', 'Électricité', 'Eau', 'Transport', 'Salaires', 'Fournitures', 'Marketing', 'Autre']

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces', wave: 'Wave', orange_money: 'Orange Money', mtn: 'MTN Money', carte: 'Carte bancaire'
}

const emptyForm = () => ({
  libelle: '',
  categorie: 'Autre',
  montant: '',
  mode_paiement: 'especes',
  date: today(),
  note: ''
})

export default function Charges() {
  const { user } = useAuthStore()
  const [charges, setCharges] = useState<Charge[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dateDebut, setDateDebut] = useState(today())
  const [dateFin, setDateFin] = useState(today())
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Charge | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = async (debut = dateDebut, fin = dateFin) => {
    setLoading(true)
    try {
      const [c, s] = await Promise.all([
        getCharges(debut, fin),
        getChargesStats(debut, fin)
      ])
      setCharges(c)
      setStats(s)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const fmt = (v: number) => formatCurrency(v)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (c: Charge) => {
    setEditing(c)
    setForm({
      libelle: c.libelle,
      categorie: c.categorie,
      montant: String(c.montant),
      mode_paiement: c.mode_paiement,
      date: c.date,
      note: c.note ?? ''
    })
    setFormError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.libelle.trim()) { setFormError('Le libellé est requis'); return }
    const montant = parseFloat(form.montant)
    if (!montant || montant <= 0) { setFormError('Le montant doit être supérieur à 0'); return }

    setSaving(true)
    setFormError('')
    try {
      if (editing) {
        await updateCharge(editing.id, { ...form, montant })
      } else {
        await createCharge({
          libelle: form.libelle,
          categorie: form.categorie,
          montant,
          mode_paiement: form.mode_paiement,
          user_id: user!.id,
          note: form.note || undefined,
          date: form.date
        })
      }
      await load()
      setShowModal(false)
    } catch { setFormError('Erreur lors de la sauvegarde') }
    setSaving(false)
  }

  const handleDelete = async (c: Charge) => {
    if (!confirm(`Supprimer la charge "${c.libelle}" (${fmt(c.montant)}) ?`)) return
    try {
      await deleteCharge(c.id)
      await load()
    } catch {}
  }

  const totalCharges = stats?.total?.total ?? 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Gestion des charges</h1>
            <p className="text-sm text-gray-500">Suivi des dépenses et charges d'exploitation</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm">
              <Printer size={16} /> Imprimer
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors">
              <Plus size={16} /> Nouvelle charge
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-2 items-center">
          {[
            { label: "Aujourd'hui", debut: today(), fin: today() },
            { label: 'Hier', debut: format(subDays(new Date(), 1), 'yyyy-MM-dd'), fin: format(subDays(new Date(), 1), 'yyyy-MM-dd') },
            { label: '7 jours', debut: format(subDays(new Date(), 6), 'yyyy-MM-dd'), fin: today() },
            { label: 'Ce mois', debut: format(startOfMonth(new Date()), 'yyyy-MM-dd'), fin: format(endOfMonth(new Date()), 'yyyy-MM-dd') },
          ].map(p => (
            <button key={p.label}
              onClick={() => { setDateDebut(p.debut); setDateFin(p.fin); load(p.debut, p.fin) }}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold">
              {p.label}
            </button>
          ))}
          <Calendar size={16} className="text-gray-400" />
          <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-400">au</span>
          <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => load()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold">
            {loading ? '...' : 'Filtrer'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-3 md:col-span-2">
            <div className="w-12 h-12 bg-red-600 text-white rounded-xl flex items-center justify-center flex-shrink-0">
              <TrendingDown size={22} />
            </div>
            <div>
              <div className="text-xs text-gray-500">Total charges période</div>
              <div className="text-2xl font-bold text-red-600">{fmt(totalCharges)}</div>
              <div className="text-xs text-gray-400">{stats?.total?.nb ?? 0} opération(s)</div>
            </div>
          </div>
          {stats?.parCategorie?.slice(0, 2).map((c: any) => (
            <div key={c.categorie} className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Tag size={14} className="text-gray-400" />
                <span className="text-xs text-gray-500 font-medium">{c.categorie}</span>
              </div>
              <div className="font-bold text-gray-800">{fmt(c.total)}</div>
              <div className="text-xs text-gray-400">{c.nb} opération(s)</div>
            </div>
          ))}
        </div>

        {/* Résumé par catégorie */}
        {stats?.parCategorie && stats.parCategorie.length > 0 && (
          <div className="bg-white rounded-2xl shadow-card p-5">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Tag size={18} className="text-blue-600" />
              Répartition par catégorie
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {stats.parCategorie.map((c: any) => {
                const pct = totalCharges > 0 ? (c.total / totalCharges) * 100 : 0
                return (
                  <div key={c.categorie} className="bg-gray-50 rounded-xl p-3">
                    <div className="font-semibold text-gray-700 text-sm mb-1">{c.categorie}</div>
                    <div className="font-bold text-red-600 mb-1">{fmt(c.total)}</div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full">
                      <div className="h-1.5 bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{pct.toFixed(0)}% du total</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tableau charges */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-800">Détail des charges</h2>
            <span className="text-sm text-gray-500">{charges.length} ligne(s)</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : charges.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Banknote size={48} className="mx-auto mb-3 opacity-20" />
              <p>Aucune charge sur la période</p>
              <button onClick={openCreate} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold">
                Ajouter une charge
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Libellé</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Catégorie</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Mode</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Montant</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {charges.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {new Date(c.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-800">{c.libelle}</div>
                        {c.note && <div className="text-xs text-gray-400 italic">{c.note}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full font-medium">
                          {c.categorie}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{MODE_LABELS[c.mode_paiement] || c.mode_paiement}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(c.montant)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(c)}
                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(c)}
                            className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 font-bold text-gray-700">TOTAL</td>
                    <td className="px-4 py-3 text-right font-bold text-red-700 text-base">{fmt(totalCharges)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal ajout/édition */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className={`${editing ? 'bg-blue-600' : 'bg-emerald-600'} text-white p-5 rounded-t-2xl flex items-center justify-between`}>
              <h2 className="font-bold text-lg">{editing ? 'Modifier la charge' : 'Nouvelle charge'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-black/10 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl text-sm">{formError}</div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Date *</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="input-field" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Libellé *</label>
                <input type="text" value={form.libelle}
                  onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))}
                  placeholder="Ex: Facture électricité juillet"
                  className="input-field" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Catégorie</label>
                  <select value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}
                    className="input-field">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Mode de paiement</label>
                  <select value={form.mode_paiement} onChange={e => setForm(f => ({ ...f, mode_paiement: e.target.value }))}
                    className="input-field">
                    {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Montant (FCFA) *</label>
                <input type="number" value={form.montant}
                  onChange={e => setForm(f => ({ ...f, montant: e.target.value }))}
                  placeholder="0"
                  min="0"
                  className="input-field text-lg font-bold"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Note <span className="text-gray-400 font-normal">(optionnel)</span>
                </label>
                <textarea value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2}
                  placeholder="Informations supplémentaires..."
                  className="input-field resize-none" />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 btn-ghost h-12">Annuler</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                  {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={18} />}
                  {editing ? 'Modifier' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
