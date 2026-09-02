import { useState, useEffect } from 'react'
import {
  TrendingUp, CreditCard, Star, FileText, Users, ChevronRight,
  Plus, Search, Check, X, RefreshCw, ArrowDownLeft, ArrowUpRight,
  Clock, AlertTriangle, Gift, BarChart2, Eye, Printer, ShoppingCart
} from 'lucide-react'
import {
  getClients, getParametres, formatCurrency,
  commercialGetClientsAvecCredit, commercialVendreACredit, commercialRembourserCredit,
  commercialGetHistoriqueArdoise,
  commercialGetFideliteRegle, commercialSetFideliteRegle, commercialGetHistoriqueFidelite,
  commercialGetAllDevis, commercialGetDevisById, commercialCreateDevis, commercialUpdateDevisStatut,
  commercialDeleteDevis, commercialTransformerDevis,
  commercialGetDashboard,
  getProduits
} from '@/lib/ipc'
import type { Client, Devis, DevisLigne, FideliteRegle, Ardoise, FideliteTransaction } from '@/types'
import { useAuthStore } from '@/store/authStore'

type Tab = 'dashboard' | 'ardoise' | 'fidelite' | 'devis'

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

const STATUT_DEVIS: Record<string, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: 'bg-gray-100 text-gray-600' },
  envoye:    { label: 'Envoyé',    color: 'bg-blue-100 text-blue-700' },
  accepte:   { label: 'Accepté',  color: 'bg-emerald-100 text-emerald-700' },
  refuse:    { label: 'Refusé',   color: 'bg-red-100 text-red-600' },
  converti:  { label: 'Converti', color: 'bg-purple-100 text-purple-700' },
}

