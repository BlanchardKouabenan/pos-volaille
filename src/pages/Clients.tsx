import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getClients, createClient, updateClient, deleteClient, getClientVentes, formatCurrency, getParametres } from '@/lib/ipc'
import type { Client, Vente } from '@/types'
import { useProfilStore } from '@/store/profilStore'
import { Users, Plus, Search, X, Edit2, Trash2, History, Check, Phone, Mail, AlertTriangle, ExternalLink } from 'lucide-react'

const emptyForm = (): Partial<Client> => ({
  nom: '', telephone: '', email: '', forfait_mensuel: 0, date_expiration: ''
})

export default function Clients() {
  const navigate = useNavigate()
  const hasForfait = useProfilStore(s => s.aModule('forfaits_client'))
  const [clients, setClients] = useState<Client[]>([])
  const [ventes, setVentes] = useState<Vente[]>([])
  const [search, setSearch] = useState('')
  const [monnaie, setMonnaie] = useState('FCFA')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showHistModal, setShowHistModal] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const [cl, params] = await Promise.all([getClients(), getParametres()])
      setClients(cl)
      if (params?.monnaie) setMonnaie(params.monnaie)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = clients.filter(c =>
    c.nom.toLowerCase().includes(search.toLowerCase()) ||
    (c.telephone || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const isExpiringSoon = (client: Client) => {
    if (!client.date_expiration) return false
    const diff = new Date(client.date_expiration).getTime() - Date.now()
    return diff > 0 && diff < 7 * 24 * 3600 * 1000
  }

  const isExpired = (client: Client) => {
    if (!client.date_expiration) return false
    return new Date(client.date_expiration).getTime() < Date.now()
  }

  const openCreate = () => {
    setEditingClient(null)
    setForm(emptyForm())
    setError('')
    setShowModal(true)
  }

  const openEdit = (client: Client) => {
    setEditingClient(client)
    setForm({ ...client })
    setError('')
    setShowModal(true)
  }

  const openHist = async (client: Client) => {
    setSelectedClient(client)
    setShowHistModal(true)
    const v = await getClientVentes(client.id)
    setVentes(v)
  }

  const handleSave = async () => {
    if (!form.nom?.trim()) { setError('Le nom est requis'); return }
    setSaving(true)
    try {
      if (editingClient) {
        await updateClient(editingClient.id, form)
      } else {
        await createClient(form as any)
      }
      await load()
      setShowModal(false)
    } catch { setError('Erreur lors de la sauvegarde') }
    setSaving(false)
  }

  const handleDelete = async (client: Client) => {
    if (!confirm(`Supprimer le client "${client.nom}" ?`)) return
    await deleteClient(client.id)
    await load()
  }

  const fmt = (v: number) => formatCurrency(v, monnaie)
  const totalCA = (clientId: number) => ventes.filter(v => v.id === clientId).reduce((s, v) => s + v.total, 0)

  if (loading) return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-800">Clients ({clients.length})</h1>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 py-2 px-4">
            <Plus size={18} /> Nouveau client
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone ou email..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={16} /></button>}
        </div>
      </div>

      {/* Expiry alerts */}
      {clients.some(c => isExpiringSoon(c) || isExpired(c)) && (
        <div className="bg-amber-50 border-b border-amber-200 p-3 flex-shrink-0">
          <div className="flex items-center gap-2 text-amber-700 text-sm font-semibold mb-2">
            <AlertTriangle size={16} />
            Alertes abonnement :
          </div>
          <div className="flex flex-wrap gap-2">
            {clients.filter(c => isExpiringSoon(c) || isExpired(c)).map(c => (
              <span key={c.id} className={`text-xs px-2 py-1 rounded-lg font-medium border ${isExpired(c) ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                {c.nom} — {isExpired(c) ? 'Expiré' : 'Expire bientôt'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Client</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Contact</th>
              {hasForfait && <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Forfait</th>}
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ardoise</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Points</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Expiration</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(client => (
              <tr key={client.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold flex-shrink-0">
                      {client.nom.charAt(0).toUpperCase()}
                    </div>
                    <button onClick={() => navigate(`/clients/${client.id}`)} className="font-semibold text-gray-800 text-sm hover:text-blue-600 flex items-center gap-1 group">
                      {client.nom} <ExternalLink size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-0.5">
                    {client.telephone && <div className="flex items-center gap-1.5 text-sm text-gray-600"><Phone size={12} />{client.telephone}</div>}
                    {client.email && <div className="flex items-center gap-1.5 text-sm text-gray-500"><Mail size={12} />{client.email}</div>}
                  </div>
                </td>
                {hasForfait && (
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800">
                    {client.forfait_mensuel ? fmt(client.forfait_mensuel) + '/mois' : '—'}
                  </td>
                )}
                <td className="px-4 py-3 text-center">
                  {Number(client.solde_credit) > 0 ? (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">
                      {fmt(Number(client.solde_credit))}
                    </span>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {Number(client.points_fidelite) > 0 ? (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">
                      {Number(client.points_fidelite)} pts
                    </span>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-600">
                  {client.date_expiration ? new Date(client.date_expiration).toLocaleDateString('fr-FR') : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  {isExpired(client) ? (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">Expiré</span>
                  ) : isExpiringSoon(client) ? (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">Bientôt</span>
                  ) : (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-semibold">Actif</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => openHist(client)} className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors" title="Historique">
                      <History size={15} />
                    </button>
                    <button onClick={() => openEdit(client)} className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors" title="Modifier">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => handleDelete(client)} className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors" title="Supprimer">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users size={48} className="mb-3 opacity-30" />
            <p>Aucun client trouvé</p>
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="bg-blue-600 text-white p-5 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-bold text-lg">{editingClient ? 'Modifier le client' : 'Nouveau client'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-blue-700 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nom complet *</label>
                <input type="text" value={form.nom || ''} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Nom du client" className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Téléphone</label>
                <input type="tel" value={form.telephone || ''} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                  placeholder="+225 07 00 00 00 00" className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="client@email.com" className="input-field" />
              </div>
              {hasForfait ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Forfait mensuel</label>
                    <input type="number" value={form.forfait_mensuel || ''} onChange={e => setForm(f => ({ ...f, forfait_mensuel: Number(e.target.value) }))}
                      placeholder="0" min="0" className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Date expiration</label>
                    <input type="date" value={form.date_expiration || ''} onChange={e => setForm(f => ({ ...f, date_expiration: e.target.value }))}
                      className="input-field" />
                  </div>
                </div>
              ) : null}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 btn-ghost">Annuler</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary flex items-center justify-center gap-2">
                  {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={18} />}
                  {editingClient ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {showHistModal && selectedClient && (
        <div className="modal-overlay">
          <div className="modal-content max-w-lg">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800 text-lg">Historique — {selectedClient.nom}</h2>
                <p className="text-gray-500 text-sm">{ventes.length} vente(s)</p>
              </div>
              <button onClick={() => setShowHistModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {ventes.length === 0 ? (
                <p className="p-8 text-center text-gray-400">Aucune vente enregistrée</p>
              ) : (
                ventes.map(v => (
                  <div key={v.id} className="p-4 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800 text-sm">{v.numero_ticket}</div>
                      <div className="text-gray-400 text-xs">{new Date(v.date).toLocaleString('fr-FR')}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-800">{fmt(v.total)}</div>
                      <div className="text-xs text-gray-500 capitalize">{v.mode_paiement.replace('_', ' ')}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
