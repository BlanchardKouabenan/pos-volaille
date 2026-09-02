import { useState, useEffect } from 'react'
import { boutiqueGetAll, boutiqueCreate, boutiqueUpdate, boutiqueDelete, boutiqueStatsConsolidees } from '@/lib/ipc'
import { Store, Plus, Edit2, Trash2, Check, X, TrendingUp, BarChart3 } from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { fr } from 'date-fns/locale'

const fmtN = (v: any) => Math.round(Number(v ?? 0)).toLocaleString('fr-FR')
const today = () => new Date().toISOString().slice(0, 10)

export default function Boutiques() {
  const [boutiques, setBoutiques] = useState<any[]>([])
  const [stats, setStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ nom: '', adresse: '', telephone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const now = new Date()
  const [debut] = useState(format(startOfMonth(now), 'yyyy-MM-dd'))
  const [fin] = useState(format(endOfMonth(now), 'yyyy-MM-dd'))

  const load = async () => {
    try {
      const [b, s] = await Promise.all([boutiqueGetAll(), boutiqueStatsConsolidees(debut, fin)])
      setBoutiques(b)
      setStats(s)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null); setForm({ nom: '', adresse: '', telephone: '' }); setError(''); setShowModal(true)
  }
  const openEdit = (b: any) => {
    setEditing(b); setForm({ nom: b.nom, adresse: b.adresse ?? '', telephone: b.telephone ?? '' }); setError(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.nom.trim()) { setError('Le nom est requis'); return }
    setSaving(true)
    try {
      if (editing) {
        await boutiqueUpdate(editing.id, form)
      } else {
        await boutiqueCreate(form)
      }
      setShowModal(false)
      await load()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  const handleDelete = async (b: any) => {
    if (!confirm(`Désactiver la boutique "${b.nom}" ?`)) return
    const res = await boutiqueDelete(b.id)
    if ((res as any)?.error) { alert((res as any).error); return }
    await load()
  }

  // Active boutique (stockée en localStorage)
  const [activeBoutique, setActiveBoutique] = useState<number>(() => {
    return Number(localStorage.getItem('pos_boutique_id') ?? '1')
  })

  const switchBoutique = (id: number) => {
    localStorage.setItem('pos_boutique_id', String(id))
    setActiveBoutique(id)
    window.location.reload()
  }

  const statsMap: Record<number, any> = {}
  for (const s of stats) statsMap[s.boutique_id] = s

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Store size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Gestion multi-boutiques</h1>
            <p className="text-gray-500 text-sm">Gérez vos succursales et consultez les stats consolidées</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all">
          <Plus size={16} /> Ajouter une boutique
        </button>
      </div>

      {/* Stats consolidées du mois */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-indigo-600" />
          Comparaison boutiques — {format(startOfMonth(now), 'MMMM yyyy', { locale: fr })}
        </h2>
        {loading ? (
          <div className="h-20 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {boutiques.filter(b => b.actif).map(b => {
              const s = statsMap[b.id] ?? {}
              const isActive = activeBoutique === b.id
              return (
                <div key={b.id}
                  className={`rounded-xl p-4 border-2 transition-all ${isActive ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-bold text-gray-800 truncate">{b.nom}</p>
                    {isActive && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">Active</span>}
                  </div>
                  <p className="text-2xl font-black text-indigo-700">{fmtN(s.ca ?? 0)} <span className="text-sm font-normal text-gray-400">FCFA</span></p>
                  <p className="text-sm text-gray-500">{fmtN(s.nb_ventes ?? 0)} ventes · panier moy. {fmtN(s.panier_moyen ?? 0)}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Liste boutiques */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-5 py-3 text-left font-semibold text-gray-600">Boutique</th>
              <th className="px-5 py-3 text-left font-semibold text-gray-600">Adresse</th>
              <th className="px-5 py-3 text-left font-semibold text-gray-600">Téléphone</th>
              <th className="px-5 py-3 text-left font-semibold text-gray-600">Statut</th>
              <th className="px-5 py-3 text-right font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {boutiques.map(b => {
              const isActive = activeBoutique === b.id
              return (
                <tr key={b.id} className={`hover:bg-gray-50 ${!b.actif ? 'opacity-40' : ''}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Store size={16} className="text-indigo-500 flex-shrink-0" />
                      <span className="font-semibold text-gray-800">{b.nom}</span>
                      {isActive && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">en cours</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-500">{b.adresse || '—'}</td>
                  <td className="px-5 py-4 text-gray-500">{b.telephone || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${b.actif ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {b.actif ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {!isActive && b.actif && (
                        <button onClick={() => switchBoutique(b.id)}
                          className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-200 font-medium flex items-center gap-1">
                          <TrendingUp size={12} /> Activer
                        </button>
                      )}
                      <button onClick={() => openEdit(b)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                        <Edit2 size={14} />
                      </button>
                      {boutiques.filter(x => x.actif).length > 1 && !isActive && (
                        <button onClick={() => handleDelete(b)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Note info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>Comment ça marche :</strong> Chaque vente est rattachée à la boutique active au moment de l'encaissement.
        Cliquez "Activer" pour changer de boutique (rechargement de l'app). Les rapports et analytics peuvent être filtrés par boutique.
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg">{editing ? 'Modifier la boutique' : 'Nouvelle boutique'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Nom *</label>
                <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Ex: Boutique Cocody"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Adresse</label>
                <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))}
                  placeholder="Quartier, ville..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Téléphone</label>
                <input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                  placeholder="+225 07 00 00 00 00"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                {editing ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