export default function Commercial() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [monnaie, setMonnaie] = useState('FCFA')

  useEffect(() => {
    getParametres().then(p => { if (p?.monnaie) setMonnaie(p.monnaie) })
  }, [])

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-3">
        <TrendingUp size={22} className="text-indigo-600" />
        <h1 className="text-xl font-bold text-gray-800">Volet Commercial</h1>
        <div className="flex-1" />
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([
            ['dashboard', BarChart2, 'Dashboard'],
            ['ardoise', CreditCard, 'Ardoise / Crédit'],
            ['fidelite', Star, 'Fidélité'],
            ['devis', FileText, 'Devis'],
          ] as [Tab, any, string][]).map(([t, Icon, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === 'dashboard' && <DashboardTab monnaie={monnaie} />}
        {tab === 'ardoise' && <ArdoiseTab monnaie={monnaie} userId={user?.id} />}
        {tab === 'fidelite' && <FideliteTab monnaie={monnaie} />}
        {tab === 'devis' && <DevisTab monnaie={monnaie} userId={user?.id} />}
      </div>
    </div>
  )
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function DashboardTab({ monnaie }: { monnaie: string }) {
  const [dateDebut, setDateDebut] = useState(firstOfMonth())
  const [dateFin, setDateFin] = useState(today())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const d = await commercialGetDashboard(dateDebut, dateFin)
    setData(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Chargement…</div>
  if (!data) return null

  const { topClients, impayesTotal, caParMode, evolutionCA, devisStats, fideliteStats } = data
  const caTotal = evolutionCA.reduce((s: number, j: any) => s + Number(j.ca), 0)
  const nbVentes = evolutionCA.reduce((s: number, j: any) => s + Number(j.nb), 0)
  const panierMoyen = nbVentes > 0 ? caTotal / nbVentes : 0

  return (
    <div className="space-y-6">
      {/* Filtres date */}
      <div className="flex gap-3 items-center">
        <label className="text-sm text-gray-600">Du</label>
        <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm" />
        <label className="text-sm text-gray-600">au</label>
        <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm" />
        <button onClick={load}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'CA Période', value: formatCurrency(caTotal, monnaie), icon: TrendingUp, color: 'indigo' },
          { label: 'Panier moyen', value: formatCurrency(Math.round(panierMoyen), monnaie), icon: ShoppingCart, color: 'blue' },
          { label: 'Impayés total', value: formatCurrency(impayesTotal, monnaie), icon: AlertTriangle, color: 'red' },
          { label: 'Pipeline devis', value: formatCurrency(Number(devisStats?.montant_pipeline ?? 0), monnaie), icon: FileText, color: 'purple' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border">
            <div className={`inline-flex p-2 rounded-xl mb-3 bg-${color}-50`}>
              <Icon size={20} className={`text-${color}-600`} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top clients */}
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Users size={16} className="text-indigo-600" /> Top 10 clients
          </h3>
          <div className="space-y-2">
            {topClients.slice(0, 10).map((c: any, i: number) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : 'bg-orange-50 text-orange-600'
                }`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{c.nom}</p>
                  <p className="text-xs text-gray-400">{c.nb_achats} achat{Number(c.nb_achats) > 1 ? 's' : ''}</p>
                </div>
                <span className="text-sm font-bold text-indigo-700">{formatCurrency(Number(c.ca_total), monnaie)}</span>
                {Number(c.solde_credit) > 0 && (
                  <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                    Doit {formatCurrency(Number(c.solde_credit), monnaie)}
                  </span>
                )}
              </div>
            ))}
            {topClients.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Aucun client sur la période</p>}
          </div>
        </div>

        {/* Devis stats */}
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <FileText size={16} className="text-purple-600" /> Pipeline Devis
          </h3>
          {devisStats && (
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Total', devisStats.total, 'gray'],
                ['Brouillons', devisStats.brouillons, 'gray'],
                ['Envoyés', devisStats.envoyes, 'blue'],
                ['Acceptés', devisStats.acceptes, 'emerald'],
                ['Convertis', devisStats.convertis, 'purple'],
              ].map(([label, val, color]) => (
                <div key={label as string} className={`bg-${color}-50 rounded-xl p-3`}>
                  <p className={`text-2xl font-bold text-${color}-700`}>{Number(val)}</p>
                  <p className="text-xs text-gray-500">{label as string}</p>
                </div>
              ))}
              <div className="bg-indigo-50 rounded-xl p-3">
                <p className="text-lg font-bold text-indigo-700">{formatCurrency(Number(devisStats.montant_pipeline), monnaie)}</p>
                <p className="text-xs text-gray-500">Valeur pipeline</p>
              </div>
            </div>
          )}

          <h3 className="font-semibold text-gray-700 mb-3 mt-5 flex items-center gap-2">
            <Star size={16} className="text-amber-500" /> Fidélité période
          </h3>
          {fideliteStats && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-xl font-bold text-amber-700">{Number(fideliteStats.clients_actifs)}</p>
                <p className="text-xs text-gray-500">Clients actifs</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xl font-bold text-green-700">{Number(fideliteStats.points_distribues)}</p>
                <p className="text-xs text-gray-500">Pts gagnés</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-3">
                <p className="text-xl font-bold text-purple-700">{Number(fideliteStats.points_utilises)}</p>
                <p className="text-xs text-gray-500">Pts utilisés</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CA par mode de paiement */}
      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Répartition par mode de paiement</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {caParMode.map((m: any) => (
            <div key={m.mode_paiement} className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-gray-800">{formatCurrency(Number(m.total), monnaie)}</p>
              <p className="text-xs text-gray-500 capitalize mt-0.5">{m.mode_paiement.replace('_', ' ')}</p>
              <p className="text-xs text-gray-400">{m.nb} vente{Number(m.nb) > 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── ARDOISE / CRÉDIT ─────────────────────────────────────────────────────────

function ArdoiseTab({ monnaie, userId }: { monnaie: string; userId?: number }) {
  const [clients, setClients] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [historique, setHistorique] = useState<Ardoise[]>([])
  const [search, setSearch] = useState('')
  const [showCredit, setShowCredit] = useState(false)
  const [showRembours, setShowRembours] = useState(false)
  const [montant, setMontant] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const cl = await commercialGetClientsAvecCredit()
    setClients(cl)
  }

  useEffect(() => { load() }, [])

  const selectClient = async (c: any) => {
    setSelected(c)
    const hist = await commercialGetHistoriqueArdoise(c.id, 30)
    setHistorique(hist)
  }

  const handleCredit = async () => {
    if (!selected || !montant || isNaN(Number(montant))) return
    setSaving(true); setError('')
    const r = await commercialVendreACredit({
      client_id: selected.id,
      montant: Number(montant),
      note: note || undefined,
      user_id: userId
    })
    if (r.success) {
      setShowCredit(false); setMontant(''); setNote('')
      await load()
      selectClient({ ...selected, solde_credit: r.solde })
    } else setError(r.error)
    setSaving(false)
  }

  const handleRembours = async () => {
    if (!selected || !montant || isNaN(Number(montant))) return
    setSaving(true); setError('')
    const r = await commercialRembourserCredit({
      client_id: selected.id,
      montant: Number(montant),
      note: note || undefined,
      user_id: userId
    })
    if (r.success) {
      setShowRembours(false); setMontant(''); setNote('')
      await load()
      selectClient({ ...selected, solde_credit: r.solde })
    } else setError(r.error)
    setSaving(false)
  }

  const filtered = clients.filter(c =>
    c.nom.toLowerCase().includes(search.toLowerCase()) ||
    (c.telephone || '').includes(search)
  )

  return (
    <div className="grid grid-cols-3 gap-6 h-full">
      {/* Liste clients */}
      <div className="col-span-1 bg-white rounded-2xl shadow-sm border flex flex-col">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-700 mb-3">Clients</h3>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => selectClient(c)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                selected?.id === c.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-800">{c.nom}</p>
                {Number(c.solde_credit) > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                    {formatCurrency(Number(c.solde_credit), monnaie)}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{c.telephone || '—'}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              {search ? 'Aucun résultat' : 'Tous les clients sont à jour'}
            </p>
          )}
        </div>
      </div>

      {/* Détail client */}
      <div className="col-span-2 bg-white rounded-2xl shadow-sm border flex flex-col">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <CreditCard size={48} className="mb-3 opacity-30" />
            <p>Sélectionnez un client</p>
          </div>
        ) : (
          <>
            <div className="p-5 border-b">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{selected.nom}</h2>
                  <p className="text-sm text-gray-500">{selected.telephone}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowCredit(true); setMontant(''); setNote(''); setError('') }}
                    className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-red-700"
                  >
                    <ArrowUpRight size={15} /> Créer ardoise
                  </button>
                  {Number(selected.solde_credit) > 0 && (
                    <button
                      onClick={() => { setShowRembours(true); setMontant(''); setNote(''); setError('') }}
                      className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-emerald-700"
                    >
                      <ArrowDownLeft size={15} /> Encaisser
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Solde dû</p>
                  <p className="text-2xl font-bold text-red-700">{formatCurrency(Number(selected.solde_credit ?? 0), monnaie)}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Points fidélité</p>
                  <p className="text-2xl font-bold text-amber-700">{Number(selected.points_fidelite ?? 0)} pts</p>
                </div>
              </div>
            </div>

            {/* Historique */}
            <div className="flex-1 overflow-auto p-5">
              <h4 className="font-semibold text-gray-700 mb-3">Historique des opérations</h4>
              <div className="space-y-2">
                {historique.map(h => (
                  <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className={`p-2 rounded-lg ${h.type === 'credit' ? 'bg-red-100' : 'bg-emerald-100'}`}>
                      {h.type === 'credit'
                        ? <ArrowUpRight size={16} className="text-red-600" />
                        : <ArrowDownLeft size={16} className="text-emerald-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {h.type === 'credit' ? 'Vente à crédit' : 'Remboursement'}
                        {h.numero_ticket && <span className="text-gray-400 ml-2">#{h.numero_ticket}</span>}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(h.date).toLocaleDateString('fr-FR')} — {h.user_nom ?? ''}
                        {h.note && ` — ${h.note}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${h.type === 'credit' ? 'text-red-600' : 'text-emerald-600'}`}>
                        {h.type === 'credit' ? '+' : '-'}{formatCurrency(Number(h.montant), monnaie)}
                      </p>
                      <p className="text-xs text-gray-400">Solde: {formatCurrency(Number(h.solde_apres), monnaie)}</p>
                    </div>
                  </div>
                ))}
                {historique.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Aucune opération</p>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal Crédit */}
      {showCredit && (
        <Modal title="Créer une ardoise" onClose={() => setShowCredit(false)}>
          <p className="text-sm text-gray-600 mb-4">Client: <strong>{selected?.nom}</strong></p>
          <label className="block text-sm text-gray-600 mb-1">Montant dû ({monnaie})</label>
          <input type="number" value={montant} onChange={e => setMontant(e.target.value)}
            placeholder="Ex: 5000" className="w-full border rounded-xl px-4 py-2 text-sm mb-3" />
          <label className="block text-sm text-gray-600 mb-1">Note (optionnel)</label>
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="Ex: Achat du marché lundi" className="w-full border rounded-xl px-4 py-2 text-sm mb-4" />
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <button onClick={handleCredit} disabled={saving}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Créer l\'ardoise'}
          </button>
        </Modal>
      )}

      {/* Modal Remboursement */}
      {showRembours && (
        <Modal title="Enregistrer un paiement" onClose={() => setShowRembours(false)}>
          <p className="text-sm text-gray-600 mb-1">Client: <strong>{selected?.nom}</strong></p>
          <p className="text-sm text-red-600 mb-4">Solde actuel: <strong>{formatCurrency(Number(selected?.solde_credit ?? 0), monnaie)}</strong></p>
          <label className="block text-sm text-gray-600 mb-1">Montant encaissé ({monnaie})</label>
          <input type="number" value={montant} onChange={e => setMontant(e.target.value)}
            placeholder="Ex: 5000" className="w-full border rounded-xl px-4 py-2 text-sm mb-3" />
          <label className="block text-sm text-gray-600 mb-1">Note (optionnel)</label>
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="Ex: Paiement espèces" className="w-full border rounded-xl px-4 py-2 text-sm mb-4" />
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <button onClick={handleRembours} disabled={saving}
            className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Confirmer le paiement'}
          </button>
        </Modal>
      )}
    </div>
  )
}

// ─── FIDÉLITÉ ─────────────────────────────────────────────────────────────────

function FideliteTab({ monnaie }: { monnaie: string }) {
  const [regle, setRegle] = useState<FideliteRegle | null>(null)
  const [editRegle, setEditRegle] = useState(false)
  const [form, setForm] = useState({ points_par_fcfa: 1, valeur_point_fcfa: 1, seuil_utilisation: 100 })
  const [clients, setClients] = useState<any[]>([])
  const [selectedClient, setSelectedClient] = useState<any | null>(null)
  const [historique, setHistorique] = useState<FideliteTransaction[]>([])
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    const r = await commercialGetFideliteRegle()
    setRegle(r)
    if (r) setForm({ points_par_fcfa: r.points_par_fcfa, valeur_point_fcfa: r.valeur_point_fcfa, seuil_utilisation: r.seuil_utilisation })
    const cl = await commercialGetClientsAvecCredit()
    setClients(cl)
  }

  useEffect(() => { load() }, [])

  const saveRegle = async () => {
    setSaving(true)
    await commercialSetFideliteRegle(form)
    await load()
    setEditRegle(false)
    setSaving(false)
  }

  const selectClient = async (c: any) => {
    setSelectedClient(c)
    const hist = await commercialGetHistoriqueFidelite(c.id, 30)
    setHistorique(hist)
  }

  const filtered = clients.filter(c =>
    c.nom.toLowerCase().includes(search.toLowerCase()) ||
    (c.telephone || '').includes(search)
  )

  return (
    <div className="space-y-6">
      {/* Configuration règle fidélité */}
      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2">
            <Star size={16} className="text-amber-500" /> Programme de fidélité
          </h3>
          <button onClick={() => setEditRegle(!editRegle)}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            {editRegle ? 'Annuler' : 'Configurer'}
          </button>
        </div>

        {!editRegle ? (
          regle ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-amber-700">{regle.points_par_fcfa} pt</p>
                <p className="text-xs text-gray-500">par 100 FCFA d'achat</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-700">{formatCurrency(regle.valeur_point_fcfa, monnaie)}</p>
                <p className="text-xs text-gray-500">valeur / point</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-700">{regle.seuil_utilisation} pts</p>
                <p className="text-xs text-gray-500">seuil d'utilisation</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">
              Aucun programme configuré. Cliquez "Configurer" pour en créer un.
            </p>
          )
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Points par 100 FCFA</label>
              <input type="number" step="0.1" value={form.points_par_fcfa}
                onChange={e => setForm(f => ({ ...f, points_par_fcfa: Number(e.target.value) }))}
                className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Valeur 1 point ({monnaie})</label>
              <input type="number" step="0.5" value={form.valeur_point_fcfa}
                onChange={e => setForm(f => ({ ...f, valeur_point_fcfa: Number(e.target.value) }))}
                className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Seuil min. (pts)</label>
              <input type="number" value={form.seuil_utilisation}
                onChange={e => setForm(f => ({ ...f, seuil_utilisation: Number(e.target.value) }))}
                className="w-full border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="col-span-3">
              <button onClick={saveRegle} disabled={saving}
                className="bg-amber-500 text-white px-6 py-2 rounded-xl text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
                {saving ? 'Enregistrement…' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clients + historique */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 bg-white rounded-2xl shadow-sm border flex flex-col max-h-96">
          <div className="p-4 border-b">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un client…"
                className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm" />
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {filtered.map(c => (
              <button key={c.id} onClick={() => selectClient(c)}
                className={`w-full text-left px-3 py-2 rounded-xl transition-all ${selectedClient?.id === c.id ? 'bg-amber-50 border border-amber-200' : 'hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">{c.nom}</p>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                    {Number(c.points_fidelite ?? 0)} pts
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2 bg-white rounded-2xl shadow-sm border flex flex-col max-h-96">
          {!selectedClient ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <Gift size={40} className="mx-auto mb-2 opacity-30" />
                <p>Sélectionnez un client</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-gray-800">{selectedClient.nom}</h4>
                  <p className="text-sm text-amber-600 font-bold">{Number(selectedClient.points_fidelite ?? 0)} points</p>
                </div>
                {regle && (
                  <p className="text-sm text-gray-500">
                    ≈ {formatCurrency(Number(selectedClient.points_fidelite ?? 0) * regle.valeur_point_fcfa, monnaie)}
                  </p>
                )}
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-2">
                {historique.map(h => (
                  <div key={h.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                    <div className={`p-1.5 rounded-lg ${h.type === 'gain' ? 'bg-amber-100' : 'bg-purple-100'}`}>
                      {h.type === 'gain' ? <Star size={14} className="text-amber-600" /> : <Gift size={14} className="text-purple-600" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-gray-700">
                        {h.type === 'gain' ? 'Points gagnés' : 'Points utilisés'}
                        {h.numero_ticket && ` — #${h.numero_ticket}`}
                      </p>
                      <p className="text-xs text-gray-400">{new Date(h.date).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <p className={`text-sm font-bold ${h.type === 'gain' ? 'text-amber-600' : 'text-purple-600'}`}>
                      {h.type === 'gain' ? '+' : ''}{h.points} pts
                    </p>
                  </div>
                ))}
                {historique.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Aucune transaction</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── DEVIS ────────────────────────────────────────────────────────────────────

function DevisTab({ monnaie, userId }: { monnaie: string; userId?: number }) {
  const [devis, setDevis] = useState<Devis[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [produits, setProduits] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<Devis | null>(null)
  const [showConvertir, setShowConvertir] = useState<Devis | null>(null)
  const [filterStatut, setFilterStatut] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const [dv, cl, pr] = await Promise.all([
      commercialGetAllDevis(filterStatut || undefined),
      getClients(),
      getProduits()
    ])
    setDevis(dv)
    setClients(cl)
    setProduits(pr)
  }

  useEffect(() => { load() }, [filterStatut])

  const handleDelete = async (d: Devis) => {
    if (!confirm(`Supprimer le devis ${d.numero} ?`)) return
    await commercialDeleteDevis(d.id)
    load()
  }

  const handleStatut = async (d: Devis, statut: string) => {
    await commercialUpdateDevisStatut(d.id, statut)
    if (showDetail) {
      const fresh = await commercialGetDevisById(d.id)
      setShowDetail(fresh)
    }
    load()
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3 items-center">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {['', 'brouillon', 'envoye', 'accepte', 'converti'].map(s => (
            <button key={s} onClick={() => setFilterStatut(s)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${filterStatut === s ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>
              {s === '' ? 'Tous' : STATUT_DEVIS[s].label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-indigo-700">
          <Plus size={15} /> Nouveau devis
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Numéro</th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Validité</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-center">Statut</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {devis.map(d => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-semibold text-indigo-700">{d.numero}</td>
                <td className="px-4 py-3 text-gray-800">
                  {d.client_nom_join || d.client_nom || <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-500">{d.date}</td>
                <td className="px-4 py-3 text-gray-500">
                  {d.date_validite ? (
                    <span className={new Date(d.date_validite) < new Date() ? 'text-red-500' : ''}>{d.date_validite}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-800">{formatCurrency(Number(d.total), monnaie)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUT_DEVIS[d.statut]?.color}`}>
                    {STATUT_DEVIS[d.statut]?.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => commercialGetDevisById(d.id).then(setShowDetail)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50">
                      <Eye size={15} />
                    </button>
                    {d.statut !== 'converti' && (
                      <>
                        <button onClick={() => printDevisPdf(d, monnaie)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
                          <Printer size={15} />
                        </button>
                        {d.statut === 'accepte' && (
                          <button onClick={() => setShowConvertir(d)}
                            className="p-1.5 text-gray-400 hover:text-purple-600 rounded-lg hover:bg-purple-50"
                            title="Convertir en vente">
                            <ShoppingCart size={15} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(d)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                          <X size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {devis.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucun devis</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Création */}
      {showCreate && (
        <CreateDevisModal
          clients={clients}
          produits={produits}
          monnaie={monnaie}
          userId={userId}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}

      {/* Modal Détail */}
      {showDetail && (
        <Modal title={`Devis ${showDetail.numero}`} onClose={() => setShowDetail(null)} wide>
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm">Client: <strong className="text-gray-800">{showDetail.client_nom_join || showDetail.client_nom || 'Non spécifié'}</strong></p>
                <p className="text-gray-500 text-sm">Date: {showDetail.date}</p>
                {showDetail.date_validite && <p className="text-gray-500 text-sm">Valide jusqu'au: {showDetail.date_validite}</p>}
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                {showDetail.statut === 'brouillon' && (
                  <button onClick={() => handleStatut(showDetail, 'envoye')} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg">Marquer Envoyé</button>
                )}
                {showDetail.statut === 'envoye' && (
                  <>
                    <button onClick={() => handleStatut(showDetail, 'accepte')} className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg">Accepté</button>
                    <button onClick={() => handleStatut(showDetail, 'refuse')} className="text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg">Refusé</button>
                  </>
                )}
                {showDetail.statut === 'accepte' && (
                  <button onClick={() => { setShowConvertir(showDetail); setShowDetail(null) }}
                    className="text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg">Convertir en vente</button>
                )}
                <button onClick={() => printDevisPdf(showDetail, monnaie)} className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg flex items-center gap-1"><Printer size={12} /> PDF</button>
              </div>
            </div>

            <table className="w-full text-sm border-t">
              <thead className="text-xs text-gray-500 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Désignation</th>
                  <th className="px-3 py-2 text-center">Qté</th>
                  <th className="px-3 py-2 text-center">Unité</th>
                  <th className="px-3 py-2 text-right">P.U.</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {showDetail.lignes?.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{l.designation}</td>
                    <td className="px-3 py-2 text-center">{l.quantite}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{l.unite}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(Number(l.prix_unitaire), monnaie)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(Number(l.total_ligne), monnaie)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right font-bold">Total</td>
                  <td className="px-3 py-2 text-right font-bold text-indigo-700 text-base">{formatCurrency(Number(showDetail.total), monnaie)}</td>
                </tr>
              </tfoot>
            </table>

            {showDetail.notes && (
              <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">{showDetail.notes}</div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal Convertir */}
      {showConvertir && (
        <ConvertirDevisModal
          devis={showConvertir}
          monnaie={monnaie}
          userId={userId}
          onClose={() => setShowConvertir(null)}
          onConverted={() => { setShowConvertir(null); load() }}
        />
      )}
    </div>
  )
}

// ─── CREATE DEVIS MODAL ───────────────────────────────────────────────────────

function CreateDevisModal({
  clients, produits, monnaie, userId, onClose, onSaved
}: {
  clients: Client[]
  produits: any[]
  monnaie: string
  userId?: number
  onClose: () => void
  onSaved: () => void
}) {
  const [clientId, setClientId] = useState<number | ''>('')
  const [clientNom, setClientNom] = useState('')
  const [clientTel, setClientTel] = useState('')
  const [dateValidite, setDateValidite] = useState('')
  const [notes, setNotes] = useState('')
  const [lignes, setLignes] = useState<Partial<DevisLigne>[]>([
    { designation: '', unite: 'pièce', quantite: 1, prix_unitaire: 0 }
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateLigne = (i: number, field: keyof DevisLigne, val: any) => {
    setLignes(ls => ls.map((l, idx) => idx === i ? { ...l, [field]: val } : l))
  }

  const addProduit = (i: number, prodId: number) => {
    const prod = produits.find(p => p.id === prodId)
    if (!prod) return
    updateLigne(i, 'produit_id', prod.id)
    updateLigne(i, 'designation', prod.nom)
    updateLigne(i, 'unite', prod.unite)
    updateLigne(i, 'prix_unitaire', prod.prix_vente)
  }

  const total = lignes.reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0), 0)

  const handleSave = async () => {
    if (lignes.some(l => !l.designation)) { setError('Toutes les lignes doivent avoir une désignation'); return }
    setSaving(true); setError('')
    const r = await commercialCreateDevis({
      client_id: clientId || undefined,
      client_nom: clientNom || undefined,
      client_telephone: clientTel || undefined,
      date_validite: dateValidite || undefined,
      notes: notes || undefined,
      user_id: userId,
      lignes: lignes.map(l => ({
        produit_id: l.produit_id,
        designation: l.designation!,
        unite: l.unite || 'pièce',
        quantite: Number(l.quantite) || 1,
        prix_unitaire: Number(l.prix_unitaire) || 0
      }))
    })
    if (r.devisId) onSaved()
    else setError('Erreur lors de la création')
    setSaving(false)
  }

  return (
    <Modal title="Nouveau devis" onClose={onClose} wide>
      <div className="space-y-4">
        {/* Client */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Client (base)</label>
            <select value={clientId} onChange={e => {
              setClientId(e.target.value ? Number(e.target.value) : '')
              const cl = clients.find(c => c.id === Number(e.target.value))
              if (cl) { setClientNom(cl.nom); setClientTel(cl.telephone || '') }
            }} className="w-full border rounded-xl px-3 py-2 text-sm">
              <option value="">— Client occasionnel —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Nom client (libre)</label>
            <input value={clientNom} onChange={e => setClientNom(e.target.value)}
              placeholder="Nom du client" className="w-full border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Téléphone</label>
            <input value={clientTel} onChange={e => setClientTel(e.target.value)}
              placeholder="07 XX XX XX XX" className="w-full border rounded-xl px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Valable jusqu'au</label>
            <input type="date" value={dateValidite} onChange={e => setDateValidite(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Lignes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Articles</label>
            <button onClick={() => setLignes(ls => [...ls, { designation: '', unite: 'pièce', quantite: 1, prix_unitaire: 0 }])}
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
              <Plus size={13} /> Ajouter une ligne
            </button>
          </div>
          <div className="space-y-2">
            {lignes.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-1">
                  <select onChange={e => addProduit(i, Number(e.target.value))}
                    className="w-full border rounded-lg px-1 py-2 text-xs" defaultValue="">
                    <option value="">🔍</option>
                    {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                </div>
                <div className="col-span-4">
                  <input value={l.designation || ''} onChange={e => updateLigne(i, 'designation', e.target.value)}
                    placeholder="Désignation" className="w-full border rounded-lg px-2 py-2 text-xs" />
                </div>
                <div className="col-span-2">
                  <input type="number" value={l.quantite || 1} onChange={e => updateLigne(i, 'quantite', e.target.value)}
                    className="w-full border rounded-lg px-2 py-2 text-xs" min={0.1} step={0.1} />
                </div>
                <div className="col-span-2">
                  <input value={l.unite || 'pièce'} onChange={e => updateLigne(i, 'unite', e.target.value)}
                    placeholder="unité" className="w-full border rounded-lg px-2 py-2 text-xs" />
                </div>
                <div className="col-span-2">
                  <input type="number" value={l.prix_unitaire || 0} onChange={e => updateLigne(i, 'prix_unitaire', e.target.value)}
                    placeholder="P.U." className="w-full border rounded-lg px-2 py-2 text-xs" min={0} />
                </div>
                <div className="col-span-1 flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium">
                    {formatCurrency((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0), monnaie)}
                  </span>
                  {lignes.length > 1 && (
                    <button onClick={() => setLignes(ls => ls.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 ml-1">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            rows={2} placeholder="Conditions, délai de livraison…"
            className="w-full border rounded-xl px-3 py-2 text-sm resize-none" />
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-lg font-bold text-indigo-700">Total: {formatCurrency(total, monnaie)}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Création…' : 'Créer le devis'}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}

// ─── CONVERTIR DEVIS ──────────────────────────────────────────────────────────

function ConvertirDevisModal({
  devis, monnaie, userId, onClose, onConverted
}: {
  devis: Devis; monnaie: string; userId?: number
  onClose: () => void; onConverted: () => void
}) {
  const [mode, setMode] = useState('especes')
  const [montantPaye, setMontantPaye] = useState(String(devis.total))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleConvertir = async () => {
    if (!userId) { setError('Utilisateur non connecté'); return }
    setSaving(true); setError('')
    const r = await commercialTransformerDevis(devis.id, userId, mode, Number(montantPaye))
    if (r.success) onConverted()
    else setError(r.error)
    setSaving(false)
  }

  return (
    <Modal title="Convertir en vente" onClose={onClose}>
      <p className="text-sm text-gray-600 mb-4">Devis <strong>{devis.numero}</strong> — {formatCurrency(Number(devis.total), monnaie)}</p>
      <label className="text-xs text-gray-500 block mb-1">Mode de paiement</label>
      <select value={mode} onChange={e => setMode(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm mb-3">
        <option value="especes">Espèces</option>
        <option value="wave">Wave</option>
        <option value="orange_money">Orange Money</option>
        <option value="mtn">MTN Money</option>
        <option value="carte">Carte</option>
      </select>
      <label className="text-xs text-gray-500 block mb-1">Montant payé ({monnaie})</label>
      <input type="number" value={montantPaye} onChange={e => setMontantPaye(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm mb-4" />
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 border rounded-xl py-2.5 text-sm text-gray-600">Annuler</button>
        <button onClick={handleConvertir} disabled={saving}
          className="flex-1 bg-purple-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
          {saving ? 'Conversion…' : 'Convertir & Encaisser'}
        </button>
      </div>
    </Modal>
  )
}

// ─── SHARED MODAL ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-2xl p-6 w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] overflow-auto`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── PDF DEVIS ────────────────────────────────────────────────────────────────

async function printDevisPdf(devis: Devis, monnaie: string) {
  const lignes = devis.lignes || []
  const html = `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Devis ${devis.numero}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #333; margin: 40px; }
      h1 { font-size: 20px; color: #4f46e5; }
      .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
      .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: bold;
        background: ${devis.statut === 'accepte' ? '#d1fae5' : '#e0e7ff'}; color: #333; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th { background: #f3f4f6; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
      td { padding: 8px; border-bottom: 1px solid #f3f4f6; }
      tfoot td { font-weight: bold; border-top: 2px solid #e5e7eb; }
      .total-row { font-size: 14px; color: #4f46e5; }
      .note { background: #f9fafb; padding: 12px; border-radius: 8px; margin-top: 20px; font-size: 11px; }
    </style></head><body>
    <div class="header">
      <div><h1>DEVIS</h1><p>${devis.numero} — ${devis.date}</p></div>
      <div class="badge">${STATUT_DEVIS[devis.statut]?.label}</div>
    </div>
    <p><strong>Client:</strong> ${devis.client_nom_join || devis.client_nom || 'Non spécifié'}</p>
    ${devis.client_telephone ? `<p><strong>Tél:</strong> ${devis.client_telephone}</p>` : ''}
    ${devis.date_validite ? `<p><strong>Valable jusqu'au:</strong> ${devis.date_validite}</p>` : ''}
    <table>
      <thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th>P.U.</th><th>Total</th></tr></thead>
      <tbody>
        ${lignes.map(l => `<tr>
          <td>${l.designation}</td>
          <td>${l.quantite}</td>
          <td>${l.unite}</td>
          <td>${Number(l.prix_unitaire).toLocaleString('fr-FR')} ${monnaie}</td>
          <td>${Number(l.total_ligne).toLocaleString('fr-FR')} ${monnaie}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr class="total-row">
        <td colspan="4">TOTAL</td>
        <td>${Number(devis.total).toLocaleString('fr-FR')} ${monnaie}</td>
      </tr></tfoot>
    </table>
    ${devis.notes ? `<div class="note"><strong>Notes:</strong> ${devis.notes}</div>` : ''}
    <p style="margin-top:40px;font-size:10px;color:#999;">Document généré automatiquement</p>
    </body></html>
  `
  const api = (window as any).electronAPI
  if (api?.pdf?.export) {
    const path = await api.pdf.export(html, `devis-${devis.numero}.pdf`)
    if (path) api.shell.openPath(path)
  }
}
